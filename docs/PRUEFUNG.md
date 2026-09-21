# Prüfstand 21.09.2026

## Automatisch geprüft

- Firmware für `arduino:mbed_nicla:nicla_sense` mit Core 4.6.0,
  Arduino_BHY2 1.0.8 und ArduinoBLE 2.1.0 kompiliert.
- JavaScript-Tests prüfen die Little-Endian-Dekodierung aller 26 Werte,
  beschädigte Pakete, Gültigkeitsmasken, Höhenformel, Sequenzlücken und den
  uint32-Überlauf.
- Das Dashboard enthält keine Laufzeitabhängigkeit von einem CDN oder Framework.
  Der GitHub-Actions-Workflow führt die Tests bei jedem Push aus. GitHub Pages
  veröffentlicht automatisch den Inhalt des Hauptbranches.

## Am Zielsystem zu prüfen

- Board flashen und eine echte Bluetooth-Verbindung in Bluefy herstellen.
- Prüfen, ob iOS eine ATT-MTU von mindestens 127 Byte aushandelt und vollständige
  124-Byte-Notifications liefert.
- Empfangsrate und Paketlücken mehrere Minuten auf iOS und Android beobachten.
- Beschleunigung in verschiedenen Lagen prüfen: linear nahe 0, mit Schwerkraft
  nahe `(0, 0, +9,81)` m/s²; definierte Bewegungen in Ost/Nord/Oben ausführen.
- Druck und Höhe gegen eine Referenz vergleichen sowie Gas/BSEC aufwärmen und
  den Kalibrierstatus beobachten.

Ein erfolgreicher Kompilationstest ersetzt diese Hardware-Abnahme nicht.
