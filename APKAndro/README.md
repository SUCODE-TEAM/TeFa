# APKAndro — TeFa Smart Greenhouse & AWS IoT (Kotlin Native Android)

Proyek ini adalah konversi **100% Kotlin Native Android** dari aplikasi web **TeFa - Smart Greenhouse & Automatic Weather Station (AWS) IoT Dashboard**, dibuat terpisah di folder `APKAndro/` tanpa menimpa file proyek web asli.

## Arsitektur & Fitur Utama

1. **Dual-Mode (Viewer & Admin):**
   - **Mode Viewer (Default):** Aplikasi langsung membuka `MainActivity` dalam mode publik *read-only* (tanpa perlu login, sesuai alur `index.html` → `indexViewer.html`).
   - **Mode Admin:** Ketuk tombol user `Viewer` di pojok kanan atas untuk masuk ke `LoginActivity`. Setelah login berhasil, **Panel Dashboard Relay 8-Channel**, pengaturan broker/topik MQTT, serta pengaturan dosis/interval hidroponik aktif.
   - **Kredensial Demo Admin:**
     - Username: `admin` (atau `admin@tefa.id`, `tefa`)
     - Password: `admin123` (atau `mappi32`)
     - Tersedia tombol isi cepat (*demo chip*) di halaman login.

2. **Klien MQTT v3.1.1 Native Kotlin (`MqttClientManager.kt`):**
   - Mendukung **MQTT over WebSocket (`wss://` / `ws://`)** dan fallback TCP/TLS (`tcp://` / `ssl://`).
   - Broker default: `wss://broker.emqx.io:8084/mqtt`.
   - Topik default:
     - Subscribe Sensor: `tefa/hidroponik/sensor`
     - Subscribe Status: `tefa/hidroponik/status`
     - Publish Control: `tefa/hidroponik/control`
   - Mendukung payload JSON standar array (`sensors[]`), legacy ID (`001pH`, `002EC`, dll.), maupun payload JSON flat (MQTTX).

3. **Sinkronisasi Supabase REST (`SupabaseClient.kt`):**
   - Memuat riwayat tabel `DataSensor` dan `DataAWS`, mengisi tabel riwayat, notifikasi peringatan, grafik multi-rentang (`1J`, `24J`, `7H`, `30H`), serta menyimpan pembacaan live.

4. **Custom Native Canvas Views:**
   - `WaterTempDonutView`: Grafik donat suhu air tangki nutrisi (`Min / Status / Max`).
   - `TelemetryChartView`: Grafik kurva Bezier interaktif (`TDS/EC`, `pH`, `Water Temp`) dengan crosshair sentuh, tooltip WIB, dan toggle seri.
   - `MiniTrendBarsView`: Grafik batang tren AWS (`Air Monitoring` & `Lux Monitoring`).
   - `VoiceOrbView`: Animasi halftone Voice Orb interaktif untuk Asisten AI suara.
   - `BotanicalBackgroundView`: Latar belakang botani pada halaman login.

5. **Asisten AI Cerdas + STT/TTS & Ekspor CSV:**
   - Dialog chat & Voice Orb dengan integrasi `TextToSpeech` + `SpeechRecognizer` Bahasa Indonesia (`id-ID`) dan dukungan multi-provider (`Gemini`, `Groq`, `Qwen`, `OpenAI`, `DeepSeek`, `OpenRouter`) serta fallback lokal tanpa API key.
   - Ekspor data sensor ke file `.csv` menggunakan system document picker Android.

## Struktur Proyek

```text
APKAndro/
├── build.gradle.kts
├── settings.gradle.kts
├── gradle/libs.versions.toml
├── local.properties
└── app/
    ├── build.gradle.kts
    └── src/
        ├── main/
        │   ├── AndroidManifest.xml
        │   ├── java/id/tefa/smartgreenhouse/
        │   │   ├── data/PreferencesManager.kt
        │   │   ├── model/Models.kt
        │   │   ├── network/
        │   │   │   ├── AiAssistantClient.kt
        │   │   │   ├── MqttClientManager.kt
        │   │   │   └── SupabaseClient.kt
        │   │   └── ui/
        │   │       ├── LoginActivity.kt
        │   │       ├── MainActivity.kt
        │   │       ├── custom/
        │   │       │   ├── BotanicalBackgroundView.kt
        │   │       │   ├── MiniTrendBarsView.kt
        │   │       │   ├── TelemetryChartView.kt
        │   │       │   ├── VoiceOrbView.kt
        │   │       │   └── WaterTempDonutView.kt
        │   │       └── dialog/
        │   │           ├── AiAssistantDialog.kt
        │   │           ├── NotificationDialog.kt
        │   │           └── SettingsDialog.kt
        │   └── res/
        │       ├── drawable/
        │       ├── layout/
        │       ├── mipmap-*/
        │       ├── values/
        │       └── xml/
        └── test/java/id/tefa/smartgreenhouse/PayloadNormalizerTest.kt
```

## Cara Membuka & Build di Android Studio

1. Buka **Android Studio** → **Open** → pilih folder `d:\Isro\TeFa\APKAndro`.
2. Tunggu Gradle sync selesai (menggunakan JDK 21 / JBR Android Studio & Android SDK `compileSdk = 36`, `minSdk = 24`).
3. Klik **Run ▶** untuk memasang aplikasi ke emulator atau perangkat Android, atau pilih **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
