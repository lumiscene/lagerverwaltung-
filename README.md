# Lagerwerk – mobile, lokale Lagerverwaltung (Version 0.1)

Funktionierende, dependency-freie Android-PWA. Lagerdaten werden **nur lokal in IndexedDB** gespeichert; es gibt keine Konten, Trackingdienste oder Datenübertragung an einen Server. Der Server liefert ausschließlich die statischen App-Dateien. Die App lässt sich nach erstmaligem Laden ohne Netzwerk betreiben.

## Funktionen

- 10 initiale Regale mit je 8 Regalstellplätzen (80 Plätze, nachträglich erweiterbar)
- 15 initiale **leere** Großboxen mit je 15 Fächern (es werden **keine** fiktiven Kleinboxen, Bestände oder Drahtrollen angelegt)
- Kleinboxen mit eigenem Taragewicht, Materialzuordnung und Nettobestand in Gramm
- Netto-/Brutto-Wiegung mit vorausgewählter Entnahme oder Zugang; bei Differenz <5 g Warnung und Bestätigung; separate Tara-Korrektur
- Drahtrolle und Reststück einzeln, Längenbuchung in Metern (intern Millimeter)
- Kleinboxen umziehen/tauschen und Großboxen/Drahtrollen am Regal umziehen/tauschen, mit atomarer Transaktion
- Suchbarer Materialstamm, kombinierbare Eigenschaften und Kurzcode-Generator für Rocailles und Draht
- Zentrale Farben/Werkstoffe/Oberflächen; zusätzliche Materialklassen und Eigenschaften anlegbar
- QR-Codes für alle Stellplätze und beweglichen Objekte, Etikettendruck, Kamera-Scan auf kompatiblen Android-Chrome-Geräten
- Gesamtbestände, Melde- und Zielbestände, Bestellvorschläge
- Unveränderbares Buchungsjournal (nur durch Datenwiederherstellung ersetzbar)
- Vollständiges JSON-Backup und Wiederherstellung

## Android-Installation (empfohlen)

1. **Die Dateien nicht als `file://` öffnen.** Eine installierbare PWA benötigt HTTPS oder `localhost`.
2. Das gesamte Verzeichnis unverändert auf einem **HTTPS-fähigen statischen Hostingdienst** bereitstellen, z. B. als Website in einem eigenen GitHub-Pages-Repository oder auf einem anderen HTTPS-Webspace. Es wird **kein Backend** benötigt. Der Code darf öffentlich zugänglich sein: **Bestandsdaten sind nicht im Code** und bleiben auf deinem Gerät.
3. URL in **Chrome für Android** öffnen. Gehe auf das Browsermenü `⋮` → `App installieren` bzw. `Zum Startbildschirm hinzufügen`.
4. Lagerwerk einmal vollständig laden, dann sind alle App-Dateien für Offlinebetrieb zwischengespeichert. Zu Beginn nach Möglichkeit im Bereich `Mehr` → `Sicherung` ein erstes Backup erstellen.
5. QR-Scan erfordert Kamera-Freigabe. Bei fehlender BarcodeDetector-Unterstützung lässt sich die ID auch manuell eingeben (z. B. `SMALL:K001`).

**ACHTUNG:** Die Datenbank ist an den genauen Web-Origin (Protokoll, Host, Port) und das Browserprofil gebunden. Beim Wechsel des Hostings, Browsers oder Smartphones **zuerst JSON exportieren** und am neuen Standort importieren. Löschen der Website-Daten entfernt den Bestand. Downloads nach jeder wichtigen Erfassung auf OneDrive oder einem anderen externen Speicher sichern. Ohne Zentralserver werden andere Geräte nicht synchronisiert.

## Lokal auf einem Computer testen

Mit Python 3 im Projektordner:

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080` im Browser des **gleichen Computers** öffnen. Das ist nur ein Entwicklungstest; `http://IP-DES-PCS:8080` auf dem Handy gilt normalerweise **nicht** als sicherer Kontext und eignet sich daher nicht zur PWA-Installation oder zum Kamera-Scan.

## Datenmodell (`db.js`, IndexedDB-Schema 1)

| Store | Inhalt |
|---|---|
| `groups` | Materialklassen mit Reihenfolge und Pflichtkennzeichen der Eigenschaften |
| `attributes` | Globale Attribute (z. B. Farbe) samt Codes/Werten |
| `materials` | Materialidentität, sprechender Code, Metadaten, Melde- und Zielbestand |
| `shelves` | Regale |
| `slots` | Regalstellplätze |
| `bigboxes` | Physische Großboxen mit `slotId` und Kapazität |
| `smallboxes` | Physische Kleinboxen mit Tara, Bestand, Material, Großbox und Fachnummer |
| `wires` | Physische Drahtrollen / Reststücke mit Restlänge und Regalstellplatz |
| `journal` | Zeitstempel und unveränderliche Bewegungsdatensätze |
| `settings` | Initialisierungs- und Backup-Informationen |

Die internen IDs der Materialien sind UUID-basiert; die angezeigten Materialcodes basieren auf dem dynamischen Katalog. `diameter` wird mit 0,01-mm-Auflösung codiert: 0,50 mm → `050`. Für Draht erfolgt die interne Bestandsführung in mm (UI in m).

## QR-Codes

Die Codes enthalten **nur** die stabile Kennung:

- Regalstellplatz `SLOT:R01-P01`
- Großbox `BIG:G001`
- Kleinbox `SMALL:K001`
- Drahtgebinde `WIRE:D001`

Die Codes werden vollständig offline von einer mitgelieferten MIT-lizenzierten QR-Bibliothek erstellt.

## Wesentliche Einschränkungen dieser ersten Version

- Kein Cloud- oder Gerätesync; PC-Zugriff auf denselben Bestand nur über manuellen Export/Import.
- Keine direkte Waagenanbindung.
- Rocailles und Draht sind vorkonfiguriert. Neue Klassen können zwar eingerichtet werden, aber bereits existierende Klassen erhalten neue Eigenschaften in dieser Version noch nicht über eine Bearbeitungsmaske; neu angelegte Attribute lassen sich bei neuen Klassen verwenden.
- Es gibt **eine Materialart pro Kleinbox**. Großboxen enthalten bis zu 15 unterschiedliche Materialien.
- Es gibt **ein Drahtgebinde pro Regalstellplatz**; mehrere Drahtgebinde können über mehr Stellplätze abgebildet werden.
- Keine Benutzerkonten, parallele Buchungen oder Synchronisationskonflikte.
- Keine automatisierten Inventur-/Freigabeprozesse oder Löschdialoge.
- Für den QR-Scan wird die in Android Chrome unterstützte native `BarcodeDetector`-Schnittstelle verwendet; Fallback ist die manuelle Kennungseingabe.
- Bei der Datenwiederherstellung wird die gesamte Datenbank atomar überschrieben. `JSON` ist nicht verschlüsselt; Backups entsprechend schützen.

## Lizenzhinweis

`vendor/qr-bundle.js` ist aus der unter MIT-Lizenz veröffentlichten QR-Code-Bibliothek von Kazuhiko Arase gebündelt (siehe `vendor/LICENSE.qr.txt`). Die Anwendungsdateien wurden für diese Version neu geschrieben.

## Prüfstatus

- JavaScript-Syntax sämtlicher Module: geprüft mit Node.js.
- Codegenerator für Rocailles und Draht: mit Beispieldaten ausgeführt.
- Offline-QR-Generator: mit einer `SMALL:K001`-Kennung ausgeführt.
- Vollständiger End-to-End-Browser-/Android-Test: **noch nicht durchgeführt**. Der Testbrowser der Erstellungsumgebung blockierte den Aufruf lokaler Testadressen. Bitte App zunächst mit wenigen Testmaterialien und einem Backup erproben, bevor Bestände endgültig übernommen werden.
