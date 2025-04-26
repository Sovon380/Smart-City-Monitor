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

// Structure for Worker
struct Worker {
  String uid;
  String name;
};

Worker workers[50]; // Max 50 workers
int workerCount = 0;

long duration;
int distance;
bool buzzerOverride = false;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  dht.begin();

  // Init OLED
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[ERROR] OLED Display Initialization Failed!");
    while (true);
  }
  display.clearDisplay();
  display.display();

  // Init RFID
  SPI.begin();
  rfid.PCD_Init();
  Serial.println("[OK] RFID Reader Initialized.");

  // Init SD Card
  if (!SD.begin(SD_CS)) {
    Serial.println("[ERROR] SD Card Mount Failed!");
    while (true);
  }
  Serial.println("[OK] SD Card Initialized.");

  // Init pins
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // Load previously registered workers
  loadWorkers();

  Serial.println("[SYSTEM READY] Scan card or view sensor data...");
}

void loop() {
  // ----- Sensor Readings -----
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  int gasVal = analogRead(GAS_SENSOR_PIN);

  // Ultrasonic for crowd sensing
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  duration = pulseIn(ECHO_PIN, HIGH);
  distance = duration * 0.034 / 2;

  // ----- Validating DHT Data -----
  if (isnan(temp) || isnan(hum)) {
    Serial.println("[ERROR] Failed to read from DHT sensor!");
    temp = 0;
    hum = 0;
  }

  // ----- Display Readings -----
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 0);
  display.printf("Temp: %.1f C\nHumidity: %.1f %%\nGas: %d\nDistance: %d cm\n", temp, hum, gasVal, distance);
  display.display();

  // ----- Serial Monitor Output -----
  Serial.println("---- Sensor Data ----");
  Serial.printf("Temperature: %.1f C\n", temp);
  Serial.printf("Humidity: %.1f %%\n", hum);
  Serial.printf("Gas Sensor Value: %d\n", gasVal);
  Serial.printf("Crowd Distance: %d cm\n", distance);
  Serial.println("----------------------");

  // ----- RFID Detection and Dynamic Worker Management -----
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
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
        welcomeDisplay(workers[i].name);
        found = true;
        break;
      }
    }

    if (!found) {
      Serial.println("[NEW] Unknown card detected!");
      Serial.println("Please type new worker name:");
      
      while (!Serial.available()); // Wait for user input
      String newName = Serial.readStringUntil('\n');
      newName.trim();

      workers[workerCount].uid = uid;
      workers[workerCount].name = newName;
      workerCount++;

      saveWorkerToSD(uid, newName);

      Serial.println("[REGISTERED] " + newName + " added successfully!");
      welcomeDisplay(newName);
    }

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
  }

  // ----- Safety Alert for Sensors -----
  bool danger = (temp > 35 || gasVal > 3000 || distance < 20);
  if (danger) {
    digitalWrite(BUZZER_PIN, HIGH);
    Serial.println("[ALERT] Safety Risk Detected!");
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }

  delay(2000); // Minimum delay for DHT11
}

// --- Show Welcome on OLED ---
void welcomeDisplay(String name) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 20);
  display.print("Welcome ");
  display.println(name);
  display.display();
}

// --- Load Worker List from SD Card ---
void loadWorkers() {
  File file = SD.open("/workers.txt");
  if (!file) {
    Serial.println("[INFO] No previous workers found. Starting fresh...");
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
  Serial.println("[INFO] " + String(workerCount) + " workers loaded from SD Card.");
}

// --- Save New Worker to SD Card ---
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
