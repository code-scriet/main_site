// S7a: the WebSocket-engine decision core. eiows is the DEFAULT; these cover
// every branch of chooseWsEngine so the "default on, auto-fallback, strict"
// contract can't silently regress.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseWsEngine } from './socket.js';

const eiowsOk = () => ({ Server: function EiowsServer() {} });
const eiowsMissing = () => {
  throw new Error("Cannot find module 'eiows'");
};

test('default (not forced, eiows available) → eiows', () => {
  const r = chooseWsEngine({ forceStock: false, strict: false, loadEiows: eiowsOk });
  assert.equal(r.engine, 'eiows');
  assert.equal(typeof r.server, 'function');
  assert.equal(r.error, undefined);
});

test('WS_ENGINE=ws (forceStock) → ws, eiows never even loaded', () => {
  let loaded = false;
  const r = chooseWsEngine({
    forceStock: true,
    strict: false,
    loadEiows: () => {
      loaded = true;
      return { Server: function () {} };
    },
  });
  assert.equal(r.engine, 'ws');
  assert.equal(r.server, undefined);
  assert.equal(loaded, false, 'forceStock must short-circuit before loading eiows');
});

test('eiows unavailable + not strict → automatic ws fallback, error surfaced (not swallowed)', () => {
  const r = chooseWsEngine({ forceStock: false, strict: false, loadEiows: eiowsMissing });
  assert.equal(r.engine, 'ws');
  assert.equal(r.server, undefined);
  assert.ok(r.error instanceof Error, 'the load error is returned so the caller can log it loudly');
});

test('eiows unavailable + strict → throws (refuse to boot, no silent fallback)', () => {
  assert.throws(
    () => chooseWsEngine({ forceStock: false, strict: true, loadEiows: eiowsMissing }),
    /Cannot find module 'eiows'/,
  );
});

test('strict + forceStock → ws (explicit opt-out wins over strict; no eiows attempt)', () => {
  const r = chooseWsEngine({ forceStock: true, strict: true, loadEiows: eiowsMissing });
  assert.equal(r.engine, 'ws');
});
