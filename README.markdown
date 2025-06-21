# 🌆 Smart City Monitor - IoT-based Environmental & Safety Monitoring System

An ESP32-powered IoT system that monitors heatwave conditions, air quality, crowd density, and worker safety in real-time for smart city applications. It integrates multiple sensors, RFID tracking, local alert systems, and cloud platforms (Blynk + ThingSpeak) to deliver intelligent urban monitoring.

## 📌 Table of Contents
- [Project Overview](#project-overview)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Hardware Components](#hardware-components)
- [Software Technologies](#software-technologies)
- [How It Works](#how-it-works)
- [Installation & Setup](#installation--setup)
- [Cloud Integration](#cloud-integration)
- [Demo & Screenshots](#demo--screenshots)
- [Future Enhancements](#future-enhancements)
- [Contributors](#contributors)
- [License](#license)

---

## 🚀 Project Overview

This project aims to provide a low-cost, scalable environmental monitoring system tailored for urban settings. It monitors:
- Temperature and humidity (heatwave conditions)
- Gas levels (air quality)
- Distance-based crowding
- Worker presence via RFID
- Local alerts (OLED + buzzer)
- Cloud logging and dashboards

The system is ideal for deployment in industrial sites, construction zones, and public areas where safety and environmental awareness are crucial.

---

## 🔧 Features

- 🌡️ **Temperature & Humidity Monitoring** (DHT11)
- 🌫️ **Gas Detection** (MQ series sensor)
- 👥 **Crowd Detection** (Ultrasonic sensor)
- 🆔 **RFID Worker Identification** (MFRC522)
- 📟 **OLED Live Display & Graph**
- 🔔 **Buzzer Alert System**
- 💾 **SD Card Logging**
- ☁️ **Cloud Uploads to ThingSpeak & Blynk**
- 🔋 **Solar-Powered & Portable**

---

## 🧩 System Architecture

The system adopts a **star topology**:

- Central Node: ESP32 (controls all logic)
- Peripherals: Sensors, RFID, OLED, SD card (via I2C & SPI)
- Cloud: Wi-Fi connectivity to Blynk & ThingSpeak
- Power: Solar panel + Li-ion battery with regulator

---

## 🛠 Hardware Components

| Component           | Quantity |
|---------------------|----------|
| ESP32 Dev Board     | 1        |
| DHT11 Sensor        | 1        |
| MQ Gas Sensor       | 1        |
| Ultrasonic Sensor   | 1        |
| MFRC522 RFID Module | 1        |
| RFID Cards & Tags   | 3+       |
| I2C OLED (0.96")    | 1        |
| Buzzer Module       | 1        |
| SD Card Module + Card| 1       |
| Solar Panel + Battery| 1       |
| Jumper Wires        | many     |
| Breadboard          | 1        |

---

## 💻 Software Technologies

- Arduino IDE (C++ for ESP32)
- Blynk IoT Platform
- ThingSpeak (Cloud data visualization)
- GitHub Pages (Static website)
- VS Code / Overleaf (Documentation)

---

## 🔄 How It Works

1. Sensors continuously read environmental data.
2. RFID detects which worker is present.
3. Data is logged to SD and visualized on OLED.
4. Local buzzer triggers if unsafe thresholds are met.
5. Data is simultaneously sent to Blynk and ThingSpeak.
6. Admin can view logs via display, dashboard, or static website.

---

## ⚙ Installation & Setup

### 1. Clone the Repo
```bash
git clone https://github.com/Sovon380/Smart-City-Monitor.git
```
```bash
cd Smart-City-Monitor
```
### 2. Libraries Required
Install these in Arduino IDE:

- Adafruit_SSD1306

- Adafruit_GFX

- DHT sensor library

- MFRC522

- SD

- WiFi

- Blynk

ThingSpeak

3. Configure Wi-Fi & Credentials
Update the following in the .ino file:

cpp
Copy
char ssid[] = "YOUR_SSID";
char pass[] = "YOUR_PASSWORD";
#define BLYNK_TEMPLATE_ID "..."
#define BLYNK_TEMPLATE_NAME "..."
#define BLYNK_AUTH_TOKEN "..."
unsigned long myChannelNumber = YOUR_THINGSPEAK_CHANNEL;
const char * myWriteAPIKey = "YOUR_API_KEY";
4. Upload & Power
Upload the code to ESP32 using Arduino IDE. Power via USB or solar panel.

## ☁️ Cloud Integration
🔹 Blynk
Real-time mobile dashboard

Displays: Temp, Humidity, Gas, Distance

Worker UID, Name, Role

🔹 ThingSpeak
Plots sensor values on public/private charts

Stores historical data for analysis

## 📸 Demo & Screenshots
(Add OLED snapshots, Blynk dashboard images, and ThingSpeak graph links here)

## 🔮 Future Enhancements
🤖 AI for heatwave prediction

📶 LoRaWAN-based long-range nodes

🏢 Municipal dashboard integration

📱 Native mobile app for monitoring

## 👨‍💻 Contributors
Sovon Mallick – IoT System Developer, Project Lead

(You can add team members or guide names if any)

## 📄 License
This project is licensed under the MIT License. See LICENSE file for more details.


