# BLE-Protokoll 4

Service `a6e90001-7a25-4b48-9c6d-4f5b108a0001`.
Telemetrie `a6e90002-7a25-4b48-9c6d-4f5b108a0001`: Read + Notify,
ein gemeinsames 140-Byte-Paket mit bis zu 50 Hz. ATT-MTU mindestens 143.
Konfiguration `a6e90003-7a25-4b48-9c6d-4f5b108a0001`: Read + Write + Notify,
148 Byte, nur bei Einstellungsänderungen und Gerätebefehlen.

Alle Zahlen sind Little Endian, Floatwerte IEEE754 float32 und fehlende Werte NaN.

| Offset | Typ | Bedeutung |
| --- | --- | --- |
| 0 | 2 Byte | ASCII EZ (Paketkennung bleibt aus Kompatibilitätsgründen erhalten) |
| 2 | uint8 | Version 4 |
| 3 | uint8 | Länge 140 |
| 4 | uint32 | Sequenznummer; zählt auch ohne BLE weiter |
| 8 | uint32 | Millisekunden des Nicla, mit Überlauf |
| 12 / 14 / 16 | uint16 | present / valid / fresh |
| 18 | uint16 | Status: Bit 0 Filter bereit, Bit 1 IMU-Fusion, Bit 2 Flug läuft |
| 20 | 30 × float32 | nachfolgende Feldliste |

Feldindex (Offset = 20 + 4·Index):

- 0–2: Gesamtbeschleunigung accE/N/U inklusive Gravitation in m/s²
- 3: Betrag der Gesamtbeschleunigung in g
- 4–6: Magnetfeld X/Y/Z in µT
- 7: Druck hPa; 8: Temperatur °C; 9: Feuchte %; 10: Gaswiderstand Ω
- 11: IAQ; 12: eCO₂ ppm; 13: bVOC ppm; 14: Richtungsunsicherheit rad
- 15: Standarddruckhöhe m; 16: BSEC-Genauigkeit
- 17: Steigrate m/s; 18: mittlere Steigrate m/s; 19: QNH-Höhe m
- 20: relative Höhe m; 21/22: maximales Steigen/Sinken m/s
- 23: maximale QNH-Höhe m; 24: Flugzeit s
- 25: geschätzter IMU-Bias m/s²; 26: Vario-Standardabweichung m/s
- 27: Tonhöhe Hz; 28: Tonperiode s; 29: Ton-Einschaltdauer s

Lineare ENU-Beschleunigung, Drehraten und Quaternion werden intern für die
Sensorfusion verwendet, aber nicht mehr übertragen. Tonhöhe 0 bedeutet stumm;
Periode 0 bei positiver Tonhöhe bedeutet Dauerton.

## Befehle und Gerätebestätigung

148 Byte: ASCII EC für Befehle / ES für Antworten, Version 2, Opcode bzw.
Ergebnis, Request-ID und Revision. Danach folgen Filter-, QNH- und Audio-Werte.
`EC`-Notifications sind Schreibechos von ArduinoBLE und werden ignoriert; nur
`ES` bestätigt einen Befehl.

Write-Opcode: 0 alle Einstellungen atomar setzen, 1 relative Höhe nullen,
2 Flug starten, 3 Flug stoppen, 4 Standardwerte, 5 Ruhig, 6 Ausgewogen,
7 Direkt, 8 QNH aus bekannter Höhe bestimmen. Bei Opcode 8 enthält Offset 8
die bekannte Höhe in Metern. Der Mikrocontroller berechnet QNH aus dieser Höhe
und dem aktuellen Barometerwert, prüft den Bereich 800–1100 hPa und speichert
das Ergebnis dauerhaft.

Ergebnis 0 bedeutet erfolgreich, 1 abgelehnt und 3 Flash-Speicherung
fehlgeschlagen. Persistente Änderungen werden erst nach Flash-Write und
Readback bestätigt.

Die Dashboard-Version liest weiterhin Telemetrie 1 bis 3. Nur Version 4 enthält
die G-Kraft und das verkleinerte Feldschema.
