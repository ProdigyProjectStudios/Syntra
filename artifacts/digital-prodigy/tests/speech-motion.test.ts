import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceSpeechPhase, smoothSpeechLevel } from '../src/lib/speech-motion.ts';

test('speech envelope softens peaks and releases naturally into pauses', () => {
  let level = smoothSpeechLevel(0.035, 1, 1 / 60);
  assert.ok(level > 0.035 && level < 0.09, 'no abrupt jump on first loud frame');
  for (let i = 0; i < 60; i++) level = smoothSpeechLevel(level, 1, 1 / 60);
  assert.ok(level > 0.3 && level < 0.39, 'loud speech stays bounded');
  const before = level;
  level = smoothSpeechLevel(level, 0, 1 / 60);
  assert.ok(level < before && level > before * 0.9, 'no abrupt stop');
  for (let i = 0; i < 120; i++) level = smoothSpeechLevel(level, 0, 1 / 60);
  assert.ok(Math.abs(level - 0.035) < 0.001);
  assert.ok(Number.isFinite(smoothSpeechLevel(level, NaN, NaN)));
});

test('speech envelope is consistent at desktop and mobile frame rates', () => {
  const run = (fps: number) => {
    let level = 0.035;
    for (let i = 0; i < fps; i++) level = smoothSpeechLevel(level, 0.6, 1 / fps);
    return level;
  };
  assert.ok(Math.abs(run(30) - run(60)) < 0.000001);
});

test('particle phase never jumps when speech volume changes, even after long sessions', () => {
  const phase = 3600;
  const next = advanceSpeechPhase(phase, 1 / 60, 0.39);
  assert.ok(next > phase && next - phase < 0.02);
  const quiet = advanceSpeechPhase(next, 1 / 60, 0.035);
  assert.ok(quiet > next && quiet - next < 0.02);
});
