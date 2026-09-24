#include <ArduinoBLE.h>

// Minimal link test for the Nicla Sense ME. It intentionally avoids BHY2,
// flash access, large attributes and frequent notifications so an HCI 0x08
// disconnect can be attributed to the board/core instead of the application.
BLEService diagnosticService("a6e90001-7a25-4b48-9c6d-4f5b108a00d1");
BLEUnsignedLongCharacteristic uptimeCharacteristic(
    "a6e90002-7a25-4b48-9c6d-4f5b108a00d1", BLERead | BLENotify);

uint32_t nextUpdate = 0;

void setup() {
  Serial.begin(115200);

  if (!BLE.begin()) {
    Serial.println("BLE initialization failed");
    while (true) delay(1000);
  }

  BLE.setLocalName("CG-Vario-DIAG");
  BLE.setDeviceName("CG-Vario BLE diagnostic");
  BLE.setAdvertisedService(diagnosticService);
  diagnosticService.addCharacteristic(uptimeCharacteristic);
  BLE.addService(diagnosticService);
  uptimeCharacteristic.writeValue(0);
  BLE.advertise();

  Serial.println("Advertising as CG-Vario-DIAG");
}

void loop() {
  BLE.poll();

  const uint32_t now = millis();
  if (BLE.connected() && uptimeCharacteristic.subscribed() &&
      static_cast<int32_t>(now - nextUpdate) >= 0) {
    uptimeCharacteristic.writeValue(now);
    nextUpdate = now + 1000;
  }
}
