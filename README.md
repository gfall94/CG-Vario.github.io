# CG Vario Web-Dashboard

Statische Web-Bluetooth-Anwendung für das EZ-Vario auf dem Arduino Nicla Sense
ME. Auf iPhone/iPad wird die veröffentlichte HTTPS-Seite in **Bluefy** geöffnet.
Android-Browser mit Web-Bluetooth-Unterstützung können sie direkt verwenden.

## Bedienung

1. Nicla mit der Firmware aus `firmware/EZVario` programmieren und einschalten.
2. Die GitHub-Pages-Adresse in Bluefy öffnen.
3. **Bluetooth verbinden** wählen und `EZ-Vario` auswählen.
4. QNH einstellen; optional die relative Höhe nullen.

Die Seite verarbeitet die Messwerte ausschließlich lokal. Sie zeigt bis zu 60
Sekunden Verlauf, Paketdurchsatz und Sequenzlücken und kann alle gespeicherten
Samples als CSV teilen oder herunterladen. **Demo starten** funktioniert ohne
Hardware.

Das Binärformat nutzt eine 124-Byte-Notification mit 50 Hz. Bluefy bzw. das
Betriebssystem muss dafür eine ATT-MTU von mindestens 127 Byte aushandeln.

## Lokal prüfen

```sh
npm test
npx serve .
```

Web Bluetooth erfordert einen sicheren Ursprung (HTTPS; localhost ist für die
lokale Entwicklung ebenfalls erlaubt). GitHub Pages veröffentlicht automatisch
den Inhalt von `main /`; `.github/workflows/test.yml` prüft bei jedem Push den
Protokolldecoder.

Das vollständige Paketformat ist in `docs/PROTOKOLL.md` beschrieben.
