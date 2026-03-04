import { Router, Request, Response } from 'express';
import { ApiResponse } from '../utils/response.js';

const router = Router();

// Language configuration for JDoodle API
const JDOODLE_LANGUAGES: Record<string, { language: string; versionIndex: number }> = {
  javascript: { language: 'nodejs', versionIndex: 4 },
  python: { language: 'python3', versionIndex: 4 },
  cpp: { language: 'cpp17', versionIndex: 1 },
  java: { language: 'java', versionIndex: 4 },
  c: { language: 'c', versionIndex: 5 },
  typescript: { language: 'nodejs', versionIndex: 4 }, // TypeScript runs as Node.js
};

interface ExecuteRequest {
  language: string;
  code: string;
  stdin?: string;
}

/**
 * POST /api/execute
 * Execute code using JDoodle API (server-side proxy to bypass CORS)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { language, code, stdin = '' } = req.body as ExecuteRequest;

    // Validate input
    if (!language || !code) {
      return res.status(400).json(
        ApiResponse.error('Language and code are required', 'INVALID_INPUT')
      );
    }

    const langConfig = JDOODLE_LANGUAGES[language];
    if (!langConfig) {
      return res.status(400).json(
        ApiResponse.error(`Language '${language}' not supported`, 'INVALID_INPUT')
      );
    }

    // Get JDoodle credentials from environment
    const clientId = process.env.JDOODLE_CLIENT_ID;
    const clientSecret = process.env.JDOODLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json(
        ApiResponse.error('JDoodle API credentials not configured', 'SERVER_ERROR')
      );
    }

    // Prepare JDoodle API request
    const payload = {
      clientId,
      clientSecret,
      script: code,
      stdin,
      language: langConfig.language,
      versionIndex: langConfig.versionIndex,
    };

    // Call JDoodle API
    const response = await fetch('https://api.jdoodle.com/v1/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`JDoodle API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    // Check for API errors
    if (result.error) {
      return res.status(400).json(
        ApiResponse.error(result.error, 'EXECUTION_ERROR')
      );
    }

    // Format response to match frontend expectations
    const executionResult = {
      language,
      version: '1.0',
      run: {
        stdout: result.output || '',
        stderr: result.statusCode !== 200 ? result.error || '' : '',
        code: result.statusCode === 200 ? 0 : 1,
        signal: null,
        output: result.output || '',
      },
      compile: result.compilationError ? {
        stdout: '',
        stderr: result.compilationError,
        code: 1,
        signal: null,
        output: result.compilationError,
      } : undefined,
    };

    return res.json(ApiResponse.success(executionResult));
  } catch (error) {
    console.error('Code execution error:', error);
    return res.status(500).json(
      ApiResponse.error(
        error instanceof Error ? error.message : 'Code execution failed',
        'EXECUTION_ERROR'
      )
    );
  }
});

export { router as executeRouter };
