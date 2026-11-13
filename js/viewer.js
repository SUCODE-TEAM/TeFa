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

                desktopLinks.forEach(function(l) {
                    if (l.getAttribute('href') === '#' + secId) {
                        l.classList.add('active');
                        targetDesktopLink = l;
                    } else {
                        l.classList.remove('active');
                    }
                });

                mobileLinks.forEach(function(ml) {
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
            window.setNavClicking = function(state) {
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
            window.addEventListener('load', function() { moveNavIndicator(); });
            window.addEventListener('resize', function() { moveNavIndicator(); });
            setTimeout(function() { moveNavIndicator(); }, 100);
            setTimeout(function() { moveNavIndicator(); }, 300);
            setTimeout(function() { moveNavIndicator(); }, 600);
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(function() { moveNavIndicator(); });
            }

            // Desktop nav click handling
            navLinks.forEach(function(link) {
                link.addEventListener('click', function(e) {
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

                            navClickTimer = setTimeout(function() {
                                isUserNavClick = false;
                            }, 850);
                        }
                    }
                });
            });

            // Single unified scroll listener
            window.addEventListener('scroll', function() {
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
                    spySectionIds.forEach(function(id) {
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

            // Clean Scroll Reveal Animation
            function initScrollReveal() {
                var revealSelectors = [
                    '.hero',
                    '.row2',
                    '.row3',
                    '.relay-sec',
                    '#relay',
                    '.card.chart',
                    '#telemetri',
                    '#hardware',
                    '.hwcards',
                    '.awsbar',
                    '.awsgrid'
                ];

                var revealElements = [];
                revealSelectors.forEach(function(sel) {
                    document.querySelectorAll(sel).forEach(function(el) {
                        if (!el.classList.contains('scroll-reveal')) {
                            el.classList.add('scroll-reveal');
                            revealElements.push(el);
                        }
                    });
                });

                if ('IntersectionObserver' in window) {
                    var observer = new IntersectionObserver(function(entries, obs) {
                        entries.forEach(function(entry) {
                            if (entry.isIntersecting) {
                                entry.target.classList.add('revealed');
                                obs.unobserve(entry.target);
                            }
                        });
                    }, {
                        threshold: 0.05,
                        rootMargin: '60px 0px 60px 0px'
                    });

                    revealElements.forEach(function(el) {
                        var rect = el.getBoundingClientRect();
                        if (rect.top < window.innerHeight + 60 && rect.bottom > -60) {
                            el.classList.add('revealed');
                        } else {
                            observer.observe(el);
                        }
                    });

                    window.addEventListener('scroll', function() {
                        revealElements.forEach(function(el) {
                            if (!el.classList.contains('revealed')) {
                                var rect = el.getBoundingClientRect();
                                if (rect.top < window.innerHeight + 60 && rect.bottom > -60) {
                                    el.classList.add('revealed');
                                }
                            }
                        });
                    }, { passive: true });
                } else {
                    revealElements.forEach(function(el) {
                        el.classList.add('revealed');
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
                    apiKey: ''
                };

                function loadSettings() {
                    try {
                        var saved = JSON.parse(localStorage.getItem('tefa_dashboard_settings') || '{}');
                        document.getElementById('set_ph_min').value = saved.phMin || defaultSettings.phMin;
                        document.getElementById('set_ph_max').value = saved.phMax || defaultSettings.phMax;
                        document.getElementById('set_tds_min').value = saved.tdsMin || defaultSettings.tdsMin;
                        document.getElementById('set_tds_max').value = saved.tdsMax || defaultSettings.tdsMax;
                        document.getElementById('set_temp_min').value = saved.tempMin || defaultSettings.tempMin;
                        document.getElementById('set_temp_max').value = saved.tempMax || defaultSettings.tempMax;
                        document.getElementById('set_hum_min').value = saved.humMin || defaultSettings.humMin;
                        document.getElementById('set_hum_max').value = saved.humMax || defaultSettings.humMax;
                        document.getElementById('set_telemetry_interval').value = saved.interval || defaultSettings.interval;
                        document.getElementById('set_ai_api_key').value = saved.apiKey || defaultSettings.apiKey;
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
                    setTimeout(function() {
                        backdrop.classList.remove('open');
                        backdrop.classList.remove('closing');
                        gearBtn.classList.remove('hidden');
                    }, 320);
                }

                gearBtn.style.cursor = 'pointer';
                gearBtn.title = 'Pengaturan Dashboard';
                gearBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    openModal();
                });

                if (closeBtn) {
                    closeBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        closeModal();
                    });
                }

                backdrop.addEventListener('click', function(e) {
                    if (e.target === backdrop) {
                        closeModal();
                    }
                });

                if (resetBtn) {
                    resetBtn.addEventListener('click', function() {
                        document.getElementById('set_ph_min').value = defaultSettings.phMin;
                        document.getElementById('set_ph_max').value = defaultSettings.phMax;
                        document.getElementById('set_tds_min').value = defaultSettings.tdsMin;
                        document.getElementById('set_tds_max').value = defaultSettings.tdsMax;
                        document.getElementById('set_temp_min').value = defaultSettings.tempMin;
                        document.getElementById('set_temp_max').value = defaultSettings.tempMax;
                        document.getElementById('set_hum_min').value = defaultSettings.humMin;
                        document.getElementById('set_hum_max').value = defaultSettings.humMax;
                        document.getElementById('set_telemetry_interval').value = defaultSettings.interval;
                        document.getElementById('set_ai_api_key').value = defaultSettings.apiKey;
                        localStorage.removeItem('tefa_dashboard_settings');
                    });
                }

                if (saveBtn) {
                    saveBtn.addEventListener('click', function() {
                        var newSettings = {
                            phMin: document.getElementById('set_ph_min').value.trim(),
                            phMax: document.getElementById('set_ph_max').value.trim(),
                            tdsMin: document.getElementById('set_tds_min').value.trim(),
                            tdsMax: document.getElementById('set_tds_max').value.trim(),
                            tempMin: document.getElementById('set_temp_min').value.trim(),
                            tempMax: document.getElementById('set_temp_max').value.trim(),
                            humMin: document.getElementById('set_hum_min').value.trim(),
                            humMax: document.getElementById('set_hum_max').value.trim(),
                            interval: document.getElementById('set_telemetry_interval').value,
                            apiKey: document.getElementById('set_ai_api_key').value.trim()
                        };
                        localStorage.setItem('tefa_dashboard_settings', JSON.stringify(newSettings));
                        
                        var originalText = saveBtn.textContent;
                        saveBtn.textContent = 'SAVED ✓';
                        saveBtn.style.background = '#2E7D32';
                        setTimeout(function() {
                            saveBtn.textContent = originalText;
                            saveBtn.style.background = '#1B5E20';
                            closeModal();
                        }, 500);
                    });
                }

                document.addEventListener('keydown', function(e) {
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

                if (!aiBtn || !aiPopup) return;

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
                    setTimeout(function() {
                        if (aiInput) aiInput.focus();
                    }, 400);
                }

                function closePopup() {
                    if (!aiPopup.classList.contains('open') || aiPopup.classList.contains('closing')) return;
                    aiPopup.classList.add('closing');
                    setTimeout(function() {
                        aiPopup.classList.remove('open');
                        aiPopup.classList.remove('closing');
                        aiBtn.classList.remove('hidden');
                    }, 320);
                }

                aiBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (aiPopup.classList.contains('open') && !aiPopup.classList.contains('closing')) {
                        closePopup();
                    } else {
                        openPopup();
                    }
                });

                if (aiClose) {
                    aiClose.addEventListener('click', function(e) {
                        e.stopPropagation();
                        closePopup();
                    });
                }

                aiPopup.addEventListener('click', function(e) {
                    e.stopPropagation();
                });

                document.addEventListener('click', function(e) {
                    if (aiPopup.classList.contains('open') && !aiPopup.contains(e.target) && !aiBtn.contains(e.target)) {
                        closePopup();
                    }
                });

                document.addEventListener('keydown', function(e) {
                    if (e.key === 'Escape' && aiPopup.classList.contains('open')) {
                        closePopup();
                    }
                });

                if (aiClear && aiMessages) {
                    aiClear.addEventListener('click', function() {
                        aiMessages.innerHTML = '';
                    });
                }

                function sendMessage() {
                    if (!aiInput || !aiMessages) return;
                    var text = aiInput.value.trim();
                    if (!text) return;

                    var userMsg = document.createElement('div');
                    userMsg.className = 'ai-msg-user';
                    userMsg.textContent = text;
                    aiMessages.appendChild(userMsg);

                    aiInput.value = '';
                    aiMessages.scrollTop = aiMessages.scrollHeight;

                    setTimeout(function() {
                        var botMsg = document.createElement('div');
                        botMsg.className = 'ai-msg-bot';
                        
                        var badge = document.createElement('div');
                        badge.className = 'ai-badge-label';
                        badge.textContent = 'AI';
                        
                        var msgText = document.createElement('div');
                        msgText.className = 'ai-msg-text';

                        var lower = text.toLowerCase();
                        if (lower.includes('status') || lower.includes('sensor')) {
                            msgText.textContent = 'Status sistem: Seluruh sensor saat ini dalam status Terputus (N/A). Data otomatis diperbarui bila ESP32 tersambung.';
                        } else if (lower.includes('hai') || lower.includes('halo')) {
                            msgText.textContent = 'HAI JUGA! Ada yang bisa saya bantu terkait monitoring greenhouse hidroponik?';
                        } else {
                            msgText.textContent = 'Sistem mencatat input: "' + text + '". Sensor saat ini N/A, telemetri otomatis akan aktif saat data live diterima.';
                        }

                        botMsg.appendChild(badge);
                        botMsg.appendChild(msgText);
                        aiMessages.appendChild(botMsg);
                        aiMessages.scrollTop = aiMessages.scrollHeight;
                    }, 450);
                }

                if (aiSend) {
                    aiSend.addEventListener('click', sendMessage);
                }

                if (aiInput) {
                    aiInput.addEventListener('keydown', function(e) {
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
                lazyImages.forEach(function(img) {
                    if (img.complete) {
                        img.classList.add('loaded');
                    } else {
                        img.addEventListener('load', function() {
                            img.classList.add('loaded');
                        });
                        img.addEventListener('error', function() {
                            img.classList.add('error');
                        });
                    }
                });
            }

            // ============================================================
            // SHARED PAGINATION BUTTON BUILDER (Max 5 pages + ellipsis)
            // ============================================================
            function renderTablePaginationButtons(btnsContainer, currentPage, totalPages, onPageSelect) {
                if (!btnsContainer) return;
                btnsContainer.innerHTML = '';

                function createPageBtn(page) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'table-pagination-btn' + (page === currentPage ? ' active' : '');
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
                prevBtn.addEventListener('click', function() {
                    if (currentPage > 1) onPageSelect(currentPage - 1);
                });
                btnsContainer.appendChild(prevBtn);

                var maxVisible = 5;
                var startPage = Math.max(1, currentPage - 2);
                var endPage = Math.min(totalPages, startPage + maxVisible - 1);
                if (endPage - startPage < maxVisible - 1) {
                    startPage = Math.max(1, endPage - maxVisible + 1);
                }

                if (startPage > 1) {
                    btnsContainer.appendChild(createPageBtn(1));
                    if (startPage > 2) btnsContainer.appendChild(createEllipsis());
                }

                for (var p = startPage; p <= endPage; p++) {
                    btnsContainer.appendChild(createPageBtn(p));
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
                    slice.forEach(function(r) {
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
                    renderTablePaginationButtons(btnsContainer, currentPage, totalPages, function(page) {
                        currentPage = page;
                        render();
                    });
                }

                if (perPageSelect) {
                    perPageSelect.addEventListener('change', function() {
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
                        sensorHistoryData.forEach(function(row) {
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

                window.addSensorHistoryRow = function(row) {
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
                    slice.forEach(function(r) {
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
                    renderTablePaginationButtons(btnsContainer, currentPage, totalPages, function(page) {
                        currentPage = page;
                        render();
                    });
                }

                if (tabsContainer) {
                    var tabBtns = tabsContainer.querySelectorAll('button');
                    tabBtns.forEach(function(btn) {
                        btn.addEventListener('click', function() {
                            tabBtns.forEach(function(b) { b.classList.remove('on'); });
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
                    perPageSelect.addEventListener('change', function() {
                        rowsPerPage = parseInt(this.value, 10) || 4;
                        currentPage = 1;
                        render();
                    });
                }

                window.addAwsHistoryRow = function(row, tab) {
                    var targetTab = tab || 'daily';
                    if (!awsHistoryData[targetTab]) awsHistoryData[targetTab] = [];
                    awsHistoryData[targetTab].unshift(row);
                    if (awsHistoryData[targetTab].length > 200) awsHistoryData[targetTab].pop();
                    if (currentTab === targetTab) render();
                };

                window.setAwsHistoryData = function(tab, rows) {
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
                    setTimeout(function() {
                        backdrop.classList.remove('open');
                        backdrop.classList.remove('closing');
                        notifBtn.classList.remove('hidden');
                    }, 320);
                }

                notifBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    openModal();
                });

                notifBtn.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openModal();
                    }
                });

                if (closeBtn) {
                    closeBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        closeModal();
                    });
                }

                backdrop.addEventListener('click', function(e) {
                    if (e.target === backdrop) {
                        closeModal();
                    }
                });

                document.addEventListener('keydown', function(e) {
                    if (e.key === 'Escape' && backdrop.classList.contains('open')) {
                        closeModal();
                    }
                });

                tabBtns.forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        tabBtns.forEach(function(b) { b.classList.remove('active'); });
                        btn.classList.add('active');
                        currentFilter = btn.getAttribute('data-filter') || 'all';
                        currentNotifPage = 1;
                        renderList();
                    });
                });

                if (notifPrevBtn) {
                    notifPrevBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        if (currentNotifPage > 1) {
                            currentNotifPage--;
                            renderList();
                        }
                    });
                }

                if (notifNextBtn) {
                    notifNextBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var filtered = notifications.filter(function(item) {
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
                    var filtered = notifications.filter(function(item) {
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
                    slice.forEach(function(item) {
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
            (function() {
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
                    setTimeout(function() {
                        mobileNavDropdown.classList.remove('open');
                        mobileNavDropdown.classList.remove('closing');
                        mobileNavDropdown.setAttribute('aria-hidden', 'true');
                    }, 200);
                }

                if (navHamburger) {
                    navHamburger.addEventListener('click', function(e) {
                        e.stopPropagation();
                        if (mobileNavDropdown && mobileNavDropdown.classList.contains('open')) {
                            closeDropdown();
                        } else {
                            openDropdown();
                        }
                    });
                }

                if (mobileNavBackdrop) {
                    mobileNavBackdrop.addEventListener('click', function() {
                        closeDropdown();
                    });
                }

                document.addEventListener('keydown', function(e) {
                    if (e.key === 'Escape' && mobileNavDropdown && mobileNavDropdown.classList.contains('open')) {
                        closeDropdown();
                    }
                });

                // Smooth scroll on link click
                mobileNavLinks.forEach(function(link) {
                    link.addEventListener('click', function(e) {
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

                                var topRow = document.querySelector('.top-row');
                                var navHeight = topRow ? topRow.offsetHeight + 16 : 76;
                                var elementPosition = targetEl.getBoundingClientRect().top;
                                var offsetPosition = elementPosition + window.pageYOffset - navHeight;

                                setTimeout(function() {
                                    window.scrollTo({
                                        top: Math.max(0, offsetPosition),
                                        behavior: 'smooth'
                                    });
                                }, 100);

                                setTimeout(function() {
                                    if (window.setNavClicking) {
                                        window.setNavClicking(false);
                                    }
                                }, 900);
                            }
                        }
                    });
                });
            })();
