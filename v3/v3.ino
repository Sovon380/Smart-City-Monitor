#include <WiFi.h>
#include <SPI.h>
#include <SD.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <MFRC522.h>

// -------------------- PIN DEFINITIONS --------------------
#define DHTPIN 4
#define DHTTYPE DHT11
#define GAS_SENSOR_PIN 34
#define BUZZER_PIN 15
#define TRIG_PIN 12
#define ECHO_PIN 14
#define OLED_SDA 21
#define OLED_SCL 22
#define SD_CS 5
#define RST_PIN 27
#define SS_PIN 25

// -------------------- OBJECT INITS --------------------
DHT dht(DHTPIN, DHTTYPE);
Adafruit_SSD1306 display(128, 64, &Wire, -1);
MFRC522 rfid(SS_PIN, RST_PIN);

// -------------------- VARIABLES --------------------
struct Worker {
  String uid;
  String name;
};

Worker workers[50]; // Max 50 workers
int workerCount = 0;

long duration;
int distance;
bool buzzerOverride = false;
float lastGoodHumidity = 50; // Default good humidity
unsigned long lastRFIDScanTime = 0;
unsigned long lastDisplayRefresh = 0;
bool showingWelcomeScreen = false;
unsigned long welcomeScreenStartTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  dht.begin();

  // OLED Init
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[ERROR] OLED Display Initialization Failed!");
    while (true);
  }
  display.clearDisplay();
  display.display();

  // RFID Init
  SPI.begin();
  rfid.PCD_Init();
  Serial.println("[OK] RFID Reader Initialized.");

  // SD Card Init
  if (!SD.begin(SD_CS)) {
    Serial.println("[ERROR] SD Card Mount Failed!");
    while (true);
  }
  Serial.println("[OK] SD Card Initialized.");

  // Pins Init
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // Load workers from SD
  loadWorkers();

  Serial.println("[SYSTEM READY]");
}

void loop() {
  unsigned long currentMillis = millis();

  // 1. Sensor Readings
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  int gasVal = analogRead(GAS_SENSOR_PIN);

  // Validate DHT Data
  if (isnan(temp) || isnan(hum)) {
    Serial.println("[Warning] Failed to read from DHT sensor!");
    temp = 0;
    hum = lastGoodHumidity;
  } else {
    if (hum >= 30 && hum <= 90) {
      lastGoodHumidity = hum-30;
    }
    // else {
    //   Serial.println("[Warning] Unusual humidity detected. Ignored.");
    //   hum = lastGoodHumidity;
    // }
  }

  // Ultrasonic Crowd Sensor
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  duration = pulseIn(ECHO_PIN, HIGH);
  distance = duration * 0.034 / 2;

  // 2. Update OLED Every 2 seconds
  if (currentMillis - lastDisplayRefresh > 2000 && !showingWelcomeScreen) {
    displayMainScreen(temp, hum, gasVal, distance);
    lastDisplayRefresh = currentMillis;
  }

  // 3. RFID Scanning
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    lastRFIDScanTime = currentMillis; // Update scan time

    String uid = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
      uid += String(rfid.uid.uidByte[i] < 0x10 ? "0" : "");
      uid += String(rfid.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();
    Serial.println("Scanned UID: " + uid);

    bool found = false;
    for (int i = 0; i < workerCount; i++) {
      if (workers[i].uid == uid) {
        Serial.println("[FOUND] Welcome " + workers[i].name);
        showWelcomeScreen(workers[i].name);
        found = true;
        break;
      }
    }

    if (!found) {
      Serial.println("[NEW] Unknown card detected!");
      Serial.println("Please type new worker name:");
      
      while (!Serial.available());
      String newName = Serial.readStringUntil('\n');
      newName.trim();

      workers[workerCount].uid = uid;
      workers[workerCount].name = newName;
      workerCount++;

      saveWorkerToSD(uid, newName);

      Serial.println("[REGISTERED] " + newName + " added successfully!");
      showWelcomeScreen(newName);
    }

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
  }

  // 4. RFID Reader Re-initialization Watchdog
  if (currentMillis - lastRFIDScanTime > 60000) { // No scan in 60s
    Serial.println("[INFO] Refreshing RFID Reader...");
    rfid.PCD_Init();
    lastRFIDScanTime = currentMillis;
  }

  // 5. Welcome Screen Timeout (Return to Main Screen)
  if (showingWelcomeScreen && (currentMillis - welcomeScreenStartTime > 5000)) {
    showingWelcomeScreen = false;
    displayMainScreen(temp, hum, gasVal, distance);
  }

  // 6. Safety Alert with Buzzer
  bool danger = (temp > 35 || gasVal > 3000 || distance < 20);
  if (danger) {
    digitalWrite(BUZZER_PIN, HIGH);
    Serial.println("[ALERT] Danger Detected! Check Gas/Temp/Crowd");
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }
}

// -------------------- FUNCTIONS --------------------

// Display Main Dashboard on OLED
void displayMainScreen(float temp, float hum, int gasVal, int distance) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 0);

  display.printf("Temp: %.1fC  Hum: %.1f%%\n", temp, hum);
  display.printf("Gas: %d  Crowd: %dcm\n", gasVal, distance);

  if (temp > 35) {
    display.println("Warning: Overheat!");
  } else if (gasVal > 3000) {
    display.println("Warning: Gas Leak!");
  } else if (distance < 20) {
    display.println("Warning: Crowd Risk!");
  } else {
    display.println("Status: Safe ✅");
  }
  
  display.display();
}

// Show Welcome Message on OLED
void showWelcomeScreen(String name) {
  showingWelcomeScreen = true;
  welcomeScreenStartTime = millis();

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(15, 20);
  display.println("** WELCOME **");
  display.setCursor(15, 40);
  display.println(name);
  display.display();
}

// Load Workers from SD Card
void loadWorkers() {
  File file = SD.open("/workers.txt");
  if (!file) {
    Serial.println("[INFO] No previous workers found.");
    return;
  }

  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    int separator = line.indexOf(',');
    if (separator > 0) {
      workers[workerCount].uid = line.substring(0, separator);
      workers[workerCount].name = line.substring(separator + 1);
      workerCount++;
    }
  }
  file.close();
  Serial.println("[INFO] " + String(workerCount) + " workers loaded.");
}

// Save New Worker to SD Card
void saveWorkerToSD(String uid, String name) {
  File file = SD.open("/workers.txt", FILE_APPEND);
  if (file) {
    file.println(uid + "," + name);
    file.close();
    Serial.println("[OK] Worker saved to SD Card.");
  } else {
    Serial.println("[ERROR] Could not open file to save worker!");
  }
}
