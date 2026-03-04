import { useState, useCallback } from 'react';
import { executeCode, formatOutput, calculateExecutionTime } from '@/utils/pistonApi';
import { usePlayground } from '@/context/PlaygroundContext';
import { validateCode } from '@/lib/utils';
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

    setIsExecuting(true);
    setIsRunning(true);
    setOutput('');
    setError('');
    const startTime = Date.now();

    try {
      const result = await executeCode({
        language: language.id,
        version: language.version,
        files: [{ content: code }],
        stdin: stdin || undefined,
        run_timeout: 15000, // 15 seconds timeout
      });

      const endTime = Date.now();
      const executionTime = calculateExecutionTime(startTime, endTime);
      setExecutionTime(executionTime);

      const { output, error, hasError } = formatOutput(result);

      if (hasError) {
        setError(error);
        if (output) {
          setOutput(output);
        }
        toast.error('Code execution failed');
        return { success: false, error, output };
      } else {
        const finalOutput = output || 'Program executed successfully with no output';
        setOutput(finalOutput);
        toast.success(`Executed in ${executionTime}`);
        return { success: true, output: finalOutput, executionTime };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const errorMsg = `Execution error: ${message}`;
      setError(errorMsg);
      toast.error('Failed to execute code');
      return { success: false, error: errorMsg };
    } finally {
      setIsExecuting(false);
      setIsRunning(false);
    }
  }, [code, language, stdin, setOutput, setError, setIsRunning, setExecutionTime]);

  return {
    runCode,
    isExecuting,
  };
}
