<!-- English source: 70a10462bdc9a52f4abbab965f71f7527b1c132a; translated 2026-11-15. Fluent review welcome. -->
# Zu Open Granola beitragen

[English](../../CONTRIBUTING.md) · Deutsch · [Español](CONTRIBUTING.es.md) · [日本語](CONTRIBUTING.ja.md) · [简体中文](CONTRIBUTING.zh-CN.md) · [繁體中文](CONTRIBUTING.zh-TW.md) · [Übersetzungsleitfaden](../I18N.md)

Lokale Verarbeitung soll Standard bleiben; jedes optionale externe Ziel muss ausdrücklich erkennbar sein. Funktionen müssen ihre Grenzen benennen und bei fehlenden Modellen, Berechtigungen oder Plattformfunktionen sichtbar fehlschlagen.

## Mitmachen

Fehlerberichte, Dokumentationskorrekturen, Verbesserungen der Barrierefreiheit und Codebeiträge sind willkommen. Prüfe vorhandene Issues, bevor du ein neues eröffnest. Beschreibe bei größeren Änderungen zuerst Verhalten und Umfang in einem Issue zur Diskussion. Für vertrauliche Sicherheitsmeldungen siehe [SECURITY.md](../../SECURITY.md).

Erstelle einen Fork, lege einen Branch für deine Änderung an und eröffne einen Pull Request gegen `main`. Füge eine kurze Beschreibung und die ausgeführten Prüfungen hinzu. Kleine Dokumentationskorrekturen benötigen keine native Toolchain.

Für gezielte Integrationsarbeit siehe den [Community-Beitragsplan](../COMMUNITY_GROWTH.md).

## Einrichtung

Verwende Node 24 LTS und Rust 1.98 oder neuer. Native Builds benötigen außerdem CMake, libclang, einen C/C++-Compiler und [Tauri-Plattformabhängigkeiten](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run dev          # Browser-Arbeitsbereich mit Beispieldaten
npm run tauri dev    # Native App; Modelle manuell im Ordner aus den Einstellungen installieren
```

Modelldateinamen und unterstütztes Verhalten stehen in der [README](README.de.md).

## Entwicklungsregeln

1. Netzwerkzugriffe zur Laufzeit gehören ausschließlich in die geprüften nativen Module `providers.rs` und `auth.rs`. Erhalte Endpunktprüfung, Zustimmung zur externen Verarbeitung, Redirect-/Proxy-Sperren, begrenzte Antworten und getrennte Zugangsdaten. Die Renderer-CSP bleibt auf App-IPC beschränkt. Keine Analysefunktionen, versteckten Uploads, externen Ressourcen oder stillen Cloud-Ausweichwege hinzufügen. Jedes neue Ziel benötigt eine ausdrückliche Produkt- und Sicherheitsprüfung.
2. Jede datenhaltige Tabelle muss an Aufbewahrung und vollständiger Bibliothekslöschung teilnehmen. Ergänze Regressionstests für Schema-, Migrations-, FTS- und Löschänderungen. Versprich keine physische Löschung von SSDs oder Sicherungen.
3. Speichere rohe Transkripte vor der Aufbereitung. Verwende Transaktionen für Schreibvorgänge über mehrere Tabellen. Vertraue weder Renderer-Zeitstempeln noch Modell-Ausgabestrukturen oder importiertem JSON.
4. Zeige Fehler an und erhalte Wiederherstellungswege. Stelle Beispieldaten, vorgefertigte Antworten oder feste Netzwerkzähler nicht als echte Desktop-Ergebnisse dar.
5. Halte aufwendige Inferenz und Audioarbeit vom UI-Thread fern. Beachte die Aufnahmesperre bei Änderungen an Aufnahme, Aufbewahrung und Löschung.

## Vor dem Einreichen

```sh
npm run check
npm audit
npm run build:worker
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --workspace --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace
```

Committe beide Abhängigkeits-Lockdateien. Beschreibe Verhalten, Validierung und verbleibende Plattformgrenzen im Pull Request. Verwende Conventional Commits und halte zusammengehörige Änderungen zusammen. Committe niemals Meetingbibliotheken, Audio, Modellgewichte, Zugangsdaten oder Signierschlüssel.

## Sinnvolle nächste Aufgaben

- Native Systemaudio-Rückführung für jedes Betriebssystem implementieren und testen.
- Wiederherstellung über Checkpoints bei Prozessabbruch während einer Aufnahme hinzufügen.
- Transkription und Zusammenfassung langer Meetings mit echten Modellen validieren.
- Bibliothekspaginierung und Rendering-Benchmarks für lange Transkripte ergänzen.
- Modellkompatibilität, Barrierefreiheit und Paketberechtigungen auf echter Hardware testen.

Melde Sicherheitsprobleme gemäß [SECURITY.md](../../SECURITY.md). Sei freundlich und direkt. Beiträge stehen unter Apache-2.0.

## Transkriptwerkzeuge ohne native Abhängigkeiten bearbeiten

Mit Node 22.12 oder neuer kannst du `npm run test:tools` ausführen und den [Entwicklungsablauf](../DEVELOPER_WORKFLOWS.md) ausprobieren. Gemeinsamer Parser, JSON Schema, synthetische Testdaten und CLI können ohne Rust-Build oder heruntergeladene Modelle verbessert werden. Füge bei Formatfehlern einen synthetischen fehlschlagenden Testfall hinzu. Native Audio-/Anbieteränderungen erfordern weiterhin die bestehenden Plattformprüfungen.
