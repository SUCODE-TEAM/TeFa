(function () {
    // Konfigurasi MQTT Broker (EMQX Public Broker - Test Sementara)
    // Catatan: Browser menggunakan WebSocket (wss:// port 8084) untuk terhubung ke broker yang sama
    // dengan port TCP 1883 pada ESP32 menggunakan protokol MQTT v3.1.1 (protocolVersion: 4).
    var MQTT_CONFIG = {
        brokerUrl: 'wss://broker.emqx.io:8084/mqtt',
        topic: 'tefa/smkn2yogyakarta/data',
        publishTopic: 'tefa/smkn2yogyakarta/control',
        options: {
            clientId: 'tefa_web_' + Math.random().toString(16).slice(2, 10),
            protocolId: 'MQTT',
            protocolVersion: 4, // MQTT v3.1.1
            clean: true,
            reconnectPeriod: 4000,
            connectTimeout: 10000
        }
    };

    var STORAGE_KEY_LOG = 'tefa_telemetry_log_v1';
    var minWaterTemp = null;
    var maxWaterTemp = null;
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
            return arr.filter(function (item) { return item && item.ts >= cutoff; }).slice(-2000);
        } catch (e) {
            return [];
        }
    }

    function saveTelemetryLog() {
        try {
            localStorage.setItem(STORAGE_KEY_LOG, JSON.stringify(telemetryLog.slice(-2000)));
        } catch (e) {
            // ignore quota errors
        }
    }

    function formatShortDate(ts) {
        var d = new Date(ts);
        var dd = String(d.getDate()).padStart(2, '0');
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        return dd + '/' + mm;
    }

    function formatClock(ts, withSec) {
        var d = new Date(ts);
        var hh = String(d.getHours()).padStart(2, '0');
        var mi = String(d.getMinutes()).padStart(2, '0');
        var ss = String(d.getSeconds()).padStart(2, '0');
        return withSec ? (hh + ':' + mi + ':' + ss) : (hh + ':' + mi);
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
                buckets[bKey] = { sumPh: 0, sumEc: 0, sumTemp: 0, count: 0, ts: bKey, lastTime: p.time };
                order.push(bKey);
            }
            buckets[bKey].sumPh += (p.ph || 0);
            buckets[bKey].sumEc += (p.ec || 0);
            buckets[bKey].sumTemp += (p.waterTemp || 0);
            buckets[bKey].count += 1;
            buckets[bKey].lastTime = p.time;
        });

        var agg = order.slice(-35).map(function (k) {
            var b = buckets[k];
            var axisLbl = '';
            var fullTime = '';
            if (rangeKey === '24J') {
                axisLbl = span < 2 * 60 * 1000 ? formatClock(b.ts, true) : formatClock(b.ts, false);
                fullTime = formatClock(b.ts, true);
            } else if (rangeKey === '7H') {
                axisLbl = formatShortDate(b.ts) + ' ' + formatClock(b.ts, false);
                fullTime = formatShortDate(b.ts) + ' · ' + formatClock(b.ts, false);
            } else {
                axisLbl = span > 48 * 3600 * 1000 ? formatShortDate(b.ts) : (formatShortDate(b.ts) + ' ' + formatClock(b.ts, false));
                fullTime = formatShortDate(b.ts) + ' · ' + formatClock(b.ts, false);
            }
            return {
                ts: b.ts,
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
            '#telemetri .legend span { cursor: pointer; user-select: none; transition: opacity 0.2s ease; }',
            '#telemetri .legend span.dimmed { opacity: 0.35; text-decoration: line-through; }',
            '.chart-hover-layer { position: absolute; pointer-events: none; z-index: 5; overflow: visible; }',
            '.chart-crosshair { position: absolute; top: 0; bottom: 0; width: 1.5px; background: repeating-linear-gradient(to bottom, rgba(27,94,32,0.45) 0 4px, transparent 4px 8px); opacity: 0; transition: left 0.08s ease-out, opacity 0.15s ease; }',
            '.chart-dot { position: absolute; width: 11px; height: 11px; border-radius: 50%; border: 2.5px solid #fff; transform: translate(-50%, -50%); opacity: 0; transition: left 0.08s ease-out, top 0.08s ease-out, opacity 0.15s ease; box-shadow: 0 2px 6px rgba(0,0,0,0.22); }',
            '.chart-tooltip { position: absolute; min-width: 185px; background: rgba(255,255,255,0.96); backdrop-filter: blur(8px); border: 1px solid #C8E6C9; border-radius: 12px; padding: 10px 13px; box-shadow: 0 10px 26px rgba(27,94,32,0.14); font-size: 12px; color: #1B3B1E; pointer-events: none; z-index: 10; opacity: 0; transition: left 0.08s ease-out, top 0.08s ease-out, opacity 0.15s ease; }',
            '.chart-tooltip-time { font-weight: 700; font-size: 11px; color: #2E7D32; margin-bottom: 6px; padding-bottom: 5px; border-bottom: 1px solid #E8F5E9; letter-spacing: 0.3px; }',
            '.chart-tooltip-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 3px 0; font-weight: 500; }',
            '.chart-tooltip-label { display: flex; align-items: center; gap: 6px; color: #4A664D; }',
            '.chart-tooltip-swatch { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }',
            '.chart-tooltip-val { font-weight: 700; color: #1B3B1E; font-variant-numeric: tabular-nums; }'
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

        var pathEc = makeLine('#1B5E20');
        var pathPh = makeLine('#66BB6A');
        var pathTemp = makeLine('#A5D6A7');

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
        dotEc.style.background = '#1B5E20';

        var dotPh = document.createElement('div');
        dotPh.className = 'chart-dot';
        dotPh.style.background = '#66BB6A';

        var dotTemp = document.createElement('div');
        dotTemp.className = 'chart-dot';
        dotTemp.style.background = '#A5D6A7';

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
                rowsHtml.push('<div class="chart-tooltip-row"><span class="chart-tooltip-label"><i class="chart-tooltip-swatch" style="background:#1B5E20"></i>EC / TDS</span><span class="chart-tooltip-val">' + (pt.ec || 0).toFixed(2) + ' mS/cm</span></div>');
            }
            if (chartState.visibleSeries.ph) {
                rowsHtml.push('<div class="chart-tooltip-row"><span class="chart-tooltip-label"><i class="chart-tooltip-swatch" style="background:#66BB6A"></i>pH</span><span class="chart-tooltip-val">' + (pt.ph || 0).toFixed(2) + ' pH</span></div>');
            }
            if (chartState.visibleSeries.temp) {
                rowsHtml.push('<div class="chart-tooltip-row"><span class="chart-tooltip-label"><i class="chart-tooltip-swatch" style="background:#A5D6A7"></i>Water Temp</span><span class="chart-tooltip-val">' + (pt.waterTemp || 0).toFixed(1) + ' °C</span></div>');
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
            return {
                phMin: parseFloat((saved.phMin || '5.5').replace(',', '.')) || 5.5,
                phMax: parseFloat((saved.phMax || '6.5').replace(',', '.')) || 6.5,
                tempMin: parseFloat((saved.tempMin || '20').replace(',', '.')) || 20,
                tempMax: parseFloat((saved.tempMax || '30').replace(',', '.')) || 30,
                humMin: parseFloat((saved.humMin || '50').replace(',', '.')) || 50,
                humMax: parseFloat((saved.humMax || '85').replace(',', '.')) || 85
            };
        } catch (e) {
            return { phMin: 5.5, phMax: 6.5, tempMin: 20, tempMax: 30, humMin: 50, humMax: 85 };
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
        if (weatherDesc && !isOnline) {
            weatherDesc.textContent = subText;
            weatherDesc.style.color = stateText === 'Connecting' ? '#E65100' : 'var(--red)';
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

        if (pts.length === 0) return;

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

        if (!fromPts) {
            chartState.paths.ec.setAttribute('d', buildSmoothPath(target.ec, h, false));
            chartState.paths.area.setAttribute('d', buildSmoothPath(target.ec, h, true));
            chartState.paths.ph.setAttribute('d', buildSmoothPath(target.ph, h, false));
            chartState.paths.temp.setAttribute('d', buildSmoothPath(target.temp, h, false));
        } else {
            var startTime = null;
            var duration = 450;

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
                    sp.textContent = i === 2 ? pts[0].axisLabel : '';
                });
            } else {
                var indices = [0, Math.floor((n - 1) * 0.25), Math.floor((n - 1) * 0.5), Math.floor((n - 1) * 0.75), n - 1];
                indices.forEach(function (idx, i) {
                    if (spans[i] && pts[idx]) {
                        spans[i].textContent = pts[idx].axisLabel;
                    }
                });
            }
        }
    }

    function updateDashboardUI(payload) {
        if (!payload || !Array.isArray(payload.sensors)) return;

        var sensorMap = {};
        payload.sensors.forEach(function (s) {
            if (s && s.id) sensorMap[s.id] = s;
        });

        var wifi = sensorMap['kekuatan_wiFi'];
        var ph = sensorMap['001pH'];
        var ec = sensorMap['002EC'];
        var light = sensorMap['003bh1750'];
        var airTemp = sensorMap['004aht20_temp'];
        var airHum = sensorMap['004aht20_hum'];
        var waterTemp = sensorMap['005sensorair'];

        var thr = getThresholds();
        var wibTime = formatWibTime(payload.timestamp);

        // Evaluasi status Normal / Warning
        var isPhWarn = ph && (ph.value < thr.phMin || ph.value > thr.phMax);
        var isWaterWarn = waterTemp && (waterTemp.value < thr.tempMin || waterTemp.value > thr.tempMax);
        var isHumWarn = airHum && (airHum.value < thr.humMin || airHum.value > thr.humMax);
        var overallStatus = (isPhWarn || isWaterWarn || isHumWarn) ? 'Warning' : 'Normal';

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
                s0.textContent = wifi ? ('WiFi ' + wifi.value.toFixed(1) + ' ' + (wifi.satuan || 'Mbps')) : (payload.device_id || 'Terhubung');
                s0.classList.remove('off');
            }

            // Sensor pH
            if (ph) {
                var v1 = hwItems[1].querySelector('.v');
                var s1 = hwItems[1].querySelector('.s');
                if (v1) { v1.textContent = ph.value.toFixed(2) + ' pH'; v1.classList.remove('off'); }
                if (s1) { s1.textContent = isPhWarn ? 'Warning' : 'Normal'; s1.classList.remove('off'); }
            }

            // Sensor EC/TDS
            if (ec) {
                var v2 = hwItems[2].querySelector('.v');
                var s2 = hwItems[2].querySelector('.s');
                if (v2) { v2.textContent = ec.value.toFixed(2) + ' ' + (ec.satuan || 'mS/cm'); v2.classList.remove('off'); }
                if (s2) { s2.textContent = 'Normal'; s2.classList.remove('off'); }
            }

            // BH1750 Light
            if (light) {
                var v3 = hwItems[3].querySelector('.v');
                var s3 = hwItems[3].querySelector('.s');
                if (v3) { v3.textContent = light.value.toFixed(1) + ' lx'; v3.classList.remove('off'); }
                if (s3) { s3.textContent = 'Aktif'; s3.classList.remove('off'); }
            }

            // Relay 8CH
            var v4 = hwItems[4].querySelector('.v');
            var s4 = hwItems[4].querySelector('.s');
            if (v4) { v4.textContent = 'Standby'; v4.classList.remove('off'); }
            if (s4) { s4.textContent = 'Terhubung'; s4.classList.remove('off'); }
        }

        // 2. Update Weather & Time Card
        var weatherTempEl = document.querySelector('.card.weather .temp');
        var weatherDescEl = document.querySelector('.card.weather .desc');
        var wstatsHumEl = document.querySelector('.card.weather .wstats > div:first-child > div');

        if (airTemp && weatherTempEl) {
            weatherTempEl.textContent = airTemp.value.toFixed(1) + '°C';
            weatherTempEl.style.fontSize = '';
            weatherTempEl.style.color = 'var(--ink)';
        }
        if (weatherDescEl) {
            weatherDescEl.textContent = 'Terhubung · ' + (payload.device_id || 'ESP32');
            weatherDescEl.style.color = '#2E7D32';
        }
        if (airHum && wstatsHumEl) {
            wstatsHumEl.innerHTML = '<small>Humidity</small>' + airHum.value.toFixed(1) + '%';
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
                    phSt.style.color = isPhWarn ? '#E65100' : '#2E7D32';
                }
            }
            if (ec) {
                var ecB = sensorCards[1].querySelector('.big b');
                var ecBar = sensorCards[1].querySelector('.bar i');
                var ecSt = sensorCards[1].querySelector('.st');
                if (ecB) ecB.innerHTML = ec.value.toFixed(2) + ' <span style="font-size:15px;font-weight:600;color:var(--mute)">' + (ec.satuan || 'mS/cm') + '</span>';
                if (ecBar) ecBar.style.width = Math.min(100, Math.max(5, (ec.value / 3.0) * 100)).toFixed(1) + '%';
                if (ecSt) {
                    ecSt.textContent = 'Optimal';
                    ecSt.style.color = '#2E7D32';
                }
            }
            if (light) {
                var lxB = sensorCards[2].querySelector('.big b');
                var lxBar = sensorCards[2].querySelector('.bar i');
                var lxSt = sensorCards[2].querySelector('.st');
                if (lxB) lxB.innerHTML = light.value.toFixed(1) + ' <span style="font-size:15px;font-weight:600;color:var(--mute)">' + (light.satuan || 'lx') + '</span>';
                if (lxBar) lxBar.style.width = Math.min(100, Math.max(5, (light.value / 10000) * 100)).toFixed(1) + '%';
                if (lxSt) {
                    lxSt.textContent = light.value > 200 ? 'Terang' : 'Redup';
                    lxSt.style.color = '#2E7D32';
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
            }
            if (donutB) {
                donutB.textContent = wtVal.toFixed(1) + '°';
                donutB.style.fontSize = '36px';
                donutB.style.color = 'var(--ink)';
            }
            if (minmaxSpans.length >= 3) {
                minmaxSpans[0].textContent = 'Min: ' + minWaterTemp.toFixed(1) + '°C';
                minmaxSpans[1].textContent = isWaterWarn ? 'Status: Warning' : 'Status: Normal';
                minmaxSpans[1].style.color = isWaterWarn ? '#E65100' : '#2E7D32';
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
                { s: light, text: light ? light.value.toFixed(1) + ' lx' : 'N/A', pct: light ? (light.value / 10000) * 100 : 0 }
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
        var logEntry = {
            ts: Date.now(),
            time: wibTime,
            ph: ph ? ph.value : 0,
            ec: ec ? ec.value : 0,
            waterTemp: waterTemp ? waterTemp.value : 0,
            airTemp: airTemp ? airTemp.value : 0,
            light: light ? light.value : 0
        };
        telemetryHistory.push(logEntry);
        if (telemetryHistory.length > 15) telemetryHistory.shift();

        telemetryLog.push(logEntry);
        if (telemetryLog.length > 2000) telemetryLog.shift();
        saveTelemetryLog();

        renderTelemetryChart();

        // 7. Tambah ke Tabel History Sensor (#hist)
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

        // 8. Update AWS (pakai data sensor yang sudah ada: AHT20 & BH1750)
        var awsCards = document.querySelectorAll('.awsgrid .card.awsc');
        if (awsCards.length >= 2) {
            // Air Monitoring
            var airCard = awsCards[0];
            var airBadge = airCard.querySelector('.awsh .badge-offline, .awsh span');
            if (airBadge && (airTemp || airHum)) {
                airBadge.textContent = 'Online';
                airBadge.classList.remove('badge-offline');
                airBadge.style.background = '#E8F5E9';
                airBadge.style.color = '#2E7D32';
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
                luxBadge.style.background = '#E8F5E9';
                luxBadge.style.color = '#2E7D32';
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
                        var hPx = Math.min(44, Math.max(6, (pt.light / 2000) * 44));
                        bar.style.height = hPx.toFixed(0) + 'px';
                        bar.style.background = 'var(--g5)';
                    }
                });
                var luxCap = luxCard.querySelector('.cap');
                if (luxCap && light) luxCap.textContent = 'Estimasi dari BH1750 (' + light.value.toFixed(0) + ' lux)';
            }
        }

        // Tambah ke Tabel History AWS (Daily)
        if (typeof window.addAwsHistoryRow === 'function') {
            var solarTxt = light ? ((light.value * 0.0079).toFixed(1) + ' W/m² · ' + (light.value * 0.0185).toFixed(0) + ' PAR') : '-';
            window.addAwsHistoryRow({
                time: wibTime + ' WIB',
                temp: airTemp ? (airTemp.value.toFixed(1) + ' °C') : '-',
                hum: airHum ? (airHum.value.toFixed(1) + '%') : '-',
                wind: '-',
                solar: solarTxt,
                soil: '-'
            }, 'daily');
        }
    }

    function initMqttClient() {
        if (typeof mqtt === 'undefined') {
            console.warn('[TeFa MQTT] Library mqtt.min.js belum termuat.');
            return;
        }

        console.log('[TeFa MQTT] Menghubungkan ke ' + MQTT_CONFIG.brokerUrl + ' (MQTT v3.1.1)...');
        setConnectionUI('Connecting', 'Menghubungkan MQTT...', false);

        var client = mqtt.connect(MQTT_CONFIG.brokerUrl, MQTT_CONFIG.options);

        client.on('connect', function () {
            console.log('[TeFa MQTT] Terhubung ke broker.emqx.io! Subscribe topik: ' + MQTT_CONFIG.topic);
            setConnectionUI('Online', 'Menunggu data...', true);

            client.subscribe(MQTT_CONFIG.topic, { qos: 0 }, function (err) {
                if (err) {
                    console.error('[TeFa MQTT] Gagal subscribe:', err);
                    setConnectionUI('Error', 'Gagal subscribe', false);
                } else {
                    console.log('[TeFa MQTT] Berhasil subscribe ke ' + MQTT_CONFIG.topic);
                }
            });

            if (pendingSettingsPayload !== null) {
                var queuedPayload = pendingSettingsPayload;
                pendingSettingsPayload = null;
                sendSettingsPayload(client, queuedPayload);
            }
        });

        client.on('message', function (topic, message) {
            try {
                var raw = message.toString();
                var data = JSON.parse(raw);
                console.log('[TeFa MQTT] Data diterima dari ' + topic + ':', data);
                updateDashboardUI(data);
            } catch (e) {
                console.error('[TeFa MQTT] Gagal parsing JSON:', e);
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
                } catch (e) {}
            }
            return 'queued';
        }
    };

    function initChartControls() {
        var rangeTabs = document.getElementById('rangeTabs');
        if (rangeTabs) {
            rangeTabs.addEventListener('click', function (e) {
                if (e.target.tagName !== 'BUTTON') return;
                // Tunggu kelas .on berpindah lalu re-render grafik
                setTimeout(function () {
                    renderTelemetryChart();
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
        }
    }

    function init() {
        initChartControls();
        initMqttClient();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

