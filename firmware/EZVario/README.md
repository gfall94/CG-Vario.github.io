# Nicla Sense ME Firmware

`EZVario.ino` mit Arduino IDE 2 öffnen. Board-Paket **Arduino Mbed OS Nicla
Boards**, Board **Arduino Nicla Sense ME**, Bibliotheken **Arduino_BHY2 1.0.8**
und **ArduinoBLE 2.1.0** installieren. Board-Core: **4.6.0**.

Alternativ:

```sh
arduino-cli core update-index
arduino-cli core install arduino:mbed_nicla@4.6.0
arduino-cli lib install Arduino_BHY2@1.0.8 ArduinoBLE@2.1.0
arduino-cli compile --export-binaries --fqbn arduino:mbed_nicla:nicla_sense Software/Nicla/EZVario
arduino-cli board list
arduino-cli upload -p COM_PORT --fqbn arduino:mbed_nicla:nicla_sense Software/Nicla/EZVario
```

COM_PORT durch den tatsächlichen Port ersetzen. Ein angeschlossenes Board wird nicht
automatisch überschrieben. USB-Serial zeigt mit 115200 Baud fehlende Sensoren
und Initialisierungsfehler. Der Sketch startet auch ohne geöffneten Serial Monitor.

Es werden alle physikalischen Sensortypen des Boards erfasst: Beschleunigung und
Drehrate des BHI260AP, Magnetfeld des BMM150, Druck des BMP390 sowie Temperatur,
Feuchte und Gaswiderstand des BME688. Der Sensorhub berechnet per Bosch-Fusion
den Gravitationsvektor, die lineare Beschleunigung und den Rotation Vector. Die
Firmware transformiert beide Beschleunigungsvektoren mit dessen Quaternion von
den Geräteachsen nach Ost/Nord/Oben. Doppelte Wake-up-/Raw-/Pass-through-
Varianten, Schrittzähler, Gesten und kundenspezifische Gas-Klassifikatoren sind
keine zusätzlichen physikalischen Sensoren und werden nicht aktiviert.

BSEC IAQ/eCO₂/bVOC sind optionale, von der installierten Hub-Firmware abhängige
Schätzwerte. Sie ersetzen keine direkten CO₂-/VOC-Messgeräte. Falls der Hub
SENSOR_ID_BSEC nicht bereitstellt, zeigt die App diese Kanäle als nicht verfügbar.
Bei fehlenden Grundsensoren zuerst Arduino_BHY2/Board-Paket und die BHI-Firmware
prüfen; die Bibliothek enthält ein `BHYFirmwareUpdate`-Beispiel.

Sensorfusion, Variofilter, Höhen und Flugstatistik laufen kontinuierlich auf
dem Nicla, auch ohne BLE-Verbindung. Die Telemetrie wird erst bei Subscription
übertragen. Ein Paket enthält 176 Byte (Protokoll 3, einschließlich Audio).
Mindestens ATT-MTU 179 ist erforderlich. Die gewünschte 50-Hz-Rate ist ein
Zielwert; Empfangsrate und Sequenzlücken sind im Web-Dashboard sichtbar. Weitere
Details stehen in `Software/PROTOKOLL.md`.

## Hardware-Abnahme

1. Board ruhig in verschiedenen Lagen: fusionierte lineare ENU-Beschleunigung nahe 0,
   Gesamtbeschleunigung nahe (0,0,+9,81) m/s².
2. Definierte Bewegung nach oben, Osten und magnetisch Norden: korrekte Vorzeichen;
   90°-Drehung des Boards darf den Erdbezug nicht mitdrehen. Dabei Magnetometer
   von Metall/Magneten fernhalten und die geschätzte Richtungsunsicherheit beachten.
3. Druck mit Referenz vergleichen; QNH oder bekannten Referenzdruck einstellen.
   Bei Höhenzunahme muss Druck sinken und Höhe steigen.
4. In Bluefy auf iOS und einem Web-Bluetooth-Browser auf Android: MTU ≥179,
   mehrere Minuten ungefähr 50 Hz, Paketlücken beobachten; Bluetooth aus/an,
   außer Reichweite, erneut verbinden.
5. Gas/BSEC mehrere Minuten aufwärmen und Kalibrierstatus beobachten.

Die Bibliothek liefert zuletzt empfangene Werte ohne zugängliche individuelle
FIFO-Zeitstempel. Der Sketch prüft deren Host-Alter; für schnelle Rotationen kann
die verbleibende zeitliche Abweichung den Erdbezug verschlechtern.

## Einstellungen und Flugwerte

`Vario.h` enthält den zustandsbasierten Höhen-/Steigraten-/Biasfilter und den
zeitgewichteten Mittelwert. `Control.h` kodiert Gerätebestätigungen. Die zweite
BLE-Charakteristik nimmt Filtereinstellungen, QNH, Nullpunkt sowie Flugstart/-ende
entgegen. Grenzen und Gültigkeit prüft die Firmware. Einstellungen bleiben im
internen Flash dauerhaft erhalten. Der Browser führt keine Vario- oder Höhenrechnung
aus; mit alter Firmware erscheint deshalb ein Update-Hinweis.

`AudioProfile.h` und `VarioTone.h` erzeugen die Tonparameter. `SettingsStore.h`
speichert Konfigurationen atomar via TDBStore mit Readback in den letzten 8 KiB
internen Flash. Der Programm-Endpunkt wird vor jedem Speicherstart auf
Überlappung geprüft. Es gibt keinen Zugriff auf den externen Sensorhub-Flash.
Bei einem vollständigen Flash-Erase während eines Firmware-Uploads können
Einstellungen verloren gehen. Power-Cycle- und Live-Audiotest noch erforderlich.
