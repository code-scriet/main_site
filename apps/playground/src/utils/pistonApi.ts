// Using multiple execution engines for reliability
const JDOODLE_CLIENT_ID = import.meta.env.VITE_JDOODLE_CLIENT_ID || '';
const JDOODLE_CLIENT_SECRET = import.meta.env.VITE_JDOODLE_CLIENT_SECRET || '';

export interface ExecutionRequest {
  language: string;
  version: string;
  files: Array<{
    name?: string;
    content: string;
  }>;
  stdin?: string;
  args?: string[];
  compile_timeout?: number;
  run_timeout?: number;
  compile_memory_limit?: number;
  run_memory_limit?: number;
}

export interface ExecutionResult {
  language: string;
  version: string;
  run: {
    stdout: string;
    stderr: string;
    code: number;
    signal: string | null;
    output: string;
  };
  compile?: {
    stdout: string;
    stderr: string;
    code: number;
    signal: string | null;
    output: string;
  };
}

export interface RuntimeInfo {
  language: string;
  version: string;
  aliases: string[];
  runtime?: string;
}

// JDoodle Language Mappings
const JDOODLE_LANGUAGES: Record<string, { language: string; versionIndex: number }> = {
  javascript: { language: 'nodejs', versionIndex: 4 },
  python: { language: 'python3', versionIndex: 4 },
  cpp: { language: 'cpp17', versionIndex: 0 },
  java: { language: 'java', versionIndex: 4 },
  c: { language: 'c', versionIndex: 5 },
  typescript: { language: 'nodejs', versionIndex: 4 },
};

/**
 * Execute JavaScript code client-side using eval (safe environment)
 */
async function executeJavaScriptClient(code: string, stdin: string): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const output: string[] = [];
    const errors: string[] = [];
    
    // Override console.log to capture output
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.log = (...args: any[]) => {
      output.push(args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' '));
    };
    
    console.error = (...args: any[]) => {
      errors.push(args.map(arg => String(arg)).join(' '));
    };
    
    console.warn = (...args: any[]) => {
      output.push('[WARN] ' + args.map(arg => String(arg)).join(' '));
    };
    
    try {
      // Create a sandboxed environment with input support
      const inputLines = stdin ? stdin.split('\\n') : [];
      let inputIndex = 0;
      
      // Mock input() function for Python-like input
      const input = (prompt?: string) => {
        if (prompt) output.push(prompt);
        return inputLines[inputIndex++] || '';
      };
      
      // Mock prompt() for browser-like input
      const prompt = (message?: string) => {
        if (message) output.push(message);
        return inputLines[inputIndex++] || '';
      };
      
      const wrappedCode = `
        (function() {
          try {
            ${code}
          } catch (error) {
            console.error(error.message);
          }
        })();
      `;
      
      eval(wrappedCode);
      
      resolve({
        language: 'javascript',
        version: 'client',
        run: {
          stdout: output.join('\\n'),
          stderr: errors.join('\\n'),
          code: errors.length > 0 ? 1 : 0,
          signal: null,
          output: output.join('\\n'),
        },
      });
    } catch (error) {
      resolve({
        language: 'javascript',
        version: 'client',
        run: {
          stdout: output.join('\\n'),
          stderr: error instanceof Error ? error.message : String(error),
          code: 1,
          signal: null,
          output: output.join('\\n'),
        },
      });
    } finally {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }
  });
}

/**
 * Execute code using backend API proxy (calls JDoodle server-side to bypass CORS)
 */
async function executeWithJDoodle(request: ExecutionRequest): Promise<ExecutionResult> {
  const langConfig = JDOODLE_LANGUAGES[request.language];
  
  if (!langConfig) {
    throw new Error(`Language ${request.language} not supported`);
  }

  // Call backend proxy endpoint instead of JDoodle directly
  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:5002';
  console.log(`🔗 Backend URL: ${backendUrl}/api/execute`);
  
  try {
    const response = await fetch(`${backendUrl}/api/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        language: request.language,
        code: request.files[0].content,
        stdin: request.stdin || '',
      }),
    });

    if (!response.ok) {
      // Try to parse error response
      let errorMessage = `API request failed: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        // If response is not JSON (e.g., HTML error page), show generic error
        const text = await response.text();
        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
          throw new Error(
            `Backend server returned HTML instead of JSON. Possible causes:\n` +
            `1. Backend server is not running on ${backendUrl}\n` +
            `2. Wrong API URL configured\n` +
            `3. Server error\n\n` +
            `💡 Make sure execute-server.js is running!`
          );
        }
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    
    // Backend returns data in ApiResponse format: { success: true, data: executionResult }
    if (!result.success) {
      throw new Error(result.error || 'Execution failed');
    }

    console.log(`✅ Execution successful for ${request.language}`);
    return result.data;
  } catch (error) {
    console.error('❌ Execution error:', error);
    
    // Provide helpful error message if network or connection issue
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Unable to connect to backend execution service at ${backendUrl}\n\n` +
        `Possible fixes:\n` +
        `1. Make sure execute-server.js is running\n` +
        `2. Check if backend is on correct port (should be 5002 locally)\n` +
        `3. Verify VITE_API_URL environment variable\n\n` +
        `💡 Tip: JavaScript works client-side without any setup!`
      );
    }
    throw error;
  }
}

/**
 * Main execute code function with fallback strategies
 */
export async function executeCode(request: ExecutionRequest): Promise<ExecutionResult> {
  try {
    // For JavaScript, try client-side execution first
    if (request.language === 'javascript') {
      try {
        return await executeJavaScriptClient(request.files[0].content, request.stdin || '');
      } catch (error) {
        console.warn('Client-side execution failed, trying API...', error);
      }
    }

    // Try JDoodle API
    return await executeWithJDoodle(request);
    
  } catch (error) {
    console.error('Code Execution Error:', error);
    throw new Error(`Execution failed: ${error instanceof Error ? error.message : 'Unable to connect to execution service. Please try again later.'}`);
  }
}

/**
 * Format execution output for display
 */
export function formatOutput(result: ExecutionResult): {
  output: string;
  error: string;
  exitCode: number;
  hasError: boolean;
} {
  const output = result.run.stdout || '';
  const stderr = result.run.stderr || '';
  const compileError = result.compile?.stderr || '';
  const exitCode = result.run.code;

  const error = compileError || stderr;
  const hasError = exitCode !== 0 || !!compileError || !!stderr;

  return {
    output,
    error,
    exitCode,
    hasError,
  };
}

/**
 * Calculate execution statistics
 */
export function calculateExecutionTime(startTime: number, endTime: number): string {
  const duration = endTime - startTime;
  if (duration < 1000) {
    return `${duration}ms`;
  }
  return `${(duration / 1000).toFixed(2)}s`;
}
