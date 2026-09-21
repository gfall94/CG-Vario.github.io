# Vario-Filter

Die Web-App verwendet einen linearen Kalman-Filter mit den Zuständen Höhe (m),
Vertikalgeschwindigkeit (m/s) und vertikalem Beschleunigungsoffset (m/s²).
Prädiktion: h += v·dt + (a−bias)·dt²/2; v += (a−bias)·dt.
Die lineare ENU-Beschleunigung stammt aus der Bosch-Fusion und der
Quaternion-Transformation in der Firmware. Die Gravitation ist bereits entfernt.

Nur neue, gültige Druckmessungen (fresh-Bit 5) korrigieren die Schätzung.
Der Filter verwendet Standarddruckhöhe, sodass QNH und relativer Nullpunkt
keine Geschwindigkeitssprünge auslösen. Als dt dient der uint32-Zeitstempel
des Nicla; Bluetooth-Bündelung verändert dadurch nicht die Integration.

Startparameter: Höhen-Messvarianz 2,25 m²; Beschleunigungs-Prozessrauschen
0,08 m²/s³, ohne IMU 0,35 m²/s³; Bias-Random-Walk 0,00005 m²/s⁵.
Die Beschleunigung wird mit 120 ms Zeitkonstante vorgefiltert. Die Anzeige nutzt
adaptiv 550 ms in ruhiger Luft und 100 ms bei mehr als 0,35 m/s² vertikaler
Beschleunigung. So bleibt schwaches Steigen ohne Totzone sichtbar, während echte
Steigwechsel schnell durchkommen.
Diese Parameter sind mit synthetischen Bewegungen geprüft, nicht flugerprobt.
Das Ergebnis ist Vertikalgeschwindigkeit, kein totalenergiekompensiertes Vario.

Ohne gültige IMU arbeitet der Filter barometrisch. Druckausreißer oberhalb
max(4 m, 6·Innovationsstandardabweichung) werden verworfen. Nach 1,5 s ohne
akzeptierte Druckkorrektur oder mehr als 0,5 s Paketabstand wird neu initialisiert.
Bei fehlenden BLE-Paketen zeigt die Geschwindigkeitsanzeige einen Strich.

Tests: Rauschen im Stillstand, Bias-Konvergenz, Beschleunigungsreaktion,
konstantes Steigen/Sinken, Druckausreißer, alte Druck-Snapshots, Zeitüberlauf,
Neustart und simulierte Browser-/BLE-Kompatibilität. Hardwaretests mit ruhendem,
gedrehtem und vertikal bewegtem Nicla sind noch erforderlich.

Die Implementierung wurde eigenständig aus den Kalman-Zustandsgleichungen
erstellt. Vergleichbares Zustandsmodell für Variometer:
https://github.com/har-in-air/Kalmanfilter_altimeter_vario
