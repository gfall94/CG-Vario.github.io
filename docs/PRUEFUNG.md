# Prüfung

Automatisch:

```sh
npm test
g++ -std=c++17 -O2 -Wall -Wextra -Werror test/firmware.cpp -o /tmp/vario-test
/tmp/vario-test
arduino-cli compile --fqbn arduino:mbed_nicla:nicla_sense firmware/EZVario
```

Die C++-Tests führen denselben Filterheader wie der Nicla aus, keinen JS-Nachbau.
Geprüft: Rauschen/IMU-Bias, Steigbeschleunigung, konstantes Steigen/Sinken,
barometrischer Fallback, unregelmäßiges dt, Ausreißer, fehlender Druck,
Millis-Überlauf, Profile, ungültige Einstellungen, Quaternion-Mathematik,
Paketoffsets und Konfiguration. JS-Tests prüfen v1/v2-Dekodierung, Gerätewerte,
Veraltung, Request-ID/Bestätigung, Verbindungsabbruch und Legacy-Hinweis.

Synthetischer Standardlauf: Stillstands-RMS 0,0124 m/s, Spitze 0,0327 m/s;
Reaktion nach einer Sekunde mit 2 m/s² Beschleunigung: 1,573 m/s,
eingeschwungen 2,000 m/s. Das sind Simulationswerte, keine Hardwaremessung.

Hardware-Abnahme bleibt erforderlich:

1. Stillstand in verschiedenen Lagen mindestens zwei Minuten aufzeichnen.
   Lineare Beschleunigung nahe Null, keine länger anhaltende falsche Steigrate.
2. Ruhende Drehungen, anschließend vertikale Bewegungen mit bekanntem Vorzeichen.
   Der BHI-Quaternion und Host-Zeitversatz müssen physikalisch geprüft werden.
3. Vergleich mit Referenzhöhe, QNH ändern: nur absolute Höhe verändert sich.
4. BLE in Bluefy verbinden: 176 Byte vollständig; neue Einstellungen erst nach
   bestätigtem Read/Notify sichtbar. Ungültige/fehlende Bestätigung testen.
5. Flug starten, Bluetooth trennen und wieder verbinden: Flugzeit/Statistik
   laufen auf dem Nicla weiter. Neustart erhält Filter/QNH/Audio, setzt den Flug zurück.
6. Druck-/IMU-Ausfall und Wiederanlauf prüfen; bei fehlender Telemetrie muss
   die Anzeige nach 1,5 s Striche statt scheinbar aktueller Werte zeigen.

Am 24.09.2026 wurde der Nicla Sense ME an COM5 erkannt und die neue Firmware
erfolgreich aufgespielt (Arduino CLI/OpenOCD, Exit-Code 0). Der vollständige
Build nach dem Cordio-Speicherfix benötigt 327960 Byte Flash und 41784 Byte
statischen RAM. BLE reserviert seinen zusammenhängenden 13.000-Byte-Puffer vor
Sensor- und Flashinitialisierung; der persistente Speicher arbeitet ohne
TDBStore mit zwei CRC-gesicherten Flash-Slots.
Live-BLE-, Power-Cycle- und Flugtest stehen weiterhin aus.

Ergänzungen v9: Tests reproduzieren das ArduinoBLE-Schreibecho (Preset-Nutzdaten
null), ignorieren es und warten auf eine echte ES-Antwort. Flash-Speicherfehler
dürfen weder aktive Werte ersetzen noch als erfolgreich gemeldet werden.
Die Transaktion wird mit einem fehlschlagenden Speicher-Double und simuliertem
Neustart getestet. Der physische Flash benötigt zusätzlich einen echten
Power-Cycle-Test: QNH, Preset und Audio-Profil ändern, Bestätigung abwarten,
Strom aus/ein und Gerätestand erneut lesen.

Audio: Firmwaretests prüfen Tonhöhenrichtung, kürzere Steigperioden, Dauerton
beim Sinken, Ruhebereich, Invalidität und Profilgrenzen. Playback-Tests prüfen
Opt-in, kurze Audio-Clock-Leases, Unterbrechung und lange konfigurierbare Töne.
Auf dem Handy Lautstärke, Bluefy-Audiofreigabe, Sperrbildschirm, BLE-Abbruch und
beide Tonarten tatsächlich anhören. Ohne diese Hardwaretests keine Aussage zur
realen Audioqualität oder Flash-Persistenz auf dem angeschlossenen Board.
