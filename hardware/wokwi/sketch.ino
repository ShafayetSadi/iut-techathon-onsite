/*
 * Vantage Dry Run — Phase 5 PoC firmware.
 *
 * Architecture: browser/operator (Wi-Fi) -> ESP32 -> PWM signal -> 6 joint
 * servos. Servo power comes from a separate external supply (see
 * diagram.json: servo_supply), NOT the ESP32's own rail — only grounds are
 * shared. In the real (non-PoC) build, a dedicated servo driver (e.g.
 * PCA9685) would sit between the ESP32 and the servos; this firmware drives
 * GPIOs directly because that's what Wokwi's native parts support, and the
 * ESP32's own LEDC hardware-PWM peripheral is the driver stage for this PoC.
 *
 * Requires the "ESP32Servo" library (see libraries.txt for the Wokwi web
 * editor; PlatformIO installs it automatically via platformio.ini).
 */

#include <WiFi.h>
#include <ESP32Servo.h>

const char *WIFI_SSID = "Wokwi-GUEST";
const char *WIFI_PASSWORD = "";

const int JOINT_PINS[] = {13, 14, 27, 26, 25, 33};
const char *JOINT_NAMES[] = {
    "J1 Base rotation", "J2 Shoulder", "J3 Elbow",
    "J4 Wrist joint 1", "J5 Wrist joint 2", "J6 Wrist joint 3"};
const int NUM_JOINTS = 6;

Servo joints[NUM_JOINTS];

void connectWifi() {
  Serial.printf("Connecting to Wi-Fi \"%s\"...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print(".");
  }
  Serial.printf("\nWi-Fi connected, IP: %s\n", WiFi.localIP().toString().c_str());
}

void setup() {
  Serial.begin(115200);
  connectWifi();

  for (int i = 0; i < NUM_JOINTS; i++) {
    joints[i].setPeriodHertz(50);
    joints[i].attach(JOINT_PINS[i], 500, 2400);
    joints[i].write(90); // neutral pose
    Serial.printf("Attached %s on GPIO%d\n", JOINT_NAMES[i], JOINT_PINS[i]);
  }
  Serial.println("All 6 joint servos attached and homed to 90 degrees.");
}

void loop() {
  // Simple sweep so the simulation visibly proves the PWM stage works;
  // the real motion pipeline would write() angles from IK results instead.
  for (int angle = 60; angle <= 120; angle += 5) {
    for (int i = 0; i < NUM_JOINTS; i++) joints[i].write(angle);
    delay(150);
  }
  for (int angle = 120; angle >= 60; angle -= 5) {
    for (int i = 0; i < NUM_JOINTS; i++) joints[i].write(angle);
    delay(150);
  }
}
