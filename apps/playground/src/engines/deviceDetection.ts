// ---------------------------------------------------------------------------
// Device Detection — Determines if client-side execution is viable
// ---------------------------------------------------------------------------

/**
 * Returns true if the device is considered "low-end" and should skip
 * heavy client-side engines (Pyodide WASM, TS compiler, etc.).
 *
 * Criteria (any one triggers low-end):
 *   - navigator.deviceMemory < 1 GB (Chrome/Edge only)
 *   - navigator.hardwareConcurrency <= 1 core (single-core)
 */
export function isLowEndDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };

  // Device memory API (Chrome 63+, Edge 79+)
  // Only flag truly memory-constrained devices (< 1 GB)
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 1) {
    return true;
  }

  // Only single-core is truly too weak for WASM engines
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 1) {
    return true;
  }

  return false;
}

/**
 * Returns true if Web Workers are available.
 */
export function supportsWebWorkers(): boolean {
  return typeof Worker !== 'undefined';
}

/**
 * Returns a human-readable description of the device's capabilities.
 */
export function getDeviceInfo(): {
  memory: number | null;
  cores: number | null;
  isMobile: boolean;
  isLowEnd: boolean;
  supportsWorkers: boolean;
} {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  return {
    memory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    isMobile,
    isLowEnd: isLowEndDevice(),
    supportsWorkers: supportsWebWorkers(),
  };
}
