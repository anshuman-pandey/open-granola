<!-- English source: 70a10462bdc9a52f4abbab965f71f7527b1c132a; translated 2026-11-15. Fluent review welcome. -->
<p align="center"><img src="../assets/logo.svg" width="72" alt="Open-Granola-Logo" /></p>
<h1 align="center">Open Granola</h1>
<p align="center"><strong>Lokale Transkripte. Deine Wahl der KI für Meetingnotizen.</strong><br/>Ein Desktop-Notizbuch für Meetings unter Apache-2.0, entwickelt mit Tauri, React und Rust.</p>
<p align="center"><a href="#vorschau">Vorschau ausprobieren</a> · <a href="#modelle">Modelle</a> · <a href="../ARCHITECTURE.md">Architektur</a> · <a href="../../PRIVACY.md">Datenschutz</a> · <a href="../COMPETITIVE_RESEARCH.md">Recherche und Prioritäten</a></p>
<p align="center"><a href="../../README.md">English</a> · Deutsch · <a href="README.es.md">Español</a> · <a href="README.ja.md">日本語</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="../I18N.md">Sprachunterstützung</a></p>

**Entwicklungsvorschau.** Open Granola zeichnet dein Mikrofon auf, transkribiert mit lokalem Whisper und wandelt das Transkript mit einem lokalen Modell oder einem von dir verbundenen Anbieter in Notizen um. Deine Bibliothek bleibt in einer lokalen SQLite-Datenbank. Cloud-Zusammenfassungen senden Transkripttext an den gewählten Anbieter.

Unter macOS 14.4 oder neuer gibt es die experimentelle Option **Mikrofon + Systemaudio** für Audio anderer Apps, einschließlich Gesprächsteilnehmern. Sie ist standardmäßig deaktiviert; Windows und Linux bleiben auf das Mikrofon beschränkt. [Einrichtung und Validierungsgrenzen](../SYSTEM_AUDIO.md). Echte Mikrofon-/Modellsitzungen, Anbieterkonten und gebündelte Veröffentlichungen müssen noch auf der vorgesehenen Hardware vollständig getestet werden. Die Browservorschau verwendet gekennzeichnete Beispielmeetings.

## Was implementiert ist

- **Mikrofontranskription:** lokales `whisper.cpp`, Transkriptabschnitte mit Zeitstempeln und ein sichtbares Live-Transkript.
- **Auswahl des Zusammenfassungsanbieters:** integriertes Qwen, LM Studio, OpenAI API, Claude API, benutzerdefinierte OpenAI-kompatible Endpunkte und experimentelle Anmeldung mit ChatGPT.
- **Verbindungstest:** Eine synthetische Textanfrage prüft das gewählte Zusammenfassungsmodell, ohne ein Meeting zu senden. Mikrofonaufnahme und Whisper werden damit nicht getestet.
- **Wiederherstellung gespeicherter Meetings:** Das Transkript wird vor der Zusammenfassung gespeichert. Eine fehlgeschlagene Zusammenfassung kann ohne erneute Aufnahme wiederholt werden. Bestehende Aufgaben-IDs und deren Erledigungsstatus bleiben bei der Neuerstellung erhalten.
- **Verarbeitungsdetails:** Gespeicherte Meetings erfassen den konfigurierten Modell-/Anbieterweg und den Zusammenfassungsstatus, damit spätere Einstellungsänderungen die Entstehung der Notiz nicht verschleiern.
- **Lokale Bibliothek:** Stichwortsuche, Fragen zu gefundenem Text, Aufgaben, Zusagen, Markdown-Vorlagen, JSON-Import und Markdown-Export.
- **Aufbewahrung:** Abgelaufene Meetings entfernen oder die lokale Bibliothek leeren. Einschränkungen stehen unter [Datenschutz](../../PRIVACY.md).

Generierte Notizen und Zusagen müssen geprüft werden. Sprecheridentifizierung, semantische/Vektorsuche, Kalenderintegration, direkte Importe aus bestimmten Meetingdiensten und verschlüsselte Audiowiedergabe sind nicht implementiert.

<a id="modelle"></a>
## Modelle und Verbindungen

Transkription und Zusammenfassung erfüllen unterschiedliche Aufgaben. **Lokales Whisper ist derzeit für Aufnahmen mit jedem Zusammenfassungsanbieter erforderlich.** Diese Version bietet keine Cloud-Transkriptions-API.

| Zusammenfassungsweg | Einrichtung | Was Open Granola sendet |
|---|---|---|
| Integriertes lokales Qwen | `qwen3-4b-q4.gguf` installieren | Keine Anbieteranfrage |
| LM Studio | OpenAI-kompatiblen Server starten; `http://127.0.0.1:1234/v1` und die ID des geladenen Modells verwenden | Text an einen Server auf diesem Gerät |
| OpenAI API | Dein API-Schlüssel und eine unterstützte Modell-ID | Text an OpenAI; API-Abrechnung gilt |
| Claude API | Dein Anthropic-API-Schlüssel und die Modell-ID | Text an Anthropic; API-Abrechnung gilt |
| OpenAI-kompatibel | Kompatible Basis-URL, Modell-ID und optionaler Schlüssel; etwa ein lokaler Ollama-Server | Text an den konfigurierten Server |
| ChatGPT-Tarif — experimentell | **Mit ChatGPT fortfahren**, berechtigte Tarifnutzung erlauben und ein Modell wählen | Text an OpenAI über den autorisierten Tarif |

Der ChatGPT-Weg verwendet den [offiziellen Anmeldeablauf für quelloffene/lokale Apps](https://developers.openai.com/siwc/token-sharing-open-source). Er gewährt keinen Zugriff auf deine vorhandenen ChatGPT-Gespräche. Berechtigung und Modellverfügbarkeit hängen von Konto und Anbieter ab. Diese Integration wurde noch nicht vollständig mit einem echten Konto überprüft. Hier unterstützt sie Textanfragen; [die Vorschau unterstützt keine Audiotranskription](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

Claude wird mit einem API-Schlüssel verbunden; diese App bietet keine Anmeldung mit einem Claude-Verbraucherkonto. OpenAI-API-Schlüssel und die Anmeldung mit einem ChatGPT-Tarif sind getrennte Wege.

### Ein Zusammenfassungsmodell verbinden

Einrichtungsanleitungen: [LM Studio](../integrations/LM_STUDIO.md) · [Ollama](../integrations/OLLAMA.md). Exportanleitung: [Obsidian](../integrations/OBSIDIAN.md).

Entwicklungsablauf: [SRT/VTT/TXT importieren, Transkript-JSON prüfen und mit Node exportieren](../DEVELOPER_WORKFLOWS.md), ohne Modelle oder nativen Build.

1. Öffne **Einstellungen → Modelle und Verbindungen** in der Desktop-App.
2. Wähle einen Anbieter und gib seine exakte Modell-ID ein. Gib für einen benutzerdefinierten Server die dokumentierte API-Basis-URL ein.
3. Verbinde für ChatGPT dein Konto und nutze **Verfügbare Modelle laden**, oder gib eine von deinem Konto unterstützte Modell-ID ein. Erlaube für ein Ziel außerhalb des Geräts das Senden von Text. Dies umfasst auch relevante gespeicherte Notizen für Assistent und Vorlagen.
4. Speichere die Einstellungen und führe **Verbindung testen** aus.
5. Zeichne eine kurze Mikrofonsitzung auf und prüfe Transkript und Notizen, bevor du längere Sitzungen verwendest.

Externe Endpunkte benötigen HTTPS; unverschlüsseltes HTTP ist nur für wörtliche Loopback-Adressen wie `127.0.0.1` erlaubt. Verwende für LM Studio die oben gezeigte Adresse. Benutzerdefinierte Kompatibilität muss getestet werden: Die Bezeichnung OpenAI-kompatibel garantiert nicht, dass alle Endpunkte dieselben Anfragefelder unterstützen. Bei einem Modellfehler erfolgt kein automatischer Wechsel von lokaler zu Cloud-Verarbeitung.

Schlüssel werden im nativen Code verarbeitet und, sofern verfügbar, im Anmeldedatenspeicher des Betriebssystems gespeichert. Kann dieser sie nicht speichern, nutzt die App nur den Arbeitsspeicher der Sitzung und zeigt dies an. Zugangsdaten werden weder in der Meetingdatenbank noch im Browserspeicher abgelegt. Ein lokaler Server kann selbst Anfragen weiterleiten; seine Konfiguration bestimmt, was nach dem Senden des Texts durch Open Granola geschieht.

<a id="vorschau"></a>
## Vorschau ausprobieren

### Browser-Arbeitsbereich

```sh
git clone https://github.com/anshuman-pandey/open-granola.git
cd open-granola
npm ci
npm run dev
```

Der Browser-Arbeitsbereich zeigt Beispielmeetings. Er zeichnet kein Audio auf, führt keine native Inferenz aus und speichert keine Anbieterzugangsdaten.

### Desktop-Entwicklungsbuild

Installiere Rust **1.98 oder neuer**, Node **22.12 oder neuer** (Node 24 LTS empfohlen), CMake, libclang, einen C/C++-Compiler und die [Tauri-Plattformvoraussetzungen](https://v2.tauri.app/start/prerequisites/). Linux benötigt außerdem die Entwicklungsabhängigkeiten für ALSA, WebKitGTK und das konfigurierte PipeWire. Das macOS-Paket setzt macOS 14.4 oder neuer voraus. Eine Plattform-Buildkonfiguration ist keine Aussage über abgeschlossene Hardwaretests.

```sh
npm ci
npm run tauri dev
```

Die Tauri-Hooks bauen vor dem App-Start den lokalen Inferenz-Hilfsprozess. Für ein Release-Paket:

```sh
npm run tauri build
```

Die Build-Ausgabe liegt unter `src-tauri/target/release/bundle`. Signierung, Notarisierung und Installations-/Upgradetests sind separate Veröffentlichungsarbeiten. Verifizierte Dateien können bei Bereitschaft unter [Releases](https://github.com/anshuman-pandey/open-granola/releases) veröffentlicht werden; diese README verspricht kein fertiges Installationsprogramm.

Für Apple-Silicon-Testkandidaten und Tests der Ersteinrichtung siehe die [Vorschau-Buildanleitung](../RELEASING.md). Diese Kandidaten benötigen vor einer öffentlichen Veröffentlichung Modelldateien und Hardwaretests.

### Lokale Modelle installieren

Die Einstellungen zeigen den tatsächlichen Modellordner: `<app-data>/library/models/`.

- Installiere für Audioaufnahmen ein kompatibles Whisper-Modell als **`whisper-large-v3-turbo.bin`**.
- Installiere ein kompatibles GGUF-Modell als **`qwen3-4b-q4.gguf`**, wenn du das integrierte Zusammenfassungsmodell verwendest.
- Für LM Studio oder einen Cloud-Anbieter ist Whisper weiterhin erforderlich, die integrierte Qwen-Datei jedoch nicht.

Die Modellinstallation erfolgt manuell. Die App lädt Modelle nicht herunter, setzt Downloads nicht fort und prüft keine Herausgeber-Prüfsummen für dich. Beziehe Modelle aus vertrauenswürdiger Quelle und prüfe Format und Lizenz. Fehlende oder ungültige Dateien führen zu Einrichtungsfehlern.

## So wird ein Meeting verarbeitet

```text
Mikrofon → lokales Whisper → gespeichertes lokales Transkript
                                  ↓
                    gewähltes lokales/Server-/Cloud-Modell
                                  ↓
                         Notizen, Aufgaben, Zusagen
```

Notizen, Transkripte und Verarbeitungsdetails werden lokal ohne Datenbankverschlüsselung auf App-Ebene gespeichert. Schlägt die Zusammenfassung nach dem Speichern des Transkripts fehl, wiederhole sie für das gespeicherte Meeting. Ein Absturz, während die Aufnahme noch im Arbeitsspeicher liegt, ist damit nicht wiederherstellbar. Audio bleibt im RAM, statt absichtlich in eine Aufnahmedatei geschrieben zu werden.

## Datenschutz in klaren Worten

- Lokale Modelle sind die Standardeinstellung. Textverarbeitung außerhalb des Geräts erfordert Anbieterkonfiguration und Zustimmung.
- Native Netzwerkzugriffe sind für Anbieter und die ChatGPT-Anmeldung aktiviert. Diese Version ist **keine vom Betriebssystem erzwungene Netzwerkisolation**.
- Die Webview ist auf gebündelte Dateien und lokale App-IPC beschränkt. Anbieteranfragen laufen im nativen Code.
- Die App implementiert keine Telemetrie und keinen Open-Granola-Cloud-Synchronisierungsdienst. Verbundene Anbieter haben eigene Datenrichtlinien.
- Das Löschen lokaler Datensätze entfernt keine beim Anbieter gespeicherten Daten, exportierten Dateien, Betriebssystem-Snapshots oder Sicherungen.

Details zu Speicherung, Zugangsdaten, Netzwerk und Löschung stehen in [PRIVACY.md](../../PRIVACY.md) und [SECURITY.md](../../SECURITY.md).

## Nächste Prioritäten

Der [Wettbewerbsvergleich](../COMPETITIVE_RESEARCH.md) untersuchte zehn große verwandte Repositories sowie sieben nähere/angrenzende Produkte. Die Prioritäten richten sich nach wiederkehrenden Nutzerproblemen, nicht nach der Anzahl der Funktionen in einer fremden README:

1. Einen vollständigen Mikrofonablauf nach Neuinstallation mit echten Modellen und Anbieterkonten überprüfen; Modelleinrichtung und Paketierung verbessern.
2. Systemaudio, Gerätewechsel, Signalaktualität und lange Aufnahmen auf einer definierten Plattformmatrix implementieren und testen.
3. Entscheidungen und Aufgaben mit Transkriptstellen verknüpfen und prüfen, bevor eine KI-Schlussfolgerung als bestätigte Zusage gilt.
4. Vokabularkorrekturen, explizite Sprachauswahl und wiederherstellbare Verarbeitung langer Meetings hinzufügen.
5. Selektive Textfreigabe und begrenzten Agentenzugriff untersuchen, sobald die grundlegende Aufzeichnung zuverlässig ist.

Dies sind geplante Funktionen. Recherche und automatisierte Tests belegen nicht, dass die App mit deiner Meetingkonfiguration funktioniert.

## Entwicklungsprüfungen

```sh
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
```

Native Tests benötigen die Buildvoraussetzungen der Plattform. Lies [Architektur](../ARCHITECTURE.md), [Sicherheitsrichtlinie](../../SECURITY.md) und [Beitragsleitfaden](CONTRIBUTING.de.md), bevor du Aufnahme, Zugangsdaten oder Datenverarbeitung änderst.

## Lizenz

[Apache-2.0](../../LICENSE). Modelldateien und Drittanbieter haben eigene Lizenzen und Bedingungen.
