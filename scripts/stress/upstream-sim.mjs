// Simulated Wandbox + godbolt upstreams for the judge stress harness.
//
// Why simulate: stress-testing the REAL wandbox.org / godbolt.org would be
// abusive to free public services (and would get our egress banned). The sim
// reproduces their observed behavior — latency calibrated from light probes
// through the deployed CF worker (2026-07: wandbox python ≈1.9s / cpp ≈3.9s,
// godbolt python ≈1.1s / cpp ≈2.6s), Wandbox's over-capacity clone/fork EAGAIN
// ("OCI runtime error"), and godbolt's queueing — behind configurable
// per-provider concurrency caps so capacity assumptions become an explicit,
// varied parameter instead of a hidden guess.
//
// Endpoints:
//   POST /wandbox                     Wandbox-shaped compile.json
//   POST /godbolt/:id/compile         godbolt-shaped compiler API
//   GET  /stats                       counters + concurrency high-water marks
//   POST /control                     { reset?, caps?: {wandbox,godbolt},
//                                       outage?: { provider, forMs } }

import http from 'node:http';

// Real-world mean service time (ms) per provider/language, from calibration
// probes, padded ~15% for judge-sized payloads (harness wrapper + multi-test stdin).
const LATENCY_MS = {
  wandbox: { python: 2400, cpp: 4400, c: 4100, java: 6000, javascript: 2300 },
  godbolt: { python: 1600, cpp: 3100, c: 2900, java: 5400 },
};

const WANDBOX_INFRA_BODY = {
  status: '126',
  signal: '',
  program_output: '',
  program_error: '',
  compiler_output: '',
  compiler_message: '',
  program_message: '',
  compiler_error: 'Error: OCI runtime error: crun: clone: Resource temporarily unavailable',
};

function languageFromWandboxCompiler(compiler) {
  const c = String(compiler || '');
  if (c.startsWith('cpython') || c.startsWith('python')) return 'python';
  if (c.startsWith('nodejs') || c.startsWith('typescript')) return 'javascript';
  if (c.endsWith('-c')) return 'c';
  if (c.startsWith('openjdk') || c.startsWith('java')) return 'java';
  return 'cpp';
}

function languageFromGodboltId(id) {
  if (id === 'python312') return 'python';
  if (id === 'cg132') return 'c';
  if (id === 'java2202') return 'java';
  return 'cpp';
}

// Judge frames the harness's stdin as __N= / __ID= / __LEN= records; echo one
// passing frame per test id so codeJudge parses a real ACCEPTED verdict.
function framesFromStdin(stdin) {
  const ids = [];
  for (const line of String(stdin || '').split('\n')) {
    if (line.startsWith('__ID=')) ids.push(line.slice(5));
  }
  const payload = Buffer.from('42').toString('base64');
  return ids.map((id) => `__JUDGE:${id}:OK:${20 + Math.floor(Math.random() * 400)}:${payload}`);
}

function jitter(ms) {
  return ms * (0.75 + Math.random() * 0.7);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startUpstreamSim({
  port = 0,
  wandboxCap = 8,
  godboltCap = 12,
  timeScale = 1,
} = {}) {
  const state = {
    caps: { wandbox: wandboxCap, godbolt: godboltCap },
    outageUntil: { wandbox: 0, godbolt: 0 },
    providers: {
      wandbox: { inflight: 0, peak: 0, served: 0, infra: 0, total: 0 },
      godbolt: { inflight: 0, peak: 0, served: 0, infra: 0, total: 0, queued: 0, queuePeak: 0 },
    },
  };

  // godbolt models a small queue in front of its cluster; over-queue → 503.
  const godboltWaiters = [];
  const GODBOLT_QUEUE_LIMIT = 40;

  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://sim');

      if (req.method === 'GET' && url.pathname === '/stats') {
        return json(res, 200, state);
      }

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw ? JSON.parse(raw) : {};

      if (req.method === 'POST' && url.pathname === '/control') {
        if (body.reset) {
          for (const p of Object.values(state.providers)) {
            p.peak = 0; p.served = 0; p.infra = 0; p.total = 0;
            if ('queuePeak' in p) { p.queuePeak = 0; p.queued = 0; }
          }
        }
        if (body.caps) Object.assign(state.caps, body.caps);
        if (body.outage) {
          state.outageUntil[body.outage.provider] = Date.now() + (body.outage.forMs || 0);
        }
        return json(res, 200, { ok: true });
      }

      // ---- Wandbox ----------------------------------------------------------
      if (req.method === 'POST' && url.pathname === '/wandbox') {
        const p = state.providers.wandbox;
        p.total += 1;
        const overloaded = p.inflight >= state.caps.wandbox;
        const inOutage = Date.now() < state.outageUntil.wandbox;
        if (overloaded || inOutage) {
          // Real Wandbox fails the container clone quickly when the host is full.
          p.infra += 1;
          await sleep(jitter(250) / timeScale);
          return json(res, 200, WANDBOX_INFRA_BODY);
        }
        p.inflight += 1;
        p.peak = Math.max(p.peak, p.inflight);
        try {
          const lang = languageFromWandboxCompiler(body.compiler);
          await sleep(jitter(LATENCY_MS.wandbox[lang]) / timeScale);
          p.served += 1;
          return json(res, 200, {
            status: '0',
            signal: '',
            compiler_output: '',
            compiler_error: '',
            compiler_message: '',
            program_error: '',
            program_output: framesFromStdin(body.stdin).join('\n') + '\n',
            program_message: '',
          });
        } finally {
          p.inflight -= 1;
        }
      }

      // ---- godbolt ----------------------------------------------------------
      const godboltMatch = /^\/godbolt\/([^/]+)\/compile$/.exec(url.pathname);
      if (req.method === 'POST' && godboltMatch) {
        const p = state.providers.godbolt;
        p.total += 1;
        if (Date.now() < state.outageUntil.godbolt) {
          p.infra += 1;
          res.writeHead(503, { 'Content-Type': 'text/plain' });
          return res.end('Service Unavailable');
        }
        if (p.inflight >= state.caps.godbolt) {
          if (godboltWaiters.length >= GODBOLT_QUEUE_LIMIT) {
            p.infra += 1;
            res.writeHead(503, { 'Content-Type': 'text/plain' });
            return res.end('Service Unavailable');
          }
          p.queued += 1;
          p.queuePeak = Math.max(p.queuePeak, godboltWaiters.length + 1);
          await new Promise((resolve) => godboltWaiters.push(resolve));
        }
        p.inflight += 1;
        p.peak = Math.max(p.peak, p.inflight);
        try {
          const lang = languageFromGodboltId(godboltMatch[1]);
          await sleep(jitter(LATENCY_MS.godbolt[lang]) / timeScale);
          p.served += 1;
          const stdin = body?.options?.executeParameters?.stdin || '';
          return json(res, 200, {
            code: 0,
            timedOut: false,
            stdout: framesFromStdin(stdin).map((text) => ({ text })),
            stderr: [],
            buildResult: { code: 0, stdout: [], stderr: [] },
          });
        } finally {
          p.inflight -= 1;
          const next = godboltWaiters.shift();
          if (next) next();
        }
      }

      json(res, 404, { error: 'not found' });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const boundPort = server.address().port;
  return {
    port: boundPort,
    wandboxUrl: `http://127.0.0.1:${boundPort}/wandbox`,
    godboltBase: `http://127.0.0.1:${boundPort}/godbolt`,
    stats: () => JSON.parse(JSON.stringify(state)),
    control: async (payload) => {
      await fetch(`http://127.0.0.1:${boundPort}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
