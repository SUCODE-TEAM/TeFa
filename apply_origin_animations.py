import re

def update_origin(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Update setting-modal-backdrop CSS
    old_backdrop_css = """.setting-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, .45);
            z-index: 2000;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 16px;
        }"""
    
    new_backdrop_css = """.setting-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, .40);
            z-index: 2000;
            display: none;
        }"""

    if old_backdrop_css in content:
        content = content.replace(old_backdrop_css, new_backdrop_css, 1)
        print(f"Updated setting-modal-backdrop in {filepath}")
    else:
        print(f"Warning: old_backdrop_css not matched in {filepath}")

    # 2. Update setting-modal CSS
    old_setting_modal = """.setting-modal {
            width: 580px;
            max-width: 100%;
            background: #fff;
            border-radius: 10px;
            border: 1px solid #A5D6A7;
            box-shadow: 0 16px 40px rgba(0, 0, 0, .18);
            padding: 28px 32px 24px;
            transform-origin: center center;
        }"""

    new_setting_modal = """.setting-modal {
            position: fixed;
            width: 580px;
            max-width: calc(100vw - 32px);
            max-height: calc(100vh - 32px);
            overflow-y: auto;
            background: #fff;
            border-radius: 10px;
            border: 1px solid #A5D6A7;
            box-shadow: 0 16px 40px rgba(0, 0, 0, .22);
            padding: 28px 32px 24px;
            transform-origin: calc(100% - 31px) 31px;
        }"""

    if old_setting_modal in content:
        content = content.replace(old_setting_modal, new_setting_modal, 1)
        print(f"Updated setting-modal styling in {filepath}")
    else:
        print(f"Warning: old_setting_modal not matched in {filepath}")

    # 3. Update notif-modal-backdrop CSS
    old_notif_backdrop = """.notif-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, .45);
            z-index: 2000;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 16px;
        }"""

    new_notif_backdrop = """.notif-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, .40);
            z-index: 2000;
            display: none;
        }"""

    if old_notif_backdrop in content:
        content = content.replace(old_notif_backdrop, new_notif_backdrop, 1)
        print(f"Updated notif-modal-backdrop in {filepath}")
    else:
        print(f"Warning: old_notif_backdrop not matched in {filepath}")

    # 4. Update notif-modal CSS
    old_notif_modal = """.notif-modal {
            width: 500px;
            max-width: 100%;
            background: #FFFFFF;
            border-radius: 6px;
            border: 1px solid #A5D6A7;
            box-shadow: 0 16px 40px rgba(0, 0, 0, .18);
            padding: 24px 26px 22px;
            display: flex;
            flex-direction: column;
            transform-origin: center center;
        }"""

    new_notif_modal = """.notif-modal {
            position: fixed;
            width: 500px;
            max-width: calc(100vw - 32px);
            max-height: calc(100vh - 32px);
            overflow-y: auto;
            background: #FFFFFF;
            border-radius: 6px;
            border: 1px solid #A5D6A7;
            box-shadow: 0 16px 40px rgba(0, 0, 0, .22);
            padding: 24px 26px 22px;
            display: flex;
            flex-direction: column;
            transform-origin: calc(100% - 31px) 31px;
        }"""

    if old_notif_modal in content:
        content = content.replace(old_notif_modal, new_notif_modal, 1)
        print(f"Updated notif-modal styling in {filepath}")
    else:
        print(f"Warning: old_notif_modal not matched in {filepath}")

    # 5. Update circleExpandSetting & settingShrinkToCircle to expand from calc(100% - 31px) 31px
    content = content.replace(
        "clip-path: circle(30px at 50% 50%);\n                border-radius: 50%;\n                opacity: 0.9;\n                transform: scale(0.2);",
        "clip-path: circle(31px at calc(100% - 31px) 31px);\n                border-radius: 50%;\n                opacity: 0.9;\n                transform: scale(0.15);"
    )
    content = content.replace(
        "clip-path: circle(150% at 50% 50%);\n                border-radius: 10px;\n                opacity: 1;\n                transform: scale(1);",
        "clip-path: circle(150% at calc(100% - 31px) 31px);\n                border-radius: 10px;\n                opacity: 1;\n                transform: scale(1);"
    )

    # 6. Update circleExpandNotif & notifShrinkToCircle
    content = content.replace(
        "clip-path: circle(150% at 50% 50%);\n                border-radius: 6px;\n                opacity: 1;\n                transform: scale(1);",
        "clip-path: circle(150% at calc(100% - 31px) 31px);\n                border-radius: 6px;\n                opacity: 1;\n                transform: scale(1);"
    )

    # 7. Add responsive mobile style if not present
    mobile_rule = """
        @media(max-width: 650px) {
            .setting-modal,
            .notif-modal {
                top: 16px !important;
                right: 16px !important;
                left: 16px !important;
                width: auto !important;
                max-width: calc(100vw - 32px) !important;
                transform-origin: calc(100% - 24px) 24px !important;
            }
        }
"""
    if '@media(max-width: 650px)' not in content:
        content = content.replace('</style>', mobile_rule + '\n    </style>', 1)
        print(f"Added mobile modal rule in {filepath}")

    # 8. Update JS openModal for Setting (position based on gearBtn)
    old_setting_open = """                function openModal() {
                    loadSettings();
                    backdrop.classList.remove('closing');
                    backdrop.classList.add('open');
                }"""

    new_setting_open = """                function openModal() {
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
                    backdrop.classList.remove('closing');
                    backdrop.classList.add('open');
                }"""

    if old_setting_open in content:
        content = content.replace(old_setting_open, new_setting_open, 1)
        print(f"Updated JS openModal for setting in {filepath}")
    else:
        print(f"Warning: old_setting_open not matched in {filepath}")

    # 9. Update JS openModal for Notification (position based on notifBtn)
    old_notif_open = """                function openModal() {
                    renderList();
                    backdrop.classList.remove('closing');
                    backdrop.classList.add('open');
                }"""

    new_notif_open = """                function openModal() {
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
                    backdrop.classList.remove('closing');
                    backdrop.classList.add('open');
                }"""

    if old_notif_open in content:
        content = content.replace(old_notif_open, new_notif_open, 1)
        print(f"Updated JS openModal for notif in {filepath}")
    else:
        print(f"Warning: old_notif_open not matched in {filepath}")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"Successfully processed {filepath}")

update_origin('indexadmin.html')
update_origin('indexViewer.html')

