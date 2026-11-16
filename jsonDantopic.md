# Spesifikasi Topik MQTT & Format JSON (TeFa Hidroponik)

Dokumen ini mendefinisikan standar kontrak data MQTT untuk komunikasi antara Mikrokontroler (ESP32/Mappi32), Broker MQTT (`wss://broker.emqx.io:8084/mqtt`), dan Dashboard Web (`mqtt-client.js`).

---

## 1. Topik Telemetri Sensor: `tefa/hidroponik/sensor`
* **Arah:** Mikrokontroler (ESP32) $\rightarrow$ Broker MQTT $\rightarrow$ Dashboard Web
* **Fungsi:** Mengirim seluruh pembacaan sensor aktual dan status koneksi secara berkala sesuai interval.
* **QoS:** `0` atau `1`

### Skema Payload JSON:
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

---

## 2. Topik Kontrol Aktuator & Pengaturan: `tefa/hidroponik/control`
* **Arah:** Dashboard Admin Web $\rightarrow$ Broker MQTT $\rightarrow$ Mikrokontroler (ESP32)
* **Fungsi:** Mengirim perintah perubahan status pompa (`on` / `off`), batas *threshold*, serta interval pengiriman.
* **QoS:** `1`

### Skema Payload JSON:
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

## 3. Topik Konfirmasi Status Perangkat: `tefa/hidroponik/status`
* **Arah:** Mikrokontroler (ESP32) $\rightarrow$ Broker MQTT $\rightarrow$ Dashboard Web
* **Fungsi:** Memberikan konfirmasi bahwa perintah kontrol berhasil dieksekusi dan menyinkronkan status relay aktual di UI.
* **QoS:** `0` atau `1`

### Skema Payload JSON:
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

## 4. Pemetaan Saluran Pompa & Relay

| Key JSON di MQTT | Saluran Fisik Relay | Nama Aktuator di Dashboard Web | Keterangan |
| :--- | :--- | :--- | :--- |
| `pump_A` | Relay 1 | **Nutrient Pump A** | Dosing larutan nutrisi A (AB Mix) |
| `pump_B` | Relay 2 | **Nutrient Pump B** | Dosing larutan nutrisi B (AB Mix) |
| `pump_up` | Relay 3 | **pH Up Pump** | Injeksi cairan alkali (penambah pH) |
| `pump_down` | Relay 4 | **pH Down Pump** | Injeksi cairan asam (penurun pH) |
| `pump_big` | Relay 5 | **Main Pump (Big)** | Pompa sirkulasi utama air tandon |
| `-` | Relay 6 | **Coming Soon** | Saluran ekspansi (Exhaust Fan) |
| `-` | Relay 7 | **Coming Soon** | Saluran ekspansi (Misting) |
| `-` | Relay 8 | **Coming Soon** | Saluran ekspansi (Reserve) |
