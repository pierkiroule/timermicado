import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingTime, meetingEnd, canEditMeeting, deadlineForToday } from '../timing.js';
const state = { isConfigured: true, startAt: 1000, endAt: 61000, finishedAt: null };

test('pauses consume budget without changing the deadline', () => {
  for (const isPaused of [true, false]) {
    const paused = { ...state, isPaused, pausedAt: 2000 };
    assert.equal(remainingTime(paused, 31000), 30000);
    assert.equal(paused.endAt, 61000);
    assert.equal(remainingTime(paused, 62000), 0);
  }
});
test('late wakeups stop statistics at the deadline', () => {
  assert.equal(meetingEnd(state, 90000), 61000);
  assert.equal(canEditMeeting(state, 61000), false);
  assert.equal(canEditMeeting(state, 60000), true);
});
test('early finish preserves planned deadline and freezes elapsed time', () => {
  const finished = { ...state, finishedAt: 20000 };
  assert.equal(remainingTime(finished, 30000), 0);
  assert.equal(meetingEnd(finished, 90000), 20000);
  assert.equal(finished.endAt, 61000);
  assert.equal(canEditMeeting(finished, 21000), false);
});
test('past and invalid times never silently become tomorrow', () => {
  const now = new Date(2026, 10, 12, 10, 0).getTime();
  for (const value of ['09:59', '10:00', '', '25:00', '10:60', 'abc']) {
    assert.equal(deadlineForToday(value, now), null);
  }
  assert.equal(deadlineForToday('11:00', now), now + 3600000);
});
