// Shared trust + addressing for the main-API ↔ playground internal calls (the contest
// /competition socket relay + the plagiarism offload). See CLAUDE.md "Playground Architecture".

import { createHash } from 'node:crypto';

let derivedSecret: string | null = null;

/**
 * Secret gating the internal endpoints. Prefers an explicit `INTERNAL_API_SECRET`; otherwise
 * **derives** one from `JWT_SECRET` — which the API and playground already share (render.yaml
 * requires the two to match). The playground derives the identical value, so the relay needs
 * NO separate secret configured: setting `PLAYGROUND_API_URL` alone turns it on. Deriving from
 * `JWT_SECRET` costs no security — anyone able to forge this already holds `JWT_SECRET` (full
 * account-forgery compromise). Returns '' only if `JWT_SECRET` is somehow unset (relay stays off).
 */
export function getInternalApiSecret(): string {
  const explicit = process.env.INTERNAL_API_SECRET?.trim();
  if (explicit) return explicit;
  if (derivedSecret !== null) return derivedSecret;
  const jwt = process.env.JWT_SECRET?.trim();
  derivedSecret = jwt ? createHash('sha256').update(`${jwt}:contest-relay-internal`).digest('hex') : '';
  return derivedSecret;
}

/**
 * Origin of the playground execute-server the main API relays to. Returns null when
 * `PLAYGROUND_API_URL` is unset (⇒ relay off; clients poll, plagiarism runs inline). Tolerates
 * a scheme-less host (prepends `https://`) and strips any trailing slash so callers can append
 * `/internal/...` directly.
 */
export function getPlaygroundRelayBase(): string | null {
  const raw = process.env.PLAYGROUND_API_URL?.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, '');
}
