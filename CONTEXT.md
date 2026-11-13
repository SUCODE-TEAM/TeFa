# KONTEKS SISTEM & DOKUMENTASI WEB IOT TEFA

Dokumen ini berisi konteks lengkap arsitektur sistem, alur akses halaman web, spesifikasi perangkat keras (hardware), serta **format data sensor berbasis JSON** untuk proyek **Teaching Factory (TeFa) - Smart Greenhouse & Automatic Weather Station (AWS) IoT Dashboard**.

---

## 1. Ringkasan Proyek

- **Nama Proyek:** TeFa IoT Smart Greenhouse & Automatic Weather Station (AWS) Dashboard
- **Institusi/Sekolah:** SMKN 1 Mappi / SMK Negeri 2 Yogyakarta
- **Tujuan:** Sistem monitoring telemetri lingkungan greenhouse hidroponik, stasiun cuaca otomatis (AWS), kontrol aktuator/relay 8-channel, ekspor riwayat pengukuran (CSV), serta asisten cerdas (AI Assistant).
- **Arsitektur Web:**
  - Client-side Front-End murni (HTML5, Vanilla CSS3, Vanilla JavaScript ES6+).
  - Ringan, cepat, responsif di desktop & mobile tanpa framework berat.
  - Data telemetri dikirim/diterima melalui protokol **MQTT** dalam format **JSON** dari mikrokontroler (ESP32) melalui broker MQTT dengan topik **`tefa/smkn2yogyakarta/data`**.

---

## 2. Alur Akses & Struktur Halaman Web (Tanpa Login Viewer)

### A. Konsep Alur Pengguna (User Flow)
1. **Buka Web Langsung Masuk Mode Viewer (Default / Publik):**
   - Saat pertama kali membuka web (`index.html` atau root URL), sistem **langsung mengarahkan pengguna ke Dashboard Viewer (`indexViewer.html`) tanpa perlu login sama sekali**.
   - Pengunjung umum, siswa, atau tamu dapat langsung melihat data telemetri sensor, cuaca, grafik, dan tabel riwayat secara *real-time*.
2. **Mode Viewer Bersifat Read-Only (Tidak Bisa Mengatur Relay):**
   - Di `indexViewer.html`, **panel kontrol relay tidak ada / dinonaktifkan**. Pengunjung tidak dapat menyalakan/mematikan pompa, lampu, misting, atau aerator.
3. **Tidak Ada Login untuk Viewer:**
   - Sistem **tidak memerlukan form login bagi pengunjung/viewer**. Mode viewer terbuka untuk publik tanpa registrasi/kredensial.
4. **Login Khusus untuk Administrator (Untuk Mengatur Relay):**
   - Jika pengguna ingin mengatur/mengontrol relay aktuator atau mengubah konfigurasi sensitif, pengguna harus masuk melalui halaman **Login Admin** (`login.html`).
   - Tombol login admin dapat diakses dari menu/header atau langsung menuju `login.html`.
5. **Dashboard Admin (`indexAdmin.html`):**
   - Setelah admin berhasil login, sistem mengalihkan ke `indexAdmin.html`.
   - Di halaman ini, seluruh data telemetri ditampilkan ditambah **Panel Aktuator Relay 8-Channel** yang dapat dikontrol (All ON, All OFF, toggle per-channel, dan timer aktif).
6. **Logout:**
   - Menghapus sesi admin dari `sessionStorage` dan otomatis mengembalikan tampilan ke mode publik **Viewer (`indexViewer.html`)**.

---

### B. Struktur File Proyek

```
D:\Isro\TeFa\
├── index.html            # Gateway/Entry point, otomatis redirect ke indexViewer.html (Mode Publik)
├── indexViewer.html      # Dashboard utama publik (Read-only telemetri & AWS, tanpa kontrol relay)
├── indexAdmin.html       # Dashboard Administrator (Telemetri + Kontrol Aktuator Relay 8-Channel)
├── login.html            # Halaman autentikasi khusus Admin (Tidak ada login viewer)
├── CONTEXT.md            # Dokumentasi konteks proyek & spesifikasi format JSON
├── README.md             # Catatan repositori proyek
├── css/
│   ├── viewer.css        # Styling layout, animasi, dan komponen untuk Dashboard Viewer
│   └── admin.css         # Styling Viewer ditambah komponen Panel Kontrol Relay untuk Admin
└── js/
    ├── viewer.js         # Logika front-end Viewer (jam WIB, chart, tabel paginasi, AI modal, notif)
    └── admin.js          # Logika front-end Admin (semua fitur viewer + logika relay toggle & timer)
```

---

### C. Kredensial Autentikasi Admin (`login.html`)
Form login **hanya digunakan oleh Administrator**:
- **Role:** `admin`
- **Username yang diterima:** `admin`, `admin@tefa.id`, atau `tefa`
- **Password:** `admin123` atau `mappi32`
- **Penyimpanan Sesi:** `sessionStorage.getItem('tefa_auth_user')` berisi objek:
  ```json
  {
    "username": "admin",
    "role": "admin",
    "loginTime": "2026-11-13T08:45:00.000Z"
  }
  ```
- *Catatan:* Opsi login viewer telah ditiadakan karena pengunjung langsung mengakses `indexViewer.html`.

---

## 3. Spesifikasi Sensor & Aktuator Hardware

Mikrokontroler utama: **ESP32**

| No | Komponen / Sensor | Modul | Pin ESP32 | Rentang / Satuan | Fungsi |
|---|---|---|---|---|---|
| 1 | **Sensor pH Air** | PH-4502C | GPIO 34 (ADC) | 0 – 14 pH | Memantau keasaman larutan nutrisi hidroponik |
| 2 | **Sensor EC / TDS (Nutrisi)** | Gravity TDS / EC | GPIO 35 (ADC) | mS/cm (atau 0 – 1000+ ppm) | Memantau kepekatan nutrisi larutan |
| 3 | **Sensor Intensitas Cahaya** | BH1750 | I2C (SDA: 21, SCL: 22) | 1 – 65,535 lux | Memantau pencahayaan greenhouse |
| 4 | **Suhu & Kelembaban Udara** | AHT20 / AHT10 | GPIO 4 / I2C | Suhu: -40–80°C, RH: 0–100% | Memantau iklim mikro greenhouse |
| 5 | **Suhu Air (Water Temp)** | DS18B20 Waterproof | GPIO (OneWire) | -55 – 125 °C | Suhu tandon nutrisi tanaman |
| 6 | **Relay 8 Channel** | Relay Module 5V | GPIO 13 – 27 | Beban: 10A 250VAC | Mengendalikan aktuator listrik (Hanya Admin) |
| 7 | **AWS (Weather Station)** | Multi-sensor Station | Serial / Modbus / I2C | Beragam (W/m², km/h, %, pH) | Cuaca luar & kondisi tanah |

### Pemetaan 8 Saluran Relay (Khusus Admin di `indexAdmin.html`):
- **Relay 1:** `Nutrient Pump` (Pompa Sirkulasi Nutrisi)
- **Relay 2:** `Aerator` (Penambah Oksigen Larutan)
- **Relay 3:** `Grow Light` (Lampu Pembantu Fotosintesis)
- **Relay 4:** `pH Up Pump` (Injeksi Cairan Basa/Alkali)
- **Relay 5:** `pH Down Pump` (Injeksi Cairan Asam)
- **Relay 6:** `Exhaust Fan` (Kipas Pembuangan Udara Panas)
- **Relay 7:** `Misting` (Pengabutan/Pendingin Suhu)
- **Relay 8:** `Reserve` (Saluran Cadangan/Tambahan)

---

## 4. Protokol MQTT & Standar Format Data JSON Sensor

Sistem menggunakan protokol **MQTT** dengan payload berformat **JSON** untuk komunikasi antara Mikrokontroler (ESP32), MQTT Broker, dan Dashboard Web.

- **Topik MQTT Telemetri Sensor:** `tefa/smkn2yogyakarta/data`

### A. Payload Telemetri Live (MQTT Topic: `tefa/smkn2yogyakarta/data`)
Format JSON aktual yang dipublish oleh firmware (`device_id`: `firmware_dayone`) ke topik `tefa/smkn2yogyakarta/data` menggunakan struktur array `sensors`:

```json
{
  "device_id": "firmware_dayone",
  "timestamp": "2026-11-09T04:15:30Z",
  "sensors": [
    {
      "id": "kekuatan_wiFi",
      "value": 10.0,
      "satuan": "Mbps"
    },
    {
      "id": "001pH",
      "value": 7.20,
      "satuan": "pH"
    },
    {
      "id": "002EC",
      "value": 1.45,
      "satuan": "mS/cm"
    },
    {
      "id": "003bh1750",
      "value": 450.50,
      "satuan": "lux"
    },
    {
      "id": "004aht20_temp",
      "value": 28.50,
      "satuan": "°C"
    },
    {
      "id": "004aht20_hum",
      "value": 65.20,
      "satuan": "%"
    },
    {
      "id": "005sensorair",
      "value": 26.80,
      "satuan": "°C"
    }
  ]
}
```

#### Pemetaan `sensors[].id` ke UI Dashboard:
| `id` Sensor | Tipe / Keterangan | `satuan` | Target Tampilan UI Dashboard |
|---|---|---|---|
| `kekuatan_wiFi` | Kekuatan / Kecepatan WiFi ESP32 | `Mbps` | Indikator koneksi / status perangkat |
| `001pH` | Sensor pH Air (PH-4502C) | `pH` | Kartu Sensor pH, Threshold Monitor, Grafik & Tabel `#hist` |
| `002EC` | Electrical Conductivity / Nutrisi | `mS/cm` | Kartu Nutrition / TDS (dapat ditampilkan sebagai EC atau dikonversi ke ppm) |
| `003bh1750` | Sensor Intensitas Cahaya (BH1750) | `lux` | Kartu Light, Threshold Monitor & Tabel `#hist` |
| `004aht20_temp` | Sensor Suhu Udara (AHT20) | `°C` | Kartu Weather & Time (Air Temp) & Grafik |
| `004aht20_hum` | Sensor Kelembaban Udara (AHT20) | `%` | Kartu Weather Humidity, Threshold Monitor & Tabel `#hist` |
| `005sensorair` | Sensor Suhu Air Tandon | `°C` | Donut Chart Water Temp, Threshold Monitor, Grafik & Tabel `#hist` |

*Catatan:* `timestamp` dikirim dalam format ISO 8601 UTC (`Z`), sehingga pada UI dashboard perlu dikonversi ke waktu lokal **WIB (UTC+7)**.

---

### B. Format Baris Tabel Riwayat Sensor (`sensorHistoryData`)
Digunakan oleh tabel `#hist` pada dashboard dan diekspor ke file CSV:

```json
[
  {
    "time": "08:45:00",
    "ph": "6.2",
    "ppm": "850",
    "temp": "24.5",
    "light": "15200",
    "hum": "72%",
    "status": "Normal"
  },
  {
    "time": "08:42:00",
    "ph": "6.9",
    "ppm": "1250",
    "temp": "27.1",
    "light": "18900",
    "hum": "48%",
    "status": "Warning"
  }
]
```

*Keterangan Field:*
- `time`: Waktu pencatatan format `HH:mm:ss`
- `ph`: Nilai pH larutan
- `ppm`: Nilai TDS ppm
- `temp`: Suhu air tandon (°C)
- `light`: Intensitas cahaya (lux)
- `hum`: Kelembaban udara (%)
- `status`: `"Normal"` atau `"Warning"` (bergantung ambang batas)

---

### C. Format Riwayat AWS (`awsHistoryData`)
Digunakan pada tabel AWS Tabs (Daily, Weekly, Monthly):

```json
{
  "daily": [
    {
      "time": "08:00 WIB",
      "temp": "28.5 °C",
      "hum": "70%",
      "wind": "11 km/h E",
      "solar": "420 W/m²",
      "soil": "65%"
    }
  ],
  "weekly": [
    {
      "time": "Senin, 12 Nov",
      "temp": "27.8 °C",
      "hum": "74%",
      "wind": "10 km/h NE",
      "solar": "390 W/m²",
      "soil": "68%"
    }
  ],
  "monthly": [
    {
      "time": "Oktober 2026",
      "temp": "28.1 °C",
      "hum": "72%",
      "wind": "12 km/h E",
      "solar": "410 W/m²",
      "soil": "66%"
    }
  ]
}
```

---

### D. Perintah Kontrol Relay (Web Admin $\rightarrow$ Aktuator / ESP32)
Dikirim saat Admin mengklik toggle atau tombol *All ON / All OFF* di `indexAdmin.html`:

```json
{
  "action": "set_relay",
  "relay_id": 1,
  "state": "on",
  "command_by": "admin",
  "timestamp": "2026-11-13T08:45:30+07:00"
}
```
Atau kontrol massal (Batch/All):
```json
{
  "action": "set_all_relays",
  "state": "off",
  "command_by": "admin",
  "timestamp": "2026-11-13T08:46:00+07:00"
}
```

---

### E. Format Konfigurasi & Ambang Batas (`localStorage: tefa_dashboard_settings`)
Tersimpan di peramban pengguna melalui modal Settings (Ikon Gear):

```json
{
  "phMin": "5,5",
  "phMax": "6,5",
  "tdsMin": "600",
  "tdsMax": "1200",
  "tempMin": "20",
  "tempMax": "30",
  "humMin": "50",
  "humMax": "85",
  "interval": "3",
  "apiKey": ""
}
```

---

### F. Format Notifikasi / Alarm Sensor (`notifications`)
Data pada popup lonceng notifikasi bila ada sensor yang melewati nilai ambang batas:

```json
[
  {
    "id": "notif-001",
    "type": "warning",
    "tag": "Suhu Air",
    "time": "08:40 WIB",
    "title": "Suhu Air Melebihi Batas Maksimum",
    "desc": "Suhu larutan tandon mencapai 31.5°C (Ambang batas aman: 20-30°C).",
    "value": "31.5 °C"
  },
  {
    "id": "notif-002",
    "type": "info",
    "tag": "Nutrisi TDS",
    "time": "08:30 WIB",
    "title": "Nutrisi Stabil",
    "desc": "Tingkat kepekatan nutrisi berada dalam rentang ideal 850 ppm.",
    "value": "850 ppm"
  }
]
```

---

## 5. Status Sambungan Sensor (Offline / Disconnected Handling)

Jika ESP32 belum terhubung atau kiriman data JSON terputus:
1. Kartu Sensor menampilkan label **N/A** dan status warna merah **Terputus**.
2. Indikator grafik telemetri menampilkan pesan: *"Sensor Terputus · Tidak Ada Data Telemetri (N/A)"*.
3. Tabel riwayat menampilkan baris kosong: *"Tidak ada data sensor terhubung (Status: Terputus / N/A)"*.
4. Tombol *Download CSV* memunculkan peringatan jika diekspor dalam keadaan kosong.
5. Ketika data JSON valid masuk, indikator status otomatis beralih menjadi hijau (**Normal / Optimal**) atau kuning/merah (**Warning**).
