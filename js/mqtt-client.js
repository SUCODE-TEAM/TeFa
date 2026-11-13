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

    var minWaterTemp = null;
    var maxWaterTemp = null;
    var telemetryHistory = []; // max 15 titik untuk grafik SVG

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

    function renderTelemetryChart() {
        var chartEmpty = document.querySelector('#telemetri .chart-empty-msg');
        var svg = document.querySelector('#telemetri svg.plot');
        var xax = document.querySelector('#telemetri .xax');
        if (!svg || telemetryHistory.length === 0) return;

        if (chartEmpty) chartEmpty.style.display = 'none';

        // Hapus path data lama (sisakan <defs> dan grid <g>)
        svg.querySelectorAll('.live-line').forEach(function (el) { el.remove(); });

        var w = 1260;
        var h = 260;
        var n = telemetryHistory.length;

        function buildPath(values, maxVal) {
            return values.map(function (val, idx) {
                var x = n === 1 ? w / 2 : (idx / (n - 1)) * w;
                var ratio = Math.min(1, Math.max(0, val / maxVal));
                var y = h - 10 - ratio * (h - 30);
                return (idx === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
            }).join(' ');
        }

        var series = [
            { vals: telemetryHistory.map(function (p) { return (p.ec || 0) * 33; }), max: 100, color: '#1B5E20' }, // EC scaled
            { vals: telemetryHistory.map(function (p) { return (p.ph || 0) * 7; }), max: 100, color: '#66BB6A' },  // pH scaled
            { vals: telemetryHistory.map(function (p) { return p.waterTemp || 0; }), max: 50, color: '#A5D6A7' }   // Temp
        ];

        var ns = 'http://www.w3.org/2000/svg';
        series.forEach(function (s) {
            var path = document.createElementNS(ns, 'path');
            path.setAttribute('class', 'live-line');
            path.setAttribute('d', buildPath(s.vals, s.max));
            path.setAttribute('stroke', s.color);
            path.setAttribute('stroke-width', '3');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            path.setAttribute('fill', 'none');
            svg.appendChild(path);
        });

        if (xax && n > 1) {
            var indices = [0, Math.floor((n - 1) * 0.25), Math.floor((n - 1) * 0.5), Math.floor((n - 1) * 0.75), n - 1];
            var spans = xax.querySelectorAll('span');
            indices.forEach(function (idx, i) {
                if (spans[i] && telemetryHistory[idx]) {
                    spans[i].textContent = telemetryHistory[idx].time.slice(0, 5);
                }
            });
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

        // 6. Update Telemetry Chart
        telemetryHistory.push({
            time: wibTime,
            ph: ph ? ph.value : 0,
            ec: ec ? ec.value : 0,
            waterTemp: waterTemp ? waterTemp.value : 0,
            airTemp: airTemp ? airTemp.value : 0,
            light: light ? light.value : 0
        });
        if (telemetryHistory.length > 15) telemetryHistory.shift();
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

    window.publishMqttSettings = function (payload) {
        var jsonStr = JSON.stringify(payload);
        if (window.tefaMqttClient && window.tefaMqttClient.connected) {
            window.tefaMqttClient.publish(MQTT_CONFIG.publishTopic, jsonStr, { qos: 0 }, function (err) {
                if (err) {
                    console.error('[TeFa MQTT] Gagal publish setting:', err);
                } else {
                    console.log('[TeFa MQTT] Setting berhasil dipublish ke ' + MQTT_CONFIG.publishTopic + ':', payload);
                }
            });
            return true;
        } else {
            console.warn('[TeFa MQTT] Belum terhubung ke broker, payload tidak terkirim:', payload);
            return false;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMqttClient);
    } else {
        initMqttClient();
    }
})();

