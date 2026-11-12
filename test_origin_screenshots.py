import os
import subprocess

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

# 1. Test Admin Gear Click (Setting Modal)
with open('indexadmin.html', 'r', encoding='utf-8') as f:
    admin_html = f.read()

test_admin_gear = admin_html.replace('</body>', '<script>setTimeout(function() { var g = document.querySelector(".gear"); if(g) g.click(); }, 300);</script></body>')
with open('_test_admin_gear.html', 'w', encoding='utf-8') as f:
    f.write(test_admin_gear)

admin_gear_png = os.path.abspath('verify_admin_gear_origin.png')
subprocess.run([
    chrome_path,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,850',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=2000',
    f'--screenshot={admin_gear_png}',
    'file:///D:/Isro/TeFa/_test_admin_gear.html'
], check=True)

# 2. Test Admin Notif Click (Notification Modal)
test_admin_notif = admin_html.replace('</body>', '<script>setTimeout(function() { var n = document.getElementById("notifBtn"); if(n) n.click(); }, 300);</script></body>')
with open('_test_admin_notif.html', 'w', encoding='utf-8') as f:
    f.write(test_admin_notif)

admin_notif_png = os.path.abspath('verify_admin_notif_origin.png')
subprocess.run([
    chrome_path,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,850',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=2000',
    f'--screenshot={admin_notif_png}',
    'file:///D:/Isro/TeFa/_test_admin_notif.html'
], check=True)

print("Admin gear png exists:", os.path.exists(admin_gear_png))
print("Admin notif png exists:", os.path.exists(admin_notif_png))

