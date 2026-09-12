# Documentation evidence audit / Auditoría de evidencia documental

Audit date / Fecha: **2026-09-12**  
Implementation baseline / Base auditada: **`ae0527e`**

## English

This audit separates what the repository proves from what still requires a live singer,
microphone, and FeedBack runtime. Source consistency is not presented as runtime acceptance.

| Claim or asset | Evidence checked | Status |
|---|---|---|
| Original creator | GitHub fork parent and upstream repository ownership identify [Taynavv](https://github.com/Taynavv/feedback-vocals-viz). | Verified repository provenance |
| Gallery PNGs | All seven image blob IDs match upstream commit [`d83af3a`](https://github.com/Taynavv/feedback-vocals-viz/commit/d83af3a503cf5ac830a5e78b6149cd320638acc2). Visible labels, controls, score card, duet guides, tuner, voice panel, and countdown agree with that revision's `screen.js`. | Inherited upstream assets; original runtime sessions not independently reproduced |
| Analytics banner | `docs/analytics-banner.webp` was generated as concept artwork for this fork. | Concept artwork; not a screenshot |
| Synthetic export | `tools/build_synthetic_export.js` deterministically creates `examples/synthetic-vocal-analysis/`. | Synthetic evidence; not a real singer or recording |
| Existing microphone and F0 path | `screen.js` contains browser `getUserMedia`, Desktop `getRawAudioFrame`, one YIN implementation, compensated timestamps, and a 400-sample realtime pitch trace. | Verified from source |
| No duplicate detector | Analytics receives the existing YIN frequency/confidence result through the small `processYinFrame` hook. | Verified from source; analytics primitives are covered by Node tests |
| Confidence handling | `PITCHED` alone feeds strict pitch metrics; other classifications remain in contour telemetry. | Verified from source and deterministic tests |
| Metrics and serialization | Cents bands, signed/absolute statistics, percentile range/tessitura, timing signs, sustain direction, aggregation, Unicode CSV/JSON, ZIP CRC, and CSV formula neutralization have deterministic tests. | Automated tests pass; live accuracy not yet characterized |
| Collection size field | `approximate_serialized_utf8_bytes` encodes collected-frame JSON with `TextEncoder`; it does not claim to measure JavaScript heap. | Verified from source |
| Local analytics export | The analytics module has no network client. `screen.js` uses the existing local plugin-data GET for chart tokens; export uses an in-browser Blob download. | Verified from source |
| Core compatibility | Manifest validation, Python tests, Node tests, and three synthetic `.feedpak` validations pass against the inspected local core/spec checkout. | Automated compatibility evidence |
| Live microphone/UI acceptance | No reproducible v0.5 session with a physical singer and captured analytics UI/export has been recorded in this fork. | Pending |

The inherited gallery contains visible commercial song titles and short lyric fragments. The
repository does not ship the corresponding audio or chart bundles. No claim is made here about
the legal status of those inherited images.

## Español

Esta auditoría separa lo demostrado por el repositorio de lo que aún necesita cantante,
micrófono y ejecución real de FeedBack. La coherencia con el código no se presenta como
aceptación runtime.

| Claim o asset | Evidencia revisada | Estado |
|---|---|---|
| Creador original | El parent del fork y el repositorio upstream identifican a [Taynavv](https://github.com/Taynavv/feedback-vocals-viz). | Procedencia verificada |
| PNG de galería | Los siete blob IDs coinciden con el commit upstream `d83af3a`; controles, labels, score, duetos, tuner, panel vocal y countdown coinciden con su `screen.js`. | Assets upstream heredados; sesiones originales no reproducidas |
| Banner de analytics | `analytics-banner.webp` fue generado como arte conceptual para este fork. | Arte conceptual, no captura |
| Export sintético | El script genera determinísticamente `examples/synthetic-vocal-analysis/`. | Evidencia sintética, no cantante real |
| Captura y F0 | El código contiene `getUserMedia`, `getRawAudioFrame`, un único YIN, timestamps compensados y trace acotado. | Verificado en fuente |
| Reutilización DSP | Analytics consume frecuencia/confidence del YIN existente; no abre otra captura ni otro detector. | Verificado en fuente y tests |
| Confidence y métricas | Sólo `PITCHED` alimenta afinación estricta; cents, percentiles, timing, sustain, agregación y serialización tienen tests deterministas. | Tests automatizados; precisión live aún no caracterizada |
| Tamaño de colección | `approximate_serialized_utf8_bytes` mide JSON codificado con `TextEncoder`, no heap JavaScript. | Verificado en fuente |
| Export local | No existe cliente de red en analytics; el GET existente obtiene tokens locales y el ZIP se descarga mediante Blob. | Verificado en fuente |
| Compatibilidad | Pasan manifiesto, Python, Node y tres paquetes sintéticos contra el core/spec local inspeccionado. | Evidencia automatizada |
| Aceptación con micrófono/UI | No existe aún una sesión v0.5 reproducible con cantante físico y captura del resultado/export. | Pendiente |

La galería heredada contiene títulos comerciales y fragmentos breves de letras visibles. No se
incluyen sus audios ni charts. Esta auditoría no afirma nada sobre la situación jurídica de esas
imágenes heredadas.
