# Vario auf dem Nicla

Seit Protokoll 2 berechnet ausschließlich die Firmware Steigrate, mittlere
Steigrate, QNH-Höhe, relative Höhe, Flugzeit und Extremwerte. Der Browser
dekodiert, formatiert, zeichnet die letzten 60 Sekunden und sendet Befehle.
Es gibt keinen JavaScript-Ersatzfilter und keine browserseitige Flugsimulation.

## Vergleich der Referenzprojekte

Untersucht am 23.09.2026, mit festgehaltenen Quellständen:

| Projekt / Quelle | Methode | Verwendung in CG-Vario |
| --- | --- | --- |
| [GNUVario kalmanvert](https://github.com/prunkdump/arduino-variometer/blob/ca3eba4b33fda434a6155199f07ba70a26076318/libraries/kalmanvert/kalmanvert.cpp) | Höhe/Geschwindigkeit mit Beschleunigungsprädiktion und Druckkorrektur; zeitstempelbasiertes dt | Dasselbe physikalische Grundprinzip; ergänzt um einen dritten Zustand für IMU-Bias |
| [XCVarioPure VarioFilter](https://github.com/hjr/XCVarioPure/blob/7ac3f9e503fca97ce07108d36ce9ba5c8bacdf97/main/sensor/VarioFilter.cpp) | Mehrere Filtervarianten; bei FILTER=3 barometrischer Kalman-Filter, zeitlich einstellbare Dynamik und symmetrische Kovarianz | Einstellbare Reaktion; numerisch stabile Joseph-Korrektur; keine Übernahme der TE-/Airspeed-Kompensation |
| [XCVarioPure AverageVario](https://github.com/hjr/XCVarioPure/blob/7ac3f9e503fca97ce07108d36ce9ba5c8bacdf97/main/AverageVario.cpp) | Separater, mehrstufiger Mittelwert positiver Thermikwerte | Getrennte schnelle und gemittelte Anzeige; hier bewusst ein vorzeichenbehafteter Mittelwert einschließlich Sinken |
| [Open-Vario ov_app](https://github.com/open-vario/open-vario/blob/027bc4545b64c7c1bf7b0a2a019b3bc8668b6296/src/firmware/app/ov_app.cpp) | Steigrate über ein einstellbares Höhenfenster und anschließenden Mittelwert; Berechnung in der Firmware | Einstellbares Mittelwertfenster und Geräteverantwortung; die schnelle Anzeige nutzt zusätzlich die vorhandene Bosch-Fusion |

Die Implementierung ist eigenständig aus den Zustandsgleichungen geschrieben;
es wurden keine Quellcodeblöcke der Referenzprojekte übernommen. Insbesondere
werden weder deren Hardwareparameter noch deren Lizenzhinweise pauschal kopiert.
Der Nicla hat keinen Fahrtmesser und kein GPS: daher keine Totalenergie-, Netto-,
Gleitzahl- oder Groundspeed-Anzeige mit erfundenen Eingangsgrößen.

## Filter

`firmware/CGVario/Vario.h` enthält einen vom Arduino-Framework unabhängigen
Float32-Filter mit x = [relative Standarddruckhöhe, Geschwindigkeit, IMU-Bias].
Der Ursprung nahe dem Startpunkt reduziert numerische Auslöschung bei großen
absoluten Höhen. Die Druck-Höhenumrechnung verwendet Double-Zwischenschritte.

Prädiktion: h += v·dt + (a−bias)·dt²/2; v += (a−bias)·dt.
Die vorgefilterte lineare Beschleunigung stammt aus dem BHI260AP und wird in
der Firmware mittels Bosch-Quaternion in ENU rotiert. Gravitation wird nicht
ein zweites Mal abgezogen. Die vorhandene Quaternion-Konvention bleibt erhalten.
Hardwaretests bei Drehungen sind weiterhin notwendig.

Der 50-Hz-Takt läuft unabhängig von BLE-Verbindung und Subscription. Das echte
Millis-dt berücksichtigt ausgefallene Rechentakte; alte Takte werden nicht
nachträglich als Burst verarbeitet. Nur frische Druckmessungen korrigieren den
Zustand. IMU-Werte älter als 80 ms werden nicht zur Integration verwendet.
Die öffentliche BHY2-Sensor-API liefert hier keine individuellen FIFO-Zeitstempel;
die Synchronisation bleibt deshalb durch den Host-Lesezeitpunkt begrenzt.

Das kontinuierliche Beschleunigungs-Prozessrauschen wird mit dt integriert;
Vibration erhöht die Unsicherheit der IMU-Prädiktion. Bias-Random-Walk:
0,00005 m²/s⁵. Messvarianz R = baroSigma². Druck-Innovationen oberhalb
max(4 m, 6·sqrt(S)) werden verworfen; ab 2,5·sqrt(S) wird ihre Gewichtung weich
reduziert. Joseph-Kovarianzupdate statt unsymmetrischer In-place-Korrektur.

Die Ausgabe blendet kontinuierlich zwischen eingestellter Dämpfung und schneller
Reaktion bei vertikaler Beschleunigung. Es gibt keinen hart schaltenden
Beschleunigungsschwellwert und keine Totzone für schwaches Steigen. Der separate
2–30-s-Mittelwert integriert die ungedämpfte geschätzte Geschwindigkeit
zeitgewichtet. Ein 10-Hz-Ringpuffer interpoliert den Anfang des Zeitfensters.
Beim Start wird die tatsächlich vorhandene Dauer statt einer vollen, mit Nullen
gefüllten Fensterlänge verwendet.

Nach mehr als 0,5 s Rechenpause oder 1,5 s ohne akzeptierten Druck wird neu
initialisiert. Dafür wird eine neue Druckmessung verlangt. Zwei Sekunden
Einlaufzeit bleiben als ungültig markiert; der Browser zeigt Striche. Ein
verlorenes Paket oder eine Bluetooth-Trennung setzt den Firmwarefilter nicht
zurück. Ohne IMU bleibt eine barometrische Schätzung verfügbar.

## Bedienung

Profile Ruhig / Ausgewogen / Direkt werden auf dem Nicla erzeugt. QNH bleibt bei
Profilwechsel erhalten. Einzelwerte: QNH 800–1100 hPa, Barometer-Sigma 0,3–3 m,
IMU-Vorfilter 0,04–0,4 s, Ausgabedämpfung 0,1–2 s, Mittelwert 2–30 s,
Prozessrauschen 0,02–1 m²/s³. Die Firmware prüft alle Werte inklusive NaN/Inf
atomar vor der Übernahme. Änderungen setzen den Filterzustand nicht zurück.
Standard wiederherstellen setzt auch QNH auf 1013,25 hPa.

Filter-, QNH- und Audioeinstellungen liegen dauerhaft im internen Flash des Nicla
und überleben Stromverlust/Neustart. Der Browser liest beim Verbinden den Gerätestand und
überschreibt ihn nicht aus lokalem Browser-Speicher. Befehle benötigen passende
Request-ID und positive Gerätebestätigung. Kein automatisches Wiederholen bei
Timeout, insbesondere nicht bei Flugstart oder Nullpunkt.

`SettingsStore.h` verwendet Mbed TDBStore auf den letzten zwei internen
4-KiB-Flashseiten (0x7e000..0x7ffff). Externer Flash und Sensorhub-Firmware
werden nicht verändert. Vor der Initialisierung wird der tatsächliche
Flash-Endpunkt des Programms geprüft; bei Überlappung wird Speicherung
verweigert. TDBStore nutzt CRC, append-only Records und zwei Bänke. Identische
Einstellungen werden nicht erneut geschrieben. Erst nach erfolgreichem Set
und Readback wird der neue RAM-Zustand übernommen und bestätigt. Ein Fehler
liefert Ergebnis 3; vorherige aktive Einstellungen bleiben erhalten. Ein
Firmware-Upload mit vollständigem Flash-Erase kann die Einstellungen löschen.
Flugzeit, Flugstatistik und relativer Nullpunkt sind weiterhin Sitzungsdaten.

Das Audio-Profil enthält neun feste Steigratenpunkte (-10, -5, -2, 0, 0,5, 1,
2, 5, 10 m/s), Tonhöhe 80–2500 Hz, positive Tonlänge 40–1000 ms und Pause
40–1500 ms. Der Nicla interpoliert linear, verwendet eine kleine Hysterese an
den Aktivierungsschwellen und sendet Tonhöhe/Periodendauer/Einschaltdauer.
Sinken bleibt unabhängig von den Pulsfeldern ein Dauerton. Das Profil verlangt
monoton steigende Tonhöhen und bei Steigen nicht zunehmende Periodendauer.
Filter-Presets erhalten das individuelle Audio-Profil und QNH.

Flugstart erfolgt bewusst manuell auf dem Gerät per BLE-Befehl, setzt relative
Höhe und Flugstatistik zurück. Flugende hält Zeit und Extremwerte fest. Bei
Bluetooth-Verlust laufen Flugzeit, Sensorfusion und Statistik weiter. QNH
beeinflusst nicht Steigrate und relativen Standardhöhen-Nullpunkt. Maximalhöhe
ist die jeweils während des Fluges angezeigte QNH-Höhe; QNH-Wechsel korrigieren
frühere Extremwerte nicht rückwirkend.

## Messgrenzen

Die Tests verwenden synthetische Bewegung und Störungen, keine aufgezeichneten
Flugdaten. Noch nicht flugerprobt. Wetterdrift, Staudruck am Gehäuse und
zeitversetzte IMU-Werte können durch den Filter allein nicht behoben werden.
Eine ruhende Nullmessung, Drehversuche und vertikale Vergleichsbewegungen sind
vor einer Beurteilung des tatsächlichen Fortschritts erforderlich.
