Karaoke Highway objective vocal analytics / Analítica vocal objetiva

Schema / Esquema: feedback-vocals-viz-analytics v1
Plugin version / Versión: 0.5.0
Detector: YIN (existing Karaoke Highway detector / detector existente).
Reliable pitch threshold / Umbral fiable: confidence >= 0.8.
Silence threshold / Umbral de silencio: RMS < 0.01.
Pitch units are cents. Positive = sharp; negative = flat.
El tono usa cents. Positivo = agudo; negativo = grave.
Timing uses milliseconds. Positive = late; negative = early.
El timing usa milisegundos. Positivo = tarde; negativo = pronto.
PITCHED frames alone feed strict pitch metrics. Low-confidence, unpitched and silence frames remain in pitch-contour.csv.
Sólo PITCHED alimenta métricas estrictas. Baja confianza, sin tono y silencio permanecen en pitch-contour.csv.
Range uses P05-P95 and effective tessitura uses P10-P90 of reliable detected MIDI samples.
El rango usa P05-P95 y la tesitura efectiva P10-P90 de muestras MIDI fiables.
No octave/subharmonic normalization is applied in schema v1; raw and normalized frequencies are identical.
El esquema v1 no normaliza octavas/subarmónicos; las frecuencias raw y normalized son iguales.
Contour resolution / Resolución: 50 ms.
Onset/offset are RMS-gated estimates within the configured timing window and are limited by contour resolution.
Onset/offset se estiman por RMS dentro de la ventana configurada y están limitados por la resolución.
Vibrato and steadiness are existing realtime plugin estimates; unavailable values are empty/null.
Vibrato y steadiness proceden del plugin existente; los valores no disponibles son vacíos/null.
This bundle contains measurements, not coaching, diagnosis, or subjective interpretation.
Este bundle contiene medidas, no coaching, diagnóstico ni interpretación subjetiva.
Chart / Chart: synthetic-objective-v1
