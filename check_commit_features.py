import subprocess

res = subprocess.run(['git', 'show', '6f772bd:indexAdmin.html'], capture_output=True, text=True, encoding='utf-8')
text = res.stdout

print('Length of 6f772bd indexAdmin.html:', len(text))
print('Has weather viewBox fix:', '-6 0 116 114' in text)
print('Has aiAssistantBtn:', 'aiAssistantBtn' in text)
print('Has notifBtn:', 'notifBtn' in text)
print('Has settingModal:', 'settingModal' in text)
print('Has navIndicator:', 'navIndicator' in text)
print('Has scroll-reveal:', 'scroll-reveal' in text)

