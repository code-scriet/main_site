// Hosts the REAL Cloudflare Worker (workers/executor.js) in a local Node HTTP
// server for the stress harness — so the provider chain, infra-failure
// classification, fallback order, and judge_provider/judge_fallback telemetry
// under test are the exact code that ships, pointed at simulated upstreams via
// the worker's WANDBOX_URL / GODBOLT_BASE env overrides.

import http from 'node:http';
import workerModule from '../../workers/executor.js';

// workers/executor.js is written as a Cloudflare ES module but the repo root
// has no `"type": "module"`, so Node/tsx loads it through CJS interop and the
// worker object lands one `.default` deeper.
const worker = workerModule?.fetch ? workerModule : workerModule.default;

export async function startWorkerHost({ port = 0, wandboxUrl, godboltBase } = {}) {
  const env = { WANDBOX_URL: wandboxUrl, GODBOLT_BASE: godboltBase };

  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);

      const headers = {};
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers[name] = value;
      }

      const request = new Request(`http://127.0.0.1${req.url}`, {
        method: req.method,
        headers,
        body: req.method === 'POST' ? body : undefined,
      });

      const response = await worker.fetch(request, env, {});
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const boundPort = server.address().port;
  return {
    port: boundPort,
    executorUrl: `http://127.0.0.1:${boundPort}/execute`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
