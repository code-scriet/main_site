// ---------------------------------------------------------------------------
// Code Execution API — Compatibility Re-export
// ---------------------------------------------------------------------------
// This file used to contain Piston/JDoodle execution logic.
// All execution now routes through the ExecutionRouter (engines/).
// This file re-exports the new API so existing imports don't break.
// ---------------------------------------------------------------------------

export { executeCode, formatOutput, calculateExecutionTime } from '@/engines/ExecutionRouter';
export type { ExecutionResult, ExecuteOptions } from '@/engines/ExecutionRouter';

// Legacy ExecutionRequest shape — kept for backward compat with any callers.
// The new executeCode() takes ExecuteOptions instead.
export interface ExecutionRequest {
  language: string;
  version?: string;
  files?: Array<{ name?: string; content: string }>;
  stdin?: string;
  args?: string[];
  compile_timeout?: number;
  run_timeout?: number;
  compile_memory_limit?: number;
  run_memory_limit?: number;
}

export interface RuntimeInfo {
  language: string;
  version: string;
  aliases: string[];
  runtime?: string;
}

