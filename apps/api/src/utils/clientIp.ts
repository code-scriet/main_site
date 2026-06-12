import type { Request } from 'express';
import type { Socket } from 'socket.io';

/**
 * S2: one definition of "the client IP" for every IP-keyed rate limiter and
 * login-telemetry write.
 *
 * Resolution order:
 * 1. `CF-Connecting-IP`, but ONLY when the connecting peer is inside
 *    Cloudflare's published ranges — Cloudflare strips/overwrites the header
 *    for proxied traffic, so it cannot be client-spoofed *through* Cloudflare,
 *    while a direct-to-origin client presenting the header is ignored (its
 *    peer address is not a CF range).
 * 2. The peer address itself: Express's `req.ip` for HTTP (honors
 *    `trust proxy 1` → right-most untrusted X-Forwarded-For hop), or the
 *    right-most XFF entry for Socket.io handshakes (Socket.io has no
 *    trust-proxy resolution; with exactly one trusted proxy in front — the
 *    platform LB — the right-most entry is what that proxy saw).
 *
 * Never the FIRST X-Forwarded-For entry: it is fully client-controlled. The
 * old socket connection limiter keyed on it, letting a direct-to-origin
 * client rotate XFF to defeat the 30-conn/min cap.
 *
 * The 24h LOG_IP_DIAGNOSTICS readback (docs/deep-audit/ops-checklist.md, lands with PR #51)
 * validates this resolution against prod traffic.
 */

// Cloudflare's published egress ranges — https://www.cloudflare.com/ips/
// (stable for years; revisit if CF announces changes).
const CF_IPV4_RANGES: Array<[number, number]> = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
].map(parseIpv4Cidr);

const CF_IPV6_RANGES: Array<[bigint, number]> = [
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
].map(parseIpv6Cidr);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255 || part !== String(octet)) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function parseIpv4Cidr(cidr: string): [number, number] {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const baseInt = ipv4ToInt(base);
  if (baseInt === null || !Number.isInteger(bits)) throw new Error(`Bad IPv4 CIDR: ${cidr}`);
  return [baseInt, bits];
}

function ipv6ToBigInt(ip: string): bigint | null {
  // Strip zone id; reject embedded IPv4 except the well-formed trailing form.
  const clean = ip.split('%')[0];
  let head = clean;
  let tailV4 = '';
  const lastColon = clean.lastIndexOf(':');
  if (clean.includes('.') && lastColon !== -1) {
    tailV4 = clean.slice(lastColon + 1);
    head = clean.slice(0, lastColon);
  }

  const sections = head.split('::');
  if (sections.length > 2) return null;
  const leftGroups = sections[0] ? sections[0].split(':') : [];
  const rightGroups = sections.length === 2 && sections[1] ? sections[1].split(':') : [];

  const v4Groups: string[] = [];
  if (tailV4) {
    const v4 = ipv4ToInt(tailV4);
    if (v4 === null) return null;
    v4Groups.push(((v4 >>> 16) & 0xffff).toString(16), (v4 & 0xffff).toString(16));
  }

  const right = [...rightGroups, ...v4Groups];
  const totalGroups = leftGroups.length + right.length;
  if (sections.length === 1 && totalGroups !== 8) return null;
  if (totalGroups > 8) return null;

  const groups = [
    ...leftGroups,
    ...Array(8 - totalGroups).fill('0'),
    ...right,
  ];

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

function parseIpv6Cidr(cidr: string): [bigint, number] {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const baseInt = ipv6ToBigInt(base);
  if (baseInt === null || !Number.isInteger(bits)) throw new Error(`Bad IPv6 CIDR: ${cidr}`);
  return [baseInt, bits];
}

/** Strip the IPv4-mapped-IPv6 prefix Express/Node commonly report. */
function normalizeIp(raw: string): string {
  return raw.trim().replace(/^::ffff:/i, '').split('%')[0];
}

export function isCloudflareIp(rawIp: string | null | undefined): boolean {
  if (!rawIp) return false;
  const ip = normalizeIp(rawIp);

  const v4 = ipv4ToInt(ip);
  if (v4 !== null) {
    return CF_IPV4_RANGES.some(([base, bits]) =>
      bits === 0 || (v4 >>> (32 - bits)) === (base >>> (32 - bits)));
  }

  const v6 = ipv6ToBigInt(ip);
  if (v6 !== null) {
    return CF_IPV6_RANGES.some(([base, bits]) =>
      (v6 >> BigInt(128 - bits)) === (base >> BigInt(128 - bits)));
  }

  return false;
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function resolveFromPeer(
  peer: string | null | undefined,
  cfConnectingIp: string | string[] | undefined,
): string {
  const peerIp = peer ? normalizeIp(peer) : null;
  const cfIp = firstHeaderValue(cfConnectingIp);
  if (cfIp && isCloudflareIp(peerIp)) {
    return normalizeIp(cfIp);
  }
  return peerIp || 'unknown';
}

/** HTTP resolution: Express `req.ip` is the peer (honors `trust proxy`). */
export function getClientIp(req: Request): string {
  return resolveFromPeer(
    req.ip || req.socket?.remoteAddress,
    req.headers['cf-connecting-ip'],
  );
}

/**
 * Socket.io handshake resolution. Socket.io does not apply Express's
 * trust-proxy logic, so mirror `trust proxy 1` manually: the right-most
 * X-Forwarded-For entry is the hop the platform proxy saw (appended by it,
 * not client-controlled); fall back to the raw TCP peer in dev.
 */
export function getSocketClientIp(socket: Socket): string {
  const forwardedFor = socket.handshake.headers['x-forwarded-for'];
  const xff = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor;
  const rightMost = xff?.split(',').map((entry) => entry.trim()).filter(Boolean).pop() || null;
  return resolveFromPeer(
    rightMost || socket.handshake.address,
    socket.handshake.headers['cf-connecting-ip'],
  );
}
