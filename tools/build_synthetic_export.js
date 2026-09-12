#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    TelemetryCollector,
    buildExportFiles,
    midiToFrequency,
} = require('../assets/analytics.js');

const outputDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'examples', 'synthetic-vocal-analysis'));
const tokens = [
    { t: 0.5, d: 1.0, w: 'Hel-', midi: 60 },
    { t: 1.7, d: 1.0, w: 'lo+', midi: 62 },
    { t: 3.2, d: 1.1, w: 'Bar-', midi: 64 },
    { t: 4.5, d: 1.1, w: 'ce-lo-na+', midi: 65 },
];
const sections = [
    { time: 0, name: 'Synthetic verse' },
    { time: 3, name: 'Synthetic chorus' },
];
const collector = new TelemetryCollector({
    metadata: {
        pluginVersion: '0.5.0',
        song: {
            artist: 'Synthetic Ensemble',
            title: 'Objective Exercise Ñ',
            chart_id: 'synthetic-objective-v1',
            arrangement: 'Vocals',
            transposition_semitones: 0,
        },
        voice: { id: 'lead', name: 'Synthetic lead' },
    },
    tokens,
    sections,
    options: { confidenceThreshold: 0.8, silenceRms: 0.01, contourIntervalMs: 50 },
    startedAt: '2026-09-12T10:00:00.000Z',
});

for (let timestampMs = 0; timestampMs <= 6000; timestampMs += 50) {
    const timestampSeconds = timestampMs / 1000;
    const syllableIndex = tokens.findIndex((token) => timestampSeconds >= token.t
        && timestampSeconds < token.t + token.d);
    let rms = 0.002;
    let peak = 0.004;
    let rawFrequencyHz = null;
    let confidence = 0;
    let steadiness = null;
    let vibratoRateHz = null;
    let vibratoExtentCents = null;
    if (syllableIndex >= 0) {
        const token = tokens[syllableIndex];
        const progress = (timestampSeconds - token.t) / token.d;
        const baseError = syllableIndex === 0 ? 3
            : syllableIndex === 1 ? 20 - 35 * progress
            : syllableIndex === 2 ? -18
            : -15 + 35 * progress;
        const vibrato = syllableIndex === 3 ? 15 * Math.sin(progress * Math.PI * 10) : 0;
        rawFrequencyHz = midiToFrequency(token.midi) * Math.pow(2, (baseError + vibrato) / 1200);
        confidence = syllableIndex === 2 && progress > 0.35 && progress < 0.7 ? 0.55 : 0.94;
        rms = 0.08 + syllableIndex * 0.01;
        peak = rms * 1.8;
        steadiness = syllableIndex === 0 ? 0.95 : 0.72;
        if (syllableIndex === 3) {
            vibratoRateHz = 5;
            vibratoExtentCents = 15;
        }
    }
    collector.addFrame({
        timestampSeconds,
        syllableIndex: syllableIndex >= 0 ? syllableIndex : null,
        rawFrequencyHz,
        confidence,
        rms,
        peak,
        steadiness,
        vibratoRateHz,
        vibratoExtentCents,
    });
}

const analysis = collector.finish({
    durationMs: 6000,
    endedAt: '2026-09-12T10:00:06.000Z',
    pluginResults: {
        0: { accuracy: 1.0 },
        1: { accuracy: 0.9 },
        2: { accuracy: 0.4 },
        3: { accuracy: 0.85 },
    },
});
const files = buildExportFiles(analysis);
fs.mkdirSync(outputDir, { recursive: true });
for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(outputDir, name), content, 'utf8');
}
console.log(outputDir);
