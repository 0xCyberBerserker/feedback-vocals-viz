# Changelog / Registro de cambios

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Los cambios relevantes se documentan aquí siguiendo Keep a Changelog y SemVer.

## Unreleased

### Documentation / Documentación

- Explicitly credit Taynavv as the creator of the original Karaoke Highway plugin.
- Se acredita explícitamente a Taynavv como creador del plugin Karaoke Highway original.
- Label concept artwork, inherited upstream captures, synthetic evidence, and pending live acceptance explicitly.
- Distinguish end-of-song aggregation from the user-triggered export step.
- Document phrase derivation and replace the misleading heap-memory estimate with serialized UTF-8 size.
- Se distinguen el arte conceptual, las capturas heredadas, la evidencia sintética y la aceptación live pendiente.

## 0.5.0 - 2026-09-12

### Added / Añadido

- Bounded realtime telemetry collection using the existing YIN and microphone pipeline.
- Objective pitch, timing, sustain, dynamics, range, tessitura, phrase, section, and session metrics.
- Deterministic confidence-aware frame classification without ML or subjective interpretation.
- Local schema-v1 JSON/CSV ZIP export and a content-free synthetic example.
- Configurable confidence, silence, and contour-resolution settings.
- Deterministic analytics, aggregation, serialization, Unicode, ZIP, and CSV-safety tests.
- Collector acotado sobre la captura y el detector YIN existentes.
- Métricas objetivas de afinación, timing, sustain, dinámica, rango, tesitura y agregación.
- Clasificación determinista sensible a confidence, sin ML ni interpretación subjetiva.
- Exportación ZIP JSON/CSV local y ejemplo sintético sin contenido protegido.

### Security / Seguridad

- Analytics never leave the browser through an analytics API or telemetry service.
- Untrusted chart strings are neutralized against spreadsheet formula injection.
- Export filenames, file count, and total payload size are validated.
- La analítica no sale del navegador y los datos no confiables del chart se neutralizan antes de exportar CSV.
