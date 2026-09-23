# BLE-Protokoll 2

Service `a6e90001-7a25-4b48-9c6d-4f5b108a0001`.
Telemetrie `a6e90002-7a25-4b48-9c6d-4f5b108a0001`: Read + Notify,
ein gemeinsames 164-Byte-Paket mit bis zu 50 Hz. ATT-MTU mindestens 167.
Ganze Pakete sind erforderlich; es gibt keine eigene BLE-Fragmentierung.
Konfiguration `a6e90003-7a25-4b48-9c6d-4f5b108a0001`: Read + Write + Notify,
32 Byte, nur bei Einstellungsänderungen/Befehlen. Telemetrie bleibt in einer
einzigen Charakteristik gebündelt.

Alle Zahlen Little Endian. Floatwerte IEEE754 float32. Fehlende Werte NaN.

| Offset | Typ | Bedeutung |
| --- | --- | --- |
| 0 | 2 Byte | ASCII EZ |
| 2 | uint8 | Version 2 |
| 3 | uint8 | Länge 164 |
| 4 | uint32 | Sequenznummer; zählt auch ohne BLE weiter |
| 8 | uint32 | Millisekunden des Nicla, mit Überlauf |
| 12 / 14 / 16 | uint16 | present / valid / fresh |
| 18 | uint16 | Status: Bit 0 Filter bereit, Bit 1 IMU-Fusion, Bit 2 Flug läuft |
| 20 | 36 × float32 | nachfolgende Feldliste |

Feldindex (Offset = 20 + 4·Index):

0–2 accE/N/U inklusive g, 3–5 linearE/N/U ohne g, jeweils m/s².
6–8 gyroX/Y/Z °/s, 9–11 magX/Y/Z µT, Geräteachsen.
12–15 Quaternion x/y/z/w, 16 Druck hPa, 17 Temperatur °C, 18 Feuchte %,
19 Gas Ω, 20 IAQ, 21 eCO₂ ppm, 22 bVOC ppm, 23 Heading-Fehler rad,
24 Standarddruckhöhe m, 25 BSEC-Genauigkeit.
26 Steigrate m/s, 27 mittlere Steigrate m/s, 28 QNH-Höhe m,
29 relative Höhe m, 30 max. Steigen m/s, 31 max. Sinken m/s (negativ),
32 max. QNH-Höhe m, 33 Flugzeit s, 34 geschätzter IMU-Bias m/s²,
35 geschätzte Standardabweichung der Geschwindigkeit m/s.

Sensorbits 0..9: Gesamtbeschleunigung, lineare Beschleunigung, Gyro, Magnetfeld,
Quaternion, Druck, Temperatur, Feuchte, Gas, BSEC. `fresh` bedeutet neue Werte
seit dem letzten Firmware-Rechentakt, nicht seit der letzten erfolgreichen
BLE-Zustellung. `valid` berücksichtigt Alter und erforderliche Quaternionen.
Vorzeichen: Up positiv = Steigen. Nord magnetisch, keine Deklination.

## Befehle und Gerätebestätigung

32 Byte: ASCII EC (0..1), Version 1 (2), Opcode/Ergebnis (3), Request-ID uint16
(4..5), Revision uint16 (6..7), sechs float32 bei 8..31:
QNH, Barometer-Sigma, IMU-Vorfilterzeit, Ausgabedämpfung, Mittelwertsekunden,
Beschleunigungs-Prozessrauschen. Dieselbe Struktur wird gelesen und bestätigt.

Write-Opcode: 0 alle Einstellungen atomar setzen, 1 relative Höhe nullen,
2 Flug starten, 3 Flug stoppen, 4 Standardwerte, 5 Ruhig, 6 Ausgewogen, 7 Direkt.
Bei Opcodes 1..7 werden float-Felder ignoriert. Read/Notify-Ergebnis: 0 erfolgreich,
1 abgelehnt. Echo der Request-ID und aktueller Gerätestand; Revision steigt bei
erfolgreichen Befehlen. Reine lokale Anzeigenänderung ist keine Bestätigung.

Flugstart und Nullen verlangen einen bereiten Filter. Wiederholter Flugstart
während eines laufenden Fluges wird abgelehnt. Der Client serialisiert Writes
und wartet maximal vier Sekunden. Nach Timeout den tatsächlichen Gerätestand
durch Neuverbinden lesen, nicht automatisch erneut starten/nullen.

Legacy-Telemetrie Version 1 / 124 Byte wird weiter als Rohsensoransicht gelesen.
Die App zeigt dazu einen Firmware-Update-Hinweis. Sie berechnet daraus bewusst
keine Ersatz-Steigrate oder Höhe und bietet keine Gerätebefehle ohne Control-Service.
