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
4. BLE in Bluefy verbinden: 164 Byte vollständig; neue Einstellungen erst nach
   bestätigtem Read/Notify sichtbar. Ungültige/fehlende Bestätigung testen.
5. Flug starten, Bluetooth trennen und wieder verbinden: Flugzeit/Statistik
   laufen auf dem Nicla weiter. Neustart setzt Einstellungen/Flug zurück.
6. Druck-/IMU-Ausfall und Wiederanlauf prüfen; bei fehlender Telemetrie muss
   die Anzeige nach 1,5 s Striche statt scheinbar aktueller Werte zeigen.

Kein eindeutig als Nicla erkanntes USB-Gerät war bei der Umsetzung verfügbar.
Ein Firmware-Upload und Live-BLE-/Flugtest wurden deshalb nicht durchgeführt.
