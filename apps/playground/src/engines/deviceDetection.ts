// ---------------------------------------------------------------------------
// Device Detection — Determines if client-side execution is viable
// ---------------------------------------------------------------------------

/**
 * Returns true if the device is considered "low-end" and should skip
 * heavy client-side engines (Pyodide WASM, TS compiler, etc.).
 *
 * Criteria (any one triggers low-end):
 *   - navigator.deviceMemory < 2 GB (Chrome/Edge only)
 *   - navigator.hardwareConcurrency <= 2 cores
 *   - Mobile Android device (regex on user agent)
 *   - iOS device (limited WASM support / memory pressure)
 */
export function isLowEndDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };

  // Device memory API (Chrome 63+, Edge 79+)
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 2) {
    return true;
  }

  // CPU cores
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2) {
    return true;
  }

  const ua = navigator.userAgent;

  // Mobile Android
  if (/Android.*Mobile/i.test(ua)) {
    return true;
  }

  // iOS (limited WASM memory, aggressive process killing)
  if (/iPhone|iPad|iPod/i.test(ua)) {
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
