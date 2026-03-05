import { useState, useCallback, useRef } from 'react';
import { executeCode, formatOutput, calculateExecutionTime } from '@/engines/ExecutionRouter';
import { usePlayground } from '@/context/PlaygroundContext';
import { validateCode } from '@/lib/utils';
import { getSessionPreflight, recordClientExecution } from '@/utils/snippetsApi';
import { toast } from 'sonner';

export function useCodeExecution() {
  const {
    code,
    language,
    stdin,
    setOutput,
    setError,
    setIsRunning,
    setExecutionTime,
  } = usePlayground();

  const [isExecuting, setIsExecuting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const runCode = useCallback(async () => {
    // Validate code
    const validation = validateCode(code);
    if (!validation.valid) {
      toast.error(validation.message || 'Invalid code');
      return { success: false, error: validation.message };
    }

    // Handle web (HTML/CSS/JS) separately
    if (language.id === 'web') {
      setOutput('');
      setError('');
      toast.success('Web preview updated!');
      return { success: true };
    }

    // Cancel any in-flight execution
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsExecuting(true);
    setIsRunning(true);
    setOutput('');
    setError('');
    const startTime = Date.now();

    try {
      const preflight = await getSessionPreflight();
      if (!preflight.allowed) {
        const msg = `Daily execution limit (${preflight.dailyLimit}) reached. Try again tomorrow.`;
        setError(msg);
        toast.error(msg);
        return { success: false, error: msg };
      }

      const result = await executeCode({
        language: language.id,
        code,
        stdin: stdin || undefined,
        signal: controller.signal,
      });

      const endTime = Date.now();
      const executionTime = calculateExecutionTime(startTime, endTime);
      setExecutionTime(executionTime);

      const { output, error, hasError, warning } = formatOutput(result);

      if (hasError) {
        setError(error);
        if (output) {
          setOutput(output);
        }

        if (result.tier === 'client') {
          try {
            await recordClientExecution({
              language: language.id,
              code,
              output: (output || error || '').slice(0, 5000),
              durationMs: endTime - startTime,
              status: 'ERROR',
            });
          } catch {
            // non-blocking
          }
        }

        toast.error(error || 'Code execution failed');
        return { success: false, error, output };
      } else {
        const finalOutput = output || 'Program executed successfully with no output';
        setOutput(finalOutput);
        if (warning) {
          // Show warnings (e.g. compiler warnings) as info, not errors
          setError(`Warning: ${warning}`);
        }

        if (result.tier === 'client') {
          try {
            await recordClientExecution({
              language: language.id,
              code,
              output: finalOutput.slice(0, 5000),
              durationMs: endTime - startTime,
              status: 'SUCCESS',
            });
          } catch {
            // non-blocking
          }
        }

        const tierLabel = result.tier === 'client' ? '(local)' : '(cloud)';
        toast.success(`Executed in ${executionTime} ${tierLabel}`);
        return { success: true, output: finalOutput, executionTime };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message === 'Execution cancelled') {
        setError('Execution cancelled by user.');
        toast.info('Execution stopped');
        return { success: false, error: message };
      }
      const errorMsg = `Execution error: ${message}`;
      setError(errorMsg);
      toast.error('Failed to execute code');
      return { success: false, error: errorMsg };
    } finally {
      setIsExecuting(false);
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [code, language, stdin, setOutput, setError, setIsRunning, setExecutionTime]);

  const stopExecution = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    runCode,
    stopExecution,
    isExecuting,
  };
}
