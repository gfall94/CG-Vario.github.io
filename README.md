# CG Vario · Flugcockpit

Arduino Nicla Sense ME → gebündelte BLE-Telemetrie → Bluefy / Web Bluetooth.

Die Firmware berechnet Steigrate aus Bosch-IMU-Fusion und Barometer, lernt den
Beschleunigungsoffset und liefert einen separaten Mittelwert. QNH-Höhe, relativer
Nullpunkt, Flugzeit und Extremwerte laufen ebenfalls auf dem Nicla. Der Browser
zeigt Werte und einen 60-Sekunden-Trend und sendet bestätigte Geräteeinstellungen.

## Verwenden

1. **Neue Firmware erforderlich:** `firmware/EZVario/EZVario.ino` mit Arduino
   Nicla Sense ME, Core 4.6.0, Arduino_BHY2 1.0.8 und ArduinoBLE 2.1.0 bauen und
   aufspielen. [Firmware-Anleitung](firmware/EZVario/README.md).
2. [Cockpit](https://gfall94.github.io/CG-Vario.github.io/?v=9) auf iOS in Bluefy
   oder auf Android in einem Web-Bluetooth-Browser öffnen und verbinden.
3. QNH und Filterprofil einstellen. „An Nicla senden“ übernimmt Einzelwerte;
   die Bestätigung kommt vom Gerät. Profile wirken ebenfalls auf dem Gerät.
4. Flug manuell starten: Nullpunkt und Statistik werden neu gesetzt. Flugende
   hält die Statistik fest. BLE-Trennungen unterbrechen die Berechnung nicht.

Filter, QNH und Audio-Profil bleiben im internen Flash auch nach einem Neustart erhalten. Ohne Verbindung sind
Geräteaktionen deaktiviert. Alte Firmware wird erkannt und zeigt Rohsensoren
sowie einen Update-Hinweis. Der Browser hat keinen Ersatzfilter.

## Vario-Ton

„Ton einschalten“ aktiviert Web Audio nach einem Antippen. Steigen erzeugt mit
zunehmender Steigrate höhere und schnellere Pieptöne, Sinken einen tiefer
werdenden Dauerton. Im Audio-Profil sind neun Stützpunkte für Tonhöhe (Hz),
Tonlänge und Pause (ms) sowie Steig-/Sinkschwellen einstellbar. Der Nicla
interpoliert das Profil und sendet die fertigen Tonparameter. Der Browser führt
keine eigene Vario-Berechnung durch. Pro Stützpunkt gibt es eine zweisekündige
Hörprobe des Entwurfs; „An Nicla senden“ speichert das gesamte Profil dauerhaft.

Die Wiedergabelautstärke bleibt lokal im Browser gespeichert; Ton ist beim
Seitenstart aus. Datenverlust, Trennung, Audio-Unterbrechung oder Verlassen der
Seite schalten den Ton stumm. Für Bluefy das Dashboard im Vordergrund halten;
Hintergrund-/Sperrbildschirm-Wiedergabe ist nicht zugesichert.

Der Preset-Fehler wurde behoben: ArduinoBLE sendet Writes an eine abonnierte
Charakteristik selbst als Notification zurück. Befehle (`EC`) und Antworten
(`ES`) haben deshalb jetzt unterschiedliche Kennungen. Echo-Daten werden nicht
als bestätigte Einstellungen angezeigt. Eine positive Speicherbestätigung
kommt erst nach erfolgreichem Flash-Write und Readback.

Alle Sensoren bleiben in der Diagnose sichtbar; Export als CSV. Kein GPS oder
Fahrtmesser vorhanden, deshalb keine erfundene Geschwindigkeit/Gleitzahl und
keine Totalenergiekompensation. Der Filter wurde synthetisch getestet, noch
nicht flugerprobt.

## Entwicklung

`npm test`; C++-Test und Build siehe [Prüfung](docs/PRUEFUNG.md).
Lokal über `python -m http.server 8765 --bind 127.0.0.1` öffnen. Web Bluetooth
benötigt HTTPS oder localhost. GitHub Actions prüft JavaScript, den nativen
C++-Filter und den vollständigen Nicla-Build.

[Algorithmus und Referenzvergleich](docs/VARIO.md) · [BLE-Protokoll](docs/PROTOKOLL.md)
