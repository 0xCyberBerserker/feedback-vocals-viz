/* Objective vocal analytics for Karaoke Highway.
 *
 * This module consumes telemetry produced by the existing microphone/YIN path.
 * It does not capture audio, detect pitch, or interpret vocal technique.
 * CommonJS + browser-global wrapper keeps it directly testable with node:test.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.VocalsAnalytics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA = 'feedback-vocals-viz-analytics';
    const SCHEMA_VERSION = 1;
    const CLASSIFICATIONS = Object.freeze({
        PITCHED: 'PITCHED',
        UNPITCHED: 'UNPITCHED',
        HARSH_LOW_CONFIDENCE: 'HARSH_LOW_CONFIDENCE',
        SILENCE: 'SILENCE',
        UNKNOWN: 'UNKNOWN',
    });
    const DEFAULTS = Object.freeze({
        confidenceThreshold: 0.8,
        silenceRms: 0.01,
        contourIntervalMs: 50,
        maxFrames: 36000,
        timingWindowMs: 300,
        sustainMinMs: 700,
    });
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    const finite = (value) => typeof value === 'number' && Number.isFinite(value);
    const nullable = (value) => finite(value) ? value : null;
    const round = (value, digits = 6) => finite(value) ? +value.toFixed(digits) : null;
    const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

    function midiToFrequency(midi) {
        return finite(midi) ? 440 * Math.pow(2, (midi - 69) / 12) : null;
    }

    function frequencyToMidi(frequency) {
        return finite(frequency) && frequency > 0 ? 69 + 12 * Math.log2(frequency / 440) : null;
    }

    function midiToName(midi) {
        if (!finite(midi)) return null;
        const rounded = Math.round(midi);
        const pitchClass = ((rounded % 12) + 12) % 12;
        return NOTE_NAMES[pitchClass] + (Math.floor(rounded / 12) - 1);
    }

    function centsError(detectedFrequency, targetFrequency) {
        if (!finite(detectedFrequency) || detectedFrequency <= 0
            || !finite(targetFrequency) || targetFrequency <= 0) return null;
        return 1200 * Math.log2(detectedFrequency / targetFrequency);
    }

    function mean(values) {
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    }

    function percentile(values, fraction) {
        if (!values.length) return null;
        const sorted = values.slice().sort((a, b) => a - b);
        const position = clamp(fraction, 0, 1) * (sorted.length - 1);
        const low = Math.floor(position);
        const high = Math.ceil(position);
        if (low === high) return sorted[low];
        return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
    }

    function standardDeviation(values) {
        if (!values.length) return null;
        const avg = mean(values);
        return Math.sqrt(mean(values.map((value) => Math.pow(value - avg, 2))));
    }

    function rootMeanSquare(values) {
        return values.length ? Math.sqrt(mean(values.map((value) => value * value))) : null;
    }

    function numeric(frames, key) {
        return frames.map((frame) => frame[key]).filter(finite);
    }

    function pitchMetrics(frames) {
        const errors = frames
            .filter((frame) => frame.classification === CLASSIFICATIONS.PITCHED)
            .map((frame) => frame.pitch_error_cents)
            .filter(finite);
        const absolute = errors.map(Math.abs);
        const within = (limit) => errors.length
            ? errors.filter((value) => Math.abs(value) <= limit).length / errors.length : null;
        return {
            sample_basis: 'reliable_pitched_frames',
            sample_count: errors.length,
            mean_pitch_error_cents: round(mean(errors)),
            median_pitch_error_cents: round(percentile(errors, 0.5)),
            mean_absolute_pitch_error_cents: round(mean(absolute)),
            median_absolute_pitch_error_cents: round(percentile(absolute, 0.5)),
            pitch_error_stddev_cents: round(standardDeviation(errors)),
            rms_pitch_error_cents: round(rootMeanSquare(errors)),
            within_10_cents: round(within(10)),
            within_25_cents: round(within(25)),
            within_50_cents: round(within(50)),
            within_100_cents: round(within(100)),
        };
    }

    function classificationMetrics(frames) {
        const targetFrames = frames.filter((frame) => frame.syllable_index !== null);
        const counts = {};
        Object.values(CLASSIFICATIONS).forEach((name) => { counts[name] = 0; });
        targetFrames.forEach((frame) => { counts[frame.classification] += 1; });
        const denominator = targetFrames.length;
        const ratio = (name) => denominator ? counts[name] / denominator : null;
        return {
            sample_basis: 'frames_during_charted_vocal_units',
            target_frames: denominator,
            valid_pitch_frames: counts.PITCHED,
            low_confidence_frames: counts.HARSH_LOW_CONFIDENCE,
            unpitched_frames: counts.UNPITCHED,
            silence_frames: counts.SILENCE,
            unknown_frames: counts.UNKNOWN,
            pitched_ratio: round(ratio(CLASSIFICATIONS.PITCHED)),
            low_confidence_ratio: round(ratio(CLASSIFICATIONS.HARSH_LOW_CONFIDENCE)),
            unpitched_ratio: round(ratio(CLASSIFICATIONS.UNPITCHED)),
            silence_ratio: round(ratio(CLASSIFICATIONS.SILENCE)),
            unknown_ratio: round(ratio(CLASSIFICATIONS.UNKNOWN)),
            outside_target_frames: frames.length - denominator,
        };
    }

    function pitchPoint(midi) {
        if (!finite(midi)) return null;
        return {
            midi: round(midi),
            note_name: midiToName(midi),
            frequency_hz: round(midiToFrequency(midi)),
        };
    }

    function rangeMetrics(frames) {
        const midis = frames
            .filter((frame) => frame.classification === CLASSIFICATIONS.PITCHED)
            .map((frame) => frame.detected_midi)
            .filter(finite);
        if (!midis.length) return {
            method: 'reliable pitched frames; P05-P95 robust range; P10-P90 effective tessitura',
            observed_low: null, observed_high: null,
            lowest_reliable_pitch: null, highest_reliable_pitch: null,
            pitch_p05: null, pitch_p10: null, pitch_p25: null, pitch_median: null,
            pitch_p75: null, pitch_p90: null, pitch_p95: null,
            effective_tessitura_low: null, effective_tessitura_high: null,
        };
        const p05 = percentile(midis, 0.05);
        const p10 = percentile(midis, 0.10);
        const p25 = percentile(midis, 0.25);
        const p50 = percentile(midis, 0.50);
        const p75 = percentile(midis, 0.75);
        const p90 = percentile(midis, 0.90);
        const p95 = percentile(midis, 0.95);
        return {
            method: 'reliable pitched frames; P05-P95 robust range; P10-P90 effective tessitura',
            observed_low: pitchPoint(Math.min(...midis)),
            observed_high: pitchPoint(Math.max(...midis)),
            lowest_reliable_pitch: pitchPoint(p05),
            highest_reliable_pitch: pitchPoint(p95),
            pitch_p05: pitchPoint(p05),
            pitch_p10: pitchPoint(p10),
            pitch_p25: pitchPoint(p25),
            pitch_median: pitchPoint(p50),
            pitch_p75: pitchPoint(p75),
            pitch_p90: pitchPoint(p90),
            pitch_p95: pitchPoint(p95),
            effective_tessitura_low: pitchPoint(p10),
            effective_tessitura_high: pitchPoint(p90),
        };
    }

    function dynamicsMetrics(frames, silenceRms) {
        const rms = numeric(frames, 'rms');
        const peaks = numeric(frames, 'peak');
        const audible = rms.filter((value) => value >= silenceRms);
        const low = percentile(audible, 0.10);
        const high = percentile(audible, 0.95);
        const dynamicRange = finite(low) && low > 0 && finite(high) && high > 0
            ? 20 * Math.log10(high / low) : null;
        return {
            rms_mean: round(mean(rms)),
            rms_median: round(percentile(rms, 0.5)),
            rms_p95: round(percentile(rms, 0.95)),
            peak_amplitude: peaks.length ? round(Math.max(...peaks)) : null,
            dynamic_range_db: round(dynamicRange),
        };
    }

    function buildPhrases(tokens) {
        if (!Array.isArray(tokens) || !tokens.length) return [];
        const hasBreaks = tokens.some((token) => String(token.w || '').endsWith('+'));
        const groups = [];
        let current = [];
        let lastEnd = -Infinity;
        tokens.forEach((token, index) => {
            if (current.length && !hasBreaks && token.t - lastEnd > 1.2) {
                groups.push(current);
                current = [];
            }
            current.push(index);
            lastEnd = token.t + (token.d || 0);
            if (String(token.w || '').endsWith('+')) {
                groups.push(current);
                current = [];
            }
        });
        if (current.length) groups.push(current);
        return groups.map((indices, index) => {
            let lyrics = '';
            indices.forEach((tokenIndex) => {
                const raw = String(tokens[tokenIndex].w || '');
                const joins = raw.endsWith('-');
                const text = raw.replace(/[+-]$/, '');
                lyrics += text + (joins ? '' : ' ');
            });
            const first = tokens[indices[0]];
            const last = tokens[indices[indices.length - 1]];
            return {
                index,
                lyrics: lyrics.trim(),
                start_ms: Math.round(first.t * 1000),
                end_ms: Math.round((last.t + (last.d || 0)) * 1000),
                token_indices: indices,
            };
        });
    }

    function normalizeSections(sections, durationMs) {
        if (!Array.isArray(sections)) return [];
        const normalized = sections.map((section) => {
            const seconds = finite(section && section.time) ? section.time
                : finite(section && section.t) ? section.t : null;
            if (!finite(seconds)) return null;
            const name = String((section && section.name) || '').trim();
            return { name: name || null, start_ms: Math.round(seconds * 1000) };
        }).filter(Boolean).sort((a, b) => a.start_ms - b.start_ms);
        return normalized.map((section, index) => ({
            index,
            name: section.name,
            start_ms: section.start_ms,
            end_ms: index + 1 < normalized.length ? normalized[index + 1].start_ms : durationMs,
        })).filter((section) => finite(section.end_ms) && section.end_ms > section.start_ms);
    }

    function indexAtTime(items, timestampMs) {
        let result = null;
        for (const item of items) {
            if (timestampMs >= item.start_ms && timestampMs < item.end_ms) result = item.index;
            if (item.start_ms > timestampMs) break;
        }
        return result;
    }

    function classifyFrame(frame, options) {
        if (!finite(frame.rms) || frame.rms < options.silenceRms) return CLASSIFICATIONS.SILENCE;
        const hasPitch = frame.pitchValid !== false
            && finite(frame.rawFrequencyHz) && frame.rawFrequencyHz > 0;
        if (frame.targetActive) {
            if (hasPitch && finite(frame.confidence) && frame.confidence >= options.confidenceThreshold) {
                return CLASSIFICATIONS.PITCHED;
            }
            if (hasPitch && finite(frame.confidence) && frame.confidence < options.confidenceThreshold) {
                return CLASSIFICATIONS.HARSH_LOW_CONFIDENCE;
            }
            return CLASSIFICATIONS.UNPITCHED;
        }
        return CLASSIFICATIONS.UNKNOWN;
    }

    function timingBounds(tokens, index, options) {
        const token = tokens[index];
        const start = token.t * 1000;
        const end = (token.t + token.d) * 1000;
        let low = start - options.timingWindowMs;
        let high = end + options.timingWindowMs;
        if (index > 0) {
            const previousEnd = (tokens[index - 1].t + tokens[index - 1].d) * 1000;
            low = Math.max(low, (previousEnd + start) / 2);
        }
        if (index + 1 < tokens.length) {
            const nextStart = tokens[index + 1].t * 1000;
            high = Math.min(high, (end + nextStart) / 2);
        }
        return { low, high, start, end };
    }

    function sustainMetrics(reliable, token, options) {
        const durationMs = token.d * 1000;
        if (durationMs < options.sustainMinMs || reliable.length < 6) {
            return {
                early_pitch_error_cents: null,
                middle_pitch_error_cents: null,
                late_pitch_error_cents: null,
                pitch_drift_cents: null,
                pitch_slope_cents_per_second: null,
            };
        }
        const startMs = token.t * 1000;
        const interior = reliable.filter((frame) => {
            const position = (frame.timestamp_ms - startMs) / durationMs;
            return position >= 0.10 && position <= 0.90;
        });
        const thirds = [[], [], []];
        interior.forEach((frame) => {
            const position = (frame.timestamp_ms - startMs) / durationMs;
            const bucket = position < 0.3667 ? 0 : position < 0.6333 ? 1 : 2;
            thirds[bucket].push(frame.pitch_error_cents);
        });
        const early = percentile(thirds[0].filter(finite), 0.5);
        const middle = percentile(thirds[1].filter(finite), 0.5);
        const late = percentile(thirds[2].filter(finite), 0.5);
        let slope = null;
        if (interior.length >= 3) {
            const xs = interior.map((frame) => frame.timestamp_ms / 1000);
            const ys = interior.map((frame) => frame.pitch_error_cents);
            const xMean = mean(xs);
            const yMean = mean(ys);
            let numerator = 0;
            let denominator = 0;
            for (let i = 0; i < xs.length; i++) {
                numerator += (xs[i] - xMean) * (ys[i] - yMean);
                denominator += Math.pow(xs[i] - xMean, 2);
            }
            if (denominator > 0) slope = numerator / denominator;
        }
        return {
            early_pitch_error_cents: round(early),
            middle_pitch_error_cents: round(middle),
            late_pitch_error_cents: round(late),
            pitch_drift_cents: finite(early) && finite(late) ? round(late - early) : null,
            pitch_slope_cents_per_second: round(slope),
        };
    }

    function noteMetrics(tokens, frames, options, pluginResults, phrases, sections) {
        return tokens.map((token, index) => {
            if (!finite(token.midi)) return null;
            const direct = frames.filter((frame) => frame.syllable_index === index);
            const reliable = direct.filter((frame) => frame.classification === CLASSIFICATIONS.PITCHED);
            const bounds = timingBounds(tokens, index, options);
            const audible = frames.filter((frame) => frame.timestamp_ms >= bounds.low
                && frame.timestamp_ms <= bounds.high && finite(frame.rms) && frame.rms >= options.silenceRms);
            const first = audible.length ? audible[0].timestamp_ms : null;
            const last = audible.length ? audible[audible.length - 1].timestamp_ms : null;
            const frequencies = numeric(reliable, 'normalized_frequency_hz');
            const detectedMidis = numeric(reliable, 'detected_midi');
            const confidences = numeric(direct, 'confidence');
            const pluginResult = pluginResults && pluginResults[index];
            const steadiness = numeric(reliable, 'steadiness');
            const vibratoRate = numeric(reliable, 'vibrato_rate_hz');
            const vibratoExtent = numeric(reliable, 'vibrato_extent_cents');
            const pitch = pitchMetrics(reliable);
            return {
                index,
                lyrics: String(token.w || '').replace(/[+-]$/, ''),
                syllable: String(token.w || ''),
                phrase_index: (() => {
                    const phrase = phrases.find((item) => item.token_indices.includes(index));
                    return phrase ? phrase.index : null;
                })(),
                section_index: indexAtTime(sections, Math.round(token.t * 1000)),
                target: {
                    pitch_name: midiToName(token.midi),
                    midi: nullable(token.midi),
                    frequency_hz: round(midiToFrequency(token.midi)),
                    start_ms: Math.round(token.t * 1000),
                    end_ms: Math.round((token.t + token.d) * 1000),
                    duration_ms: Math.round(token.d * 1000),
                },
                performance: {
                    mean_frequency_hz: round(mean(frequencies)),
                    median_frequency_hz: round(percentile(frequencies, 0.5)),
                    detected_note: midiToName(percentile(detectedMidis, 0.5)),
                    mean_confidence: round(mean(confidences)),
                },
                pitch,
                timing: {
                    sign_convention: 'positive=late; negative=early',
                    onset_error_ms: finite(first) ? round(first - bounds.start, 3) : null,
                    offset_error_ms: finite(last) ? round(last - bounds.end, 3) : null,
                    target_duration_ms: Math.round(token.d * 1000),
                    performed_duration_ms: finite(first) && finite(last) ? round(last - first, 3) : null,
                    duration_error_ms: finite(first) && finite(last)
                        ? round((last - first) - token.d * 1000, 3) : null,
                },
                sustain: sustainMetrics(reliable, token, options),
                existing_metrics: {
                    plugin_score: pluginResult && finite(pluginResult.accuracy)
                        ? round(pluginResult.accuracy) : null,
                    steadiness: round(percentile(steadiness, 0.5)),
                    vibrato_rate_hz: round(percentile(vibratoRate, 0.5)),
                    vibrato_extent_cents: round(percentile(vibratoExtent, 0.5)),
                    vibrato_confidence: null,
                },
                classification: classificationMetrics(direct),
                dynamics: dynamicsMetrics(direct, options.silenceRms),
            };
        }).filter(Boolean);
    }

    function aggregateGroup(group, notes, frames, options, kind) {
        const selectedFrames = frames.filter((frame) => frame[`${kind}_index`] === group.index);
        const selectedNotes = notes.filter((note) => note[`${kind}_index`] === group.index);
        const onsets = selectedNotes.map((note) => note.timing.onset_error_ms).filter(finite);
        const offsets = selectedNotes.map((note) => note.timing.offset_error_ms).filter(finite);
        const range = rangeMetrics(selectedFrames);
        return {
            index: group.index,
            name: group.name || null,
            lyrics: group.lyrics || null,
            start_ms: group.start_ms,
            end_ms: group.end_ms,
            note_count: selectedNotes.length,
            pitch: pitchMetrics(selectedFrames),
            timing: {
                mean_onset_error_ms: round(mean(onsets)),
                mean_offset_error_ms: round(mean(offsets)),
            },
            range: {
                low: range.lowest_reliable_pitch,
                high: range.highest_reliable_pitch,
                median: range.pitch_median,
            },
            classification: classificationMetrics(selectedFrames),
            dynamics: dynamicsMetrics(selectedFrames, options.silenceRms),
        };
    }

    function analyzeSession(input) {
        const options = Object.assign({}, DEFAULTS, input.options || {});
        const tokens = (input.tokens || []).filter((token) => finite(token.t)
            && finite(token.d) && token.d > 0);
        const frames = (input.frames || []).slice().sort((a, b) => a.timestamp_ms - b.timestamp_ms);
        const durationMs = finite(input.durationMs) ? input.durationMs
            : tokens.length ? Math.round(Math.max(...tokens.map((token) => token.t + token.d)) * 1000) : 0;
        const phrases = input.phrases || buildPhrases(tokens);
        const sections = normalizeSections(input.sections || [], durationMs);
        const notes = noteMetrics(tokens, frames, options, input.pluginResults || null, phrases, sections);
        const phraseRows = phrases.map((phrase) => aggregateGroup(phrase, notes, frames, options, 'phrase'));
        const sectionRows = sections.map((section) => aggregateGroup(section, notes, frames, options, 'section'));
        const timingNotes = notes.filter((note) => finite(note.timing.onset_error_ms));
        const onsetErrors = timingNotes.map((note) => note.timing.onset_error_ms);
        const offsetErrors = notes.map((note) => note.timing.offset_error_ms).filter(finite);
        const metadata = input.metadata || {};
        return {
            schema: SCHEMA,
            schema_version: SCHEMA_VERSION,
            generated_at: input.endedAt || new Date().toISOString(),
            plugin: {
                id: 'vocals_highway',
                version: metadata.pluginVersion || null,
                detector: 'YIN',
                local_only: true,
            },
            song: metadata.song || {},
            voice: metadata.voice || {},
            settings: {
                confidence_threshold: options.confidenceThreshold,
                silence_rms_threshold: options.silenceRms,
                contour_interval_ms: options.contourIntervalMs,
                timing_window_ms: options.timingWindowMs,
                sustain_minimum_ms: options.sustainMinMs,
                octave_normalization: 'none',
            },
            collection: {
                frame_count: frames.length,
                dropped_by_capacity: input.droppedFrames || 0,
                approximate_serialized_utf8_bytes: new TextEncoder().encode(JSON.stringify(frames)).length,
            },
            summary: {
                pitch: pitchMetrics(frames),
                timing: {
                    sign_convention: 'positive=late; negative=early',
                    note_count: timingNotes.length,
                    mean_onset_error_ms: round(mean(onsetErrors)),
                    median_onset_error_ms: round(percentile(onsetErrors, 0.5)),
                    mean_offset_error_ms: round(mean(offsetErrors)),
                    median_offset_error_ms: round(percentile(offsetErrors, 0.5)),
                },
                range: rangeMetrics(frames),
                classification: classificationMetrics(frames),
                dynamics: dynamicsMetrics(frames, options.silenceRms),
            },
            notes,
            phrases: phraseRows,
            sections: sectionRows,
            pitch_contour: frames,
        };
    }

    class TelemetryCollector {
        constructor(input) {
            const config = input || {};
            this.options = Object.assign({}, DEFAULTS, config.options || {});
            this.metadata = config.metadata || {};
            this.tokens = Array.isArray(config.tokens) ? config.tokens : [];
            this.phrases = buildPhrases(this.tokens);
            this.tokenPhraseIndices = new Map();
            this.phrases.forEach((phrase) => {
                phrase.token_indices.forEach((tokenIndex) => this.tokenPhraseIndices.set(tokenIndex, phrase.index));
            });
            const durationMs = this.tokens.length
                ? Math.round(Math.max(...this.tokens.map((token) => token.t + token.d)) * 1000) : 0;
            this.sections = normalizeSections(config.sections || [], durationMs);
            this.frames = [];
            this.lastTimestampMs = -Infinity;
            this.droppedFrames = 0;
            this.startedAt = config.startedAt || new Date().toISOString();
        }

        addFrame(input) {
            const timestampMs = Math.round(input.timestampSeconds * 1000);
            if (!finite(timestampMs) || timestampMs < 0) return false;
            if (timestampMs - this.lastTimestampMs < this.options.contourIntervalMs) return false;
            if (this.frames.length >= this.options.maxFrames) {
                this.droppedFrames += 1;
                return false;
            }
            const syllableIndex = Number.isInteger(input.syllableIndex) ? input.syllableIndex : null;
            const token = syllableIndex !== null ? this.tokens[syllableIndex] : null;
            const targetMidi = token && finite(token.midi) ? token.midi : null;
            const targetFrequency = midiToFrequency(targetMidi);
            const rawFrequency = finite(input.rawFrequencyHz) && input.rawFrequencyHz > 0
                ? input.rawFrequencyHz : null;
            // No octave/subharmonic correction is applied in schema v1. The raw
            // estimate is always retained so a future conservative normalizer
            // cannot erase evidence.
            const normalizedFrequency = rawFrequency;
            const detectedMidi = frequencyToMidi(normalizedFrequency);
            const classification = classifyFrame({
                rms: input.rms,
                rawFrequencyHz: rawFrequency,
                confidence: input.confidence,
                targetActive: !!token,
                pitchValid: input.pitchValid,
            }, this.options);
            const phraseIndex = syllableIndex === null ? indexAtTime(this.phrases, timestampMs)
                : this.tokenPhraseIndices.get(syllableIndex);
            const sectionIndex = indexAtTime(this.sections, timestampMs);
            this.frames.push({
                timestamp_ms: timestampMs,
                target_frequency_hz: round(targetFrequency),
                target_midi: nullable(targetMidi),
                target_note_name: midiToName(targetMidi),
                raw_frequency_hz: round(rawFrequency),
                normalized_frequency_hz: round(normalizedFrequency),
                normalization_applied: false,
                normalization_reason: null,
                detected_midi: round(detectedMidi),
                detected_note_name: midiToName(detectedMidi),
                pitch_error_cents: round(centsError(normalizedFrequency, targetFrequency)),
                absolute_pitch_error_cents: (() => {
                    const error = centsError(normalizedFrequency, targetFrequency);
                    return finite(error) ? round(Math.abs(error)) : null;
                })(),
                confidence: round(input.confidence),
                voiced_probability: null,
                rms: round(input.rms),
                peak: round(input.peak),
                syllable_index: syllableIndex,
                phrase_index: Number.isInteger(phraseIndex) ? phraseIndex : null,
                section_index: sectionIndex,
                classification,
                steadiness: round(input.steadiness),
                vibrato_rate_hz: round(input.vibratoRateHz),
                vibrato_extent_cents: round(input.vibratoExtentCents),
            });
            this.lastTimestampMs = timestampMs;
            return true;
        }

        finish(extra) {
            const details = extra || {};
            return analyzeSession({
                options: this.options,
                metadata: this.metadata,
                tokens: this.tokens,
                phrases: this.phrases,
                sections: this.sections.map((section) => ({
                    time: section.start_ms / 1000,
                    name: section.name,
                })),
                frames: this.frames,
                droppedFrames: this.droppedFrames,
                pluginResults: details.pluginResults || null,
                durationMs: details.durationMs,
                endedAt: details.endedAt,
            });
        }
    }

    function csvEscape(value) {
        if (value === null || value === undefined) return '';
        let text = String(value);
        // Treat chart text as untrusted when an analyst opens CSV in a spreadsheet.
        // Numeric metric values remain numeric; only string cells can be prefixed.
        if (typeof value === 'string' && /^[\x00-\x20]*[=+@-]/.test(text)) text = `'${text}`;
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function csv(columns, rows) {
        const lines = [columns.join(',')];
        rows.forEach((row) => lines.push(columns.map((column) => csvEscape(row[column])).join(',')));
        return lines.join('\n') + '\n';
    }

    function buildExportFiles(analysis) {
        const notes = analysis.notes.map((note) => ({
            index: note.index,
            lyrics: note.lyrics,
            syllable: note.syllable,
            phrase_index: note.phrase_index,
            section_index: note.section_index,
            target_pitch_name: note.target.pitch_name,
            target_midi: note.target.midi,
            target_frequency_hz: note.target.frequency_hz,
            target_start_ms: note.target.start_ms,
            target_end_ms: note.target.end_ms,
            target_duration_ms: note.target.duration_ms,
            mean_frequency_hz: note.performance.mean_frequency_hz,
            median_frequency_hz: note.performance.median_frequency_hz,
            detected_note: note.performance.detected_note,
            mean_confidence: note.performance.mean_confidence,
            mean_pitch_error_cents: note.pitch.mean_pitch_error_cents,
            mean_absolute_pitch_error_cents: note.pitch.mean_absolute_pitch_error_cents,
            pitch_stddev_cents: note.pitch.pitch_error_stddev_cents,
            onset_error_ms: note.timing.onset_error_ms,
            offset_error_ms: note.timing.offset_error_ms,
            performed_duration_ms: note.timing.performed_duration_ms,
            duration_error_ms: note.timing.duration_error_ms,
            early_pitch_error_cents: note.sustain.early_pitch_error_cents,
            middle_pitch_error_cents: note.sustain.middle_pitch_error_cents,
            late_pitch_error_cents: note.sustain.late_pitch_error_cents,
            pitch_drift_cents: note.sustain.pitch_drift_cents,
            pitch_slope_cents_per_second: note.sustain.pitch_slope_cents_per_second,
            plugin_score: note.existing_metrics.plugin_score,
            steadiness: note.existing_metrics.steadiness,
            vibrato_rate_hz: note.existing_metrics.vibrato_rate_hz,
            vibrato_extent_cents: note.existing_metrics.vibrato_extent_cents,
            pitched_ratio: note.classification.pitched_ratio,
            low_confidence_ratio: note.classification.low_confidence_ratio,
            rms_mean: note.dynamics.rms_mean,
            peak_amplitude: note.dynamics.peak_amplitude,
        }));
        const groupRows = (groups) => groups.map((group) => ({
            index: group.index,
            name: group.name,
            lyrics: group.lyrics,
            start_ms: group.start_ms,
            end_ms: group.end_ms,
            note_count: group.note_count,
            mean_absolute_pitch_error_cents: group.pitch.mean_absolute_pitch_error_cents,
            median_absolute_pitch_error_cents: group.pitch.median_absolute_pitch_error_cents,
            pitch_stddev_cents: group.pitch.pitch_error_stddev_cents,
            within_10_cents: group.pitch.within_10_cents,
            within_25_cents: group.pitch.within_25_cents,
            within_50_cents: group.pitch.within_50_cents,
            mean_onset_error_ms: group.timing.mean_onset_error_ms,
            mean_offset_error_ms: group.timing.mean_offset_error_ms,
            range_low: group.range.low && group.range.low.note_name,
            range_high: group.range.high && group.range.high.note_name,
            range_median: group.range.median && group.range.median.note_name,
            pitched_ratio: group.classification.pitched_ratio,
            low_confidence_ratio: group.classification.low_confidence_ratio,
            unpitched_ratio: group.classification.unpitched_ratio,
            silence_ratio: group.classification.silence_ratio,
            rms_mean: group.dynamics.rms_mean,
            peak_amplitude: group.dynamics.peak_amplitude,
        }));
        const contour = analysis.pitch_contour.map((frame) => ({
            timestamp_ms: frame.timestamp_ms,
            target_frequency_hz: frame.target_frequency_hz,
            target_midi: frame.target_midi,
            target_note_name: frame.target_note_name,
            raw_frequency_hz: frame.raw_frequency_hz,
            normalized_frequency_hz: frame.normalized_frequency_hz,
            normalization_applied: frame.normalization_applied,
            normalization_reason: frame.normalization_reason,
            detected_midi: frame.detected_midi,
            detected_note_name: frame.detected_note_name,
            pitch_error_cents: frame.pitch_error_cents,
            absolute_pitch_error_cents: frame.absolute_pitch_error_cents,
            confidence: frame.confidence,
            voiced_probability: frame.voiced_probability,
            classification: frame.classification,
            rms: frame.rms,
            peak: frame.peak,
            syllable_index: frame.syllable_index,
            phrase_index: frame.phrase_index,
            section_index: frame.section_index,
        }));
        const noteColumns = Object.keys(notes[0] || {
            index: '', lyrics: '', syllable: '', phrase_index: '', section_index: '',
        });
        const groupColumns = Object.keys(groupRows(analysis.phrases)[0] || {
            index: '', name: '', lyrics: '', start_ms: '', end_ms: '', note_count: '',
        });
        const contourColumns = Object.keys(contour[0] || {
            timestamp_ms: '', target_frequency_hz: '', target_midi: '', target_note_name: '',
            raw_frequency_hz: '', normalized_frequency_hz: '', normalization_applied: '',
            normalization_reason: '', detected_midi: '', detected_note_name: '', pitch_error_cents: '',
            absolute_pitch_error_cents: '', confidence: '', voiced_probability: '', classification: '',
            rms: '', peak: '', syllable_index: '', phrase_index: '', section_index: '',
        });
        const session = JSON.parse(JSON.stringify(analysis));
        delete session.notes;
        delete session.phrases;
        delete session.sections;
        delete session.pitch_contour;
        const readme = [
            'Karaoke Highway objective vocal analytics / Analítica vocal objetiva',
            '',
            `Schema / Esquema: ${SCHEMA} v${SCHEMA_VERSION}`,
            `Plugin version / Versión: ${analysis.plugin.version || 'unknown'}`,
            'Detector: YIN (existing Karaoke Highway detector / detector existente).',
            `Reliable pitch threshold / Umbral fiable: confidence >= ${analysis.settings.confidence_threshold}.`,
            `Silence threshold / Umbral de silencio: RMS < ${analysis.settings.silence_rms_threshold}.`,
            'Pitch units are cents. Positive = sharp; negative = flat.',
            'El tono usa cents. Positivo = agudo; negativo = grave.',
            'Timing uses milliseconds. Positive = late; negative = early.',
            'El timing usa milisegundos. Positivo = tarde; negativo = pronto.',
            'PITCHED frames alone feed strict pitch metrics. Low-confidence, unpitched and silence frames remain in pitch-contour.csv.',
            'Sólo PITCHED alimenta métricas estrictas. Baja confianza, sin tono y silencio permanecen en pitch-contour.csv.',
            'Range uses P05-P95 and effective tessitura uses P10-P90 of reliable detected MIDI samples.',
            'El rango usa P05-P95 y la tesitura efectiva P10-P90 de muestras MIDI fiables.',
            'No octave/subharmonic normalization is applied in schema v1; raw and normalized frequencies are identical.',
            'El esquema v1 no normaliza octavas/subarmónicos; las frecuencias raw y normalized son iguales.',
            `Contour resolution / Resolución: ${analysis.settings.contour_interval_ms} ms.`,
            'Onset/offset are RMS-gated estimates within the configured timing window and are limited by contour resolution.',
            'Onset/offset se estiman por RMS dentro de la ventana configurada y están limitados por la resolución.',
            'Vibrato and steadiness are existing realtime plugin estimates; unavailable values are empty/null.',
            'Vibrato y steadiness proceden del plugin existente; los valores no disponibles son vacíos/null.',
            'Phrases follow lyric-line + markers; when absent, gaps longer than 1.2 s split phrases. Sections come only from chart section data.',
            'Las frases siguen marcadores + de línea; si no existen, gaps mayores de 1,2 s separan frases. Las secciones proceden sólo del chart.',
            'This bundle contains measurements, not coaching, diagnosis, or subjective interpretation.',
            'Este bundle contiene medidas, no coaching, diagnóstico ni interpretación subjetiva.',
            `Chart / Chart: ${(analysis.song && analysis.song.chart_id) || 'unknown'}`,
        ].join('\n') + '\n';
        return {
            'session.json': JSON.stringify(session, null, 2) + '\n',
            'notes.csv': csv(noteColumns, notes),
            'phrases.csv': csv(groupColumns, groupRows(analysis.phrases)),
            'sections.csv': csv(groupColumns, groupRows(analysis.sections)),
            'pitch-contour.csv': csv(contourColumns, contour),
            'README.txt': readme,
        };
    }

    function crc32(bytes) {
        let crc = 0xffffffff;
        for (const byte of bytes) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++) {
                crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
            }
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    function zipDate(date) {
        const year = Math.max(1980, date.getFullYear());
        return {
            time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
            date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
        };
    }

    function concatBytes(parts) {
        const size = parts.reduce((sum, part) => sum + part.length, 0);
        const result = new Uint8Array(size);
        let offset = 0;
        for (const part of parts) { result.set(part, offset); offset += part.length; }
        return result;
    }

    function zipHeader(size) {
        const bytes = new Uint8Array(size);
        return { bytes, view: new DataView(bytes.buffer) };
    }

    // Dependency-free ZIP STORE writer. The browser receives one Blob locally;
    // no analytics payload is posted to the plugin backend or any other API.
    function createZipArchive(files, rootName, modifiedAt) {
        const encoder = new TextEncoder();
        const root = String(rootName || 'vocal-analysis')
            .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/^[ .]+|[ .]+$/g, '').slice(0, 140)
            || 'vocal-analysis';
        const entries = Object.entries(files || {});
        if (!entries.length || entries.length > 16) throw new Error('Invalid export file count');
        let total = 0;
        const stamp = zipDate(modifiedAt instanceof Date ? modifiedAt : new Date());
        const localParts = [];
        const centralParts = [];
        let localOffset = 0;
        for (const [fileName, text] of entries) {
            if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fileName) || typeof text !== 'string') {
                throw new Error('Invalid export file');
            }
            const name = encoder.encode(`${root}/${fileName}`);
            const data = encoder.encode(text);
            total += data.length;
            if (total > 32 * 1024 * 1024) throw new Error('Export exceeds 32 MiB');
            const checksum = crc32(data);
            const local = zipHeader(30);
            local.view.setUint32(0, 0x04034b50, true);
            local.view.setUint16(4, 20, true);
            local.view.setUint16(6, 0x0800, true);
            local.view.setUint16(8, 0, true);
            local.view.setUint16(10, stamp.time, true);
            local.view.setUint16(12, stamp.date, true);
            local.view.setUint32(14, checksum, true);
            local.view.setUint32(18, data.length, true);
            local.view.setUint32(22, data.length, true);
            local.view.setUint16(26, name.length, true);
            localParts.push(local.bytes, name, data);

            const central = zipHeader(46);
            central.view.setUint32(0, 0x02014b50, true);
            central.view.setUint16(4, 20, true);
            central.view.setUint16(6, 20, true);
            central.view.setUint16(8, 0x0800, true);
            central.view.setUint16(10, 0, true);
            central.view.setUint16(12, stamp.time, true);
            central.view.setUint16(14, stamp.date, true);
            central.view.setUint32(16, checksum, true);
            central.view.setUint32(20, data.length, true);
            central.view.setUint32(24, data.length, true);
            central.view.setUint16(28, name.length, true);
            central.view.setUint32(42, localOffset, true);
            centralParts.push(central.bytes, name);
            localOffset += local.bytes.length + name.length + data.length;
        }
        const centralBytes = concatBytes(centralParts);
        const end = zipHeader(22);
        end.view.setUint32(0, 0x06054b50, true);
        end.view.setUint16(8, entries.length, true);
        end.view.setUint16(10, entries.length, true);
        end.view.setUint32(12, centralBytes.length, true);
        end.view.setUint32(16, localOffset, true);
        return concatBytes([...localParts, centralBytes, end.bytes]);
    }

    return {
        SCHEMA,
        SCHEMA_VERSION,
        CLASSIFICATIONS,
        DEFAULTS,
        TelemetryCollector,
        analyzeSession,
        buildExportFiles,
        createZipArchive,
        buildPhrases,
        centsError,
        classifyFrame,
        frequencyToMidi,
        midiToFrequency,
        midiToName,
        percentile,
        pitchMetrics,
        rangeMetrics,
    };
});
