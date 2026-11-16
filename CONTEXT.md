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
  - Data telemetri, kontrol aktuator, dan status perangkat dikirim/diterima melalui protokol **MQTT** (WebSocket `wss://broker.emqx.io:8084/mqtt`) dalam format **JSON** dari mikrokontroler (ESP32) menggunakan topik **`tefa/hidroponik/sensor`**, **`tefa/hidroponik/control`**, dan **`tefa/hidroponik/status`** (mengacu pada [`jsonDantopic.md`](jsonDantopic.md)).

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
├── jsonDantopic.md       # Spesifikasi topik MQTT & skema payload JSON terbaru
├── README.md             # Catatan repositori proyek
├── css/
│   ├── viewer.css        # Styling layout, animasi, dan komponen untuk Dashboard Viewer
│   └── admin.css         # Styling Viewer ditambah komponen Panel Kontrol Relay untuk Admin
└── js/
    ├── viewer.js         # Logika front-end Viewer (jam WIB, chart, tabel paginasi, AI modal, notif)
    ├── admin.js          # Logika front-end Admin (semua fitur viewer + kontrol pompa/relay & setting MQTT)
    └── mqtt-client.js    # Klien MQTT WebSocket (subscribe sensor/status, publish control, grafik & tabel)
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

### Pemetaan Saluran Pompa & Relay (Khusus Admin di `indexAdmin.html`):
Saluran Relay 1–5 terhubung langsung ke kontrol pompa MQTT (`pumps` pada topik `tefa/hidroponik/control` & `pumps_status` pada topik `tefa/hidroponik/status`):
- **Relay 1 (`pump_A`):** `Nutrient Pump A` (Pompa Nutrisi A)
- **Relay 2 (`pump_B`):** `Nutrient Pump B` (Pompa Nutrisi B)
- **Relay 3 (`pump_up`):** `pH Up Pump` (Injeksi Cairan Basa/Alkali)
- **Relay 4 (`pump_down`):** `pH Down Pump` (Injeksi Cairan Asam)
- **Relay 5 (`pump_big`):** `Main Pump (Big)` (Pompa Sirkulasi Utama)
- **Relay 6:** `Exhaust Fan` (Saluran Tambahan / UI Lokal)
- **Relay 7:** `Misting` (Saluran Tambahan / UI Lokal)
- **Relay 8:** `Reserve` (Saluran Cadangan / UI Lokal)

---

## 4. Protokol MQTT & Standar Format Data JSON Sensor

Sistem menggunakan protokol **MQTT** (broker default: `wss://broker.emqx.io:8084/mqtt`) dengan payload berformat **JSON** untuk komunikasi antara Mikrokontroler (ESP32), MQTT Broker, dan Dashboard Web sesuai [`jsonDantopic.md`](jsonDantopic.md):

- **Topik MQTT Subscribe Sensor:** `tefa/hidroponik/sensor`
- **Topik MQTT Publish Control:** `tefa/hidroponik/control`
- **Topik MQTT Subscribe Status:** `tefa/hidroponik/status`

### A. Payload Telemetri Live (MQTT Topic: `tefa/hidroponik/sensor`)
Format JSON aktual yang dipublish oleh perangkat (`device_id`: `DEV-TSK-01`) ke topik `tefa/hidroponik/sensor`:

```json
{
  "device_id": "DEV-TSK-01",
  "timestamp": "2026-11-09T04:15:30Z",
  "sensors": [
    {
      "id": "SNS-PH-001",
      "name": "pH Larutan Nutrisi",
      "value": 7.20,
      "satuan": "pH"
    },
    {
      "id": "SNS-EC-002",
      "name": "Konduktivitas Listrik (EC)",
      "value": 1.45,
      "satuan": "mS/cm"
    },
    {
      "id": "SNS-BH-003",
      "name": "Intensitas Cahaya Lingkungan",
      "value": 450.50,
      "satuan": "Lux"
    },
    {
      "id": "SNS-AHT-004",
      "name": "Suhu & Kelembapan Udara",
      "temperature": 28.50,
      "humidity": 65.20,
      "satuan_temp": "°C",
      "satuan_hum": "% RH"
    },
    {
      "id": "SNS-WT-005",
      "name": "Suhu Air Tangki Nutrisi",
      "value": 26.80,
      "satuan": "°C"
    },
    {
      "id": "TEL-WIFI-001",
      "name": "Kekuatan Sinyal WiFi (RSSI)",
      "value": -65,
      "satuan": "dBm"
    }
  ]
}
```

#### Pemetaan `sensors[].id` ke UI Dashboard:
| `id` Sensor | Tipe / Keterangan | Field & Satuan | Target Tampilan UI Dashboard |
|---|---|---|---|
| `TEL-WIFI-001` | Kekuatan Sinyal WiFi (RSSI) | `value` (`dBm`) | Indikator koneksi / status perangkat ESP32 |
| `SNS-PH-001` | pH Larutan Nutrisi | `value` (`pH`) | Kartu Sensor pH, Threshold Monitor, Grafik & Tabel `#hist` |
| `SNS-EC-002` | Konduktivitas Listrik (EC) | `value` (`mS/cm`) | Kartu Nutrition / TDS, Threshold Monitor, Grafik & Tabel `#hist` |
| `SNS-BH-003` | Intensitas Cahaya Lingkungan | `value` (`Lux`) | Kartu Light, Threshold Monitor, AWS Lux & Tabel `#hist` |
| `SNS-AHT-004` | Suhu & Kelembapan Udara (AHT20) | `temperature` (`°C`), `humidity` (`% RH`) | Kartu Weather & Time, Threshold Monitor, AWS Air & Tabel `#hist` |
| `SNS-WT-005` | Suhu Air Tangki Nutrisi | `value` (`°C`) | Donut Chart Water Temp, Threshold Monitor, Grafik & Tabel `#hist` |

*Catatan:* `timestamp` dikirim dalam format ISO 8601 UTC (`Z`), sehingga pada UI dashboard dikonversi ke waktu lokal **WIB (UTC+7)**. Klien web juga tetap mempertahankan fallback kompatibilitas untuk ID legacy (`001pH`, `002EC`, dll.).

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

### D. Publish Pengaturan & Kontrol Pompa (Web Admin $\rightarrow$ MQTT Broker $\rightarrow$ ESP32)
Dikirim saat Admin menekan tombol **SAVE** pada modal Setting atau mengubah toggle pompa (`Relay 1–5`) di `indexAdmin.html` ke topik `tefa/hidroponik/control`:

```json
{
  "interval_minutes": 1,
  "pumps": {
    "pump_A": "off",
    "pump_B": "off",
    "pump_up": "off",
    "pump_down": "off",
    "pump_big": "on"
  },
  "threshold": {
    "ph_min": 5.5,
    "ph_max": 6.5,
    "ec_target": 1.5,
    "ph_up_dose_sec": 2,
    "ph_down_dose_sec": 2
  }
}
```

---

### E. Subscribe Status Perangkat & Pompa (ESP32 $\rightarrow$ MQTT Broker $\rightarrow$ Web)
Diterima dari topik `tefa/hidroponik/status` untuk menyinkronkan status pompa dan interval aktif pada Hardware Health serta Relay Card di Admin:

```json
{
  "device_id": "DEV-TSK-01",
  "status_message": "Command executed successfully",
  "active_interval_minutes": 1,
  "pumps_status": {
    "pump_A": "OFF",
    "pump_B": "OFF",
    "pump_up": "OFF",
    "pump_down": "OFF",
    "pump_big": "ON"
  }
}
```

---

### F. Format Konfigurasi & Ambang Batas (`localStorage: tefa_dashboard_settings`)
Tersimpan di peramban pengguna melalui modal Settings (Ikon Gear):

```json
{
  "phMin": "5.5",
  "phMax": "6.5",
  "tdsMin": "600",
  "tdsMax": "1200",
  "tempMin": "20",
  "tempMax": "30",
  "humMin": "50",
  "humMax": "85",
  "mqttBroker": "wss://broker.emqx.io:8084/mqtt",
  "mqttTopicSub": "tefa/hidroponik/sensor",
  "mqttTopicPub": "tefa/hidroponik/control",
  "mqttTopicStatus": "tefa/hidroponik/status",
  "intervalMinutes": "1",
  "pump_A": "off",
  "pump_B": "off",
  "pump_up": "off",
  "pump_down": "off",
  "pump_big": "on",
  "ecTarget": "1.5",
  "phUpDose": "2",
  "phDownDose": "2",
  "interval": "3",
  "aiProvider": "gemini",
  "apiKey": ""
}
```

---

### G. Format Notifikasi / Alarm Sensor (`notifications`)
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
