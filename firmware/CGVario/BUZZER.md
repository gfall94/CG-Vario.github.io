# CG-Vario Grove Passive Buzzer

Output: digital 0 = header GPIO3/LPIO3 = P0_10. IO voltage: 3.3 V.
Do not externally supply VDDIO_EXT with this firmware.

Grove VCC: separate 3-5 V supply. Grove GND, supply GND and Nicla GND:
common ground. NC: unconnected.
Use a high-input-impedance non-inverting buffer between GPIO3 and SIG,
e.g. 74AHCT1G125 on 5 V, /OE grounded, 100 nF supply bypass.
GPIO3 -> buffer input; buffer output -> Grove SIG. Add 100 kOhm pulldown
on buffer input so reset stays silent. Never connect the 5 V output to Nicla.
The Nicla uses low-current level translators; Grove has a 1 kOhm transistor
base input load. Direct drive is not guaranteed.

Settings -> Buzzer am Nicla: Ein/Aus, 0-100 %, An Nicla senden.
Default off, 75 %. Flash settings survive restart. Old settings migrate on save.
Hardware PWM uses the same tone frequency, on-time and pause as phone telemetry.
BLE and Web Audio latency can offset pulse starts. Buzzer works without a phone.
Invalid estimator data mutes it. Volume changes duty from 0 to 50 %;
this is relative output, not calibrated sound pressure. Response depends on
frequency and module. Phone volume is independent.

Sources:
https://wiki.seeedstudio.com/Grove-Passive-Buzzer/
https://files.seeedstudio.com/products/107020109/document/Grove_Passive_Buzzer_SCH_190925.pdf
https://docs.arduino.cc/resources/pinouts/ABX00050-full-pinout.pdf
