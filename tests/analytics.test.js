'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CLASSIFICATIONS,
    TelemetryCollector,
    analyzeSession,
    buildExportFiles,
    centsError,
    createZipArchive,
    midiToFrequency,
    pitchMetrics,
    rangeMetrics,
} = require('../assets/analytics.js');

const close = (actual, expected, tolerance = 1e-6) => {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ~= ${expected}`);
};

test('cents are signed and exact across required bands', () => {
    close(centsError(440, 440), 0);
    for (const cents of [10, -10, 25, -25, 50, -50, 100, -100]) {
        const detected = 440 * Math.pow(2, cents / 1200);
        close(centsError(detected, 440), cents);
    }
});

test('absolute pitch error cannot cancel opposite signed errors', () => {
    const frames = [40, -40].map((error) => ({
        classification: CLASSIFICATIONS.PITCHED,
        pitch_error_cents: error,
    }));
    const metrics = pitchMetrics(frames);
    assert.equal(metrics.mean_pitch_error_cents, 0);
    assert.equal(metrics.mean_absolute_pitch_error_cents, 40);
    assert.equal(metrics.rms_pitch_error_cents, 40);
});

test('low-confidence and silence frames remain visible but do not affect strict pitch metrics', () => {
    const collector = new TelemetryCollector({
        tokens: [{ t: 0, d: 1, w: 'Test+', midi: 69 }],
        options: { confidenceThreshold: 0.8, silenceRms: 0.01, contourIntervalMs: 0 },
    });
    collector.addFrame({ timestampSeconds: 0.1, syllableIndex: 0, rawFrequencyHz: 440, confidence: 0.95, rms: 0.1, peak: 0.2 });
    collector.addFrame({ timestampSeconds: 0.2, syllableIndex: 0, rawFrequencyHz: 466.164, confidence: 0.4, rms: 0.1, peak: 0.2 });
    collector.addFrame({ timestampSeconds: 0.3, syllableIndex: 0, rawFrequencyHz: null, confidence: 0, rms: 0.001, peak: 0.002 });
    const analysis = collector.finish({ durationMs: 1000 });
    assert.deepEqual(analysis.pitch_contour.map((frame) => frame.classification), [
        'PITCHED', 'HARSH_LOW_CONFIDENCE', 'SILENCE',
    ]);
    assert.equal(analysis.summary.pitch.sample_count, 1);
    assert.equal(analysis.summary.pitch.mean_absolute_pitch_error_cents, 0);
    assert.equal(analysis.summary.classification.low_confidence_frames, 1);
});

test('one octave glitch does not redefine robust range or tessitura', () => {
    const frames = [];
    for (let i = 0; i < 100; i++) frames.push({ classification: 'PITCHED', detected_midi: 60 + (i % 5) * 0.1 });
    frames.push({ classification: 'PITCHED', detected_midi: 84 });
    const range = rangeMetrics(frames);
    assert.ok(range.highest_reliable_pitch.midi < 61);
    assert.ok(range.effective_tessitura_high.midi < 61);
    assert.equal(range.observed_high.note_name, 'C6');
});

test('tessitura percentiles use the documented linear P10-P90 method', () => {
    const frames = Array.from({ length: 101 }, (_, i) => ({ classification: 'PITCHED', detected_midi: i }));
    const range = rangeMetrics(frames);
    assert.equal(range.pitch_p05.midi, 5);
    assert.equal(range.effective_tessitura_low.midi, 10);
    assert.equal(range.pitch_median.midi, 50);
    assert.equal(range.effective_tessitura_high.midi, 90);
    assert.equal(range.pitch_p95.midi, 95);
});

function frame(timestampMs, errorCents, syllableIndex = 0, extra = {}) {
    const target = midiToFrequency(60);
    const frequency = target * Math.pow(2, errorCents / 1200);
    return {
        timestamp_ms: timestampMs,
        target_frequency_hz: target,
        target_midi: 60,
        normalized_frequency_hz: frequency,
        detected_midi: 60 + errorCents / 100,
        pitch_error_cents: errorCents,
        confidence: 0.95,
        rms: 0.1,
        peak: 0.2,
        syllable_index: syllableIndex,
        phrase_index: 0,
        section_index: 0,
        classification: CLASSIFICATIONS.PITCHED,
        steadiness: 0.9,
        vibrato_rate_hz: null,
        vibrato_extent_cents: null,
        ...extra,
    };
}

test('timing signs are early-negative and late-positive', () => {
    const frames = [
        frame(900, 0, null, { target_midi: null, target_frequency_hz: null, classification: 'UNKNOWN' }),
        frame(1100, 0),
        frame(1900, 0),
        frame(2100, 0, null, { target_midi: null, target_frequency_hz: null, classification: 'UNKNOWN' }),
    ];
    const analysis = analyzeSession({
        tokens: [{ t: 1, d: 1, w: 'Timing+', midi: 60 }],
        frames,
        durationMs: 2500,
        options: { timingWindowMs: 300, silenceRms: 0.01 },
    });
    assert.equal(analysis.notes[0].timing.onset_error_ms, -100);
    assert.equal(analysis.notes[0].timing.offset_error_ms, 100);
    assert.equal(analysis.notes[0].timing.duration_error_ms, 200);
});

function sustainAnalysis(errors) {
    const frames = errors.map((error, index) => frame(100 + index * 100, error));
    return analyzeSession({
        tokens: [{ t: 0, d: 1.1, w: 'Sustain+', midi: 60 }],
        frames,
        durationMs: 1100,
        options: { sustainMinMs: 700 },
    }).notes[0].sustain;
}

test('sustain metrics distinguish stable, falling and rising pitch', () => {
    const stable = sustainAnalysis(Array(10).fill(5));
    const falling = sustainAnalysis([20, 15, 10, 5, 0, -5, -10, -15, -20, -25]);
    const rising = sustainAnalysis([-20, -15, -10, -5, 0, 5, 10, 15, 20, 25]);
    close(stable.pitch_drift_cents, 0);
    assert.ok(falling.pitch_drift_cents < -20);
    assert.ok(falling.pitch_slope_cents_per_second < 0);
    assert.ok(rising.pitch_drift_cents > 20);
    assert.ok(rising.pitch_slope_cents_per_second > 0);
});

test('frame, note, phrase, section and session aggregation stays consistent', () => {
    const tokens = [
        { t: 0, d: 0.8, w: 'One-', midi: 60 },
        { t: 1, d: 0.8, w: 'two+', midi: 62 },
    ];
    const collector = new TelemetryCollector({
        tokens,
        sections: [{ time: 0, name: 'Synthetic verse' }],
        options: { contourIntervalMs: 0 },
    });
    collector.addFrame({ timestampSeconds: 0.2, syllableIndex: 0, rawFrequencyHz: midiToFrequency(60), confidence: 0.95, rms: 0.1, peak: 0.2 });
    collector.addFrame({ timestampSeconds: 1.2, syllableIndex: 1, rawFrequencyHz: midiToFrequency(62), confidence: 0.95, rms: 0.1, peak: 0.2 });
    const analysis = collector.finish({ durationMs: 2000 });
    assert.equal(analysis.pitch_contour.length, 2);
    assert.equal(analysis.notes.length, 2);
    assert.equal(analysis.phrases.length, 1);
    assert.equal(analysis.phrases[0].note_count, 2);
    assert.equal(analysis.sections.length, 1);
    assert.equal(analysis.sections[0].note_count, 2);
    assert.equal(analysis.summary.pitch.sample_count, 2);
});

test('serialization emits all required files and preserves Unicode', () => {
    const collector = new TelemetryCollector({
        metadata: { pluginVersion: 'test', song: { artist: 'Björk', title: 'Síntesis ñ', chart_id: 'synthetic' } },
        tokens: [{ t: 0, d: 1, w: 'corazón+', midi: 69 }],
        sections: [{ time: 0, name: 'Estribillo ñ' }],
        options: { contourIntervalMs: 0 },
    });
    collector.addFrame({ timestampSeconds: 0.5, syllableIndex: 0, rawFrequencyHz: 440, confidence: 0.99, rms: 0.1, peak: 0.2 });
    const files = buildExportFiles(collector.finish({ durationMs: 1000 }));
    assert.deepEqual(Object.keys(files).sort(), [
        'README.txt', 'notes.csv', 'phrases.csv', 'pitch-contour.csv', 'sections.csv', 'session.json',
    ]);
    assert.match(files['session.json'], /Björk/);
    assert.match(files['notes.csv'], /corazón/);
    assert.match(files['sections.csv'], /Estribillo ñ/);
    JSON.parse(files['session.json']);
});

test('client-side ZIP contains only the local schema files with UTF-8 paths', () => {
    const files = {
        'session.json': '{"artist":"Björk"}\n',
        'notes.csv': 'lyrics\ncorazón\n',
    };
    const archive = createZipArchive(files, '../Björk: sesión', new Date('2026-09-12T10:00:00Z'));
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const decoder = new TextDecoder();
    let offset = 0;
    const extracted = {};
    while (view.getUint32(offset, true) === 0x04034b50) {
        const size = view.getUint32(offset + 18, true);
        const nameLength = view.getUint16(offset + 26, true);
        const nameStart = offset + 30;
        const name = decoder.decode(archive.subarray(nameStart, nameStart + nameLength));
        const dataStart = nameStart + nameLength;
        extracted[name] = decoder.decode(archive.subarray(dataStart, dataStart + size));
        offset = dataStart + size;
    }
    assert.deepEqual(extracted, {
        '_Björk_ sesión/session.json': files['session.json'],
        '_Björk_ sesión/notes.csv': files['notes.csv'],
    });
    assert.equal(view.getUint32(offset, true), 0x02014b50);
});

test('client-side ZIP writes the standard CRC-32 value', () => {
    const archive = createZipArchive({ 'check.txt': '123456789' }, 'check', new Date('2026-09-12T10:00:00Z'));
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    assert.equal(view.getUint32(14, true), 0xcbf43926);
});
