import { tick, startSystemTest } from '../lib/machine.ts';
import { mobilityCommand } from '../lib/mobility.ts';
import assert from 'node:assert/strict';
export function checked(s) {
  return {
    ...s,
    testPhase: 'passed',
    testResults: [true, true, true],
    actualPressure: 210,
    coolantFlow: 42.8,
    mobility: { ...s.mobility, helmet: true, calibration: 'ready', elapsed: 8 },
  };
}
export function advance(s, seconds) {
  for (let i = 0; i < Math.round(seconds * 10); i++) s = tick(s, Math.max(0, s.simAt) + 100);
  return s;
}
export function qualify(s) {
  s = mobilityCommand(s, 82);
  s = mobilityCommand(s, 83);
  assert.equal(s.error, false, s.message);
  s = advance(s, 8.1);
  assert.equal(s.mobility.calibration, 'ready');
  s = startSystemTest(s);
  assert.equal(s.error, false, s.message);
  s = advance(s, 13.2);
  for (const radarRange of [125, 250, 500]) s = advance({ ...s, radarRange }, 2.6);
  assert.equal(s.testPhase, 'passed', s.testMessage);
  return s;
}
