(function () {
    // Konfigurasi MQTT Broker (EMQX Public Broker - Test Sementara)
    // Catatan: Browser menggunakan WebSocket (wss:// port 8084) untuk terhubung ke broker yang sama
    // dengan port TCP 1883 pada ESP32 menggunakan protokol MQTT v3.1.1 (protocolVersion: 4).
    var DEFAULT_MQTT_CONFIG = {
        brokerUrl: 'wss://broker.emqx.io:8084/mqtt',
        topic: 'tefa/hidroponik/sensor',
        publishTopic: 'tefa/hidroponik/control',
        statusTopic: 'tefa/hidroponik/status'
    };

    var SUPABASE_CONFIG = {
        url: 'https://nrlktavercurgxwgpcfa.supabase.co/rest/v1',
        anonKey: 'sb_publishable_P7p6_aBUXNlZ_d-O2G2UGQ_sm2jX9cF',
        sensorTable: 'DataSensor',
        awsTable: 'DataAWS'
    };

    var MQTT_CONFIG = {
        brokerUrl: DEFAULT_MQTT_CONFIG.brokerUrl,
        topic: DEFAULT_MQTT_CONFIG.topic,
        publishTopic: DEFAULT_MQTT_CONFIG.publishTopic,
        statusTopic: DEFAULT_MQTT_CONFIG.statusTopic,
        options: {
            clientId: 'tefa_web_' + Math.random().toString(16).slice(2, 10),
            protocolId: 'MQTT',
            protocolVersion: 4, // MQTT v3.1.1
            clean: true,
            reconnectPeriod: 4000,
            connectTimeout: 10000
        }
    };

    function isLocalHost(host) {
        var h = (host || '').split(':')[0].toLowerCase();
        if (h === 'localhost' || h === '127.0.0.1') return true;
        if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(h)) return true;
        return false;
    }

    function normalizeBrokerUrl(input) {
        if (!input || typeof input !== 'string') return DEFAULT_MQTT_CONFIG.brokerUrl;
        var raw = input.trim();
        if (!raw) return DEFAULT_MQTT_CONFIG.brokerUrl;

        if (/^wss?:\/\//i.test(raw)) {
            var m = raw.match(/^(wss?:\/\/)([^\/]+)(\/.*)?$/i);
            if (m) {
                var hostPart = m[2];
                var pathPart = m[3] || '';
                if (!pathPart && /emqx|hivemq/i.test(hostPart)) {
                    pathPart = '/mqtt';
                }
                return m[1].toLowerCase() + hostPart + pathPart;
            }
            return raw;
        }

        raw = raw.replace(/^(mqtt|tcp):\/\//i, '');
        var slashIdx = raw.indexOf('/');
        var hostPort = slashIdx === -1 ? raw : raw.slice(0, slashIdx);
        var pathStr = slashIdx === -1 ? '/mqtt' : (raw.slice(slashIdx) || '/mqtt');

        if (hostPort.indexOf(':') === -1) {
            hostPort += ':8084';
        } else if (/:1883$/.test(hostPort)) {
            hostPort = hostPort.replace(/:1883$/, ':8084');
        }

        var scheme = isLocalHost(hostPort) ? 'ws://' : 'wss://';
        return scheme + hostPort + pathStr;
    }

    function loadSavedMqttConfig() {
        try {
            var saved = JSON.parse(localStorage.getItem('tefa_dashboard_settings') || '{}');
            MQTT_CONFIG.brokerUrl = normalizeBrokerUrl(saved.mqttBroker || DEFAULT_MQTT_CONFIG.brokerUrl);
            MQTT_CONFIG.topic = (saved.mqttTopicSub && saved.mqttTopicSub.trim()) || DEFAULT_MQTT_CONFIG.topic;
            var savedPub = saved.mqttTopicPub && saved.mqttTopicPub.trim();
            if (savedPub === 'tefa/hidroponik/aktuator') {
                savedPub = DEFAULT_MQTT_CONFIG.publishTopic;
            }
            MQTT_CONFIG.publishTopic = savedPub || DEFAULT_MQTT_CONFIG.publishTopic;
            MQTT_CONFIG.statusTopic = (saved.mqttTopicStatus && saved.mqttTopicStatus.trim()) || DEFAULT_MQTT_CONFIG.statusTopic;
        } catch (e) {
            MQTT_CONFIG.brokerUrl = DEFAULT_MQTT_CONFIG.brokerUrl;
            MQTT_CONFIG.topic = DEFAULT_MQTT_CONFIG.topic;
            MQTT_CONFIG.publishTopic = DEFAULT_MQTT_CONFIG.publishTopic;
            MQTT_CONFIG.statusTopic = DEFAULT_MQTT_CONFIG.statusTopic;
        }
    }

    var STORAGE_KEY_LOG = 'tefa_telemetry_log_v1';
    var minWaterTemp = null;
    var maxWaterTemp = null;
    var minAirTemp = null;
    var maxAirTemp = null;
    var lastDeviceStatus = null;
    var lastNotifStatus = null;
    var telemetryHistory = []; // live short buffer for AWS bars
    var telemetryLog = loadTelemetryLog();
    var pendingSettingsPayload = null;
    var chartState = {
        initialized: false,
        animFrameId: null,
        currPoints: null,
        displayedPoints: [],
        hoverIdx: -1,
        activeRange: '24J',
        visibleSeries: { ec: true, ph: true, temp: true },
        paths: {}
    };

    function loadTelemetryLog() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY_LOG);
            if (!raw) return [];
            var arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return [];
            var cutoff = Date.now() - 30 * 24 * 3600 * 1000;
            return arr.filter(function (item) { return item && item.ts >= cutoff; }).slice(-600);
        } catch (e) {
            return [];
        }
    }

    var saveTelemetryTimer = null;
    function flushTelemetryLog() {
        saveTelemetryTimer = null;
        try {
            localStorage.setItem(STORAGE_KEY_LOG, JSON.stringify(telemetryLog.slice(-600)));
        } catch (e) {
            // ignore quota errors
        }
    }

    function saveTelemetryLog(immediate) {
        if (immediate) {
            if (saveTelemetryTimer) {
                clearTimeout(saveTelemetryTimer);
                saveTelemetryTimer = null;
            }
            flushTelemetryLog();
            return;
        }
        if (saveTelemetryTimer) return;
        saveTelemetryTimer = setTimeout(flushTelemetryLog, 3000);
    }

    function getWibDateParts(ts) {
        var d = new Date(ts);
        if (isNaN(d.getTime())) d = new Date();
        try {
            var parts = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Jakarta',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).formatToParts(d);
            var map = {};
            parts.forEach(function (p) { map[p.type] = p.value; });
            return {
                dd: map.day || '01',
                mm: map.month || '01',
                hh: map.hour === '24' ? '00' : (map.hour || '00'),
                mi: map.minute || '00',
                ss: map.second || '00'
            };
        } catch (e) {
            var wib = new Date(d.getTime() + 7 * 3600 * 1000);
            return {
                dd: String(wib.getUTCDate()).padStart(2, '0'),
                mm: String(wib.getUTCMonth() + 1).padStart(2, '0'),
                hh: String(wib.getUTCHours()).padStart(2, '0'),
                mi: String(wib.getUTCMinutes()).padStart(2, '0'),
                ss: String(wib.getUTCSeconds()).padStart(2, '0')
            };
        }
    }

    function formatShortDate(ts) {
        var p = getWibDateParts(ts);
        return p.dd + '/' + p.mm;
    }

    function formatClock(ts, withSec) {
        var p = getWibDateParts(ts);
        return withSec ? (p.hh + ':' + p.mi + ':' + p.ss) : (p.hh + ':' + p.mi);
    }

    function getActiveRangeFromDOM() {
        var onBtn = document.querySelector('#rangeTabs button.on');
        return onBtn ? onBtn.textContent.trim().toUpperCase() : '24J';
    }

    function getSeriesForRange(rangeKey) {
        if (telemetryLog.length === 0) return { points: [], label: '' };
        var latestTs = telemetryLog[telemetryLog.length - 1].ts;
        var windowMs = 24 * 3600 * 1000;
        var desc = '24 Jam Terakhir';

        if (rangeKey === '1J') {
            windowMs = 1 * 3600 * 1000;
            desc = '1 Jam Terakhir (Detail)';
        } else if (rangeKey === '24J') {
            windowMs = 24 * 3600 * 1000;
            desc = '24 Jam Terakhir';
        } else if (rangeKey === '7H') {
            windowMs = 7 * 24 * 3600 * 1000;
            desc = '7 Hari Terakhir';
        } else if (rangeKey === '30H') {
            windowMs = 30 * 24 * 3600 * 1000;
            desc = '30 Hari Terakhir';
        }

        var filtered = telemetryLog.filter(function (p) {
            return p.ts >= (latestTs - windowMs);
        });
        if (filtered.length === 0) filtered = telemetryLog.slice(-20);

        if (rangeKey === '1J') {
            var rawPts = filtered.slice(-20).map(function (p) {
                return {
                    ts: p.ts,
                    time: p.time || formatClock(p.ts, true),
                    axisLabel: p.time || formatClock(p.ts, true),
                    ph: p.ph,
                    ec: p.ec,
                    waterTemp: p.waterTemp
                };
            });
            return { points: rawPts, label: desc + ' · ' + rawPts.length + ' titik' };
        }

        var span = Math.max(1, filtered[filtered.length - 1].ts - filtered[0].ts);
        var bucketMs = 60 * 1000;

        if (rangeKey === '24J') {
            if (span > 3 * 3600 * 1000) bucketMs = 15 * 60 * 1000;
            else if (span > 30 * 60 * 1000) bucketMs = 2 * 60 * 1000;
            else if (span > 2 * 60 * 1000) bucketMs = 30 * 1000;
            else bucketMs = 10 * 1000;
        } else if (rangeKey === '7H') {
            if (span > 24 * 3600 * 1000) bucketMs = 3 * 3600 * 1000;
            else if (span > 2 * 3600 * 1000) bucketMs = 30 * 60 * 1000;
            else bucketMs = 60 * 1000;
        } else if (rangeKey === '30H') {
            if (span > 48 * 3600 * 1000) bucketMs = 24 * 3600 * 1000;
            else if (span > 6 * 3600 * 1000) bucketMs = 4 * 3600 * 1000;
            else bucketMs = 5 * 60 * 1000;
        }

        var buckets = {};
        var order = [];
        filtered.forEach(function (p) {
            var bKey = Math.floor(p.ts / bucketMs) * bucketMs;
            if (!buckets[bKey]) {
                buckets[bKey] = { sumPh: 0, sumEc: 0, sumTemp: 0, count: 0, ts: bKey, lastTs: p.ts, lastTime: p.time };
                order.push(bKey);
            }
            buckets[bKey].sumPh += (p.ph || 0);
            buckets[bKey].sumEc += (p.ec || 0);
            buckets[bKey].sumTemp += (p.waterTemp || 0);
            buckets[bKey].count += 1;
            if (p.ts >= buckets[bKey].lastTs) {
                buckets[bKey].lastTs = p.ts;
                buckets[bKey].lastTime = p.time;
            }
        });

        var agg = order.slice(-35).map(function (k) {
            var b = buckets[k];
            var refTs = b.lastTs || b.ts;
            var axisLbl = '';
            var fullTime = '';
            if (rangeKey === '24J') {
                axisLbl = span < 2 * 60 * 1000 ? formatClock(refTs, true) : formatClock(refTs, false);
                fullTime = formatClock(refTs, true);
            } else if (rangeKey === '7H') {
                axisLbl = formatShortDate(refTs) + ' ' + formatClock(refTs, false);
                fullTime = formatShortDate(refTs) + ' · ' + formatClock(refTs, false);
            } else {
                axisLbl = span > 48 * 3600 * 1000 ? formatShortDate(refTs) : (formatShortDate(refTs) + ' ' + formatClock(refTs, false));
                fullTime = formatShortDate(refTs) + ' · ' + formatClock(refTs, false);
            }
            return {
                ts: refTs,
                time: fullTime,
                axisLabel: axisLbl,
                ph: b.sumPh / b.count,
                ec: b.sumEc / b.count,
                waterTemp: b.sumTemp / b.count
            };
        });

        return { points: agg, label: desc + ' · ' + agg.length + ' interval' };
    }

    function injectChartStyles() {
        if (document.getElementById('tefa-live-chart-styles')) return;
        var style = document.createElement('style');
        style.id = 'tefa-live-chart-styles';
        style.textContent = [
            '#telemetri .chartbox { position: relative; cursor: crosshair; }',
            '#telemetri .xax { position: relative; display: block; height: 22px; padding-top: 0; }',
            '#telemetri .xax span { position: absolute; top: 6px; white-space: nowrap; font-variant-numeric: tabular-nums; }',
            '#telemetri .legend span { cursor: pointer; user-select: none; transition: opacity 0.2s ease; }',
            '#telemetri .legend span.dimmed { opacity: 0.35; text-decoration: line-through; }',
            '.chart-hover-layer { position: absolute; pointer-events: none; z-index: 5; overflow: visible; }',
            '.chart-crosshair { position: absolute; top: 0; bottom: 0; width: 1.5px; background: repeating-linear-gradient(to bottom, rgba(13,40,24,0.45) 0 4px, transparent 4px 8px); opacity: 0; transition: left 0.08s ease-out, opacity 0.15s ease; }',
            '.chart-dot { position: absolute; width: 11px; height: 11px; border-radius: 50%; border: 2.5px solid #fff; transform: translate(-50%, -50%); opacity: 0; transition: left 0.08s ease-out, top 0.08s ease-out, opacity 0.15s ease; box-shadow: 0 2px 6px rgba(2,2,2,0.22); }',
            '.chart-tooltip { position: absolute; min-width: 185px; background: rgba(255,255,255,0.98); border: none; border-radius: 12px; padding: 10px 13px; box-shadow: 0 12px 28px rgba(9,24,15,0.18), 0 4px 10px rgba(2,2,2,0.08); font-size: 12px; color: #0D2818; pointer-events: none; z-index: 10; opacity: 0; transition: left 0.08s ease-out, top 0.08s ease-out, opacity 0.15s ease; }',
            '.chart-tooltip-time { font-weight: 700; font-size: 11px; color: #0D2818; margin-bottom: 6px; padding-bottom: 5px; border-bottom: 1px solid #EBF0ED; letter-spacing: 0.3px; }',
            '.chart-tooltip-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 3px 0; font-weight: 500; }',
            '.chart-tooltip-label { display: flex; align-items: center; gap: 6px; color: #4A5D52; }',
            '.chart-tooltip-swatch { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }',
            '.chart-tooltip-val { font-weight: 700; color: #0D2818; font-variant-numeric: tabular-nums; }'
        ].join('\n');
        document.head.appendChild(style);
    }

    function buildSmoothPath(pts, h, closeArea) {
        if (!pts || pts.length === 0) return '';
        if (pts.length === 1) {
            var p = pts[0];
            var dSingle = 'M0 ' + p.y.toFixed(2) + ' L1260 ' + p.y.toFixed(2);
            return closeArea ? (dSingle + ' L1260 ' + h + ' L0 ' + h + ' Z') : dSingle;
        }
        var d = 'M' + pts[0].x.toFixed(2) + ' ' + pts[0].y.toFixed(2);
        for (var i = 0; i < pts.length - 1; i++) {
            var p0 = pts[Math.max(0, i - 1)];
            var p1 = pts[i];
            var p2 = pts[i + 1];
            var p3 = pts[Math.min(pts.length - 1, i + 2)];

            var cp1x = p1.x + (p2.x - p0.x) / 6;
            var cp1y = Math.min(h - 6, Math.max(6, p1.y + (p2.y - p0.y) / 6));
            var cp2x = p2.x - (p3.x - p1.x) / 6;
            var cp2y = Math.min(h - 6, Math.max(6, p2.y - (p3.y - p1.y) / 6));

            d += ' C' + cp1x.toFixed(2) + ' ' + cp1y.toFixed(2) + ',' +
                cp2x.toFixed(2) + ' ' + cp2y.toFixed(2) + ',' +
                p2.x.toFixed(2) + ' ' + p2.y.toFixed(2);
        }
        if (closeArea) {
            d += ' L' + pts[pts.length - 1].x.toFixed(2) + ' ' + h +
                ' L' + pts[0].x.toFixed(2) + ' ' + h + ' Z';
        }
        return d;
    }

    function computeSeriesCoords(dataList, w, h) {
        var n = dataList.length;
        function mapSeries(getter, maxVal) {
            return dataList.map(function (item, idx) {
                var x = n === 1 ? w / 2 : (idx / (n - 1)) * w;
                var ratio = Math.min(1, Math.max(0, getter(item) / maxVal));
                var y = h - 14 - ratio * (h - 32);
                return { x: x, y: y };
            });
        }
        return {
            ec: mapSeries(function (p) { return (p.ec || 0) * 33; }, 100),
            ph: mapSeries(function (p) { return (p.ph || 0) * 7; }, 100),
            temp: mapSeries(function (p) { return p.waterTemp || 0; }, 50)
        };
    }

    function resamplePoints(oldPts, newLen, w) {
        if (!oldPts || oldPts.length === 0) return null;
        if (oldPts.length === newLen) return oldPts;
        var res = [];
        for (var i = 0; i < newLen; i++) {
            var x = newLen === 1 ? w / 2 : (i / (newLen - 1)) * w;
            var srcIdx = Math.min(oldPts.length - 1, Math.round((i / Math.max(1, newLen - 1)) * (oldPts.length - 1)));
            res.push({ x: x, y: oldPts[srcIdx].y });
        }
        return res;
    }

    function ensureChartInteractive(chartBox, svg) {
        if (chartState.initialized) return;
        chartState.initialized = true;
        injectChartStyles();

        var ns = 'http://www.w3.org/2000/svg';
        // Buat persistent SVG paths
        var areaPath = document.createElementNS(ns, 'path');
        areaPath.setAttribute('class', 'live-line');
        areaPath.setAttribute('fill', 'url(#gr)');
        areaPath.setAttribute('stroke', 'none');

        function makeLine(color) {
            var p = document.createElementNS(ns, 'path');
            p.setAttribute('class', 'live-line');
            p.setAttribute('stroke', color);
            p.setAttribute('stroke-width', '3');
            p.setAttribute('stroke-linecap', 'round');
            p.setAttribute('stroke-linejoin', 'round');
            p.setAttribute('fill', 'none');
            return p;
        }

        var pathEc = makeLine('#0D2818');
        var pathPh = makeLine('#1B4332');
        var pathTemp = makeLine('#6B9080');

        svg.appendChild(areaPath);
        svg.appendChild(pathTemp);
        svg.appendChild(pathPh);
        svg.appendChild(pathEc);

        chartState.paths = { area: areaPath, ec: pathEc, ph: pathPh, temp: pathTemp };

        // Buat HTML overlay di atas svg.plot untuk crosshair, dots, dan tooltip anti-distorsi
        var hoverLayer = document.createElement('div');
        hoverLayer.className = 'chart-hover-layer';

        var crosshair = document.createElement('div');
        crosshair.className = 'chart-crosshair';

        var dotEc = document.createElement('div');
        dotEc.className = 'chart-dot';
        dotEc.style.background = '#0D2818';

        var dotPh = document.createElement('div');
        dotPh.className = 'chart-dot';
        dotPh.style.background = '#1B4332';

        var dotTemp = document.createElement('div');
        dotTemp.className = 'chart-dot';
        dotTemp.style.background = '#6B9080';

        var tooltip = document.createElement('div');
        tooltip.className = 'chart-tooltip';

        hoverLayer.appendChild(crosshair);
        hoverLayer.appendChild(dotTemp);
        hoverLayer.appendChild(dotPh);
        hoverLayer.appendChild(dotEc);
        chartBox.appendChild(hoverLayer);
        chartBox.appendChild(tooltip);

        function syncLayerBounds() {
            var boxRect = chartBox.getBoundingClientRect();
            var svgRect = svg.getBoundingClientRect();
            hoverLayer.style.left = (svgRect.left - boxRect.left) + 'px';
            hoverLayer.style.top = (svgRect.top - boxRect.top) + 'px';
            hoverLayer.style.width = svgRect.width + 'px';
            hoverLayer.style.height = svgRect.height + 'px';
            return { boxRect: boxRect, svgRect: svgRect };
        }

        function showHoverAt(clientX, clientY) {
            var pts = chartState.displayedPoints;
            if (!pts || pts.length === 0 || !chartState.currPoints) return;
            var bounds = syncLayerBounds();
            var svgRect = bounds.svgRect;
            var boxRect = bounds.boxRect;
            if (svgRect.width <= 0) return;

            var n = pts.length;
            var relX = Math.min(1, Math.max(0, (clientX - svgRect.left) / svgRect.width));
            var idx = n === 1 ? 0 : Math.round(relX * (n - 1));
            idx = Math.min(n - 1, Math.max(0, idx));
            chartState.hoverIdx = idx;

            var pt = pts[idx];
            var pEc = chartState.currPoints.ec[idx];
            var pPh = chartState.currPoints.ph[idx];
            var pTemp = chartState.currPoints.temp[idx];
            if (!pEc || !pPh || !pTemp) return;

            var xPct = ((pEc.x / 1260) * 100).toFixed(3) + '%';
            crosshair.style.left = xPct;
            crosshair.style.opacity = '1';

            dotEc.style.left = xPct;
            dotEc.style.top = ((pEc.y / 260) * 100).toFixed(3) + '%';
            dotEc.style.opacity = chartState.visibleSeries.ec ? '1' : '0';

            dotPh.style.left = xPct;
            dotPh.style.top = ((pPh.y / 260) * 100).toFixed(3) + '%';
            dotPh.style.opacity = chartState.visibleSeries.ph ? '1' : '0';

            dotTemp.style.left = xPct;
            dotTemp.style.top = ((pTemp.y / 260) * 100).toFixed(3) + '%';
            dotTemp.style.opacity = chartState.visibleSeries.temp ? '1' : '0';

            var rowsHtml = ['<div class="chart-tooltip-time">' + pt.time + ' WIB</div>'];
            if (chartState.visibleSeries.ec) {
                rowsHtml.push('<div class="chart-tooltip-row"><span class="chart-tooltip-label"><i class="chart-tooltip-swatch" style="background:#0D2818"></i>EC</span><span class="chart-tooltip-val">' + (pt.ec || 0).toFixed(2) + ' mS/cm</span></div>');
            }
            if (chartState.visibleSeries.ph) {
                rowsHtml.push('<div class="chart-tooltip-row"><span class="chart-tooltip-label"><i class="chart-tooltip-swatch" style="background:#1B4332"></i>pH</span><span class="chart-tooltip-val">' + (pt.ph || 0).toFixed(2) + ' pH</span></div>');
            }
            if (chartState.visibleSeries.temp) {
                rowsHtml.push('<div class="chart-tooltip-row"><span class="chart-tooltip-label"><i class="chart-tooltip-swatch" style="background:#6B9080"></i>Water Temp</span><span class="chart-tooltip-val">' + (pt.waterTemp || 0).toFixed(1) + ' °C</span></div>');
            }
            tooltip.innerHTML = rowsHtml.join('');

            var cursorX = clientX - boxRect.left;
            var cursorY = clientY - boxRect.top;
            var tipW = tooltip.offsetWidth || 190;
            var tipH = tooltip.offsetHeight || 105;

            var tipLeft = cursorX + 16;
            if (tipLeft + tipW > boxRect.width - 8) {
                tipLeft = cursorX - tipW - 16;
            }
            tipLeft = Math.max(8, Math.min(boxRect.width - tipW - 8, tipLeft));
            var tipTop = Math.max(8, Math.min(boxRect.height - tipH - 8, cursorY - tipH / 2));

            tooltip.style.left = tipLeft + 'px';
            tooltip.style.top = tipTop + 'px';
            tooltip.style.opacity = '1';
        }

        function hideHover() {
            chartState.hoverIdx = -1;
            crosshair.style.opacity = '0';
            dotEc.style.opacity = '0';
            dotPh.style.opacity = '0';
            dotTemp.style.opacity = '0';
            tooltip.style.opacity = '0';
        }

        chartBox.addEventListener('mousemove', function (e) {
            showHoverAt(e.clientX, e.clientY);
        });
        chartBox.addEventListener('touchmove', function (e) {
            if (e.touches && e.touches[0]) {
                showHoverAt(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });
        chartBox.addEventListener('mouseleave', hideHover);
        chartBox.addEventListener('touchend', hideHover);
    }

    function formatWibTime(isoString) {
        try {
            var d = isoString ? new Date(isoString) : new Date();
            if (isNaN(d.getTime())) d = new Date();
            return d.toLocaleTimeString('id-ID', {
                timeZone: 'Asia/Jakarta',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).replace(/\./g, ':');
        } catch (e) {
            return new Date().toTimeString().slice(0, 8);
        }
    }

    function getThresholds() {
        try {
            var saved = JSON.parse(localStorage.getItem('tefa_dashboard_settings') || '{}');
            var rawEcMin = parseFloat(String(saved.ecMin || saved.tdsMin || '1.0').replace(',', '.'));
            var rawEcMax = parseFloat(String(saved.ecMax || saved.tdsMax || '2.5').replace(',', '.'));
            var ecMin = (!isNaN(rawEcMin) && rawEcMin >= 0 && rawEcMin <= 20) ? rawEcMin : 1.0;
            var ecMax = (!isNaN(rawEcMax) && rawEcMax > 0 && rawEcMax <= 20) ? rawEcMax : 2.5;
            return {
                phMin: parseFloat(String(saved.phMin || '5.5').replace(',', '.')) || 5.5,
                phMax: parseFloat(String(saved.phMax || '6.5').replace(',', '.')) || 6.5,
                ecMin: ecMin,
                ecMax: ecMax,
                tempMin: parseFloat(String(saved.tempMin || '20').replace(',', '.')) || 20,
                tempMax: parseFloat(String(saved.tempMax || '30').replace(',', '.')) || 30,
                humMin: parseFloat(String(saved.humMin || '50').replace(',', '.')) || 50,
                humMax: parseFloat(String(saved.humMax || '85').replace(',', '.')) || 85
            };
        } catch (e) {
            return { phMin: 5.5, phMax: 6.5, ecMin: 1.0, ecMax: 2.5, tempMin: 20, tempMax: 30, humMin: 50, humMax: 85 };
        }
    }

    function setConnectionUI(stateText, subText, isOnline) {
        var hwItems = document.querySelectorAll('.hero .hw > div');
        if (hwItems.length > 0) {
            var espV = hwItems[0].querySelector('.v');
            var espS = hwItems[0].querySelector('.s');
            if (espV) {
                espV.textContent = stateText;
                if (isOnline) espV.classList.remove('off');
                else espV.classList.add('off');
            }
            if (espS) {
                espS.textContent = subText;
                if (isOnline) espS.classList.remove('off');
                else espS.classList.add('off');
            }
        }

        var weatherDesc = document.querySelector('.card.weather .desc');
        if (weatherDesc) {
            if (isOnline) {
                weatherDesc.textContent = 'Broker terhubung · ' + subText;
                weatherDesc.style.color = '#1B4332';
            } else {
                weatherDesc.textContent = subText;
                weatherDesc.style.color = stateText === 'Connecting' ? '#E65100' : 'var(--red)';
            }
        }
    }

    function applySeriesVisibility() {
        if (!chartState.paths || !chartState.paths.ec) return;
        chartState.paths.ec.style.display = chartState.visibleSeries.ec ? '' : 'none';
        chartState.paths.area.style.display = chartState.visibleSeries.ec ? '' : 'none';
        chartState.paths.ph.style.display = chartState.visibleSeries.ph ? '' : 'none';
        chartState.paths.temp.style.display = chartState.visibleSeries.temp ? '' : 'none';
    }

    function renderTelemetryChart() {
        var chartBox = document.querySelector('#telemetri .chartbox');
        var chartEmpty = document.querySelector('#telemetri .chart-empty-msg');
        var svg = document.querySelector('#telemetri svg.plot');
        var xax = document.querySelector('#telemetri .xax');
        if (!chartBox || !svg) return;

        chartState.activeRange = getActiveRangeFromDOM();
        var rangeResult = getSeriesForRange(chartState.activeRange);
        var pts = rangeResult.points;
        chartState.displayedPoints = pts;

        if (pts.length === 0) {
            if (chartEmpty) chartEmpty.style.display = '';
            if (chartState.animFrameId) {
                cancelAnimationFrame(chartState.animFrameId);
                chartState.animFrameId = null;
            }
            if (chartState.paths && chartState.paths.ec) {
                chartState.paths.ec.setAttribute('d', '');
                chartState.paths.area.setAttribute('d', '');
                chartState.paths.ph.setAttribute('d', '');
                chartState.paths.temp.setAttribute('d', '');
            }
            chartState.currPoints = null;
            return;
        }

        if (chartEmpty) chartEmpty.style.display = 'none';
        ensureChartInteractive(chartBox, svg);
        applySeriesVisibility();

        var w = 1260;
        var h = 260;
        var n = pts.length;
        var target = computeSeriesCoords(pts, w, h);

        var fromPts = chartState.currPoints ? {
            ec: resamplePoints(chartState.currPoints.ec, n, w),
            ph: resamplePoints(chartState.currPoints.ph, n, w),
            temp: resamplePoints(chartState.currPoints.temp, n, w)
        } : null;

        chartState.currPoints = target;

        if (chartState.animFrameId) {
            cancelAnimationFrame(chartState.animFrameId);
        }

        if (!fromPts || document.hidden) {
            chartState.paths.ec.setAttribute('d', buildSmoothPath(target.ec, h, false));
            chartState.paths.area.setAttribute('d', buildSmoothPath(target.ec, h, true));
            chartState.paths.ph.setAttribute('d', buildSmoothPath(target.ph, h, false));
            chartState.paths.temp.setAttribute('d', buildSmoothPath(target.temp, h, false));
        } else {
            var startTime = null;
            var duration = 280;

            function step(ts) {
                if (!startTime) startTime = ts;
                var rawT = Math.min(1, (ts - startTime) / duration);
                var ease = 1 - Math.pow(1 - rawT, 3); // easeOutCubic

                function interp(a, b) {
                    return b.map(function (pt, i) {
                        var src = a[i] || pt;
                        return {
                            x: src.x + (pt.x - src.x) * ease,
                            y: src.y + (pt.y - src.y) * ease
                        };
                    });
                }

                var curEc = interp(fromPts.ec, target.ec);
                var curPh = interp(fromPts.ph, target.ph);
                var curTemp = interp(fromPts.temp, target.temp);

                chartState.paths.ec.setAttribute('d', buildSmoothPath(curEc, h, false));
                chartState.paths.area.setAttribute('d', buildSmoothPath(curEc, h, true));
                chartState.paths.ph.setAttribute('d', buildSmoothPath(curPh, h, false));
                chartState.paths.temp.setAttribute('d', buildSmoothPath(curTemp, h, false));

                if (rawT < 1) {
                    chartState.animFrameId = requestAnimationFrame(step);
                } else {
                    chartState.animFrameId = null;
                }
            }
            chartState.animFrameId = requestAnimationFrame(step);
        }

        if (xax && n >= 1) {
            var spans = xax.querySelectorAll('span');
            if (n === 1) {
                spans.forEach(function (sp, i) {
                    if (i === 0) {
                        sp.textContent = pts[0].axisLabel;
                        sp.style.display = '';
                        sp.style.left = '50%';
                        sp.style.transform = 'translateX(-50%)';
                    } else {
                        sp.textContent = '';
                        sp.style.display = 'none';
                    }
                });
            } else {
                var rawIndices = n <= 5
                    ? pts.map(function (_, idx) { return idx; })
                    : [0, Math.round((n - 1) * 0.25), Math.round((n - 1) * 0.5), Math.round((n - 1) * 0.75), n - 1];
                var indices = [];
                rawIndices.forEach(function (idx) {
                    if (indices.indexOf(idx) === -1) indices.push(idx);
                });

                spans.forEach(function (sp, i) {
                    if (i < indices.length && pts[indices[i]]) {
                        var idx = indices[i];
                        var xPct = ((idx / (n - 1)) * 100).toFixed(3) + '%';
                        sp.textContent = pts[idx].axisLabel;
                        sp.style.display = '';
                        sp.style.left = xPct;
                        if (idx === 0) {
                            sp.style.transform = 'translateX(0)';
                        } else if (idx === n - 1) {
                            sp.style.transform = 'translateX(-100%)';
                        } else {
                            sp.style.transform = 'translateX(-50%)';
                        }
                    } else {
                        sp.textContent = '';
                        sp.style.display = 'none';
                    }
                });
            }
        }
    }

    function toSensorNumber(val) {
        if (val === null || val === undefined || val === '') return null;
        var num = Number(val);
        return isNaN(num) ? null : num;
    }

    function pickSensorValue(sensorMap, ids, defaultSatuan) {
        for (var i = 0; i < ids.length; i++) {
            var item = sensorMap[ids[i]];
            if (item) {
                var num = toSensorNumber(item.value);
                if (num !== null) {
                    return {
                        id: item.id,
                        name: item.name || item.id,
                        value: num,
                        satuan: item.satuan || defaultSatuan || ''
                    };
                }
            }
        }
        return null;
    }

    function normalizePayload(payload) {
        if (!payload || typeof payload !== 'object') return null;

        // Unpack if wrapped in data or d
        if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
            payload = Object.assign({}, payload, payload.data);
        } else if (payload.d && typeof payload.d === 'object' && !Array.isArray(payload.d)) {
            payload = Object.assign({}, payload, payload.d);
        }

        // 1. If already standard array format
        if (Array.isArray(payload.sensors)) {
            return payload;
        }

        // 2. If flat JSON format (common in MQTTX / manual publish)
        var normalizedSensors = [];

        function getVal(keys) {
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                if (payload[k] !== undefined && payload[k] !== null && payload[k] !== '') {
                    var num = Number(payload[k]);
                    if (!isNaN(num)) return num;
                }
            }
            return null;
        }

        // WiFi
        var wifiVal = getVal(['wifi', 'wifi_rssi', 'rssi', 'kekuatan_wiFi', 'signal', 'wifi_speed']);
        if (wifiVal !== null) {
            normalizedSensors.push({ id: 'kekuatan_wiFi', value: wifiVal, satuan: 'dBm' });
        }

        // pH
        var phVal = getVal(['ph', 'pH', 'PH', 'ph_value', '001pH', 'sensor_ph']);
        if (phVal !== null) {
            normalizedSensors.push({ id: '001pH', value: phVal, satuan: 'pH' });
        }

        // EC
        var ecVal = getVal(['ec', 'EC', 'ec_value', '002EC', 'sensor_ec']);
        var tdsVal = getVal(['tds', 'TDS', 'ppm', 'PPM']);
        if (ecVal !== null) {
            normalizedSensors.push({ id: '002EC', value: ecVal, satuan: 'mS/cm' });
        } else if (tdsVal !== null) {
            var convertedEc = tdsVal > 15 ? tdsVal / 640 : tdsVal;
            normalizedSensors.push({ id: '002EC', value: convertedEc, satuan: 'mS/cm' });
        }

        // Light / Lux
        var lightVal = getVal(['light', 'lux', 'Lux', 'bh1750', 'cahaya', '003bh1750', 'intensitas_cahaya']);
        if (lightVal !== null) {
            normalizedSensors.push({ id: '003bh1750', value: lightVal, satuan: 'Lux' });
        }

        // Air Temperature
        var airTempVal = getVal(['air_temp', 'airTemp', 'temp', 'temperature', 'suhu_udara', 'suhu', '004aht20_temp']);
        if (airTempVal !== null) {
            normalizedSensors.push({ id: '004aht20_temp', value: airTempVal, satuan: '°C' });
        }

        // Air Humidity
        var airHumVal = getVal(['hum', 'humidity', 'air_hum', 'airHum', 'kelembaban', '004aht20_hum']);
        if (airHumVal !== null) {
            normalizedSensors.push({ id: '004aht20_hum', value: airHumVal, satuan: '%' });
        }

        // Water Temperature
        var waterTempVal = getVal(['water_temp', 'waterTemp', 'temp_water', 'suhu_air', '005sensorair', 'tandon_temp', 'water_temperature']);
        if (waterTempVal !== null) {
            normalizedSensors.push({ id: '005sensorair', value: waterTempVal, satuan: '°C' });
        } else if (airTempVal !== null && normalizedSensors.length > 0) {
            normalizedSensors.push({ id: '005sensorair', value: Math.max(18, airTempVal - 1.5), satuan: '°C' });
        }

        if (normalizedSensors.length === 0) return null;

        return {
            device_id: payload.device_id || payload.clientId || 'MQTTX',
            timestamp: payload.timestamp || payload.time || new Date().toISOString(),
            sensors: normalizedSensors,
            system_status: payload.system_status || { pompa: payload.pompa || 'Standby' }
        };
    }

    function updateDashboardUI(payload) {
        if (!payload || !Array.isArray(payload.sensors)) return;

        var sensorMap = {};
        payload.sensors.forEach(function (s) {
            if (s && s.id) sensorMap[s.id] = s;
        });

        var wifi = pickSensorValue(sensorMap, ['TEL-WIFI-001', 'kekuatan_wiFi'], 'dBm');
        var ph = pickSensorValue(sensorMap, ['SNS-PH-001', '001pH'], 'pH');
        var ec = pickSensorValue(sensorMap, ['SNS-EC-002', '002EC'], 'mS/cm');
        var light = pickSensorValue(sensorMap, ['SNS-BH-003', '003bh1750'], 'Lux');
        var waterTemp = pickSensorValue(sensorMap, ['SNS-WT-005', '005sensorair', 'SNS-WT-006'], '°C');
        var reservoirTemp = pickSensorValue(sensorMap, ['SNS-WT-006'], '°C');

        var airTemp = null;
        var airHum = null;
        var ahtCombo = sensorMap['SNS-AHT-004'];
        if (ahtCombo) {
            var tVal = toSensorNumber(ahtCombo.temperature !== undefined ? ahtCombo.temperature : ahtCombo.value);
            var hVal = toSensorNumber(ahtCombo.humidity);
            if (tVal !== null) airTemp = { value: tVal, satuan: ahtCombo.satuan_temp || '°C' };
            if (hVal !== null) airHum = { value: hVal, satuan: ahtCombo.satuan_hum || '% RH' };
        }
        if (!airTemp) airTemp = pickSensorValue(sensorMap, ['004aht20_temp'], '°C');
        if (!airHum) airHum = pickSensorValue(sensorMap, ['004aht20_hum'], '%');

        var thr = getThresholds();
        var wibTime = formatWibTime(payload.timestamp);

        // Evaluasi status Normal / Warning
        var isPhWarn = ph && (ph.value < thr.phMin || ph.value > thr.phMax);
        var isEcWarn = ec && (ec.value < thr.ecMin || ec.value > thr.ecMax);
        var isWaterWarn = waterTemp && (waterTemp.value < thr.tempMin || waterTemp.value > thr.tempMax);
        var isHumWarn = airHum && (airHum.value < thr.humMin || airHum.value > thr.humMax);
        var overallStatus = (isPhWarn || isEcWarn || isWaterWarn || isHumWarn) ? 'Warning' : 'Normal';

        // 1. Update Hero Uptime & Hardware Health
        var uptimeEl = document.getElementById('uptime');
        if (uptimeEl) uptimeEl.textContent = wibTime + ' WIB';

        var hwItems = document.querySelectorAll('.hero .hw > div');
        if (hwItems.length >= 5) {
            // ESP32 & WiFi
            var v0 = hwItems[0].querySelector('.v');
            var s0 = hwItems[0].querySelector('.s');
            if (v0) { v0.textContent = 'Online'; v0.classList.remove('off'); }
            if (s0) {
                if (wifi) {
                    var wifiUnit = wifi.satuan || 'dBm';
                    var wifiValStr = wifiUnit.toLowerCase() === 'dbm' ? wifi.value.toFixed(0) : wifi.value.toFixed(1);
                    s0.textContent = 'WiFi ' + wifiValStr + ' ' + wifiUnit;
                } else {
                    s0.textContent = payload.device_id || 'Terhubung';
                }
                s0.classList.remove('off');
            }

            // Sensor pH
            if (ph) {
                var v1 = hwItems[1].querySelector('.v');
                var s1 = hwItems[1].querySelector('.s');
                if (v1) { v1.textContent = ph.value.toFixed(2) + ' pH'; v1.classList.remove('off'); }
                if (s1) { s1.textContent = isPhWarn ? 'Warning' : 'Normal'; s1.classList.remove('off'); }
            }

            // Sensor EC
            if (ec) {
                var v2 = hwItems[2].querySelector('.v');
                var s2 = hwItems[2].querySelector('.s');
                if (v2) { v2.textContent = ec.value.toFixed(2) + ' ' + (ec.satuan || 'mS/cm'); v2.classList.remove('off'); }
                if (s2) { s2.textContent = isEcWarn ? 'Warning' : 'Normal'; s2.classList.remove('off'); }
            }

            // BH1750 Light
            if (light) {
                var v3 = hwItems[3].querySelector('.v');
                var s3 = hwItems[3].querySelector('.s');
                if (v3) { v3.textContent = light.value.toFixed(1) + ' lx'; v3.classList.remove('off'); }
                if (s3) { s3.textContent = 'Aktif'; s3.classList.remove('off'); }
            }

            // Relay 8CH / Device Status
            if (lastDeviceStatus) {
                renderHeroRelayStatus(lastDeviceStatus);
            } else {
                var v4 = hwItems[4].querySelector('.v');
                var s4 = hwItems[4].querySelector('.s');
                var sys = payload.system_status || null;
                if (v4) {
                    v4.textContent = (sys && sys.pompa) ? ('Pompa ' + String(sys.pompa).toUpperCase()) : 'Standby';
                    v4.classList.remove('off');
                }
                if (s4) {
                    s4.textContent = (sys && sys.deepsleep_sec !== undefined) ? ('DeepSleep ' + sys.deepsleep_sec + 's') : 'Terhubung';
                    s4.classList.remove('off');
                }
            }
        }

        // 2. Update Air Temp & Time Card
        var weatherTempEl = document.querySelector('.card.weather .temp');
        var weatherDescEl = document.querySelector('.card.weather .desc');
        var wstatsItems = document.querySelectorAll('.card.weather .wstats > div > div');

        if (airTemp) {
            if (minAirTemp === null || airTemp.value < minAirTemp) minAirTemp = airTemp.value;
            if (maxAirTemp === null || airTemp.value > maxAirTemp) maxAirTemp = airTemp.value;
            if (weatherTempEl) {
                weatherTempEl.textContent = airTemp.value.toFixed(1) + '°C';
                weatherTempEl.style.fontSize = '';
                weatherTempEl.style.color = 'var(--ink)';
            }
            if (wstatsItems.length >= 3) {
                wstatsItems[1].innerHTML = '<small>Suhu Min</small>' + minAirTemp.toFixed(1) + '°C';
                wstatsItems[2].innerHTML = '<small>Suhu Maks</small>' + maxAirTemp.toFixed(1) + '°C';
            }
        }
        if (weatherDescEl) {
            weatherDescEl.textContent = 'Terhubung · ' + (payload.device_id || 'ESP32');
            weatherDescEl.style.color = '#1B4332';
        }
        if (airHum && wstatsItems.length >= 1) {
            wstatsItems[0].innerHTML = '<small>Kelembapan</small>' + airHum.value.toFixed(1) + '%';
        }

        // 3. Update 3 Sensor Cards (pH, Nutrition/EC, Light)
        var sensorCards = document.querySelectorAll('.sensors .card.sensor');
        if (sensorCards.length >= 3) {
            if (ph) {
                var phB = sensorCards[0].querySelector('.big b');
                var phBar = sensorCards[0].querySelector('.bar i');
                var phSt = sensorCards[0].querySelector('.st');
                if (phB) phB.textContent = ph.value.toFixed(2);
                if (phBar) phBar.style.width = Math.min(100, Math.max(0, (ph.value / 14) * 100)).toFixed(1) + '%';
                if (phSt) {
                    phSt.textContent = isPhWarn ? 'Warning' : 'Optimal';
                    phSt.style.color = isPhWarn ? '#E65100' : '#1B4332';
                }
            }
            if (ec) {
                var ecB = sensorCards[1].querySelector('.big b');
                var ecBar = sensorCards[1].querySelector('.bar i');
                var ecSt = sensorCards[1].querySelector('.st');
                if (ecB) ecB.innerHTML = ec.value.toFixed(2) + ' <span style="font-size:15px;font-weight:600;color:var(--mute)">' + (ec.satuan || 'mS/cm') + '</span>';
                if (ecBar) ecBar.style.width = Math.min(100, Math.max(5, (ec.value / 3.0) * 100)).toFixed(1) + '%';
                if (ecSt) {
                    ecSt.textContent = isEcWarn ? 'Warning' : 'Optimal';
                    ecSt.style.color = isEcWarn ? '#E65100' : '#1B4332';
                }
            }
            if (light) {
                var lxB = sensorCards[2].querySelector('.big b');
                var lxBar = sensorCards[2].querySelector('.bar i');
                var lxSt = sensorCards[2].querySelector('.st');
                if (lxB) lxB.innerHTML = light.value.toFixed(1) + ' <span style="font-size:15px;font-weight:600;color:var(--mute)">' + (light.satuan || 'lx') + '</span>';
                if (lxBar) lxBar.style.width = Math.min(100, Math.max(5, (light.value / 30000) * 100)).toFixed(1) + '%';
                if (lxSt) {
                    lxSt.textContent = light.value > 200 ? 'Terang' : 'Redup';
                    lxSt.style.color = '#1B4332';
                }
            }
        }

        // 4. Update Water Temp Donut Card
        if (waterTemp) {
            var wtVal = waterTemp.value;
            if (minWaterTemp === null || wtVal < minWaterTemp) minWaterTemp = wtVal;
            if (maxWaterTemp === null || wtVal > maxWaterTemp) maxWaterTemp = wtVal;

            var donut = document.querySelector('.row3 .donut');
            var donutB = document.querySelector('.row3 .donut b');
            var minmaxSpans = document.querySelectorAll('.row3 .minmax span');

            if (donut) {
                donut.classList.remove('disconnected');
                var deg = Math.min(360, Math.max(0, (wtVal / 50) * 360)).toFixed(1);
                donut.style.background = 'conic-gradient(var(--g5) 0 ' + deg + 'deg, var(--g1) ' + deg + 'deg 360deg)';
                donut.title = reservoirTemp
                    ? ('Tangki Nutrisi: ' + wtVal.toFixed(1) + ' °C · Tangki Reservoir: ' + reservoirTemp.value.toFixed(1) + ' °C')
                    : ('Tangki Nutrisi: ' + wtVal.toFixed(1) + ' °C');
            }
            if (donutB) {
                donutB.textContent = wtVal.toFixed(1) + '°';
                donutB.style.fontSize = '36px';
                donutB.style.color = 'var(--ink)';
            }
            if (minmaxSpans.length >= 3) {
                minmaxSpans[0].textContent = 'Min: ' + minWaterTemp.toFixed(1) + '°C';
                minmaxSpans[1].textContent = isWaterWarn ? 'Status: Warning' : 'Status: Normal';
                minmaxSpans[1].style.color = isWaterWarn ? '#E65100' : '#1B4332';
                minmaxSpans[2].textContent = 'Max: ' + maxWaterTemp.toFixed(1) + '°C';
            }
        }

        // 5. Update Threshold Monitor (.thr)
        var thrRows = document.querySelectorAll('.thr > div');
        if (thrRows.length >= 5) {
            var thrData = [
                { s: ph, text: ph ? ph.value.toFixed(2) + ' pH' : 'N/A', pct: ph ? (ph.value / 14) * 100 : 0 },
                { s: ec, text: ec ? ec.value.toFixed(2) + ' mS/cm' : 'N/A', pct: ec ? (ec.value / 3.0) * 100 : 0 },
                { s: waterTemp, text: waterTemp ? waterTemp.value.toFixed(1) + ' °C' : 'N/A', pct: waterTemp ? (waterTemp.value / 50) * 100 : 0 },
                { s: airHum, text: airHum ? airHum.value.toFixed(1) + ' %' : 'N/A', pct: airHum ? airHum.value : 0 },
                { s: light, text: light ? light.value.toFixed(1) + ' lx' : 'N/A', pct: light ? (light.value / 30000) * 100 : 0 }
            ];
            thrData.forEach(function (item, idx) {
                var valSpan = thrRows[idx].querySelector('.h span:last-child');
                var barI = thrRows[idx].querySelector('.bar i');
                if (valSpan && item.s) {
                    valSpan.textContent = item.text;
                    valSpan.style.color = 'var(--ink)';
                }
                if (barI && item.s) {
                    barI.style.width = Math.min(100, Math.max(3, item.pct)).toFixed(1) + '%';
                }
            });
        }

        // 6. Update Telemetry Chart & Log
        var parsedPayloadTs = payload.timestamp ? new Date(payload.timestamp).getTime() : NaN;
        var entryTs = !isNaN(parsedPayloadTs) ? parsedPayloadTs : Date.now();
        var logEntry = {
            ts: entryTs,
            time: wibTime,
            ph: ph ? ph.value : 0,
            ec: ec ? ec.value : 0,
            waterTemp: waterTemp ? waterTemp.value : 0,
            airTemp: airTemp ? airTemp.value : 0,
            airHum: airHum ? airHum.value : null,
            light: light ? light.value : 0
        };
        telemetryHistory.push(logEntry);
        if (telemetryHistory.length > 15) telemetryHistory.shift();

        telemetryLog.push(logEntry);
        if (telemetryLog.length > 600) telemetryLog.shift();
        saveTelemetryLog();

        renderTelemetryChart();

        // 7. Tambah ke Tabel History Sensor (#hist) & Notifikasi Sensor
        if (typeof window.addSensorHistoryRow === 'function') {
            window.addSensorHistoryRow({
                time: wibTime,
                ph: ph ? ph.value.toFixed(2) : 'N/A',
                ppm: ec ? (ec.value.toFixed(2) + ' mS/cm') : 'N/A',
                temp: waterTemp ? waterTemp.value.toFixed(1) : 'N/A',
                light: light ? light.value.toFixed(1) : 'N/A',
                hum: airHum ? (airHum.value.toFixed(1) + '%') : 'N/A',
                status: overallStatus
            });
        }
        if (typeof window.addSensorNotification === 'function') {
            var liveNotif = buildSensorNotificationItem(
                ph ? ph.value : null,
                ec ? ec.value : null,
                waterTemp ? waterTemp.value : null,
                airHum ? airHum.value : null,
                thr,
                wibTime + ' WIB',
                overallStatus === 'Warning',
                Date.now()
            );
            if (liveNotif.type === 'warning' || lastNotifStatus !== 'normal') {
                window.addSensorNotification(liveNotif);
            }
            lastNotifStatus = liveNotif.type;
        }

        // 8. Update AWS (pakai data sensor yang sudah ada: AHT20 & BH1750)
        var awsCards = document.querySelectorAll('.awsgrid .card.awsc');
        if (awsCards.length >= 2) {
            // Air Monitoring
            var airCard = awsCards[0];
            var airBadge = airCard.querySelector('.awsh .badge-offline, .awsh span');
            if (airBadge && (airTemp || airHum)) {
                airBadge.textContent = 'Online';
                airBadge.classList.remove('badge-offline');
                airBadge.style.background = '#EBF0ED';
                airBadge.style.color = '#1B4332';
                airBadge.style.padding = '4px 10px';
                airBadge.style.borderRadius = '99px';
                airBadge.style.fontSize = '12px';
                airBadge.style.fontWeight = '600';
            }
            var airMetrics = airCard.querySelectorAll('.metrics .n');
            if (airMetrics.length >= 2) {
                if (airTemp) {
                    airMetrics[0].querySelector('b').textContent = airTemp.value.toFixed(1);
                    airMetrics[0].querySelector('b').style.color = 'var(--ink)';
                    airMetrics[0].querySelector('span').textContent = '°C';
                }
                if (airHum) {
                    airMetrics[1].querySelector('b').textContent = airHum.value.toFixed(1);
                    airMetrics[1].querySelector('b').style.color = 'var(--ink)';
                    airMetrics[1].querySelector('span').textContent = '%';
                }
            }
            var airBars = airCard.querySelectorAll('.bars i');
            if (airBars.length > 0 && telemetryHistory.length > 0) {
                airBars.forEach(function (bar, idx) {
                    var pt = telemetryHistory[telemetryHistory.length - airBars.length + idx];
                    if (pt && pt.airTemp) {
                        var hPx = Math.min(44, Math.max(6, (pt.airTemp / 50) * 44));
                        bar.style.height = hPx.toFixed(0) + 'px';
                        bar.style.background = 'var(--g5)';
                    }
                });
                var airCap = airCard.querySelector('.cap');
                if (airCap) airCap.textContent = 'Data tren suhu udara · Live dari AHT20';
            }

            // Lux Monitoring (dari BH1750)
            var luxCard = awsCards[1];
            var luxBadge = luxCard.querySelector('.awsh .badge-offline, .awsh span');
            if (luxBadge && light) {
                luxBadge.textContent = 'Online';
                luxBadge.classList.remove('badge-offline');
                luxBadge.style.background = '#EBF0ED';
                luxBadge.style.color = '#1B4332';
                luxBadge.style.padding = '4px 10px';
                luxBadge.style.borderRadius = '99px';
                luxBadge.style.fontSize = '12px';
                luxBadge.style.fontWeight = '600';
            }
            var solarVal = light ? (light.value * 0.0079) : 0;
            var parVal = light ? (light.value * 0.0185) : 0;
            var luxMetrics = luxCard.querySelectorAll('.metrics .n');
            if (luxMetrics.length >= 2 && light) {
                luxMetrics[0].querySelector('b').textContent = solarVal.toFixed(1);
                luxMetrics[0].querySelector('b').style.color = 'var(--ink)';
                luxMetrics[0].querySelector('span').textContent = 'W/m²';

                luxMetrics[1].querySelector('b').textContent = parVal.toFixed(1);
                luxMetrics[1].querySelector('b').style.color = 'var(--ink)';
                luxMetrics[1].querySelector('span').textContent = 'µmol/m²/s';
            }
            var luxBars = luxCard.querySelectorAll('.bars i');
            if (luxBars.length > 0 && telemetryHistory.length > 0) {
                luxBars.forEach(function (bar, idx) {
                    var pt = telemetryHistory[telemetryHistory.length - luxBars.length + idx];
                    if (pt && pt.light !== undefined) {
                        var hPx = Math.min(44, Math.max(6, (pt.light / 30000) * 44));
                        bar.style.height = hPx.toFixed(0) + 'px';
                        bar.style.background = 'var(--g5)';
                    }
                });
                var luxCap = luxCard.querySelector('.cap');
                if (luxCap && light) luxCap.textContent = 'Estimasi dari BH1750 (' + light.value.toFixed(0) + ' lux)';
            }
        }

        // Tambah ke Tabel History AWS (Daily) & perbarui agregasi Weekly / Monthly
        if (typeof window.addAwsHistoryRow === 'function') {
            var solarTxt = light ? ((light.value * 0.0079).toFixed(1) + ' W/m² · ' + (light.value * 0.0185).toFixed(0) + ' PAR') : '-';
            window.addAwsHistoryRow({
                time: wibTime + ' WIB',
                temp: airTemp ? (airTemp.value.toFixed(1) + ' °C') : '-',
                hum: airHum ? (airHum.value.toFixed(1) + '%') : '-',
                solar: solarTxt
            }, 'daily');
        }
        syncAwsHistoryTables(false);

        // 9. Simpan data sensor & AWS ke Supabase untuk riwayat persisten
        saveTelemetryToSupabase(payload, ph, ec, waterTemp, light, airTemp, airHum);
    }

    function postSupabaseRow(table, row) {
        if (typeof fetch !== 'function' || !SUPABASE_CONFIG.anonKey) return;
        fetch(SUPABASE_CONFIG.url + '/' + table, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(row)
        }).then(function (res) {
            if (!res.ok) {
                return res.text().then(function (txt) {
                    console.warn('[TeFa Supabase] Gagal simpan ke ' + table + ' (' + res.status + '):', txt);
                });
            }
        }).catch(function (err) {
            console.warn('[TeFa Supabase] Error simpan ke ' + table + ':', err);
        });
    }

    function fetchSupabaseRows(table, limit) {
        if (typeof fetch !== 'function' || !SUPABASE_CONFIG.anonKey) return Promise.resolve(null);
        var url = SUPABASE_CONFIG.url + '/' + table + '?select=*&order=waktu.desc&limit=' + (limit || 200);
        return fetch(url, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey
            }
        }).then(function (res) {
            if (!res.ok) {
                return res.text().then(function (txt) {
                    console.warn('[TeFa Supabase] Gagal muat ' + table + ' (' + res.status + '):', txt);
                    return null;
                });
            }
            return res.json();
        }).catch(function (err) {
            console.warn('[TeFa Supabase] Error muat ' + table + ':', err);
            return null;
        });
    }

    function saveTelemetryToSupabase(payload, ph, ec, waterTemp, light, airTemp, airHum) {
        var d = payload && payload.timestamp ? new Date(payload.timestamp) : new Date();
        if (isNaN(d.getTime())) d = new Date();
        var isoTime = d.toISOString();

        if (ph || ec || waterTemp || light || airHum) {
            var thr = getThresholds();
            var isWarnNow = (ph && (ph.value < thr.phMin || ph.value > thr.phMax)) ||
                (ec && (ec.value < thr.ecMin || ec.value > thr.ecMax)) ||
                (waterTemp && (waterTemp.value < thr.tempMin || waterTemp.value > thr.tempMax)) ||
                (airHum && (airHum.value < thr.humMin || airHum.value > thr.humMax));
            postSupabaseRow(SUPABASE_CONFIG.sensorTable, {
                waktu: isoTime,
                PH: ph ? Number(ph.value.toFixed(2)) : null,
                PPM: ec ? Number(ec.value.toFixed(2)) : null,
                Suhu_air: waterTemp ? Number(waterTemp.value.toFixed(1)) : null,
                cahaya: light ? Math.round(Math.min(32767, Math.max(-32768, light.value))) : null,
                kelembapan: airHum ? Number(airHum.value.toFixed(1)) : null,
                status: !isWarnNow
            });
        }

        if (airTemp || airHum || light) {
            postSupabaseRow(SUPABASE_CONFIG.awsTable, {
                waktu: isoTime,
                temperatur: airTemp ? Number(airTemp.value.toFixed(1)) : null,
                kelembapan: airHum ? Number(airHum.value.toFixed(1)) : null,
                radiasi: light ? Number((light.value * 0.0079).toFixed(2)) : null
            });
        }
    }

    function formatDisplayTimeWithDate(isoString) {
        var d = isoString ? new Date(isoString) : new Date();
        if (isNaN(d.getTime())) return '--:--:--';
        var now = new Date();
        var isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
        var t = formatWibTime(isoString);
        return isToday ? t : (formatShortDate(d.getTime()) + ' ' + t);
    }

    function buildSensorNotificationItem(phVal, ecVal, wtVal, humVal, thr, timeText, forceWarn, tsMs) {
        var issues = [];
        var details = [];
        if (phVal !== null && (phVal < thr.phMin || phVal > thr.phMax)) {
            issues.push('pH');
            details.push('pH ' + phVal.toFixed(2) + ' (batas ' + thr.phMin + '–' + thr.phMax + ')');
        }
        if (ecVal !== null && (ecVal < thr.ecMin || ecVal > thr.ecMax)) {
            issues.push('EC');
            details.push('EC ' + ecVal.toFixed(2) + ' mS/cm (batas ' + thr.ecMin + '–' + thr.ecMax + ')');
        }
        if (wtVal !== null && (wtVal < thr.tempMin || wtVal > thr.tempMax)) {
            issues.push('Suhu Air');
            details.push('Suhu air ' + wtVal.toFixed(1) + '°C (batas ' + thr.tempMin + '–' + thr.tempMax + '°C)');
        }
        if (humVal !== null && (humVal < thr.humMin || humVal > thr.humMax)) {
            issues.push('Kelembapan');
            details.push('Kelembapan ' + humVal.toFixed(1) + '% (batas ' + thr.humMin + '–' + thr.humMax + '%)');
        }

        var parts = [];
        if (phVal !== null) parts.push('pH: ' + phVal.toFixed(2));
        if (ecVal !== null) parts.push('EC: ' + ecVal.toFixed(2) + ' mS/cm');
        if (wtVal !== null) parts.push('Air: ' + wtVal.toFixed(1) + '°C');
        if (humVal !== null) parts.push('RH: ' + humVal.toFixed(1) + '%');
        var valSummary = parts.length ? parts.join(' · ') : 'N/A';

        var numericTs = (typeof tsMs === 'number' && !isNaN(tsMs) && tsMs > 0) ? tsMs : Date.now();
        var notifType = (issues.length > 0 || forceWarn) ? 'warning' : 'normal';
        var stableId = numericTs + '|' + notifType + '|' + valSummary;

        if (notifType === 'warning') {
            return {
                id: stableId,
                ts: numericTs,
                type: 'warning',
                tag: issues.length > 0 ? issues.join(' & ') : 'Parameter Kritis',
                time: timeText,
                title: issues.length > 0
                    ? ('Peringatan: ' + issues.join(' & ') + ' di luar batas aman')
                    : 'Peringatan Parameter Sensor',
                desc: details.length > 0
                    ? details.join(' · ')
                    : 'Salah satu pembacaan sensor melewati ambang batas yang ditentukan.',
                value: valSummary
            };
        }

        return {
            id: stableId,
            ts: numericTs,
            type: 'normal',
            tag: 'Parameter Normal',
            time: timeText,
            title: 'Kondisi Sensor Normal',
            desc: 'Semua parameter berada dalam batas ambang aman.',
            value: valSummary
        };
    }

    var lastSupabaseSyncAt = 0;
    var supabaseSyncInFlight = false;
    var lastSupabaseFingerprint = '';

    function refreshHistoryFromSupabase(force) {
        var now = Date.now();
        if (supabaseSyncInFlight) return;
        if (!force && (now - lastSupabaseSyncAt) < 2000) return;
        loadHistoryFromSupabase();
    }

    function loadHistoryFromSupabase() {
        supabaseSyncInFlight = true;
        Promise.all([
            fetchSupabaseRows(SUPABASE_CONFIG.sensorTable, 300),
            fetchSupabaseRows(SUPABASE_CONFIG.awsTable, 250)
        ]).then(function (results) {
            supabaseSyncInFlight = false;
            lastSupabaseSyncAt = Date.now();
            var sensorOk = Array.isArray(results[0]);
            var awsOk = Array.isArray(results[1]);
            var sensorRows = sensorOk ? results[0] : [];
            var awsRows = awsOk ? results[1] : [];
            var thr = getThresholds();

            var thrSig = [thr.phMin, thr.phMax, thr.ecMin, thr.ecMax, thr.tempMin, thr.tempMax, thr.humMin, thr.humMax].join(',');
            var firstSensor = sensorRows[0] ? (sensorRows[0].waktu + '|' + sensorRows[0].PH + '|' + sensorRows[0].PPM) : '';
            var lastSensor = sensorRows.length > 1 ? (sensorRows[sensorRows.length - 1].waktu || '') : '';
            var firstAws = awsRows[0] ? (awsRows[0].waktu + '|' + awsRows[0].temperatur + '|' + awsRows[0].radiasi) : '';
            var fp = sensorOk + ':' + sensorRows.length + ':' + firstSensor + ':' + lastSensor + '|' + awsOk + ':' + awsRows.length + ':' + firstAws + '|' + thrSig;
            if (fp === lastSupabaseFingerprint) {
                return;
            }
            lastSupabaseFingerprint = fp;

            if (sensorOk && typeof window.setSensorHistoryData === 'function') {
                var mappedSensor = sensorRows.map(function (r) {
                    var phVal = toSensorNumber(r.PH);
                    var ppmVal = toSensorNumber(r.PPM);
                    var wtVal = toSensorNumber(r.Suhu_air);
                    var lxVal = toSensorNumber(r.cahaya);
                    var humVal = toSensorNumber(r.kelembapan);
                    var isWarn = typeof r.status === 'boolean'
                        ? !r.status
                        : ((phVal !== null && (phVal < thr.phMin || phVal > thr.phMax)) ||
                            (ppmVal !== null && (ppmVal < thr.ecMin || ppmVal > thr.ecMax)) ||
                            (wtVal !== null && (wtVal < thr.tempMin || wtVal > thr.tempMax)) ||
                            (humVal !== null && (humVal < thr.humMin || humVal > thr.humMax)));
                    return {
                        time: formatDisplayTimeWithDate(r.waktu),
                        ph: phVal !== null ? phVal.toFixed(2) : 'N/A',
                        ppm: ppmVal !== null ? (ppmVal.toFixed(2) + ' mS/cm') : 'N/A',
                        temp: wtVal !== null ? wtVal.toFixed(1) : 'N/A',
                        light: lxVal !== null ? lxVal.toFixed(1) : 'N/A',
                        hum: humVal !== null ? (humVal.toFixed(1) + '%') : 'N/A',
                        status: isWarn ? 'Warning' : 'Normal'
                    };
                });
                window.setSensorHistoryData(mappedSensor);
            }

            if (sensorRows.length > 0 && typeof window.setSensorNotifications === 'function') {
                var historyNotifs = sensorRows.slice(0, 50).map(function (r) {
                    var phVal = toSensorNumber(r.PH);
                    var ppmVal = toSensorNumber(r.PPM);
                    var wtVal = toSensorNumber(r.Suhu_air);
                    var humVal = toSensorNumber(r.kelembapan);
                    var rowWarn = typeof r.status === 'boolean' ? !r.status : false;
                    var rowTs = r.waktu ? new Date(r.waktu).getTime() : 0;
                    if (isNaN(rowTs)) rowTs = 0;
                    return buildSensorNotificationItem(
                        phVal,
                        ppmVal,
                        wtVal,
                        humVal,
                        thr,
                        formatDisplayTimeWithDate(r.waktu) + ' WIB',
                        rowWarn,
                        rowTs
                    );
                });
                window.setSensorNotifications(historyNotifs);
            }

            if (awsRows.length > 0 && typeof window.setAwsHistoryData === 'function') {
                var now = Date.now();
                var monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
                var pad2 = function (n) { return String(n).padStart(2, '0'); };

                var awsPoints = awsRows.map(function (r) {
                    var ts = r.waktu ? new Date(r.waktu).getTime() : now;
                    if (isNaN(ts)) ts = now;
                    var rad = toSensorNumber(r.radiasi);
                    return {
                        ts: ts,
                        time: formatDisplayTimeWithDate(r.waktu),
                        airTemp: toSensorNumber(r.temperatur),
                        airHum: toSensorNumber(r.kelembapan),
                        light: rad !== null ? (rad / 0.0079) : null,
                        radiasi: rad
                    };
                });

                var dailyRows = awsPoints.filter(function (pt) {
                    return now - pt.ts <= 24 * 60 * 60 * 1000;
                }).slice(0, 200).map(function (pt) {
                    var solarTxt = pt.radiasi !== null
                        ? (pt.radiasi.toFixed(1) + ' W/m² · ' + ((pt.radiasi / 0.0079) * 0.0185).toFixed(0) + ' PAR')
                        : '-';
                    return {
                        time: pt.time + ' WIB',
                        temp: pt.airTemp !== null ? (pt.airTemp.toFixed(1) + ' °C') : '-',
                        hum: pt.airHum !== null ? (pt.airHum.toFixed(1) + '%') : '-',
                        solar: solarTxt
                    };
                });
                window.setAwsHistoryData('daily', dailyRows);

                var weekWindow = awsPoints.filter(function (pt) { return now - pt.ts <= 7 * 24 * 60 * 60 * 1000; });
                window.setAwsHistoryData('weekly', buildGroupedAwsRows(
                    weekWindow,
                    function (pt) {
                        var d = new Date(pt.ts);
                        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
                    },
                    function (pt) {
                        var d = new Date(pt.ts);
                        return pad2(d.getDate()) + ' ' + monthsShort[d.getMonth()] + ' ' + d.getFullYear();
                    }
                ));

                var monthWindow = awsPoints.filter(function (pt) { return now - pt.ts <= 30 * 24 * 60 * 60 * 1000; });
                var getWeekStart = function (ts) {
                    var d = new Date(ts);
                    var day = d.getDay();
                    var diff = d.getDate() - day + (day === 0 ? -6 : 1);
                    return new Date(d.getFullYear(), d.getMonth(), diff);
                };
                window.setAwsHistoryData('monthly', buildGroupedAwsRows(
                    monthWindow,
                    function (pt) {
                        var ws = getWeekStart(pt.ts);
                        return ws.getFullYear() + '-' + pad2(ws.getMonth() + 1) + '-' + pad2(ws.getDate());
                    },
                    function (pt) {
                        var ws = getWeekStart(pt.ts);
                        var we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6);
                        if (ws.getMonth() === we.getMonth()) {
                            return pad2(ws.getDate()) + ' - ' + pad2(we.getDate()) + ' ' + monthsShort[we.getMonth()] + ' ' + we.getFullYear();
                        }
                        return pad2(ws.getDate()) + ' ' + monthsShort[ws.getMonth()] + ' - ' + pad2(we.getDate()) + ' ' + monthsShort[we.getMonth()] + ' ' + we.getFullYear();
                    }
                ));
            }

            if (sensorOk) {
                var cappedRows = sensorRows.slice(0, 600);
                telemetryLog = cappedRows.map(function (r) {
                    var ts = r.waktu ? new Date(r.waktu).getTime() : Date.now();
                    if (isNaN(ts)) ts = Date.now();
                    return {
                        ts: ts,
                        time: formatWibTime(r.waktu),
                        ph: toSensorNumber(r.PH) || 0,
                        ec: toSensorNumber(r.PPM) || 0,
                        waterTemp: toSensorNumber(r.Suhu_air) || 0,
                        airTemp: 0,
                        airHum: null,
                        light: toSensorNumber(r.cahaya) || 0
                    };
                }).sort(function (a, b) {
                    return a.ts - b.ts;
                });
                saveTelemetryLog();
                renderTelemetryChart();

                if (telemetryHistory.length === 0 && telemetryLog.length > 0) {
                    telemetryHistory = telemetryLog.slice(-15);
                }
            }
        }).catch(function () {
            supabaseSyncInFlight = false;
        });
    }

    function formatAwsAvgRow(items, label) {
        var tempSum = 0, tempCount = 0;
        var humSum = 0, humCount = 0;
        var lightSum = 0, lightCount = 0;
        items.forEach(function (it) {
            if (typeof it.airTemp === 'number' && !isNaN(it.airTemp) && it.airTemp > 0) {
                tempSum += it.airTemp;
                tempCount++;
            }
            if (typeof it.airHum === 'number' && !isNaN(it.airHum)) {
                humSum += it.airHum;
                humCount++;
            }
            if (typeof it.light === 'number' && !isNaN(it.light)) {
                lightSum += it.light;
                lightCount++;
            }
        });
        var avgLight = lightCount > 0 ? (lightSum / lightCount) : null;
        return {
            time: label,
            temp: tempCount > 0 ? ((tempSum / tempCount).toFixed(1) + ' °C') : '-',
            hum: humCount > 0 ? ((humSum / humCount).toFixed(1) + '%') : '-',
            wind: '-',
            solar: avgLight !== null ? ((avgLight * 0.0079).toFixed(1) + ' W/m² · ' + (avgLight * 0.0185).toFixed(0) + ' PAR') : '-',
            soil: '-'
        };
    }

    function buildGroupedAwsRows(entries, keyFn, labelFn) {
        var order = [];
        var map = {};
        entries.forEach(function (pt) {
            var k = keyFn(pt);
            if (!map[k]) {
                map[k] = { key: k, label: labelFn(pt), items: [], maxTs: pt.ts };
                order.push(map[k]);
            }
            map[k].items.push(pt);
            if (pt.ts > map[k].maxTs) map[k].maxTs = pt.ts;
        });
        order.sort(function (a, b) { return b.maxTs - a.maxTs; });
        return order.map(function (g) {
            return formatAwsAvgRow(g.items, g.label + ' · Rata-rata (' + g.items.length + ' data)');
        });
    }

    function syncAwsHistoryTables(includeDaily) {
        if (typeof window.setAwsHistoryData !== 'function') return;
        var now = Date.now();
        var monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        var pad2 = function (n) { return String(n).padStart(2, '0'); };

        if (includeDaily) {
            var dailyEntries = telemetryLog.filter(function (pt) {
                return now - pt.ts <= 24 * 60 * 60 * 1000;
            }).slice(-200).reverse();
            var dailyRows = dailyEntries.map(function (pt) {
                var solarTxt = (typeof pt.light === 'number')
                    ? ((pt.light * 0.0079).toFixed(1) + ' W/m² · ' + (pt.light * 0.0185).toFixed(0) + ' PAR')
                    : '-';
                return {
                    time: (pt.time || '--:--:--') + ' WIB',
                    temp: (typeof pt.airTemp === 'number' && pt.airTemp > 0) ? (pt.airTemp.toFixed(1) + ' °C') : '-',
                    hum: (typeof pt.airHum === 'number') ? (pt.airHum.toFixed(1) + '%') : '-',
                    wind: '-',
                    solar: solarTxt,
                    soil: '-'
                };
            });
            window.setAwsHistoryData('daily', dailyRows);
        }

        // Weekly: agregasi per hari dalam 7 hari terakhir
        var weekWindow = telemetryLog.filter(function (pt) {
            return now - pt.ts <= 7 * 24 * 60 * 60 * 1000;
        });
        var weeklyRows = buildGroupedAwsRows(
            weekWindow,
            function (pt) {
                var d = new Date(pt.ts);
                return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
            },
            function (pt) {
                var d = new Date(pt.ts);
                return pad2(d.getDate()) + ' ' + monthsShort[d.getMonth()] + ' ' + d.getFullYear();
            }
        );
        window.setAwsHistoryData('weekly', weeklyRows);

        // Monthly: agregasi per minggu dalam 30 hari terakhir
        var monthWindow = telemetryLog.filter(function (pt) {
            return now - pt.ts <= 30 * 24 * 60 * 60 * 1000;
        });
        var getWeekStart = function (ts) {
            var d = new Date(ts);
            var day = d.getDay();
            var diff = d.getDate() - day + (day === 0 ? -6 : 1);
            return new Date(d.getFullYear(), d.getMonth(), diff);
        };
        var monthlyRows = buildGroupedAwsRows(
            monthWindow,
            function (pt) {
                var ws = getWeekStart(pt.ts);
                return ws.getFullYear() + '-' + pad2(ws.getMonth() + 1) + '-' + pad2(ws.getDate());
            },
            function (pt) {
                var ws = getWeekStart(pt.ts);
                var we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6);
                if (ws.getMonth() === we.getMonth()) {
                    return pad2(ws.getDate()) + ' - ' + pad2(we.getDate()) + ' ' + monthsShort[we.getMonth()] + ' ' + we.getFullYear();
                }
                return pad2(ws.getDate()) + ' ' + monthsShort[ws.getMonth()] + ' - ' + pad2(we.getDate()) + ' ' + monthsShort[we.getMonth()] + ' ' + we.getFullYear();
            }
        );
        window.setAwsHistoryData('monthly', monthlyRows);
    }

    function renderHeroRelayStatus(payload) {
        if (!payload || typeof payload !== 'object') return;
        var hwItems = document.querySelectorAll('.hero .hw > div');
        if (hwItems.length < 5) return;

        var v4 = hwItems[4].querySelector('.v');
        var s4 = hwItems[4].querySelector('.s');
        var ps = (payload.pumps_status && typeof payload.pumps_status === 'object') ? payload.pumps_status : null;

        if (v4) {
            if (ps) {
                var pumpKeys = Object.keys(ps);
                var activeCount = 0;
                pumpKeys.forEach(function (k) {
                    if (String(ps[k]).toUpperCase() === 'ON') activeCount++;
                });
                var onlyBigOn = activeCount === 1 && String(ps.pump_big).toUpperCase() === 'ON';
                if (activeCount === 0) {
                    v4.textContent = 'Semua OFF';
                } else if (onlyBigOn) {
                    v4.textContent = 'Pump Big ON';
                } else {
                    v4.textContent = activeCount + '/' + pumpKeys.length + ' Pompa ON';
                }
            } else {
                v4.textContent = 'Terhubung';
            }
            v4.classList.remove('off');
        }

        if (s4) {
            if (payload.active_interval_minutes !== undefined && payload.active_interval_minutes !== null) {
                s4.textContent = 'Interval ' + payload.active_interval_minutes + ' mnt';
            } else {
                s4.textContent = payload.status_message || 'Terhubung';
            }
            s4.classList.remove('off');
        }

        if (ps) {
            hwItems[4].title = (payload.status_message ? payload.status_message + ' · ' : '') +
                'A:' + (ps.pump_A || '-') +
                ' B:' + (ps.pump_B || '-') +
                ' UP:' + (ps.pump_up || '-') +
                ' DN:' + (ps.pump_down || '-') +
                ' BIG:' + (ps.pump_big || '-');
        } else if (payload.status_message) {
            hwItems[4].title = payload.status_message;
        }
    }

    function updateDeviceStatusUI(payload) {
        if (!payload || typeof payload !== 'object') return;
        lastDeviceStatus = payload;

        var uptimeEl = document.getElementById('uptime');
        if (uptimeEl) uptimeEl.textContent = formatWibTime(payload.timestamp) + ' WIB';

        var hwItems = document.querySelectorAll('.hero .hw > div');
        if (hwItems.length > 0) {
            var v0 = hwItems[0].querySelector('.v');
            var s0 = hwItems[0].querySelector('.s');
            if (v0) {
                v0.textContent = 'Online';
                v0.classList.remove('off');
            }
            if (s0) {
                if (s0.textContent.indexOf('WiFi ') !== 0) {
                    s0.textContent = payload.device_id || 'Terhubung';
                }
                s0.classList.remove('off');
            }
        }

        renderHeroRelayStatus(payload);

        if (typeof window.syncAdminPumpsUI === 'function') {
            window.syncAdminPumpsUI(payload.pumps_status, payload.active_interval_minutes, payload);
        }
    }

    function initMqttClient() {
        if (typeof mqtt === 'undefined') {
            console.warn('[TeFa MQTT] Library mqtt.min.js belum termuat.');
            return;
        }

        if (window.tefaMqttClient) {
            try {
                if (typeof window.tefaMqttClient.removeAllListeners === 'function') {
                    window.tefaMqttClient.removeAllListeners();
                }
                if (typeof window.tefaMqttClient.end === 'function') {
                    window.tefaMqttClient.end(true);
                }
            } catch (e) { }
            window.tefaMqttClient = null;
        }

        MQTT_CONFIG.options.clientId = 'tefa_web_' + Math.random().toString(16).slice(2, 10);
        console.log('[TeFa MQTT] Menghubungkan ke ' + MQTT_CONFIG.brokerUrl + ' (MQTT v3.1.1)...');
        setConnectionUI('Connecting', 'Menghubungkan MQTT...', false);

        var client = mqtt.connect(MQTT_CONFIG.brokerUrl, MQTT_CONFIG.options);

        client.on('connect', function () {
            console.log('[TeFa MQTT] Terhubung ke ' + MQTT_CONFIG.brokerUrl + '! Mendaftarkan subscriptions...');
            setConnectionUI('Online', 'Menunggu data...', true);

            var topics = [MQTT_CONFIG.topic, MQTT_CONFIG.statusTopic].filter(Boolean);
            var seen = {};
            topics.forEach(function (top) {
                if (seen[top]) return;
                seen[top] = true;
                client.subscribe(top, { qos: 0 }, function (err) {
                    if (err) {
                        console.error('[TeFa MQTT] Gagal subscribe ' + top + ':', err);
                    } else {
                        console.log('[TeFa MQTT] Berhasil subscribe ke ' + top);
                    }
                });
            });

            if (pendingSettingsPayload !== null) {
                var queuedPayload = pendingSettingsPayload;
                pendingSettingsPayload = null;
                sendSettingsPayload(client, queuedPayload);
            }
        });

        client.on('message', function (topic, message, packet) {
            try {
                // Abaikan pesan retained lama dari broker agar tidak muncul saat sensor mati
                if (packet && packet.retain) {
                    console.log('[TeFa MQTT] Mengabaikan pesan retained lama dari [' + topic + ']');
                    return;
                }

                // Hanya proses pesan dari topik sensor & status yang dikonfigurasi
                if (topic !== MQTT_CONFIG.topic && topic !== MQTT_CONFIG.statusTopic) {
                    return;
                }

                var raw = message.toString();
                var data = JSON.parse(raw);
                console.log('[TeFa MQTT] Data diterima dari [' + topic + ']:', data);
                if (topic === MQTT_CONFIG.statusTopic || (data && (data.pumps_status || data.status_message !== undefined))) {
                    updateDeviceStatusUI(data);
                }

                if (topic === MQTT_CONFIG.topic) {
                    var normalized = normalizePayload(data);
                    if (normalized && Array.isArray(normalized.sensors)) {
                        updateDashboardUI(normalized);
                    } else if (!data || (!data.pumps_status && data.status_message === undefined)) {
                        console.warn('[TeFa MQTT] Format data belum sesuai (harus ada nilai sensor seperti ph, ec, temp):', data);
                    }
                }
            } catch (e) {
                console.error('[TeFa MQTT] Gagal parsing JSON pesan dari ' + topic + ':', e);
            }
        });

        client.on('reconnect', function () {
            console.log('[TeFa MQTT] Mencoba menyambung ulang...');
            setConnectionUI('Reconnect', 'Menyambung ulang...', false);
        });

        client.on('error', function (err) {
            console.error('[TeFa MQTT] Error koneksi:', err);
            setConnectionUI('Offline', 'Koneksi Error', false);
        });

        client.on('offline', function () {
            console.warn('[TeFa MQTT] Klien offline.');
            setConnectionUI('Offline', 'Terputus', false);
        });

        window.tefaMqttClient = client;
    }

    function sendSettingsPayload(client, payload) {
        var jsonStr = JSON.stringify(payload);
        client.publish(MQTT_CONFIG.publishTopic, jsonStr, { qos: 1, retain: true }, function (err) {
            if (err) {
                console.error('[TeFa MQTT] Gagal publish setting:', err);
            } else {
                console.log('[TeFa MQTT] Setting berhasil dipublish ke ' + MQTT_CONFIG.publishTopic + ':', payload);
            }
        });
    }

    window.publishMqttSettings = function (payload) {
        if (window.tefaMqttClient && window.tefaMqttClient.connected) {
            sendSettingsPayload(window.tefaMqttClient, payload);
            return 'sent';
        } else {
            pendingSettingsPayload = payload;
            console.warn('[TeFa MQTT] Belum terhubung ke broker, payload diantrekan ke ' + MQTT_CONFIG.publishTopic + ':', payload);
            if (window.tefaMqttClient && typeof window.tefaMqttClient.reconnect === 'function' && !window.tefaMqttClient.reconnecting) {
                try {
                    window.tefaMqttClient.reconnect();
                } catch (e) { }
            }
            return 'queued';
        }
    };

    window.updateMqttConnectionConfig = function (cfg) {
        var nextBroker = normalizeBrokerUrl((cfg && cfg.brokerUrl) || DEFAULT_MQTT_CONFIG.brokerUrl);
        var nextSub = (cfg && cfg.topic ? String(cfg.topic).trim() : '') || DEFAULT_MQTT_CONFIG.topic;
        var nextPub = (cfg && cfg.publishTopic ? String(cfg.publishTopic).trim() : '') || DEFAULT_MQTT_CONFIG.publishTopic;
        var nextStatus = (cfg && cfg.statusTopic ? String(cfg.statusTopic).trim() : '') || DEFAULT_MQTT_CONFIG.statusTopic;

        var prevBroker = MQTT_CONFIG.brokerUrl;
        var prevSub = MQTT_CONFIG.topic;
        var prevStatus = MQTT_CONFIG.statusTopic;

        MQTT_CONFIG.brokerUrl = nextBroker;
        MQTT_CONFIG.topic = nextSub;
        MQTT_CONFIG.publishTopic = nextPub;
        MQTT_CONFIG.statusTopic = nextStatus;

        if (!window.tefaMqttClient || prevBroker !== nextBroker) {
            initMqttClient();
            return;
        }

        if (window.tefaMqttClient.connected) {
            if (prevSub !== nextSub) {
                try {
                    if (typeof window.tefaMqttClient.unsubscribe === 'function') {
                        window.tefaMqttClient.unsubscribe(prevSub);
                    }
                    window.tefaMqttClient.subscribe(nextSub, { qos: 0 }, function (err) {
                        if (err) {
                            console.error('[TeFa MQTT] Gagal subscribe ke topik baru:', err);
                            setConnectionUI('Error', 'Gagal subscribe', false);
                        } else {
                            console.log('[TeFa MQTT] Topik subscribe diganti ke ' + nextSub);
                            setConnectionUI('Online', 'Menunggu data...', true);
                        }
                    });
                } catch (e) {
                    initMqttClient();
                    return;
                }
            }
            if (prevStatus !== nextStatus) {
                try {
                    if (prevStatus && typeof window.tefaMqttClient.unsubscribe === 'function') {
                        window.tefaMqttClient.unsubscribe(prevStatus);
                    }
                    if (nextStatus && nextStatus !== nextSub) {
                        window.tefaMqttClient.subscribe(nextStatus, { qos: 0 }, function (err) {
                            if (err) {
                                console.error('[TeFa MQTT] Gagal subscribe ke topik status baru:', err);
                            } else {
                                console.log('[TeFa MQTT] Topik status diganti ke ' + nextStatus);
                            }
                        });
                    }
                } catch (e) {
                    initMqttClient();
                }
            }
        }
    };

    function initChartControls() {
        var rangeTabs = document.getElementById('rangeTabs');
        if (rangeTabs) {
            rangeTabs.addEventListener('click', function (e) {
                if (e.target.tagName !== 'BUTTON') return;
                // Tunggu kelas .on berpindah lalu re-render grafik & sinkronkan dengan database
                setTimeout(function () {
                    renderTelemetryChart();
                    refreshHistoryFromSupabase(false);
                }, 0);
            });
        }

        var legendSpans = document.querySelectorAll('#telemetri .legend span');
        var keys = ['ec', 'ph', 'temp'];
        legendSpans.forEach(function (span, idx) {
            var key = keys[idx];
            if (!key) return;
            span.title = 'Klik untuk tampil/sembunyikan garis';
            span.addEventListener('click', function () {
                // Pastikan minimal 1 garis tetap tampil
                var activeCount = Object.keys(chartState.visibleSeries).filter(function (k) {
                    return chartState.visibleSeries[k];
                }).length;
                if (chartState.visibleSeries[key] && activeCount <= 1) return;

                chartState.visibleSeries[key] = !chartState.visibleSeries[key];
                if (chartState.visibleSeries[key]) span.classList.remove('dimmed');
                else span.classList.add('dimmed');
                applySeriesVisibility();
            });
        });

        // Jika sudah ada data tersimpan sebelumnya dari localStorage, langsung tampilkan
        if (telemetryLog.length > 0) {
            renderTelemetryChart();
            syncAwsHistoryTables(true);
        }
    }

    function init() {
        loadSavedMqttConfig();
        initChartControls();
        loadHistoryFromSupabase();
        setInterval(function () {
            if (document.hidden) return;
            refreshHistoryFromSupabase(true);
        }, 30000);
        initMqttClient();

        window.addEventListener('storage', function (e) {
            if (e.key === 'tefa_dashboard_settings' && typeof window.updateMqttConnectionConfig === 'function') {
                try {
                    var updated = JSON.parse(e.newValue || '{}');
                    window.updateMqttConnectionConfig({
                        brokerUrl: updated.mqttBroker,
                        topic: updated.mqttTopicSub,
                        publishTopic: updated.mqttTopicPub,
                        statusTopic: updated.mqttTopicStatus
                    });
                } catch (err) { }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

