# Objective vocal analytics / Analítica vocal objetiva

## English

Schema v1 separates raw telemetry, derived metrics, and external interpretation. Karaoke Highway supplies only the first two. It makes no coaching, diagnostic, subjective, cloud, or AI calls.

```text
browser getUserMedia -> ScriptProcessor(2048) -> bounded sample ring --+
desktop JUCE bridge -> getRawAudioFrame polling -----------------------+
                                                                      v
panel-local time - midpoint latency - device latency - mic offset -> processYinFrame
                                                                      |
                                existing YIN {freq, confidence} -------+
                                      |                 |
                                      v                 v
                       existing trace/scoring      compact collector
                                                        |
                                                        v
                           post-session aggregation -> explicit Export -> local ZIP
```

### Classification

- `PITCHED`: charted vocal unit, audible RMS, valid F0, confidence at or above the configured threshold.
- `HARSH_LOW_CONFIDENCE`: charted audible unit with an F0 estimate below that threshold. Retained, but excluded from strict pitch metrics.
- `UNPITCHED`: charted audible unit without a valid F0.
- `SILENCE`: RMS below the configured threshold.
- `UNKNOWN`: audible frame outside a charted vocal unit.

YIN confidence measures estimator clarity, not singing quality. YIN exposes no separate voiced probability here, so `voiced_probability` is `null`.

### Methods

- Pitch error: `1200 * log2(detected_hz / target_hz)` cents. Positive is sharp; negative is flat.
- Strict pitch metrics and ±10/25/50/100-cent bands use only `PITCHED` frames.
- Reliable range is P05-P95 and effective tessitura is P10-P90 of reliable detected MIDI. Raw outliers remain in `pitch-contour.csv`.
- Onset/offset are RMS-gated estimates in the configured timing window. Positive is late; negative is early. Precision is limited by `contour_interval_ms`.
- Sustain uses the 10%-90% interior of notes at least 700 ms long, split into early/middle/late thirds. Drift is late median minus early median.
- Steadiness reuses `clamp(1 - pitch_stddev_cents / 60, 0, 1)` over the existing one-second window.
- Vibrato reuses the existing detrended zero-crossing estimate over about 1.6 seconds, gated to 3-9 Hz and at least 18 cents peak modulation. Rate and extent are coarse; confidence is unavailable.
- Dynamics are linear PCM RMS and peak. Dynamic range is `20 * log10(P95 RMS / P10 RMS)` over non-silent frames, not LUFS.
- Schema v1 applies no octave/subharmonic normalization. Raw and normalized frequencies are equal and `normalization_applied` is false.
- Phrases follow lyric-line `+` markers. If the chart has none, gaps longer than 1.2 seconds split phrases. Sections come only from chart section data.
- `approximate_serialized_utf8_bytes` measures the UTF-8 JSON representation of collected frames, not JavaScript heap usage.

```text
<artist> - <title> - <timestamp>/
  session.json
  notes.csv
  phrases.csv
  sections.csv
  pitch-contour.csv
  README.txt
```

Missing measurements are empty in CSV and `null` in JSON. `vocal.ogg` is absent because the plugin does not record microphone audio. At 50 ms, ten minutes produce about 12,000 compact frames. Collection is capped at 36,000 frames and reports later drops.

## Español

El esquema v1 separa telemetría raw, métricas derivadas e interpretación externa. Karaoke Highway sólo proporciona las dos primeras. No realiza coaching, diagnóstico, interpretación subjetiva, llamadas cloud ni IA.

```text
captura browser o bridge JUCE -> reloj compensado -> YIN existente
                                                     |          |
                                                     v          v
                                          scoring/trace   collector compacto
                                                               |
                                                               v
                                  agregación post-sesión -> Export explícito -> ZIP local
```

### Clasificación

- `PITCHED`: unidad vocal del chart, RMS audible, F0 válido y confianza igual o superior al umbral.
- `HARSH_LOW_CONFIDENCE`: unidad audible con F0 inferior al umbral. Se conserva, pero no participa en métricas estrictas.
- `UNPITCHED`: unidad audible sin F0 válido.
- `SILENCE`: RMS inferior al umbral configurado.
- `UNKNOWN`: frame audible fuera de una unidad vocal del chart.

La confianza YIN mide claridad del estimador, no calidad del canto. No existe una probabilidad de voz separada, por lo que `voiced_probability` vale `null`.

### Métodos

- Error: `1200 * log2(hz_detectados / hz_objetivo)` cents. Positivo significa agudo; negativo, grave.
- Las métricas estrictas y bandas ±10/25/50/100 usan sólo `PITCHED`.
- Rango fiable: P05-P95. Tesitura efectiva: P10-P90 de MIDI fiable. Los outliers raw permanecen en `pitch-contour.csv`.
- Onset/offset se estiman por RMS dentro de la ventana configurada. Positivo significa tarde; negativo, pronto. La precisión depende de `contour_interval_ms`.
- Sustain usa el interior 10%-90% de notas de al menos 700 ms dividido en tercios. Drift es la mediana late menos early.
- Steadiness y vibrato reutilizan los cálculos realtime existentes descritos arriba; no se inventa confidence de vibrato.
- Dinámica usa RMS PCM lineal y peak; no es LUFS.
- El esquema v1 no normaliza octavas ni subarmónicos: raw y normalized coinciden.
- Las frases siguen marcadores `+` de línea; sin ellos, gaps mayores de 1,2 segundos separan frases. Las secciones proceden sólo del chart.
- `approximate_serialized_utf8_bytes` mide el JSON UTF-8 de los frames, no el heap JavaScript real.

Los archivos son los mostrados arriba. Los datos no disponibles quedan vacíos en CSV y como `null` en JSON. No se incluye `vocal.ogg` porque el plugin no graba el micrófono. A 50 ms, diez minutos producen unos 12.000 frames compactos; el límite es 36.000 y los descartes posteriores quedan registrados.
