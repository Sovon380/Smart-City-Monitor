#define BLYNK_TEMPLATE_ID "TMPL6TkVSSjJF"
#define BLYNK_TEMPLATE_NAME "Smart City Monitor"
//#define BLYNK_AUTH_TOKEN "KJBMdEq1EF5z0gcbyuQR4NwSYpd4VIBa"  // optional if already in auth[]


#include <WiFi.h>
#include <SPI.h>
#include <SD.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <MFRC522.h>
#include <BlynkSimpleEsp32.h>

// -------------------- BLYNK CREDENTIALS --------------------
char auth[] = "KJBMdEq1EF5z0gcbyuQR4NwSYpd4VIBa";
char ssid[] = "R8202GHZ";
char pass[] = "%A4f%t^ejAGiMP";

// -------------------- PIN DEFINITIONS --------------------
#define DHTPIN 2
#define DHTTYPE DHT11
#define GAS_SENSOR_PIN 34
#define BUZZER_PIN 27
#define TRIG_PIN 12
#define ECHO_PIN 14
#define OLED_SDA 21
#define OLED_SCL 22
#define SD_CS 13
#define RST_PIN 15
#define SS_PIN 5  // RFID SS

// -------------------- OBJECT INITS --------------------
DHT dht(DHTPIN, DHTTYPE);
Adafruit_SSD1306 display(128, 64, &Wire, -1);
MFRC522 rfid(SS_PIN, RST_PIN);

long duration;
int distance;
bool buzzerOverride = false;

void setup() {
  Serial.begin(115200);

  // Init WiFi & Blynk
  WiFi.begin(ssid, pass);
  Blynk.begin(auth, ssid, pass);

  // Init DHT Sensor
  dht.begin();

  // Init OLED
  Wire.begin(OLED_SDA, OLED_SCL);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();

  // Init RFID
  SPI.begin();  // Start SPI for both RFID and SD
  rfid.PCD_Init();

  // Init SD Card
  if (!SD.begin(SD_CS)) {
    Serial.println("SD Card Mount Failed");
  } else {
    Serial.println("SD Card Initialized.");
  }

  // Init pins
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
}

// -------------------- BLYNK BUTTON HANDLERS --------------------

BLYNK_WRITE(V5) {  // Manual Buzzer Override
  buzzerOverride = param.asInt();
  digitalWrite(BUZZER_PIN, buzzerOverride);
}

BLYNK_WRITE(V6) {  // Reset OLED Display
  display.clearDisplay();
  display.setCursor(0, 0);
  display.println("Display Reset!");
  display.display();
}

BLYNK_WRITE(V7) {  // Simulate Worker Entry
  if (param.asInt() == 1) {
    String fakeUID = "SIM123456";
    File logFile = SD.open("/log.txt", FILE_APPEND);
    if (logFile) {
      logFile.println("Sim RFID: " + fakeUID);
      logFile.close();
    }
    Blynk.virtualWrite(V4, "Simulated RFID: " + fakeUID);
    Serial.println("Simulated RFID: " + fakeUID);
  }
}

// -------------------- MAIN LOOP --------------------

void loop() {
  Blynk.run();

  // ----- Sensor Readings -----
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  int gasVal = analogRead(GAS_SENSOR_PIN);

  // Crowd Detection
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  duration = pulseIn(ECHO_PIN, HIGH);
  distance = duration * 0.034 / 2;

  // ----- Display -----
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 0);
  display.printf("Temp: %.1f C\nHumidity: %.1f %%\nGas: %d\nCrowd Dist: %d cm\n", temp, hum, gasVal, distance);
  display.display();

  // ----- Blynk Update -----
  Blynk.virtualWrite(V0, temp);
  Blynk.virtualWrite(V1, hum);
  Blynk.virtualWrite(V2, gasVal);
  Blynk.virtualWrite(V3, distance);

  // ----- Safety Alerts -----
  bool danger = (temp > 35 || gasVal > 3000 || distance < 20);
  if (danger && !buzzerOverride) {
    digitalWrite(BUZZER_PIN, HIGH);
    Blynk.logEvent("safety_alert", "Danger Detected: Heat/Gas/Crowd!");
  } else if (!buzzerOverride) {
    digitalWrite(BUZZER_PIN, LOW);
  }

  // ----- RFID Detection -----
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    String uid = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
      uid += String(rfid.uid.uidByte[i] < 0x10 ? "0" : "");
      uid += String(rfid.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();
    Serial.println("RFID UID: " + uid);
    Blynk.virtualWrite(V4, uid);

    File logFile = SD.open("/log.txt", FILE_APPEND);
    if (logFile) {
      logFile.println("RFID UID: " + uid);
      logFile.close();
    }
    rfid.PICC_HaltA();
  }

  delay(2000);
}
