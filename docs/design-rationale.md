# Design rationale / Decisiones de diseño

## English

### Problem

Karaoke Highway already produced useful realtime vocal evidence, but most of it disappeared
when the song ended. An external analyst could see the final score or receive separately
recorded audio,
but could not reproduce how confidence, pitch error, timing, range, or sustain behaviour
changed throughout the performance.

Distorted and extreme vocals make this gap more important. A pitch detector can lose a clear
periodic fundamental during rasp, grit, screams, or growls. Treating every failed estimate as
bad intonation would produce a precise-looking but false conclusion.

### Decision

The extension adds a bounded telemetry collector beside the existing scoring path. It consumes
the existing YIN result, compensated timestamp, target token, RMS, peak, steadiness, and vibrato
estimate. It does not open another microphone, run another pitch detector, or alter the score.

The realtime path performs only lightweight measurements and appends compact frames at a
configurable interval. Aggregation runs when the song ends; JSON/CSV serialization and ZIP
creation run only after the user invokes the explicit Export action.

```text
existing microphone and YIN
          ↓
existing realtime telemetry
          ↓
bounded collector
          ↓
post-session metrics
          ↓
local documented export
          ↓
external human interpretation
```

### Evidence policy

- The raw F0 estimate is retained whenever YIN returns one; raw PCM is not retained.
- Only `PITCHED` frames above the confidence threshold feed strict pitch metrics.
- Low-confidence frames remain measurable classification evidence, not singing failures.
- Missing measurements remain `null` or empty; values are never synthesized for schema symmetry.
- Schema v1 does not correct octave or subharmonic estimates. Robust percentiles limit their
  influence while preserving the original observation.
- The plugin reports measurements, not coaching, diagnosis, or subjective conclusions.

### Reuse and compatibility

The implementation is an isolated module with small hooks in `screen.js`. It uses the current
FeedBack plugin asset and song-data contracts and requires no core modification. This keeps the
fork reviewable and makes future upstream rebases substantially smaller than a parallel vocal
engine would be.

`feedback-plugin-notedetect` informed field conventions such as signed timing and pitch errors,
but its guitar/bass detector was not copied. `feedback-plugin-practice` stores compact practice
history rather than frame telemetry, so analytics remain session-local instead of creating a
second global history subsystem.

### Security and privacy boundary

- No analytics HTTP endpoint, upload, cloud DSP, AI, or LLM integration.
- ZIP generation is client-side and rejects unexpected filenames or oversized payloads.
- CSV strings from chart metadata are neutralized against spreadsheet formula injection.
- Collection is bounded to 36,000 frames and reports capacity drops.
- Microphone audio is not retained. `vocal.ogg` is absent unless a future existing recorder can
  be referenced safely without duplicating capture.

## Español

### Problema

Karaoke Highway ya producía evidencia vocal útil en tiempo real, pero gran parte desaparecía al
terminar la canción. Un analista externo podía ver el score final o recibir audio grabado por
separado, pero no podía
reconstruir cómo evolucionaban la confianza, el error de afinación, el timing, el rango o el
comportamiento de los sostenidos.

Las voces distorsionadas y extremas agravan este problema. Un detector puede perder una
fundamental periódica clara durante rasp, grit, screams o growls. Convertir cada fallo de F0 en
un error de afinación produciría una conclusión aparentemente precisa, pero falsa.

### Decisión

La extensión añade un collector acotado junto al scoring existente. Consume el resultado YIN,
el timestamp compensado, el token objetivo, RMS, peak, steadiness y vibrato ya disponibles. No
abre otro micrófono, no ejecuta otro detector y no altera el score.

El camino realtime sólo realiza mediciones ligeras y añade frames compactos según un intervalo
configurable. La agregación sucede al terminar; JSON/CSV y el ZIP sólo se crean cuando el
usuario ejecuta la acción explícita Export.

### Política de evidencia

- Se conserva la estimación F0 raw cuando YIN devuelve una; no se conserva PCM raw.
- Sólo `PITCHED` por encima del umbral participa en métricas estrictas.
- La baja confianza queda como evidencia de clasificación, no como fallo del cantante.
- Las medidas ausentes son `null` o vacías; nunca se fabrican valores para completar el esquema.
- El schema v1 no corrige octavas ni subarmónicos. Los percentiles robustos limitan su impacto
  sin destruir la observación original.
- El plugin entrega medidas, no coaching, diagnóstico ni conclusiones subjetivas.

### Reutilización, seguridad y privacidad

La implementación está aislada y sólo añade hooks pequeños en `screen.js`; no modifica el core.
`notedetect` se utilizó como referencia de convenciones, no como DSP vocal, y `practice` no se
duplicó porque su historial resumido no almacena frames.

No existen endpoints de analytics, uploads, cloud DSP, IA ni LLM. El ZIP se genera en cliente,
los CSV neutralizan fórmulas procedentes de charts no confiables y la captura está limitada a
36.000 frames. El audio del micrófono no se conserva.
