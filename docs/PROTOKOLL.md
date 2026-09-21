# EZ-Vario BLE-Protokoll v1

Service: `a6e90001-7a25-4b48-9c6d-4f5b108a0001`  
Einzige Charakteristik: `a6e90002-7a25-4b48-9c6d-4f5b108a0001` (Read + Notify,
feste Länge 124 Byte).

50 Snapshots/s, 124 Byte/Snapshot, 6200 Nutzbytes/s. Alle Zahlen Little Endian,
Fließkommazahlen IEEE-754 binary32. Keine Strings/JSON, keine Fragmentierung.
Der Stream läuft nur, solange ein BLE-Client Notifications abonniert hat.

## Verbindung

1. Service scannen, Gerät verbinden, Charakteristik entdecken.
2. Notifications abonnieren. Browser und Betriebssystem handeln die ATT-MTU aus;
   für ein vollständiges Paket muss sie mindestens 127 Byte betragen.
3. Erst nach Empfang eines vollständigen 124-Byte-Pakets gilt der Stream als aktiv.

Die Web-App verwirft jedes Paket falscher Länge/Version. Bei Unsubscribe oder
Verbindungsabbruch stoppt die Firmware automatisch. Eine neue Verbindung wird
durch bewusste Geräteauswahl in der Web-App aufgebaut.

## Header

| Offset | Typ | Bedeutung |
|---|---|---|
| 0 | uint8[2] | ASCII `EZ` |
| 2 | uint8 | Version 1 |
| 3 | uint8 | Länge 124 |
| 4 | uint32 | 50-Hz-Taktzähler, modulo 2³² |
| 8 | uint32 | Snapshot-Zeit `millis()`, modulo 2³² |
| 12 | uint16 | Unterstützte Sensorgruppen |
| 14 | uint16 | Gültige/aktuelle Sensorgruppen |
| 16 | uint16 | Seit letzter erfolgreicher Übergabe an BLE aktualisierte Gruppen |
| 18 | uint16 | Reserviert, 0 |

Bitpositionen: 0 Beschleunigung, 1 lineare Beschleunigung, 2 Gyroskop,
3 Magnetometer, 4 Quaternion, 5 Druck, 6 Temperatur, 7 Feuchte, 8 Gas, 9 BSEC.
`present` ist Sensorverfügbarkeit, nicht Kalibrierqualität. `valid` setzt einen
empfangenen, hinreichend frischen Messwert voraus. Nicht verfügbare/ungültige
Werte sind NaN. Erdbezogene Beschleunigungen erfordern zusätzlich eine gültige
Quaternion und höchstens 25 ms Abstand der Host-Empfangszeiten.

## Nutzdaten: 26 float32 ab Byte 20

| Index | Größe | Einheit / Bezug |
|---|---|---|
| 0–2 | Beschleunigung einschließlich Schwerkraft | m/s², Ost/Nord/Oben |
| 3–5 | Lineare Beschleunigung | m/s², Ost/Nord/Oben, Schwerkraft entfernt |
| 6–8 | Drehrate | °/s, Geräte-X/Y/Z |
| 9–11 | Magnetfeld | µT, Geräte-X/Y/Z |
| 12–15 | Rotation Vector x/y/z/w | Bosch-Quaternion ENU → Gerät |
| 16 | Luftdruck | hPa |
| 17 | Temperatur | °C |
| 18 | Relative Feuchte | % |
| 19 | Gaswiderstand | Ω |
| 20 | BSEC IAQ | Index |
| 21 | BSEC eCO₂ | ppm, Schätzung |
| 22 | BSEC bVOC-Äquivalent | ppm, Schätzung |
| 23 | Geschätzter Heading-Fehler | rad |
| 24 | Standarddruckhöhe | m, Referenzdruck 1013,25 hPa |
| 25 | BSEC-Genauigkeitsstatus | 0–3 |

Beschleunigungsfaktor: tatsächlich konfigurierte Range in g × 9,80665 / 32768.
Gyroskop: Range in °/s / 32768. Magnetfeld: Range in µT / 32768
(bei 2048 µT Full-Scale entspricht das 1/16 µT pro LSB).
Druck: exakt 1/128 hPa pro LSB (überschreibt gerundeten Bibliotheksfaktor).
Quaternion wird vor der inversen Rotation normiert. Nord ist magnetisch Nord;
ohne lokale Deklinationskorrektur ist dies kein geografisch wahres Nord.

Angeforderte Raten: Bewegung/Quaternion/Magnetfeld 50 Hz, Druck 25 Hz,
Temperatur/Feuchte/Gas/BSEC 1 Hz. Tatsächliche Raten bestimmt die Hub-Firmware;
insbesondere Gas/BSEC können deutlich langsamer liefern. Grenzalter für gültige
Werte: IMU/Quaternion 200 ms, Magnetfeld/Druck 500 ms, Gas/BSEC 15 s.
Temperatur/Feuchte werden vom Hub nur bei Änderung gemeldet und behalten nach
dem ersten Empfang ihre Gültigkeit; deren Sensorstillstand ist aus bloßem
Ausbleiben eines Änderungsereignisses nicht erkennbar. Bei fehlenden BLE-Paketen
markiert die App nach 1,5 s den gesamten Stream als veraltet.
Alle Messwerte eines Pakets sind ein Latest-Value-Snapshot,
keine hardware-synchrone Abtastung. Zeitstempel ist Host-Empfangs-/Sendezeit,
nicht individueller Sensor-FIFO-Zeitstempel. Für präzise inertiale Navigation
wäre eine FIFO-Zeitstempel-Synchronisierung erforderlich.

Sequenzlücken umfassen übersprungene Firmware-Takte und verlorene Notifications.
Die Web-App trennt das 50-Hz-Empfangen von der 10-Hz-UI-Aktualisierung und hält bis
zu 3000 Samples. Paketlücken >150 ms unterbrechen die gezeichnete Linie.

Höhe: `44330 × (1 − (p / p0)^0.19029495)`. Die App berechnet die Höhe aus Druck
und einstellbarem QNH neu. Der relative Nullpunkt verwendet den aktuellen Druck
als p0 und bleibt damit von nachträglichen QNH-Änderungen unabhängig.

## Quellen

- [Arduino_BHY2 Quellcode und Sensor-IDs](https://github.com/arduino-libraries/Arduino_BHY2)
- [Bosch BHI260AP Datenblatt, Datenformate und Skalierung](https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bhi260ap-ds000.pdf)
- [Bosch BSX Sensor Fusion, Koordinaten und Rotation Vector](https://www.bosch-sensortec.com/media/boschsensortec/downloads/application_notes_1/bst-bhi260_bhi360-an002.pdf)
- [ArduinoBLE](https://github.com/arduino-libraries/ArduinoBLE)
- [Bosch-Klarstellung: Druckeinheit ist hPa](https://community.bosch-sensortec.com/mems-sensors-forum-jrmujtaw/post/bhi260ap-sensor-with-bmp390-to-get-pressure-and-temperature-sensor-data-CmQ1OLGa0adWeOm)
- [ArduinoAI Nicla Sense ME Web-BLE Dashboard](https://github.com/arduino/ArduinoAI/tree/master/NiclaSenseME-dashboard)

