# TeFa - Smart Greenhouse & Hydroponic IoT Dashboard

Dashboard Internet of Things (IoT) untuk monitoring telemetri lingkungan greenhouse hidroponik, Automatic Weather Station (AWS), serta kontrol aktuator 8-channel relay berbasis web.

Dikembangkan untuk program **Teaching Factory (TeFa)** — kolaborasi **SMKN 1 Mappi** dan **SMK Negeri 2 Yogyakarta**.

---

## 🚀 Alur Akses Halaman (Dual-Mode Architecture)

Aplikasi mengadopsi arsitektur akses ganda untuk memisahkan hak pantau umum dengan hak kontrol aktuator fisik:

1. **Mode Viewer (Publik / Default):**
   * Saat pertama kali membuka web (`index.html` atau root URL), pengguna **langsung diarahkan ke Dashboard Viewer (`indexViewer.html`) tanpa perlu login**.
   * Mode ini bersifat *read-only* (hanya dapat melihat telemetri real-time, grafik analitik, cuaca AWS, informasi sensor, dan mengunduh laporan CSV).
   * Panel kontrol relay dinonaktifkan/disembunyikan demi keamanan.
2. **Mode Admin (Khusus Kontrol Relay & Parameter):**
   * Jika pengguna ingin mengendalikan aktuator 8-channel relay, mengubah batas *threshold*, atau mengatur interval MQTT, pengguna masuk melalui halaman **[Login Admin](login.html)**.
   * Setelah verifikasi kredensial berhasil, sesi disimpan di `sessionStorage` dan pengguna diarahkan ke **[Dashboard Admin](indexAdmin.html)**.
   * Tombol *logout* pada header akan menghapus sesi admin dan mengembalikan pengguna ke mode publik (`indexViewer.html`).

---

## 🔑 Kredensial Pengujian (Demo Admin)

* **Halaman Login:** [`login.html`](login.html)
* **Username:** `admin` (atau `admin@tefa.id`, `tefa`)
* **Password:** `admin123` (atau `mappi32`)
* *Catatan:* Terdapat chip pengisian otomatis (*autofill chip*) pada halaman login untuk memudahkan pengujian.

---

## ✨ Fitur Utama Sistem

1. **Telemetri Sensor Real-Time (MQTT over WebSocket):**
   * Pemantauan parameter: pH Air, EC/TDS (Nutrisi), Intensitas Cahaya (BH1750), Suhu Air (DS18B20), serta Suhu & Kelembapan Udara (AHT20).
   * Terhubung langsung ke broker MQTT via WebSocket (`wss://broker.emqx.io:8084/mqtt`).
   * Dilengkapi indikator koneksi perangkat (RSSI WiFi) dan status *Hardware Health*.
2. **Kontrol Aktuator 8-Channel Relay (Khusus Admin):**
   * Kontrol individual dengan saklar toggle interaktif serta tombol aksi massal (`All ON` / `All OFF`).
   * Sinkronisasi dua arah via MQTT topik `tefa/hidroponik/control` dan `tefa/hidroponik/status`:
     * **Relay 1 (`pump_A`):** Nutrient Pump A
     * **Relay 2 (`pump_B`):** Nutrient Pump B
     * **Relay 3 (`pump_up`):** pH Up Pump
     * **Relay 4 (`pump_down`):** pH Down Pump
     * **Relay 5 (`pump_big`):** Main Pump (Big)
     * **Relay 6 - 8:** Saluran Ekspansi (*Coming Soon*)
   * Penghitung durasi aktif per-relay (`Active · HH:MM:SS`) dengan format *tabular-nums*.
3. **Grafik Analitik & Riwayat Telemetri:**
   * Visualisasi kurva multi-parameter interaktif dengan filter rentang (`Real-time`, `1 Jam`, `24 Jam`, `7 Hari`).
   * Tabel riwayat pembacaan sensor dengan status ambang batas (`Normal` / `Warning`) dan tombol **Download CSV**.
4. **Automatic Weather Station (AWS):**
   * Pemantauan kondisi cuaca eksternal dan tanah greenhouse (Suhu, Kelembaban, Kecepatan Angin, Radiasi Surya, Kelembaban Tanah).
   * Tab riwayat AWS: *Daily*, *Weekly*, dan *Monthly*.
5. **Asisten AI Cerdas (Agronomy Copilot):**
   * Dialog konsultasi agronomi interaktif berbasis teks dan suara (*Web Speech API*).
   * Terintegrasi dengan opsi API Key (Google Gemini / OpenAI) yang dapat diatur melalui modal Settings.
6. **Desain Presisi Figma & Tema Dinamis:**
   * Halaman login presisi 1:1 sesuai desain Figma, *single page static* tanpa scrollbar, dengan aksen spiral botani.
   * Dashboard mendukung *Light Mode* dan *Dark Mode* dengan palet organik (`#1B5E20`, `#2E7D32`, `#66BB6A`, `#A5D6A7`, `#E8F5E9`).

---

## 📂 Struktur File Proyek

```text
TEFA-combine/
├── index.html            # Gateway/Entry point, otomatis redirect ke indexViewer.html
├── indexViewer.html      # Dashboard Publik (Read-only telemetri, AWS & chart, tanpa relay)
├── indexAdmin.html       # Dashboard Administrator (Telemetri + Kontrol Aktuator Relay 8-CH)
├── login.html            # Halaman autentikasi Admin (Figma-compliant, single-page static)
├── CONTEXT.md            # Dokumentasi arsitektur sistem, mapping UI, dan skema JSON
├── jsonDantopic.md       # Spesifikasi kontrak topik MQTT & payload JSON sensor/kontrol
├── README.md             # Ringkasan proyek dan panduan repositori
├── css/
│   ├── admin.css         # Styling layout, animasi, dan komponen Dashboard Admin
│   └── viewer.css        # Styling layout dan komponen Dashboard Viewer
├── js/
│   ├── admin.js          # Logika front-end Admin (kontrol relay, modal settings, clock)
│   ├── viewer.js         # Logika front-end Viewer (clock, AI modal, tabs AWS)
│   └── mqtt-client.js    # Engine MQTT WebSocket (subscribe, publish, chart rendering, CSV)
└── docs/
    ├── design_TEFA.md    # Spesifikasi Design System (@anti-slop-design, token, komponen)
    ├── prd_smart_hydroponic_system_mappi32_node_red.md # Dokumen PRD teknis sistem
    └── [file blueprint, PDF mockup, dan aset grafis]
```

---

## 🛠️ Cara Menjalankan Proyek

Aplikasi ini menggunakan arsitektur front-end modern tanpa dependensi build tool yang rumit:

1. **Menggunakan Live Server (VS Code / Extension):**
   * Buka folder `TEFA-combine` di VS Code.
   * Klik kanan pada `index.html` dan pilih **"Open with Live Server"**.
   * Web akan terbuka di peramban pada alamat `http://localhost:5500/` dan langsung mengarahkan ke `indexViewer.html`.
2. **Menggunakan Local HTTP Server (Python / Node.js):**
   * Jalankan terminal di folder repositori:
     ```bash
     # Menggunakan Python
     python -m http.server 8080

     # Atau menggunakan npx serve
     npx serve .
     ```
   * Buka peramban pada `http://localhost:8080/`.
3. **Membuka File Langsung:**
   * Anda juga dapat membuka langsung file `indexViewer.html` atau `login.html` langsung di peramban web modern (Chrome, Edge, Firefox).

---

## 📡 Konfigurasi MQTT Default

| Parameter | Nilai Default |
| :--- | :--- |
| **Broker URL** | `wss://broker.emqx.io:8084/mqtt` |
| **Topic Sensor (Sub)** | `tefa/hidroponik/sensor` |
| **Topic Control (Pub)** | `tefa/hidroponik/control` |
| **Topic Status (Sub)** | `tefa/hidroponik/status` |
| **Device ID** | `DEV-TSK-01` |

*Catatan:* Pengaturan broker dan topik dapat diubah secara dinamis melalui tombol **Settings (Ikon Gear)** di Dashboard Admin dan tersimpan di `localStorage`.

---

## 📚 Dokumentasi Terkait
* 📄 **[CONTEXT.md](CONTEXT.md)** — Rincian arsitektur sistem, alur pengguna, dan struktur JSON.
* 📄 **[jsonDantopic.md](jsonDantopic.md)** — Spesifikasi payload MQTT sensor, kontrol, dan status.
* 📄 **[docs/design_TEFA.md](docs/design_TEFA.md)** — Standar visual, sistem tipografi, dan token desain.
* 📄 **[docs/prd_smart_hydroponic_system_mappi32_node_red.md](docs/prd_smart_hydroponic_system_mappi32_node_red.md)** — Dokumen persyaratan produk (PRD) lengkap.
