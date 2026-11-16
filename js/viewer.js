(function () {
    // Live clock for Date & Time card
    var dateEl = document.getElementById('date');
    function updateClock() {
        if (!dateEl) return;
        var now = new Date();
        var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        var p = function (n) { return String(n).padStart(2, '0'); };
        var str = days[now.getDay()] + ', ' + now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear() + ' · ' + p(now.getHours()) + ':' + p(now.getMinutes()) + ' WIB';
        dateEl.textContent = str;
    }
    updateClock();
    setInterval(updateClock, 30000);

    // Bars rendering for AWS (will be flat 0 height when disconnected)
    document.querySelectorAll('.bars').forEach(function (b) {
        b.innerHTML = '';
        var h = b.dataset.h.split(',').map(Number);
        h.forEach(function () {
            var e = document.createElement('i');
            e.style.height = '4px';
            e.style.background = 'var(--g1)';
            b.appendChild(e);
        });
    });

    // Tabs interaction
    [['rangeTabs'], ['awsTabs']].forEach(function (a) {
        var c = document.getElementById(a[0]);
        if (c) {
            c.addEventListener('click', function (e) {
                if (e.target.tagName !== 'BUTTON') return;
                c.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
                e.target.classList.add('on');
            });
        }
    });

    // CSV Download button (alerts if no data)
    var csvBtn = document.getElementById('csv');
    if (csvBtn) {
        csvBtn.addEventListener('click', function () {
            var rows = [].map.call(document.querySelectorAll('#hist tr'), function (r) {
                return [].map.call(r.children, function (c) { return '"' + c.textContent.trim() + '"'; }).join(String.fromCharCode(10));
            }).join(String.fromCharCode(10));

            var isEmpty = document.querySelector('#hist .empty-table-cell') !== null;
            if (isEmpty) {
                alert('Peringatan: Sensor sedang terputus (N/A). Belum ada data pengukuran yang dapat diekspor.');
                return;
            }
            var a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([rows], { type: 'text/csv' }));
            a.download = 'sensor-data.csv';
            a.click();
        });
    }

    // Unified Navigation Scrollspy & Sliding Indicator
    var navContainer = document.getElementById('navLinksContainer');
    var navIndicator = document.getElementById('navIndicator');
    var navLinks = document.querySelectorAll('.nav-links a');
    var spySectionIds = ['top', 'telemetri', 'hardware', 'aws'];
    var isUserNavClick = false;
    var navClickTimer = null;
    var currentNavSection = 'top';

    function moveNavIndicator(targetLink) {
        if (!navIndicator || !navContainer) return;
        if (navContainer.offsetParent === null) return; // Hidden on mobile/tablet
        var activeLink = targetLink || navContainer.querySelector('a.active') || navLinks[0];
        if (activeLink && activeLink.offsetParent !== null) {
            var cRect = navContainer.getBoundingClientRect();
            var lRect = activeLink.getBoundingClientRect();
            if (lRect.width > 0) {
                navIndicator.style.left = (lRect.left - cRect.left) + 'px';
                navIndicator.style.width = lRect.width + 'px';
            }
        }
    }

    function syncActiveSection(secId, shouldMoveIndicator) {
        currentNavSection = secId;
        var desktopLinks = document.querySelectorAll('.nav-links a');
        var mobileLinks = document.querySelectorAll('.mobile-nav-link');
        var targetDesktopLink = null;

        desktopLinks.forEach(function (l) {
            if (l.getAttribute('href') === '#' + secId) {
                l.classList.add('active');
                targetDesktopLink = l;
            } else {
                l.classList.remove('active');
            }
        });

        mobileLinks.forEach(function (ml) {
            if (ml.getAttribute('href') === '#' + secId) {
                ml.classList.add('active');
            } else {
                ml.classList.remove('active');
            }
        });

        if (shouldMoveIndicator !== false && targetDesktopLink) {
            moveNavIndicator(targetDesktopLink);
        }
    }
    window.syncActiveSection = syncActiveSection;
    window.setNavClicking = function (state) {
        isUserNavClick = state;
    };

    function releaseClickLock() {
        if (isUserNavClick) {
            isUserNavClick = false;
            clearTimeout(navClickTimer);
        }
    }
    window.addEventListener('wheel', releaseClickLock, { passive: true });
    window.addEventListener('touchmove', releaseClickLock, { passive: true });

    // Indicator initialization and resize handling
    window.addEventListener('load', function () { moveNavIndicator(); });
    window.addEventListener('resize', function () { moveNavIndicator(); });
    setTimeout(function () { moveNavIndicator(); }, 100);
    setTimeout(function () { moveNavIndicator(); }, 300);
    setTimeout(function () { moveNavIndicator(); }, 600);
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { moveNavIndicator(); });
    }

    // Desktop nav click handling
    navLinks.forEach(function (link) {
        link.addEventListener('click', function (e) {
            var targetHref = this.getAttribute('href');
            if (targetHref && targetHref.startsWith('#')) {
                e.preventDefault();
                var secId = targetHref.substring(1);
                var targetEl = document.getElementById(secId);
                if (targetEl) {
                    isUserNavClick = true;
                    clearTimeout(navClickTimer);

                    syncActiveSection(secId, true);

                    var topRow = document.querySelector('.top-row');
                    var navHeight = topRow ? topRow.offsetHeight + 24 : 86;
                    var elementPosition = targetEl.getBoundingClientRect().top;
                    var offsetPosition = elementPosition + window.pageYOffset - navHeight;

                    window.scrollTo({
                        top: Math.max(0, offsetPosition),
                        behavior: 'smooth'
                    });

                    navClickTimer = setTimeout(function () {
                        isUserNavClick = false;
                    }, 850);
                }
            }
        });
    });

    // Single unified scroll listener
    window.addEventListener('scroll', function () {
        var topRow = document.querySelector('.top-row');
        if (topRow) {
            if (window.scrollY > 15) {
                topRow.classList.add('scrolled');
            } else {
                topRow.classList.remove('scrolled');
            }
        }

        if (isUserNavClick) return;

        var topRowHeight = topRow ? topRow.offsetHeight : 80;
        var threshold = topRowHeight + 110;
        var currentId = 'top';

        // Check if user scrolled to bottom of page (forcing AWS)
        var scrollBottom = window.innerHeight + window.pageYOffset;
        var docHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.offsetHeight
        );
        var isAtBottom = scrollBottom >= (docHeight - 70);

        if (isAtBottom) {
            currentId = 'aws';
        } else if (window.pageYOffset < 60) {
            currentId = 'top';
        } else {
            spySectionIds.forEach(function (id) {
                var el = document.getElementById(id);
                if (el) {
                    var r = el.getBoundingClientRect();
                    if (r.top <= threshold) {
                        currentId = id;
                    }
                }
            });
        }

        if (currentId !== currentNavSection) {
            syncActiveSection(currentId, true);
        } else if (navIndicator && (!navIndicator.style.width || navIndicator.style.width === '0px')) {
            moveNavIndicator();
        }
    }, { passive: true });

    // AOS (Animate On Scroll) Initialization & Staggered Card Setup
    function initScrollReveal() {
        ['.row2', '.row3', '.relay-sec', '.hwcards', '.awsgrid'].forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (el) {
                el.removeAttribute('data-aos');
                el.removeAttribute('data-aos-delay');
                el.removeAttribute('data-aos-duration');
            });
        });

        function applyAOS(el, anim, delay) {
            if (!el) return;
            if (!el.getAttribute('data-aos')) {
                el.setAttribute('data-aos', anim || 'fade-up');
            }
            if (delay && !el.getAttribute('data-aos-delay')) {
                el.setAttribute('data-aos-delay', String(delay));
            }
        }

        document.querySelectorAll('.hero').forEach(function (el) {
            applyAOS(el, 'fade-down', 0);
        });

        document.querySelectorAll('.row2 .weather').forEach(function (el) {
            applyAOS(el, 'fade-up', 60);
        });
        document.querySelectorAll('.row2 .sensor').forEach(function (el, idx) {
            applyAOS(el, 'fade-up', 100 + idx * 80);
        });

        document.querySelectorAll('.row3 > .card').forEach(function (el, idx) {
            applyAOS(el, 'fade-up', idx * 100);
        });

        document.querySelectorAll('.card.chart, .card.tcard').forEach(function (el, idx) {
            applyAOS(el, 'fade-up', idx * 80);
        });

        document.querySelectorAll('#hardware, .awsbar').forEach(function (el) {
            applyAOS(el, 'fade-up', 0);
        });

        document.querySelectorAll('.hwcards .hwc').forEach(function (el, idx) {
            applyAOS(el, 'fade-up', idx * 75);
        });

        document.querySelectorAll('.awsgrid .awsc').forEach(function (el, idx) {
            applyAOS(el, 'fade-up', (idx % 2) * 90);
        });

        document.querySelectorAll('footer').forEach(function (el) {
            applyAOS(el, 'fade-up', 0);
        });

        if (window.AOS) {
            window.AOS.init({
                duration: 750,
                easing: 'ease-out-cubic',
                once: false,
                mirror: true,
                offset: 50,
                anchorPlacement: 'top-bottom'
            });
            window.addEventListener('load', function () {
                if (window.AOS) window.AOS.refresh();
            });
        }
    }

    // Setting Modal Logic (Setting.svg)
    function initSettingModal() {
        var gearBtn = document.querySelector('.gear');
        var backdrop = document.getElementById('settingModalBackdrop');
        var modal = document.getElementById('settingModal');
        var closeBtn = document.getElementById('settingBtnClose');
        var resetBtn = document.getElementById('setBtnReset');
        var saveBtn = document.getElementById('setBtnSave');

        if (!gearBtn || !backdrop) return;

        var defaultSettings = {
            phMin: '5,5', phMax: '6,5',
            tdsMin: '600', tdsMax: '1200',
            tempMin: '20', tempMax: '30',
            humMin: '50', humMax: '85',
            interval: '3',
            aiProvider: 'gemini',
            apiKey: ''
        };

        function loadSettings() {
            try {
                var saved = JSON.parse(localStorage.getItem('tefa_dashboard_settings') || '{}');
                if (document.getElementById('set_ph_min')) document.getElementById('set_ph_min').value = saved.phMin || defaultSettings.phMin;
                if (document.getElementById('set_ph_max')) document.getElementById('set_ph_max').value = saved.phMax || defaultSettings.phMax;
                if (document.getElementById('set_tds_min')) document.getElementById('set_tds_min').value = saved.tdsMin || defaultSettings.tdsMin;
                if (document.getElementById('set_tds_max')) document.getElementById('set_tds_max').value = saved.tdsMax || defaultSettings.tdsMax;
                if (document.getElementById('set_temp_min')) document.getElementById('set_temp_min').value = saved.tempMin || defaultSettings.tempMin;
                if (document.getElementById('set_temp_max')) document.getElementById('set_temp_max').value = saved.tempMax || defaultSettings.tempMax;
                if (document.getElementById('set_hum_min')) document.getElementById('set_hum_min').value = saved.humMin || defaultSettings.humMin;
                if (document.getElementById('set_hum_max')) document.getElementById('set_hum_max').value = saved.humMax || defaultSettings.humMax;
                if (document.getElementById('set_telemetry_interval')) document.getElementById('set_telemetry_interval').value = saved.interval || defaultSettings.interval;
                if (document.getElementById('set_ai_provider')) document.getElementById('set_ai_provider').value = saved.aiProvider || defaultSettings.aiProvider;
                if (document.getElementById('set_ai_api_key')) document.getElementById('set_ai_api_key').value = saved.apiKey || defaultSettings.apiKey;
            } catch (e) {
                console.error('Failed to load settings:', e);
            }
        }

        function openModal() {
            // Tutup modal lain agar tidak saling menumpuk
            var aiPopup = document.getElementById('aiChatPopup');
            var aiBtn = document.getElementById('aiAssistantBtn');
            if (aiPopup && aiPopup.classList.contains('open')) {
                aiPopup.classList.remove('open');
                aiPopup.classList.remove('closing');
                if (aiBtn) aiBtn.classList.remove('hidden');
            }
            var notifBackdrop = document.getElementById('notifModalBackdrop');
            var notifBtn = document.getElementById('notifBtn');
            if (notifBackdrop && notifBackdrop.classList.contains('open')) {
                notifBackdrop.classList.remove('open');
                notifBackdrop.classList.remove('closing');
                if (notifBtn) notifBtn.classList.remove('hidden');
            }
            loadSettings();
            var rect = gearBtn.getBoundingClientRect();
            var top = Math.max(12, rect.top);
            var right = Math.max(12, window.innerWidth - rect.right);
            if (window.innerWidth - right < 590) {
                right = Math.min(right, window.innerWidth - 600);
                if (right < 16) right = 16;
            }
            modal.style.top = top + 'px';
            modal.style.right = right + 'px';
            gearBtn.classList.add('hidden');
            backdrop.classList.remove('closing');
            backdrop.classList.add('open');
        }

        function closeModal() {
            if (!backdrop.classList.contains('open')) return;
            backdrop.classList.add('closing');
            setTimeout(function () {
                backdrop.classList.remove('open');
                backdrop.classList.remove('closing');
                gearBtn.classList.remove('hidden');
            }, 320);
        }

        gearBtn.style.cursor = 'pointer';
        gearBtn.title = 'Pengaturan Dashboard';
        gearBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            openModal();
        });

        if (closeBtn) {
            closeBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                closeModal();
            });
        }

        backdrop.addEventListener('click', function (e) {
            if (e.target === backdrop) {
                closeModal();
            }
        });

        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                document.getElementById('set_ph_min').value = defaultSettings.phMin;
                document.getElementById('set_ph_max').value = defaultSettings.phMax;
                document.getElementById('set_tds_min').value = defaultSettings.tdsMin;
                document.getElementById('set_tds_max').value = defaultSettings.tdsMax;
                document.getElementById('set_temp_min').value = defaultSettings.tempMin;
                document.getElementById('set_temp_max').value = defaultSettings.tempMax;
                document.getElementById('set_hum_min').value = defaultSettings.humMin;
                document.getElementById('set_hum_max').value = defaultSettings.humMax;
                if (document.getElementById('set_telemetry_interval')) document.getElementById('set_telemetry_interval').value = defaultSettings.interval;
                if (document.getElementById('set_ai_provider')) document.getElementById('set_ai_provider').value = defaultSettings.aiProvider;
                if (document.getElementById('set_ai_api_key')) document.getElementById('set_ai_api_key').value = defaultSettings.apiKey;
                localStorage.removeItem('tefa_dashboard_settings');
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', function () {
                var newSettings = {
                    phMin: document.getElementById('set_ph_min').value.trim(),
                    phMax: document.getElementById('set_ph_max').value.trim(),
                    tdsMin: document.getElementById('set_tds_min').value.trim(),
                    tdsMax: document.getElementById('set_tds_max').value.trim(),
                    tempMin: document.getElementById('set_temp_min').value.trim(),
                    tempMax: document.getElementById('set_temp_max').value.trim(),
                    humMin: document.getElementById('set_hum_min').value.trim(),
                    humMax: document.getElementById('set_hum_max').value.trim(),
                    interval: document.getElementById('set_telemetry_interval') ? document.getElementById('set_telemetry_interval').value : defaultSettings.interval,
                    aiProvider: document.getElementById('set_ai_provider') ? document.getElementById('set_ai_provider').value : defaultSettings.aiProvider,
                    apiKey: document.getElementById('set_ai_api_key') ? document.getElementById('set_ai_api_key').value.trim() : defaultSettings.apiKey
                };
                localStorage.setItem('tefa_dashboard_settings', JSON.stringify(newSettings));

                var originalText = saveBtn.textContent;
                saveBtn.textContent = 'SAVED ✓';
                saveBtn.style.background = '#1B4332';
                setTimeout(function () {
                    saveBtn.textContent = originalText;
                    saveBtn.style.background = '#0D2818';
                    closeModal();
                }, 500);
            });
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && backdrop.classList.contains('open')) {
                closeModal();
            }
        });
    }

    function initAIAssistant() {
        var aiBtn = document.getElementById('aiAssistantBtn');
        var aiPopup = document.getElementById('aiChatPopup');
        var aiClose = document.getElementById('aiBtnClose');
        var aiClear = document.getElementById('aiBtnClear');
        var aiSend = document.getElementById('aiBtnSend');
        var aiInput = document.getElementById('aiInput');
        var aiMessages = document.getElementById('aiChatMessages');
        var aiBtnTtsToggle = document.getElementById('aiBtnTtsToggle');
        var aiBtnVoiceOrb = document.getElementById('aiBtnVoiceOrb');
        var aiBtnMic = document.getElementById('aiBtnMic');
        var voicePanel = document.getElementById('aiVoiceOrbPanel');
        var orbStatusBadge = document.getElementById('aiOrbStatusBadge');
        var orbMicBtn = document.getElementById('aiOrbMicBtn');
        var orbBackBtn = document.getElementById('aiOrbBackBtn');
        var orbCloseBtn = document.getElementById('aiOrbCloseBtn');
        var orbResizeHandle = document.getElementById('aiOrbResizeHandle');
        var orbSizeDownBtn = document.getElementById('aiOrbSizeDownBtn');
        var orbSizeUpBtn = document.getElementById('aiOrbSizeUpBtn');
        var orbTrigger = document.getElementById('aiOrbTrigger');
        var orbTopbar = voicePanel ? voicePanel.querySelector('.ai-voice-orb-topbar') : null;
        var orbCanvas = document.getElementById('aiVoiceOrbCanvas');
        var orbTranscript = document.getElementById('aiOrbTranscript');

        if (!aiBtn || !aiPopup) return;

        var DEFAULT_ORB_HINT = 'Generate expressive prompts by speaking naturally. Ketuk orb untuk mulai bertanya dengan suara.';
        var MIN_ORB_SIZE = 120;
        var MAX_ORB_SIZE = 560;
        var currentOrbSize = window.innerWidth <= 680 ? 180 : 380;
        var suppressOrbClick = false;
        var ttsEnabled = true;
        var isListening = false;
        var isSpeaking = false;
        var orbMode = 'idle'; // 'idle' | 'listening' | 'speaking'
        var orbRafId = null;
        var orbPhase = 0;
        var smoothedEnergy = 0;
        var speechPulse = 0;
        var recognition = null;
        var latestTranscript = '';
        var audioCtx = null;
        var analyser = null;
        var freqData = null;
        var micStream = null;
        var activeSpeakBtn = null;
        var preferredVoice = null;

        function resolveIndonesianVoice() {
            if (!('speechSynthesis' in window)) return null;
            var voices = window.speechSynthesis.getVoices() || [];
            for (var i = 0; i < voices.length; i++) {
                if (voices[i].lang && voices[i].lang.toLowerCase().indexOf('id') === 0) {
                    return voices[i];
                }
            }
            for (var j = 0; j < voices.length; j++) {
                if (voices[j].default) return voices[j];
            }
            return voices[0] || null;
        }

        if ('speechSynthesis' in window) {
            preferredVoice = resolveIndonesianVoice();
            if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
                window.speechSynthesis.onvoiceschanged = function () {
                    preferredVoice = resolveIndonesianVoice();
                };
            }
        }

        function setOrbStatus(text, stateClass) {
            if (orbStatusBadge) orbStatusBadge.textContent = text;
            if (!voicePanel) return;
            voicePanel.classList.remove('is-listening', 'is-speaking');
            if (stateClass) voicePanel.classList.add(stateClass);
        }

        function setOrbTranscript(text, isActiveSpeech) {
            if (!orbTranscript) return;
            orbTranscript.textContent = text;
            if (isActiveSpeech) {
                orbTranscript.classList.add('active-speech');
            } else {
                orbTranscript.classList.remove('active-speech');
            }
        }

        function updateMicButtonsUI(active) {
            if (aiBtnMic) aiBtnMic.classList.toggle('listening', active);
            if (orbMicBtn) orbMicBtn.classList.toggle('active', active);
        }

        function updateTtsToggleUI() {
            if (!aiBtnTtsToggle) return;
            aiBtnTtsToggle.classList.toggle('active', ttsEnabled);
            aiBtnTtsToggle.title = ttsEnabled
                ? 'Suara AI (Text-to-Speech) Aktif'
                : 'Suara AI (Text-to-Speech) Nonaktif';
            var volOn = aiBtnTtsToggle.querySelector('.icon-vol-on');
            var volOff = aiBtnTtsToggle.querySelector('.icon-vol-off');
            if (volOn) volOn.style.display = ttsEnabled ? '' : 'none';
            if (volOff) volOff.style.display = ttsEnabled ? 'none' : '';
        }

        function stopMicAnalyser() {
            if (micStream) {
                var tracks = micStream.getTracks();
                for (var i = 0; i < tracks.length; i++) {
                    tracks[i].stop();
                }
                micStream = null;
            }
            if (audioCtx && typeof audioCtx.close === 'function') {
                try {
                    audioCtx.close();
                } catch (err) {
                    // ignore AudioContext close errors
                }
            }
            audioCtx = null;
            analyser = null;
            freqData = null;
        }

        function startMicAnalyser() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;

            navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
                if (!isListening) {
                    stream.getTracks().forEach(function (t) { t.stop(); });
                    return;
                }
                micStream = stream;
                audioCtx = new AudioCtx();
                var source = audioCtx.createMediaStreamSource(stream);
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 64;
                analyser.smoothingTimeConstant = 0.78;
                source.connect(analyser);
                freqData = new Uint8Array(analyser.frequencyBinCount);
            }).catch(function () {
                // Fallback gracefully to procedural + speechPulse reactivity
            });
        }

        function resetSpeakButtons() {
            if (!aiMessages) return;
            var btns = aiMessages.querySelectorAll('.ai-msg-speak-btn.speaking');
            for (var i = 0; i < btns.length; i++) {
                btns[i].classList.remove('speaking');
                var label = btns[i].querySelector('span');
                if (label) label.textContent = 'Dengarkan';
            }
            activeSpeakBtn = null;
        }

        function stopSpeaking() {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
            isSpeaking = false;
            resetSpeakButtons();
            if (!isListening) {
                orbMode = 'idle';
                setOrbStatus('Ketuk Orb untuk Bicara', '');
            }
        }

        function speakText(text, btnEl) {
            if (!('speechSynthesis' in window) || !text) return;

            var clickedSameActive = btnEl && activeSpeakBtn === btnEl && isSpeaking;
            stopSpeaking();
            if (clickedSameActive) return;

            var cleanText = String(text).replace(/\s+/g, ' ').trim();
            if (!cleanText) return;

            var utterance = new SpeechSynthesisUtterance(cleanText);
            if (!preferredVoice) preferredVoice = resolveIndonesianVoice();
            if (preferredVoice) utterance.voice = preferredVoice;
            utterance.lang = 'id-ID';
            utterance.rate = 1.02;
            utterance.pitch = 1.0;

            if (btnEl) {
                activeSpeakBtn = btnEl;
                btnEl.classList.add('speaking');
                var spanEl = btnEl.querySelector('span');
                if (spanEl) spanEl.textContent = 'Berhenti';
            }

            utterance.onstart = function () {
                isSpeaking = true;
                if (!isListening) {
                    orbMode = 'speaking';
                    setOrbStatus('AI Sedang Berbicara...', 'is-speaking');
                }
            };

            utterance.onend = function () {
                isSpeaking = false;
                resetSpeakButtons();
                if (!isListening) {
                    orbMode = 'idle';
                    setOrbStatus('Ketuk Orb untuk Bicara', '');
                }
            };

            utterance.onerror = function () {
                isSpeaking = false;
                resetSpeakButtons();
                if (!isListening) {
                    orbMode = 'idle';
                    setOrbStatus('Ketuk Orb untuk Bicara', '');
                }
            };

            window.speechSynthesis.speak(utterance);
        }

        // Render Halftone Concentric Ring Voice Orb on Pure Black Canvas
        function renderVoiceOrbFrame() {
            if (!orbCanvas || !voicePanel || !voicePanel.classList.contains('open')) {
                orbRafId = null;
                return;
            }

            var ctx = orbCanvas.getContext('2d');
            if (!ctx) return;

            var w = orbCanvas.width;
            var h = orbCanvas.height;
            var cx = w * 0.5;
            var cy = h * 0.5;
            var R = Math.min(w, h) * 0.44;
            var step = 6;

            ctx.clearRect(0, 0, w, h);

            var targetEnergy = 0.04;
            if (orbMode === 'listening') {
                var micLevel = 0;
                if (analyser && freqData) {
                    analyser.getByteFrequencyData(freqData);
                    var sum = 0;
                    for (var f = 0; f < freqData.length; f++) {
                        sum += freqData[f];
                    }
                    micLevel = Math.min(1, (sum / (freqData.length * 145)));
                }
                var basePulse = 0.16 + 0.07 * Math.sin(orbPhase * 1.9);
                targetEnergy = Math.min(1, Math.max(basePulse, micLevel * 0.95) + speechPulse * 0.45);
            } else if (orbMode === 'speaking') {
                var cadence = Math.abs(Math.sin(orbPhase * 2.4)) * 0.48
                    + Math.abs(Math.cos(orbPhase * 3.9)) * 0.28
                    + Math.sin(orbPhase * 1.1) * 0.08;
                targetEnergy = Math.min(1, 0.22 + Math.max(0, cadence) * 0.65);
            }

            speechPulse *= 0.88;
            smoothedEnergy += (targetEnergy - smoothedEnergy) * 0.18;
            orbPhase += orbMode === 'idle' ? 0.032 : (0.075 + smoothedEnergy * 0.08);

            // Soft circular dark sphere strictly within orb radius so outside remains transparent
            var sphereRadius = R * 1.06;
            var sphereGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sphereRadius);
            sphereGrad.addColorStop(0, 'rgba(6, 10, 8, 0.94)');
            sphereGrad.addColorStop(0.58, 'rgba(6, 10, 8, 0.88)');
            sphereGrad.addColorStop(0.86, 'rgba(6, 10, 8, 0.56)');
            sphereGrad.addColorStop(1, 'rgba(6, 10, 8, 0)');
            ctx.beginPath();
            ctx.arc(cx, cy, sphereRadius, 0, Math.PI * 2);
            ctx.fillStyle = sphereGrad;
            ctx.fill();

            var coreRadius = (0.125 + smoothedEnergy * 0.024) * R;
            ctx.beginPath();
            ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(155, 158, 156, ' + (0.52 + smoothedEnergy * 0.16).toFixed(3) + ')';
            ctx.fill();

            var ringCenter = 0.38 + smoothedEnergy * 0.042;
            var ringSpread = 0.082 + smoothedEnergy * 0.034;

            for (var dy = -R; dy <= R; dy += step) {
                for (var dx = -R; dx <= R; dx += step) {
                    var r = Math.sqrt(dx * dx + dy * dy);
                    if (r > R) continue;

                    var u = r / R;
                    var theta = Math.atan2(dy, dx);
                    var angularWave =
                        Math.sin(theta * 3 + orbPhase) * (0.012 + smoothedEnergy * 0.032) +
                        Math.cos(theta * 5 - orbPhase * 1.35) * (0.008 + smoothedEnergy * 0.022);

                    var localCenter = ringCenter + angularWave;
                    var ringVal = Math.exp(-Math.pow((u - localCenter) / ringSpread, 2));

                    var outerFalloff = 0;
                    if (u > localCenter) {
                        var tOut = Math.min(1, (u - localCenter) / Math.max(0.01, 1 - localCenter));
                        outerFalloff = Math.pow(1 - tOut, 1.85) * 0.56;
                    } else {
                        var tIn = u / Math.max(0.01, localCenter);
                        outerFalloff = (0.20 + 0.16 * tIn);
                    }

                    var intensity = Math.min(1, ringVal * 1.18 + outerFalloff * 0.85);
                    var edgeFade = u > 0.9 ? Math.max(0.15, (1 - u) / 0.1) : 1;

                    var halfSize = 0.42 + Math.pow(intensity, 1.65) * (3.15 + smoothedEnergy * 1.1);
                    if (u < 0.12) {
                        halfSize = 0.72 + smoothedEnergy * 0.35;
                    }

                    var alpha = Math.min(1, (0.28 + Math.pow(intensity, 1.1) * 0.72) * edgeFade);
                    if (u < 0.12) alpha = 0.42 + smoothedEnergy * 0.18;

                    ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha.toFixed(3) + ')';
                    var px = cx + dx;
                    var py = cy + dy;
                    ctx.fillRect(px - halfSize, py - halfSize, halfSize * 2, halfSize * 2);
                }
            }

            orbRafId = window.requestAnimationFrame(renderVoiceOrbFrame);
        }

        function startOrbAnimation() {
            if (orbRafId !== null) return;
            orbRafId = window.requestAnimationFrame(renderVoiceOrbFrame);
        }

        function stopOrbAnimation() {
            if (orbRafId !== null) {
                window.cancelAnimationFrame(orbRafId);
                orbRafId = null;
            }
        }

        function clampOrbPanelToViewport() {
            if (!voicePanel || !voicePanel.classList.contains('has-custom-pos')) return;
            var rect = voicePanel.getBoundingClientRect();
            var maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
            var maxTop = Math.max(8, window.innerHeight - rect.height - 8);
            var clampedLeft = Math.min(maxLeft, Math.max(8, rect.left));
            var clampedTop = Math.min(maxTop, Math.max(8, rect.top));
            voicePanel.style.left = clampedLeft + 'px';
            voicePanel.style.top = clampedTop + 'px';
        }

        function setOrbSize(nextSize) {
            var isMobile = window.innerWidth <= 680;
            var maxFit = isMobile
                ? Math.min(240, window.innerWidth - 56, window.innerHeight - 130)
                : Math.min(MAX_ORB_SIZE, window.innerWidth - 40, window.innerHeight - 110);
            var upper = Math.max(MIN_ORB_SIZE, maxFit);
            currentOrbSize = Math.round(Math.min(upper, Math.max(MIN_ORB_SIZE, nextSize)));
            if (orbCanvas) {
                orbCanvas.style.width = currentOrbSize + 'px';
                orbCanvas.style.height = currentOrbSize + 'px';
            }
            clampOrbPanelToViewport();
        }

        function attachPanelDrag(handleEl, isOrbSurface) {
            if (!handleEl || !voicePanel) return;
            handleEl.addEventListener('pointerdown', function (e) {
                if (e.button && e.button !== 0) return;
                if (orbResizeHandle && (e.target === orbResizeHandle || orbResizeHandle.contains(e.target))) return;
                if (!isOrbSurface && e.target.closest('button')) return;

                var startX = e.clientX;
                var startY = e.clientY;
                var panelRect = voicePanel.getBoundingClientRect();
                var startLeft = panelRect.left;
                var startTop = panelRect.top;
                var moved = false;

                function onPointerMove(ev) {
                    var dx = ev.clientX - startX;
                    var dy = ev.clientY - startY;
                    if (!moved && Math.hypot(dx, dy) < 6) return;
                    if (!moved) {
                        moved = true;
                        if (isOrbSurface) suppressOrbClick = true;
                        voicePanel.classList.add('has-custom-pos', 'is-dragging');
                        voicePanel.style.left = startLeft + 'px';
                        voicePanel.style.top = startTop + 'px';
                    }
                    var curRect = voicePanel.getBoundingClientRect();
                    var maxLeft = Math.max(8, window.innerWidth - curRect.width - 8);
                    var maxTop = Math.max(8, window.innerHeight - curRect.height - 8);
                    voicePanel.style.left = Math.min(maxLeft, Math.max(8, startLeft + dx)) + 'px';
                    voicePanel.style.top = Math.min(maxTop, Math.max(8, startTop + dy)) + 'px';
                }

                function onPointerUp() {
                    window.removeEventListener('pointermove', onPointerMove);
                    window.removeEventListener('pointerup', onPointerUp);
                    window.removeEventListener('pointercancel', onPointerUp);
                    voicePanel.classList.remove('is-dragging');
                    if (moved && isOrbSurface) {
                        setTimeout(function () {
                            suppressOrbClick = false;
                        }, 60);
                    }
                }

                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp);
                window.addEventListener('pointercancel', onPointerUp);
            });
        }

        function openVoiceOrb() {
            if (!voicePanel) return;
            if (!voicePanel.classList.contains('has-custom-pos')) {
                voicePanel.style.left = '';
                voicePanel.style.top = '';
            }
            aiPopup.classList.remove('open', 'closing');
            aiBtn.classList.add('hidden');
            voicePanel.classList.add('open');
            voicePanel.setAttribute('aria-hidden', 'false');
            if (window.innerWidth <= 680 && currentOrbSize > 200) {
                currentOrbSize = 180;
            }
            setOrbSize(currentOrbSize);
            if (aiBtnVoiceOrb) aiBtnVoiceOrb.classList.add('voice-active');
            startOrbAnimation();
        }

        function closeVoiceOrb(reopenChat) {
            if (!voicePanel) return;
            if (isListening) stopListening();
            if (!reopenChat) stopSpeaking();
            voicePanel.classList.remove('open', 'is-listening', 'is-speaking');
            voicePanel.setAttribute('aria-hidden', 'true');
            if (aiBtnVoiceOrb) aiBtnVoiceOrb.classList.remove('voice-active');
            stopOrbAnimation();
            if (reopenChat) {
                openPopup();
            } else {
                aiBtn.classList.remove('hidden');
            }
        }

        function readDashboardTelemetry() {
            var sensors = [];
            var sensorCards = document.querySelectorAll('.sensors .sensor');
            for (var i = 0; i < sensorCards.length; i++) {
                var lblEl = sensorCards[i].querySelector('.lbl');
                var bigEl = sensorCards[i].querySelector('.big');
                var stEl = sensorCards[i].querySelector('.st');
                if (lblEl && bigEl) {
                    sensors.push(
                        lblEl.textContent.trim().toUpperCase() + ': ' +
                        bigEl.textContent.trim() +
                        (stEl ? ' (' + stEl.textContent.trim() + ')' : '')
                    );
                }
            }
            var weatherTempEl = document.querySelector('.weather .temp');
            var weatherDescEl = document.querySelector('.weather .desc');
            var waterTempEl = document.querySelector('.donut b');
            return {
                sensorsSummary: sensors.length ? sensors.join(', ') : 'pH, Nutrisi, Cahaya N/A',
                weatherTemp: weatherTempEl ? weatherTempEl.textContent.trim() : 'N/A',
                weatherDesc: weatherDescEl ? weatherDescEl.textContent.trim() : 'Terputus',
                waterTemp: waterTempEl ? waterTempEl.textContent.trim() : 'N/A'
            };
        }

        function generateAiReply(text) {
            var lower = text.toLowerCase();
            var t = readDashboardTelemetry();

            if (lower.includes('ph') || lower.includes('nutrisi') || lower.includes('tds') || lower.includes('ec') || lower.includes('cahaya') || lower.includes('lux')) {
                return 'Pembacaan sensor saat ini: ' + t.sensorsSummary + '. Suhu air tercatat ' + t.waterTemp + '.';
            }
            if (lower.includes('suhu') || lower.includes('cuaca') || lower.includes('kelembaban') || lower.includes('kelembapan') || lower.includes('aws')) {
                return 'Kondisi lingkungan greenhouse: suhu udara ' + t.weatherTemp + ' dengan status ' + t.weatherDesc + ', dan suhu air ' + t.waterTemp + '.';
            }
            if (lower.includes('status') || lower.includes('sensor') || lower.includes('cek') || lower.includes('diagnosa')) {
                return 'Ringkasan telemetri: ' + t.sensorsSummary + '. Suhu air ' + t.waterTemp + ', status cuaca ' + t.weatherDesc + '. Data otomatis diperbarui bila ESP32 tersambung.';
            }
            if (lower.includes('hai') || lower.includes('halo') || lower.includes('selamat')) {
                return 'Halo! Saya Asisten AI Greenhouse Anda. Silakan tanya lewat suara atau ketik mengenai pH, nutrisi, suhu air, dan cuaca.';
            }
            return 'Saya menerima pertanyaan Anda: "' + text + '". Data saat ini: ' + t.sensorsSummary + ' dengan suhu air ' + t.waterTemp + '.';
        }

        function createSpeakButtonSVG() {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>' +
                '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>' +
                '</svg><span>Dengarkan</span>';
        }

        function appendBotMessage(replyText, shouldAutoSpeak) {
            if (!aiMessages) return;
            var botMsg = document.createElement('div');
            botMsg.className = 'ai-msg-bot';

            var head = document.createElement('div');
            head.className = 'ai-msg-bot-head';

            var badge = document.createElement('div');
            badge.className = 'ai-badge-label';
            badge.textContent = 'AI';

            var speakBtn = document.createElement('button');
            speakBtn.type = 'button';
            speakBtn.className = 'ai-msg-speak-btn';
            speakBtn.title = 'Bacakan jawaban AI (Text-to-Speech)';
            speakBtn.innerHTML = createSpeakButtonSVG();
            speakBtn.addEventListener('click', function () {
                speakText(replyText, speakBtn);
            });

            head.appendChild(badge);
            head.appendChild(speakBtn);

            var msgText = document.createElement('div');
            msgText.className = 'ai-msg-text';
            msgText.textContent = replyText;

            botMsg.appendChild(head);
            botMsg.appendChild(msgText);
            aiMessages.appendChild(botMsg);
            aiMessages.scrollTop = aiMessages.scrollHeight;

            if (shouldAutoSpeak) {
                speakText(replyText, speakBtn);
            }
        }

        var AI_PROVIDERS = {
            gemini: {
                label: 'Gemini',
                type: 'gemini',
                models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']
            },
            groq: {
                label: 'Groq',
                type: 'openai',
                url: 'https://api.groq.com/openai/v1/chat/completions',
                modelsUrl: 'https://api.groq.com/openai/v1/models',
                models: [
                    'llama-3.1-8b-instant',
                    'meta-llama/llama-4-scout-17b-16e-instruct',
                    'qwen/qwen3-32b',
                    'qwen-qwq-32b',
                    'gemma2-9b-it',
                    'llama3-8b-8192',
                    'llama-3.3-70b-versatile'
                ]
            },
            qwen: {
                label: 'Qwen',
                type: 'openai',
                url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
                modelsUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models',
                models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen2.5-72b-instruct']
            },
            openai: {
                label: 'OpenAI',
                type: 'openai',
                url: 'https://api.openai.com/v1/chat/completions',
                modelsUrl: 'https://api.openai.com/v1/models',
                models: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-3.5-turbo']
            },
            deepseek: {
                label: 'DeepSeek',
                type: 'openai',
                url: 'https://api.deepseek.com/chat/completions',
                modelsUrl: 'https://api.deepseek.com/models',
                models: ['deepseek-chat', 'deepseek-reasoner']
            },
            openrouter: {
                label: 'OpenRouter',
                type: 'openai',
                url: 'https://openrouter.ai/api/v1/chat/completions',
                modelsUrl: 'https://openrouter.ai/api/v1/models',
                models: ['openai/gpt-4o-mini', 'google/gemini-2.0-flash-001', 'meta-llama/llama-3.1-8b-instruct:free']
            }
        };

        var workingModelCache = {};

        function cleanAiReplyText(raw) {
            var text = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            if (/^<think>/i.test(text)) {
                var splitIdx = text.lastIndexOf('\n\n');
                text = splitIdx !== -1 ? text.slice(splitIdx + 2).trim() : '';
            }
            return text;
        }

        function getSavedAiConfig() {
            try {
                var saved = JSON.parse(localStorage.getItem('tefa_dashboard_settings') || '{}');
                var provider = saved.aiProvider && AI_PROVIDERS[saved.aiProvider] ? saved.aiProvider : 'gemini';
                var apiKey = typeof saved.apiKey === 'string' ? saved.apiKey.replace(/^["']|["']$/g, '').trim() : '';
                var preferQwenOnGroq = false;
                if (apiKey.indexOf('AIza') === 0) {
                    provider = 'gemini';
                } else if (apiKey.indexOf('gsk_') === 0) {
                    if (provider === 'qwen') preferQwenOnGroq = true;
                    provider = 'groq';
                } else if (apiKey.indexOf('sk-or-') === 0) {
                    provider = 'openrouter';
                }
                return {
                    provider: provider,
                    apiKey: apiKey,
                    preferQwenOnGroq: preferQwenOnGroq
                };
            } catch (e) {
                return { provider: 'gemini', apiKey: '', preferQwenOnGroq: false };
            }
        }

        function isAuthOrQuotaError(status, msg) {
            return status === 401 || status === 403 || status === 429 ||
                /invalid.*api.?key|incorrect.*api.?key|unauthorized|authentication|quota|billing|rate.?limit/i.test(msg || '');
        }

        function isModelUnavailableError(status, msg) {
            if (isAuthOrQuotaError(status, msg)) return false;
            return status === 404 ||
                /does not exist|not have access|model_not_found|decommissioned|not found|invalid_model|not supported|deprecated/i.test(msg || '');
        }

        function discoverChatModels(providerKey, spec, apiKey, preferQwen) {
            if (spec.type === 'gemini') {
                var listUrl = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey);
                return fetch(listUrl).then(function (res) {
                    if (!res.ok) return [];
                    return res.json();
                }).then(function (data) {
                    var items = (data && data.models) || [];
                    var found = [];
                    for (var i = 0; i < items.length; i++) {
                        var m = items[i];
                        var methods = m.supportedGenerationMethods || [];
                        if (methods.indexOf('generateContent') === -1) continue;
                        var id = String(m.name || '').replace(/^models\//, '');
                        if (!id || /embedding|aqa|imagen|tts|robotics/i.test(id)) continue;
                        found.push(id);
                    }
                    found.sort(function (a, b) {
                        var score = function (s) {
                            if (/2\.0-flash|2\.5-flash/.test(s)) return 0;
                            if (/flash/.test(s)) return 1;
                            return 2;
                        };
                        return score(a) - score(b);
                    });
                    return found;
                }).catch(function () { return []; });
            }

            if (!spec.modelsUrl) return Promise.resolve([]);
            return fetch(spec.modelsUrl, {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + apiKey }
            }).then(function (res) {
                if (!res.ok) return [];
                return res.json();
            }).then(function (data) {
                var items = (data && data.data) || [];
                var found = [];
                for (var i = 0; i < items.length; i++) {
                    var id = items[i] && items[i].id;
                    if (!id) continue;
                    if (/whisper|tts|guard|embed|rerank|playai|orpheus|dall-e|sora|realtime|transcribe|audio|moderation|imagen|veo/i.test(id)) continue;
                    found.push(id);
                }
                if (preferQwen) {
                    found.sort(function (a, b) {
                        var aq = /qwen/i.test(a) ? 0 : 1;
                        var bq = /qwen/i.test(b) ? 0 : 1;
                        return aq - bq;
                    });
                } else if (providerKey === 'groq') {
                    var pref = spec.models || [];
                    found.sort(function (a, b) {
                        var ai = pref.indexOf(a);
                        var bi = pref.indexOf(b);
                        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                    });
                }
                return found;
            }).catch(function () { return []; });
        }

        function callSingleModel(spec, apiKey, modelId, systemPrompt, userText) {
            if (spec.type === 'gemini') {
                var geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modelId) + ':generateContent?key=' + encodeURIComponent(apiKey);
                return fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        contents: [{ role: 'user', parts: [{ text: userText }] }]
                    })
                }).then(function (res) {
                    return res.json().catch(function () { return {}; }).then(function (data) {
                        var errMsg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
                        if (!res.ok) {
                            var err = new Error(errMsg);
                            err.status = res.status;
                            throw err;
                        }
                        var reply = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
                            data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
                        var cleaned = cleanAiReplyText(reply);
                        if (!cleaned) throw new Error('Respon Gemini kosong');
                        return cleaned;
                    });
                });
            }

            return fetch(spec.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiKey
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userText }
                    ],
                    temperature: 0.6,
                    max_tokens: 650
                })
            }).then(function (res) {
                return res.json().catch(function () { return {}; }).then(function (data) {
                    var errMsg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
                    if (!res.ok) {
                        var err = new Error(errMsg);
                        err.status = res.status;
                        throw err;
                    }
                    var reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                    var cleaned = cleanAiReplyText(reply);
                    if (!cleaned) throw new Error('Respon ' + spec.label + ' kosong');
                    return cleaned;
                });
            });
        }

        function requestAiProviderReply(userText) {
            var cfg = getSavedAiConfig();
            var spec = AI_PROVIDERS[cfg.provider] || AI_PROVIDERS.gemini;
            var t = readDashboardTelemetry();
            var systemPrompt =
                'Kamu adalah Asisten AI Greenhouse Hidroponik TeFa. Jawab ringkas, akurat, dan ramah dalam Bahasa Indonesia (maksimal 3 kalimat agar nyaman dibacakan suara). ' +
                'Data sensor saat ini: ' + t.sensorsSummary + '. Suhu air: ' + t.waterTemp + '. Suhu udara: ' + t.weatherTemp + ' (' + t.weatherDesc + ').';

            var cacheKey = cfg.provider + ':' + (cfg.preferQwenOnGroq ? 'q:' : '') + cfg.apiKey.slice(0, 14);
            var initialQueue = [];
            if (workingModelCache[cacheKey]) initialQueue.push(workingModelCache[cacheKey]);
            var defaults = spec.models.slice();
            if (cfg.preferQwenOnGroq) {
                defaults.sort(function (a, b) {
                    return (/qwen/i.test(a) ? 0 : 1) - (/qwen/i.test(b) ? 0 : 1);
                });
            }
            for (var i = 0; i < defaults.length; i++) {
                if (initialQueue.indexOf(defaults[i]) === -1) initialQueue.push(defaults[i]);
            }

            var tried = {};
            var discovered = false;

            function tryNext(queue) {
                if (!queue.length) {
                    return Promise.reject(new Error('Tidak ada model aktif yang tersedia untuk API key ini'));
                }
                var modelId = queue.shift();
                if (tried[modelId]) return tryNext(queue);
                tried[modelId] = true;

                return callSingleModel(spec, cfg.apiKey, modelId, systemPrompt, userText).then(function (reply) {
                    workingModelCache[cacheKey] = modelId;
                    return reply;
                }).catch(function (err) {
                    var msg = err && err.message ? err.message : '';
                    var status = err && err.status ? err.status : 0;
                    if (!isModelUnavailableError(status, msg)) {
                        throw err;
                    }
                    if (discovered) {
                        return queue.length ? tryNext(queue) : Promise.reject(err);
                    }
                    discovered = true;
                    return discoverChatModels(cfg.provider, spec, cfg.apiKey, cfg.preferQwenOnGroq).then(function (liveModels) {
                        if (!liveModels.length && !queue.length) throw err;
                        var merged = [];
                        for (var m = 0; m < liveModels.length; m++) {
                            if (!tried[liveModels[m]] && merged.indexOf(liveModels[m]) === -1) merged.push(liveModels[m]);
                        }
                        for (var q = 0; q < queue.length; q++) {
                            if (!tried[queue[q]] && merged.indexOf(queue[q]) === -1) merged.push(queue[q]);
                        }
                        if (!merged.length) throw err;
                        return tryNext(merged);
                    });
                });
            }

            return tryNext(initialQueue);
        }

        function sendMessage(customText, options) {
            if (!aiInput || !aiMessages) return;
            var opts = options || {};
            var text = (typeof customText === 'string' ? customText : aiInput.value).trim();
            if (!text) return;

            var userMsg = document.createElement('div');
            userMsg.className = 'ai-msg-user';
            userMsg.textContent = text;
            aiMessages.appendChild(userMsg);

            if (typeof customText !== 'string') {
                aiInput.value = '';
            }
            aiMessages.scrollTop = aiMessages.scrollHeight;

            var shouldSpeak = Boolean(opts.fromVoice || ttsEnabled);
            var cfg = getSavedAiConfig();
            if (!cfg.apiKey) {
                setTimeout(function () {
                    var replyText = generateAiReply(text);
                    if (voicePanel && voicePanel.classList.contains('open')) {
                        setOrbTranscript(replyText, true);
                    }
                    appendBotMessage(replyText, shouldSpeak);
                }, 350);
                return;
            }

            var spec = AI_PROVIDERS[cfg.provider] || AI_PROVIDERS.gemini;
            if (voicePanel && voicePanel.classList.contains('open')) {
                setOrbStatus('Menghubungkan ke ' + spec.label + '...', '');
            }

            var pendingBubble = document.createElement('div');
            pendingBubble.className = 'ai-msg-bot';
            pendingBubble.innerHTML = '<div class="ai-msg-bot-head"><div class="ai-badge-label">AI · ' + spec.label + '</div></div><div class="ai-msg-text">Sedang memproses...</div>';
            aiMessages.appendChild(pendingBubble);
            aiMessages.scrollTop = aiMessages.scrollHeight;

            requestAiProviderReply(text).then(function (replyText) {
                if (pendingBubble.parentNode) pendingBubble.parentNode.removeChild(pendingBubble);
                if (voicePanel && voicePanel.classList.contains('open')) {
                    setOrbTranscript(replyText, true);
                    if (!shouldSpeak) setOrbStatus('Ketuk Orb untuk Bicara', '');
                }
                appendBotMessage(replyText, shouldSpeak);
            }).catch(function (err) {
                if (pendingBubble.parentNode) pendingBubble.parentNode.removeChild(pendingBubble);
                var fallback = 'Gagal terhubung ke ' + spec.label + ' (' + (err && err.message ? err.message : 'Error') + '). ' + generateAiReply(text);
                if (voicePanel && voicePanel.classList.contains('open')) {
                    setOrbTranscript(fallback, true);
                    if (!shouldSpeak) setOrbStatus('Ketuk Orb untuk Bicara', '');
                }
                appendBotMessage(fallback, shouldSpeak);
            });
        }

        function stopListening() {
            isListening = false;
            updateMicButtonsUI(false);
            stopMicAnalyser();
            if (recognition) {
                try {
                    recognition.stop();
                } catch (err) {
                    // ignore already-stopped recognition errors
                }
            }
            if (!isSpeaking) {
                orbMode = 'idle';
                setOrbStatus('Ketuk Orb untuk Bicara', '');
            }
        }

        function startListening() {
            var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRec) {
                openVoiceOrb();
                setOrbStatus('Mikrofon Tidak Didukung', '');
                setOrbTranscript('Browser ini belum mendukung Speech-to-Text (gunakan Chrome atau Edge terbaru via HTTPS/localhost).', false);
                return;
            }

            if (isListening) {
                stopListening();
                return;
            }

            stopSpeaking();
            openVoiceOrb();

            recognition = new SpeechRec();
            recognition.lang = 'id-ID';
            recognition.interimResults = true;
            recognition.continuous = false;
            latestTranscript = '';

            recognition.onstart = function () {
                isListening = true;
                orbMode = 'listening';
                updateMicButtonsUI(true);
                setOrbStatus('Mendengarkan...', 'is-listening');
                setOrbTranscript('Silakan bicara sekarang...', false);
                startMicAnalyser();
            };

            recognition.onresult = function (event) {
                var interim = '';
                var finalStr = '';
                for (var i = event.resultIndex; i < event.results.length; i++) {
                    var transcriptPart = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalStr += transcriptPart;
                    } else {
                        interim += transcriptPart;
                    }
                }

                var combined = (finalStr || interim).trim();
                if (combined) {
                    latestTranscript = combined;
                    speechPulse = 1.0;
                    setOrbTranscript(combined, true);
                }

                if (finalStr && finalStr.trim()) {
                    var question = finalStr.trim();
                    latestTranscript = '';
                    isListening = false;
                    updateMicButtonsUI(false);
                    stopMicAnalyser();
                    setOrbStatus('Memproses jawaban...', '');
                    sendMessage(question, { fromVoice: true });
                }
            };

            recognition.onerror = function (event) {
                isListening = false;
                updateMicButtonsUI(false);
                stopMicAnalyser();
                if (!isSpeaking) orbMode = 'idle';
                if (event && event.error === 'not-allowed') {
                    setOrbStatus('Izin Mikrofon Ditolak', '');
                    setOrbTranscript('Izinkan akses mikrofon di browser agar dapat bertanya lewat suara.', false);
                } else if (event && event.error === 'no-speech') {
                    setOrbStatus('Ketuk Orb untuk Bicara', '');
                    setOrbTranscript('Tidak ada suara terdeteksi. Ketuk orb dan coba bicara lagi.', false);
                } else {
                    setOrbStatus('Ketuk Orb untuk Bicara', '');
                }
            };

            recognition.onend = function () {
                var pending = latestTranscript.trim();
                isListening = false;
                updateMicButtonsUI(false);
                stopMicAnalyser();
                if (pending) {
                    latestTranscript = '';
                    setOrbStatus('Memproses jawaban...', '');
                    sendMessage(pending, { fromVoice: true });
                } else if (!isSpeaking) {
                    orbMode = 'idle';
                    setOrbStatus('Ketuk Orb untuk Bicara', '');
                }
            };

            try {
                recognition.start();
            } catch (err) {
                isListening = false;
                updateMicButtonsUI(false);
                stopMicAnalyser();
                setOrbStatus('Ketuk Orb untuk Bicara', '');
            }
        }

        function openPopup() {
            // Tutup modal lain agar tidak saling menumpuk
            var setBackdrop = document.getElementById('settingModalBackdrop');
            var gearBtn = document.querySelector('.gear');
            if (setBackdrop && setBackdrop.classList.contains('open')) {
                setBackdrop.classList.remove('open');
                setBackdrop.classList.remove('closing');
                if (gearBtn) gearBtn.classList.remove('hidden');
            }
            var notifBackdrop = document.getElementById('notifModalBackdrop');
            var notifBtn = document.getElementById('notifBtn');
            if (notifBackdrop && notifBackdrop.classList.contains('open')) {
                notifBackdrop.classList.remove('open');
                notifBackdrop.classList.remove('closing');
                if (notifBtn) notifBtn.classList.remove('hidden');
            }
            var rect = aiBtn.getBoundingClientRect();
            var top = Math.max(12, rect.top);
            var right = Math.max(12, window.innerWidth - rect.right);
            if (window.innerWidth - right < 600) {
                right = Math.min(right, window.innerWidth - 610);
                if (right < 16) right = 16;
            }
            aiPopup.style.top = top + 'px';
            aiPopup.style.right = right + 'px';
            aiBtn.classList.add('hidden');
            aiPopup.classList.remove('closing');
            aiPopup.classList.add('open');
            setTimeout(function () {
                if (aiInput) aiInput.focus();
            }, 400);
        }

        function closePopup() {
            if (!aiPopup.classList.contains('open') || aiPopup.classList.contains('closing')) return;
            stopListening();
            stopSpeaking();
            aiPopup.classList.add('closing');
            setTimeout(function () {
                aiPopup.classList.remove('open');
                aiPopup.classList.remove('closing');
                if (!voicePanel || !voicePanel.classList.contains('open')) {
                    aiBtn.classList.remove('hidden');
                }
            }, 320);
        }

        updateTtsToggleUI();

        aiBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (voicePanel && voicePanel.classList.contains('open')) {
                closeVoiceOrb(false);
            } else if (aiPopup.classList.contains('open') && !aiPopup.classList.contains('closing')) {
                closePopup();
            } else {
                openPopup();
            }
        });

        if (aiClose) {
            aiClose.addEventListener('click', function (e) {
                e.stopPropagation();
                closePopup();
            });
        }

        aiPopup.addEventListener('click', function (e) {
            e.stopPropagation();
        });

        if (voicePanel) {
            voicePanel.addEventListener('click', function (e) {
                e.stopPropagation();
            });
        }

        attachPanelDrag(orbTrigger, true);
        attachPanelDrag(orbTopbar, false);

        if (orbResizeHandle && voicePanel) {
            orbResizeHandle.addEventListener('click', function (e) {
                e.stopPropagation();
            });
            orbResizeHandle.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var startX = e.clientX;
                var startY = e.clientY;
                var startSize = orbCanvas ? orbCanvas.getBoundingClientRect().width : currentOrbSize;
                voicePanel.classList.add('is-resizing');

                function onResizeMove(ev) {
                    var delta = ((ev.clientX - startX) + (ev.clientY - startY)) * 0.85;
                    setOrbSize(startSize + delta);
                }

                function onResizeUp() {
                    window.removeEventListener('pointermove', onResizeMove);
                    window.removeEventListener('pointerup', onResizeUp);
                    window.removeEventListener('pointercancel', onResizeUp);
                    voicePanel.classList.remove('is-resizing');
                }

                window.addEventListener('pointermove', onResizeMove);
                window.addEventListener('pointerup', onResizeUp);
                window.addEventListener('pointercancel', onResizeUp);
            });
        }

        if (orbSizeDownBtn) {
            orbSizeDownBtn.addEventListener('click', function () {
                setOrbSize(currentOrbSize - 30);
            });
        }

        if (orbSizeUpBtn) {
            orbSizeUpBtn.addEventListener('click', function () {
                setOrbSize(currentOrbSize + 30);
            });
        }

        window.addEventListener('resize', function () {
            if (voicePanel && voicePanel.classList.contains('open')) {
                setOrbSize(currentOrbSize);
            }
        });

        document.addEventListener('click', function (e) {
            if (aiPopup.classList.contains('open') && !aiPopup.contains(e.target) && !aiBtn.contains(e.target) && (!voicePanel || !voicePanel.contains(e.target))) {
                closePopup();
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                if (voicePanel && voicePanel.classList.contains('open')) {
                    closeVoiceOrb(false);
                } else if (aiPopup.classList.contains('open')) {
                    closePopup();
                }
            }
        });

        if (aiClear && aiMessages) {
            aiClear.addEventListener('click', function () {
                stopSpeaking();
                stopListening();
                aiMessages.innerHTML = '';
                setOrbTranscript(DEFAULT_ORB_HINT, false);
            });
        }

        if (aiBtnTtsToggle) {
            aiBtnTtsToggle.addEventListener('click', function () {
                ttsEnabled = !ttsEnabled;
                if (!ttsEnabled) stopSpeaking();
                updateTtsToggleUI();
            });
        }

        if (aiBtnVoiceOrb) {
            aiBtnVoiceOrb.addEventListener('click', function () {
                if (voicePanel && voicePanel.classList.contains('open')) {
                    closeVoiceOrb(false);
                } else {
                    openVoiceOrb();
                }
            });
        }

        if (orbBackBtn) {
            orbBackBtn.addEventListener('click', function () {
                closeVoiceOrb(true);
            });
        }

        if (orbCloseBtn) {
            orbCloseBtn.addEventListener('click', function () {
                closeVoiceOrb(false);
            });
        }

        if (orbMicBtn) {
            orbMicBtn.addEventListener('click', startListening);
        }

        if (orbTrigger) {
            orbTrigger.addEventListener('click', function (e) {
                if (orbResizeHandle && (e.target === orbResizeHandle || orbResizeHandle.contains(e.target))) return;
                if (suppressOrbClick) {
                    suppressOrbClick = false;
                    return;
                }
                startListening();
            });
            orbTrigger.addEventListener('wheel', function (e) {
                e.preventDefault();
                setOrbSize(currentOrbSize + (e.deltaY < 0 ? 22 : -22));
            }, { passive: false });
            orbTrigger.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    startListening();
                }
            });
        }

        if (aiBtnMic) {
            aiBtnMic.addEventListener('click', startListening);
        }

        if (aiSend) {
            aiSend.addEventListener('click', function () {
                sendMessage();
            });
        }

        if (aiInput) {
            aiInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }
    }


    // ============================================================
    // LAZY LOADING & PERFORMANCE OPTIMIZATION
    // ============================================================
    function initLazyLoading() {
        var lazyImages = document.querySelectorAll('img[loading="lazy"]');
        lazyImages.forEach(function (img) {
            if (img.complete) {
                img.classList.add('loaded');
            } else {
                img.addEventListener('load', function () {
                    img.classList.add('loaded');
                });
                img.addEventListener('error', function () {
                    img.classList.add('error');
                });
            }
        });
    }

            // ============================================================
            // SHARED PAGINATION BUTTON BUILDER (Responsive pages + ellipsis)
            // ============================================================
            function getPaginationMaxVisible() {
                return window.innerWidth <= 380 ? 1 : (window.innerWidth <= 600 ? 3 : 5);
            }

            function renderTablePaginationButtons(btnsContainer, currentPage, totalPages, onPageSelect) {
                if (!btnsContainer) return;
                btnsContainer._paginationState = {
                    currentPage: currentPage,
                    totalPages: totalPages,
                    onPageSelect: onPageSelect
                };
                btnsContainer.innerHTML = '';

                function createPageBtn(page, extraClass) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'table-pagination-btn' + (page === currentPage ? ' active' : '') + (extraClass || '');
                    btn.textContent = page;
                    btn.addEventListener('click', function() {
                        onPageSelect(page);
                    });
                    return btn;
                }

        function createEllipsis() {
            var ell = document.createElement('span');
            ell.className = 'table-pagination-ellipsis';
            ell.textContent = '...';
            return ell;
        }

        var prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'table-pagination-btn';
        prevBtn.innerHTML = '&lsaquo;';
        prevBtn.title = 'Halaman Sebelumnya';
        prevBtn.disabled = currentPage <= 1;
        prevBtn.addEventListener('click', function () {
            if (currentPage > 1) onPageSelect(currentPage - 1);
        });
        btnsContainer.appendChild(prevBtn);

                var maxVisible = getPaginationMaxVisible();
                var half = Math.floor(maxVisible / 2);
                var startPage = Math.max(1, currentPage - half);
                var endPage = Math.min(totalPages, startPage + maxVisible - 1);
                if (endPage - startPage < maxVisible - 1) {
                    startPage = Math.max(1, endPage - maxVisible + 1);
                }

        if (startPage > 1) {
            btnsContainer.appendChild(createPageBtn(1));
            if (startPage > 2) btnsContainer.appendChild(createEllipsis());
        }

                for (var p = startPage; p <= endPage; p++) {
                    var isFar = Math.abs(p - currentPage) > 1 && p !== 1 && p !== totalPages;
                    btnsContainer.appendChild(createPageBtn(p, isFar ? ' page-btn-far' : ''));
                }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) btnsContainer.appendChild(createEllipsis());
            btnsContainer.appendChild(createPageBtn(totalPages));
        }

                var nextBtn = document.createElement('button');
                nextBtn.type = 'button';
                nextBtn.className = 'table-pagination-btn';
                nextBtn.innerHTML = '&rsaquo;';
                nextBtn.title = 'Halaman Berikutnya';
                nextBtn.disabled = currentPage >= totalPages || totalPages === 0;
                nextBtn.addEventListener('click', function() {
                    if (currentPage < totalPages) onPageSelect(currentPage + 1);
                });
                btnsContainer.appendChild(nextBtn);

                if (!window._tefaPaginationResizeBound) {
                    window._tefaPaginationResizeBound = true;
                    window._tefaPaginationMaxVisible = maxVisible;
                    window.addEventListener('resize', function() {
                        var nextMax = getPaginationMaxVisible();
                        if (nextMax === window._tefaPaginationMaxVisible) return;
                        window._tefaPaginationMaxVisible = nextMax;
                        ['sensorPaginationBtns', 'awsPaginationBtns'].forEach(function(id) {
                            var el = document.getElementById(id);
                            if (el && el._paginationState && el.childNodes.length > 0) {
                                var st = el._paginationState;
                                renderTablePaginationButtons(el, st.currentPage, st.totalPages, st.onPageSelect);
                            }
                        });
                    });
                }
            }

    // ============================================================
    // SENSOR DATA TABLE PAGINATION & DATA ENGINE
    // ============================================================
    var sensorHistoryData = [];

    function initSensorTablePagination() {
        var tableBody = document.querySelector('#hist tbody');
        var startEl = document.getElementById('sensorPageStart');
        var endEl = document.getElementById('sensorPageEnd');
        var totalEl = document.getElementById('sensorTotalRows');
        var perPageSelect = document.getElementById('sensorRowsPerPage');
        var btnsContainer = document.getElementById('sensorPaginationBtns');
        var csvBtn = document.getElementById('csv');

        var currentPage = 1;
        var rowsPerPage = parseInt(perPageSelect ? perPageSelect.value : 5, 10) || 5;

        function render() {
            if (!tableBody) return;
            var total = sensorHistoryData.length;
            if (totalEl) totalEl.textContent = total;

            if (total === 0) {
                tableBody.innerHTML = '<tr><td colspan="7" class="empty-table-cell"><div style="display:flex;align-items:center;justify-content:center;gap:8px;color:var(--red)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>Tidak ada data sensor terhubung (Status: Terputus / N/A)</div></td></tr>';
                if (startEl) startEl.textContent = '0';
                if (endEl) endEl.textContent = '0';
                if (btnsContainer) btnsContainer.innerHTML = '';
                return;
            }

            var totalPages = Math.ceil(total / rowsPerPage);
            if (currentPage > totalPages) currentPage = totalPages;
            if (currentPage < 1) currentPage = 1;

            var startIndex = (currentPage - 1) * rowsPerPage;
            var endIndex = Math.min(startIndex + rowsPerPage, total);

            if (startEl) startEl.textContent = total > 0 ? (startIndex + 1) : 0;
            if (endEl) endEl.textContent = endIndex;

            // Render sliced rows
            var slice = sensorHistoryData.slice(startIndex, endIndex);
            var html = '';
            slice.forEach(function (r) {
                var isWarn = r.status.toLowerCase() === 'warning';
                html += '<tr>' +
                    '<td>' + r.time + '</td>' +
                    '<td>' + r.ph + '</td>' +
                    '<td>' + r.ppm + '</td>' +
                    '<td>' + r.temp + '</td>' +
                    '<td>' + r.light + '</td>' +
                    '<td>' + r.hum + '</td>' +
                    '<td class="st' + (isWarn ? ' warn' : '') + '">' + r.status + '</td>' +
                    '</tr>';
            });
            tableBody.innerHTML = html;

            // Render pagination buttons
            renderButtons(totalPages);
        }

        function renderButtons(totalPages) {
            renderTablePaginationButtons(btnsContainer, currentPage, totalPages, function (page) {
                currentPage = page;
                render();
            });
        }

        if (perPageSelect) {
            perPageSelect.addEventListener('change', function () {
                rowsPerPage = parseInt(this.value, 10) || 5;
                currentPage = 1;
                render();
            });
        }

        // CSV Export: Exports ALL records across all pages
        if (csvBtn) {
            // Clone and replace to remove any old listeners
            var newCsvBtn = csvBtn.cloneNode(true);
            csvBtn.parentNode.replaceChild(newCsvBtn, csvBtn);
            newCsvBtn.addEventListener('click', function () {
                if (sensorHistoryData.length === 0) {
                    alert('Tidak ada data sensor untuk diekspor!');
                    return;
                }
                var headers = ['Time', 'pH', 'ppm', 'water temp (C)', 'LIGHT (lx)', 'humidity', 'Status'];
                var csvContent = [headers.join(',')];
                sensorHistoryData.forEach(function (row) {
                    var line = [
                        '"' + row.time + '"',
                        '"' + row.ph + '"',
                        '"' + row.ppm + '"',
                        '"' + row.temp + '"',
                        '"' + row.light + '"',
                        '"' + row.hum + '"',
                        '"' + row.status + '"'
                    ].join(',');
                    csvContent.push(line);
                });
                var blob = new Blob([csvContent.join('\\r\\n')], { type: 'text/csv;charset=utf-8;' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = 'data_sensor_tefa_' + new Date().toISOString().slice(0, 10) + '.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
        }

        window.addSensorHistoryRow = function (row) {
            sensorHistoryData.unshift(row);
            if (sensorHistoryData.length > 200) sensorHistoryData.pop();
            render();
        };

        render();
    }

    // ============================================================
    // HISTORY AWS TABLE PAGINATION & TABS DATA ENGINE
    // ============================================================
    var awsHistoryData = {
        daily: [],
        weekly: [],
        monthly: []
    };

    function initAwsTablePagination() {
        var awsContainer = document.querySelector('.card.awsc.span2.aws');
        if (!awsContainer) return;
        var tableBody = awsContainer.querySelector('table tbody');
        var startEl = document.getElementById('awsPageStart');
        var endEl = document.getElementById('awsPageEnd');
        var totalEl = document.getElementById('awsTotalRows');
        var perPageSelect = document.getElementById('awsRowsPerPage');
        var btnsContainer = document.getElementById('awsPaginationBtns');
        var tabsContainer = document.getElementById('awsTabs');

        var currentTab = 'daily';
        var currentPage = 1;
        var rowsPerPage = parseInt(perPageSelect ? perPageSelect.value : 4, 10) || 4;

        function render() {
            if (!tableBody) return;
            var dataList = awsHistoryData[currentTab] || [];
            var total = dataList.length;
            if (totalEl) totalEl.textContent = total;

            if (total === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" class="empty-table-cell"><div style="display:flex;align-items:center;justify-content:center;gap:8px;color:var(--red)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>Tidak ada data riwayat AWS</div></td></tr>';
                if (startEl) startEl.textContent = '0';
                if (endEl) endEl.textContent = '0';
                if (btnsContainer) btnsContainer.innerHTML = '';
                return;
            }

            var totalPages = Math.ceil(total / rowsPerPage);
            if (currentPage > totalPages) currentPage = totalPages;
            if (currentPage < 1) currentPage = 1;

            var startIndex = (currentPage - 1) * rowsPerPage;
            var endIndex = Math.min(startIndex + rowsPerPage, total);

            if (startEl) startEl.textContent = startIndex + 1;
            if (endEl) endEl.textContent = endIndex;

            // Render sliced rows
            var slice = dataList.slice(startIndex, endIndex);
            var html = '';
            slice.forEach(function (r) {
                html += '<tr>' +
                    '<td>' + r.time + '</td>' +
                    '<td>' + r.temp + '</td>' +
                    '<td>' + r.hum + '</td>' +
                    '<td>' + r.wind + '</td>' +
                    '<td>' + r.solar + '</td>' +
                    '<td>' + r.soil + '</td>' +
                    '</tr>';
            });
            tableBody.innerHTML = html;

            renderButtons(totalPages);
        }

        function renderButtons(totalPages) {
            renderTablePaginationButtons(btnsContainer, currentPage, totalPages, function (page) {
                currentPage = page;
                render();
            });
        }

        if (tabsContainer) {
            var tabBtns = tabsContainer.querySelectorAll('button');
            tabBtns.forEach(function (btn) {
                btn.addEventListener('click', function () {
                    tabBtns.forEach(function (b) { b.classList.remove('on'); });
                    this.classList.add('on');
                    var tabName = this.textContent.trim().toLowerCase();
                    if (tabName.indexOf('daily') !== -1) currentTab = 'daily';
                    else if (tabName.indexOf('weekly') !== -1) currentTab = 'weekly';
                    else if (tabName.indexOf('monthly') !== -1) currentTab = 'monthly';
                    currentPage = 1;
                    render();
                });
            });
        }

        if (perPageSelect) {
            perPageSelect.addEventListener('change', function () {
                rowsPerPage = parseInt(this.value, 10) || 4;
                currentPage = 1;
                render();
            });
        }

        window.addAwsHistoryRow = function (row, tab) {
            var targetTab = tab || 'daily';
            if (!awsHistoryData[targetTab]) awsHistoryData[targetTab] = [];
            awsHistoryData[targetTab].unshift(row);
            if (awsHistoryData[targetTab].length > 200) awsHistoryData[targetTab].pop();
            if (currentTab === targetTab) render();
        };

        window.setAwsHistoryData = function (tab, rows) {
            var targetTab = tab || 'daily';
            awsHistoryData[targetTab] = Array.isArray(rows) ? rows : [];
            if (currentTab === targetTab) render();
        };

        render();
    }


    // Notification Modal Logic (notifikasi.svg)
    function initNotificationModal() {
        var notifBtn = document.getElementById('notifBtn');
        var backdrop = document.getElementById('notifModalBackdrop');
        var closeBtn = document.getElementById('notifBtnClose');
        var tabBtns = document.querySelectorAll('#notifTabs .notif-tab');
        var listContainer = document.getElementById('notifList');
        var notifPagination = document.getElementById('notifPagination');
        var notifPaginationInfo = document.getElementById('notifPaginationInfo');
        var notifPrevBtn = document.getElementById('notifPrevBtn');
        var notifNextBtn = document.getElementById('notifNextBtn');

        if (!notifBtn || !backdrop) return;

        var currentFilter = 'all';
        var currentNotifPage = 1;
        var notifsPerPage = 3;
        var notifications = [];

        function openModal() {
            // Tutup modal lain agar tidak saling menumpuk
            var setBackdrop = document.getElementById('settingModalBackdrop');
            var gearBtn = document.querySelector('.gear');
            if (setBackdrop && setBackdrop.classList.contains('open')) {
                setBackdrop.classList.remove('open');
                setBackdrop.classList.remove('closing');
                if (gearBtn) gearBtn.classList.remove('hidden');
            }
            var aiPopup = document.getElementById('aiChatPopup');
            var aiBtn = document.getElementById('aiAssistantBtn');
            if (aiPopup && aiPopup.classList.contains('open')) {
                aiPopup.classList.remove('open');
                aiPopup.classList.remove('closing');
                if (aiBtn) aiBtn.classList.remove('hidden');
            }
            renderList();
            var rect = notifBtn.getBoundingClientRect();
            var top = Math.max(12, rect.top);
            var right = Math.max(12, window.innerWidth - rect.right);
            if (window.innerWidth - right < 510) {
                right = Math.min(right, window.innerWidth - 520);
                if (right < 16) right = 16;
            }
            var modalEl = document.getElementById('notifModal');
            if (modalEl) {
                modalEl.style.top = top + 'px';
                modalEl.style.right = right + 'px';
            }
            notifBtn.classList.add('hidden');
            backdrop.classList.remove('closing');
            backdrop.classList.add('open');
        }

        function closeModal() {
            if (!backdrop.classList.contains('open')) return;
            backdrop.classList.add('closing');
            setTimeout(function () {
                backdrop.classList.remove('open');
                backdrop.classList.remove('closing');
                notifBtn.classList.remove('hidden');
            }, 320);
        }

        notifBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            openModal();
        });

        notifBtn.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openModal();
            }
        });

        if (closeBtn) {
            closeBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                closeModal();
            });
        }

        backdrop.addEventListener('click', function (e) {
            if (e.target === backdrop) {
                closeModal();
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && backdrop.classList.contains('open')) {
                closeModal();
            }
        });

        tabBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                tabBtns.forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                currentFilter = btn.getAttribute('data-filter') || 'all';
                currentNotifPage = 1;
                renderList();
            });
        });

        if (notifPrevBtn) {
            notifPrevBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (currentNotifPage > 1) {
                    currentNotifPage--;
                    renderList();
                }
            });
        }

        if (notifNextBtn) {
            notifNextBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                var filtered = notifications.filter(function (item) {
                    return currentFilter === 'all' || item.type === currentFilter;
                });
                var totalPages = Math.ceil(filtered.length / notifsPerPage) || 1;
                if (currentNotifPage < totalPages) {
                    currentNotifPage++;
                    renderList();
                }
            });
        }

        function renderList() {
            if (!listContainer) return;
            var filtered = notifications.filter(function (item) {
                if (currentFilter === 'all') return true;
                return item.type === currentFilter;
            });

            var total = filtered.length;
            var totalPages = Math.ceil(total / notifsPerPage) || 1;
            if (currentNotifPage > totalPages) currentNotifPage = totalPages;
            if (currentNotifPage < 1) currentNotifPage = 1;

            if (notifPaginationInfo) {
                notifPaginationInfo.textContent = 'Halaman ' + currentNotifPage + ' dari ' + totalPages + ' (' + total + ' notifikasi)';
            }
            if (notifPrevBtn) notifPrevBtn.disabled = currentNotifPage === 1;
            if (notifNextBtn) notifNextBtn.disabled = currentNotifPage === totalPages || total === 0;

            if (total === 0) {
                listContainer.innerHTML = '<div class="notif-empty"><div class="notif-empty-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg></div><div class="notif-empty-title">Tidak Ada Notifikasi</div><div class="notif-empty-desc">Saat ini tidak ada pemberitahuan atau peringatan baru dari sensor.</div></div>';
                if (notifPagination) notifPagination.style.display = 'none';
                return;
            }
            if (notifPagination) notifPagination.style.display = 'flex';

            var start = (currentNotifPage - 1) * notifsPerPage;
            var end = Math.min(start + notifsPerPage, total);
            var slice = filtered.slice(start, end);

            var html = '';
            slice.forEach(function (item) {
                html += [
                    '<div class="notif-card">',
                    '  <div class="notif-card-header">',
                    '    <span class="notif-card-tag">' + item.tag + '</span>',
                    '    <span class="notif-card-time">' + item.time + '</span>',
                    '  </div>',
                    '  <h4 class="notif-card-title">' + item.title + '</h4>',
                    '  <p class="notif-card-desc">' + item.desc + '</p>',
                    '  <div class="notif-card-divider"></div>',
                    '  <div class="notif-card-footer">',
                    '    <span class="notif-card-value">' + item.value + '</span>',
                    '  </div>',
                    '</div>'
                ].join('');
            });
            listContainer.innerHTML = html;
        }
    }

    function initAllWidgets() {
        initLazyLoading();
        initSensorTablePagination();
        initAwsTablePagination();
        initAIAssistant();
        initSettingModal();
        initNotificationModal();
        initScrollReveal();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAllWidgets);
    } else {
        initAllWidgets();
    }
})();


// Mobile Dropdown Navigation Logic (Melebar ke Bawah)
(function () {
    var navHamburger = document.getElementById('navHamburger');
    var mobileNavDropdown = document.getElementById('mobileNavDropdown');
    var mobileNavBackdrop = document.getElementById('mobileNavBackdrop');
    var mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
    var navLinks = document.querySelectorAll('.nav-links a');

    function openDropdown() {
        if (!mobileNavDropdown) return;
        mobileNavDropdown.classList.remove('closing');
        mobileNavDropdown.classList.add('open');
        if (mobileNavBackdrop) mobileNavBackdrop.classList.add('open');
        if (navHamburger) {
            navHamburger.classList.add('active');
            navHamburger.setAttribute('aria-expanded', 'true');
        }
        mobileNavDropdown.setAttribute('aria-hidden', 'false');
    }

    function closeDropdown() {
        if (!mobileNavDropdown || !mobileNavDropdown.classList.contains('open')) return;
        mobileNavDropdown.classList.add('closing');
        if (navHamburger) {
            navHamburger.classList.remove('active');
            navHamburger.setAttribute('aria-expanded', 'false');
        }
        if (mobileNavBackdrop) mobileNavBackdrop.classList.remove('open');
        setTimeout(function () {
            mobileNavDropdown.classList.remove('open');
            mobileNavDropdown.classList.remove('closing');
            mobileNavDropdown.setAttribute('aria-hidden', 'true');
        }, 200);
    }

    if (navHamburger) {
        navHamburger.addEventListener('click', function (e) {
            e.stopPropagation();
            if (mobileNavDropdown && mobileNavDropdown.classList.contains('open')) {
                closeDropdown();
            } else {
                openDropdown();
            }
        });
    }

    if (mobileNavBackdrop) {
        mobileNavBackdrop.addEventListener('click', function () {
            closeDropdown();
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && mobileNavDropdown && mobileNavDropdown.classList.contains('open')) {
            closeDropdown();
        }
    });

    // Smooth scroll on link click
    mobileNavLinks.forEach(function (link) {
        link.addEventListener('click', function (e) {
            var targetId = this.getAttribute('href');
            if (targetId && targetId.startsWith('#')) {
                e.preventDefault();
                var secId = targetId.substring(1);
                var targetEl = document.getElementById(secId);

                closeDropdown();

                if (targetEl) {
                    if (window.setNavClicking) {
                        window.setNavClicking(true);
                    }
                    if (window.syncActiveSection) {
                        window.syncActiveSection(secId, true);
                    }

                    var navBar = document.querySelector('.top-row .nav');
                    var navHeight = (navBar ? navBar.offsetHeight : 54) + 20;
                    var elementPosition = targetEl.getBoundingClientRect().top;
                    var offsetPosition = elementPosition + window.pageYOffset - navHeight;

                    setTimeout(function () {
                        window.scrollTo({
                            top: Math.max(0, offsetPosition),
                            behavior: 'smooth'
                        });
                    }, 100);

                    setTimeout(function () {
                        if (window.setNavClicking) {
                            window.setNavClicking(false);
                        }
                    }, 900);
                }
            }
        });
    });
})();

/* ================= PARALLAX CURSOR EFFECT ================= */
(function () {
    function initParallaxCursorEffect() {
        if (!window.matchMedia || !window.matchMedia('(pointer: fine)').matches) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (document.body.dataset.parallaxInit === '1') return;
        document.body.dataset.parallaxInit = '1';

        function attachCardParallax(el, options) {
            const maxTilt = options.maxTilt || 0;
            const hoverLift = options.hoverLift || 0;
            const baseTransition = options.baseTransition || 'box-shadow .25s ease, transform .38s cubic-bezier(0.22, 1, 0.36, 1)';
            el.classList.add('parallax-card');

            el.addEventListener('mousemove', function (e) {
                const rect = el.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                el.style.setProperty('--mx', `${x.toFixed(1)}px`);
                el.style.setProperty('--my', `${y.toFixed(1)}px`);
                el.classList.add('is-tilting');

                if (maxTilt > 0) {
                    const rx = ((y - rect.height / 2) / (rect.height / 2)) * -maxTilt;
                    const ry = ((x - rect.width / 2) / (rect.width / 2)) * maxTilt;
                    el.style.transition = 'box-shadow .25s ease, transform .08s ease-out';
                    el.style.transform = `perspective(1000px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(${hoverLift}px)`;
                }
            }, { passive: true });

            el.addEventListener('mouseleave', function () {
                el.classList.remove('is-tilting');
                if (maxTilt > 0) {
                    el.style.transition = baseTransition;
                    el.style.transform = '';
                    setTimeout(function () {
                        if (!el.classList.contains('is-tilting')) {
                            el.style.transition = '';
                        }
                    }, 380);
                }
            });
        }

        document.querySelectorAll('.hero, .weather, .row3 > .card, .awsbar').forEach(function (el) {
            attachCardParallax(el, { maxTilt: 2.2, hoverLift: -2 });
        });

        document.querySelectorAll('.sensor, .hwc, .awsc').forEach(function (el) {
            attachCardParallax(el, { maxTilt: 3.8, hoverLift: -2 });
        });

        document.querySelectorAll('.card.chart, .card.tcard').forEach(function (el) {
            attachCardParallax(el, { maxTilt: 0 });
        });

        document.querySelectorAll('.notif-btn, .ai-assistant-btn, .gear').forEach(function (btn) {
            const icon = btn.querySelector('svg');
            btn.addEventListener('mousemove', function (e) {
                const rect = btn.getBoundingClientRect();
                const dx = e.clientX - (rect.left + rect.width / 2);
                const dy = e.clientY - (rect.top + rect.height / 2);
                btn.style.transition = 'transform .1s ease-out, box-shadow .22s ease, background .22s ease';
                btn.style.transform = `translate3d(${(dx * 0.22).toFixed(2)}px, ${(dy * 0.22).toFixed(2)}px, 0)`;
                if (icon) {
                    icon.style.transition = 'transform .1s ease-out';
                    icon.style.transform = `translate3d(${(dx * 0.12).toFixed(2)}px, ${(dy * 0.12).toFixed(2)}px, 0)`;
                }
            }, { passive: true });

            btn.addEventListener('mouseleave', function () {
                btn.style.transition = 'transform .35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow .22s ease, background .22s ease';
                btn.style.transform = '';
                if (icon) {
                    icon.style.transition = 'transform .35s cubic-bezier(0.22, 1, 0.36, 1)';
                    icon.style.transform = '';
                }
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initParallaxCursorEffect);
    } else {
        initParallaxCursorEffect();
    }
})();
