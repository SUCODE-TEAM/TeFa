# TeFa - Smart Greenhouse & AWS IoT Dashboard

Dashboard Internet of Things (IoT) untuk monitoring telemetri lingkungan greenhouse hidroponik dan Automatic Weather Station (AWS), serta kontrol aktuator 8-channel relay berbasis web.

Dikembangkan untuk program **Teaching Factory (TeFa)** — kolaborasi SMKN 1 Mappi / SMK Negeri 2 Yogyakarta.

## 📄 Dokumentasi Konteks & Format JSON
Untuk detail lengkap mengenai alur akses, arsitektur web, spesifikasi hardware, dan **skema payload data sensor dalam format JSON**, silakan baca:
👉 **[CONTEXT.md](CONTEXT.md)**

## 🚀 Alur Akses Halaman
1. **Mode Viewer (Publik / Default):** Pengguna langsung masuk ke `indexViewer.html` tanpa login. Mode ini bersifat *read-only* (tidak dapat mengatur relay).
2. **Mode Admin:** Jika ingin mengatur/mengontrol 8 saluran relay atau mengubah parameter sistem, masuk melalui `login.html` (Khusus Admin). Setelah berhasil login, diarahkan ke `indexAdmin.html`.
