topic : tefa/hidroponik/sensor :

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


topic : tefa/hidroponik/control :


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

topic : tefa/hidroponik/status :

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