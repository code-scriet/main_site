// Pins the QOTD authoring security invariant: a non-admin (CORE_MEMBER) author
// can NEVER publish or auto-schedule a QOTD, regardless of the publishNow/publishAt
// the route computed from their request. Admins keep full control. Pure function,
// no DB. See qotdAuthoring.ts + qotd.ts POST /api/qotd.

import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveQotdPublishState } from './qotdAuthoring.js';

const future = new Date(Date.now() + 86_400_000);

test('non-admin author is forced to an unpublished, unscheduled draft (publishNow ignored)', () => {
  const state = resolveQotdPublishState({ isAdmin: false, publishNow: true, publishAt: future });
  assert.equal(state.isPublished, false);
  assert.equal(state.publishAt, null);
});

test('non-admin author cannot schedule (publishAt is dropped)', () => {
  const state = resolveQotdPublishState({ isAdmin: false, publishNow: false, publishAt: future });
  assert.equal(state.isPublished, false);
  assert.equal(state.publishAt, null);
});

test('admin can publish now', () => {
  const state = resolveQotdPublishState({ isAdmin: true, publishNow: true, publishAt: future });
  assert.equal(state.isPublished, true);
  assert.equal(state.publishAt, future);
});

test('admin can schedule for the future (unpublished + publishAt kept)', () => {
  const state = resolveQotdPublishState({ isAdmin: true, publishNow: false, publishAt: future });
  assert.equal(state.isPublished, false);
  assert.equal(state.publishAt, future);
});
