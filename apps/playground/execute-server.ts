import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.EXECUTE_PORT || 5002;

// Middleware
app.use(cors());
app.use(express.json());

// Language configuration for JDoodle API
const JDOODLE_LANGUAGES: Record<string, { language: string; versionIndex: number }> = {
  javascript: { language: 'nodejs', versionIndex: 4 },
  python: { language: 'python3', versionIndex: 4 },
  cpp: { language: 'cpp17', versionIndex: 1 },
  java: { language: 'java', versionIndex: 4 },
  c: { language: 'c', versionIndex: 5 },
  typescript: { language: 'nodejs', versionIndex: 4 },
};

interface ExecuteRequest {
  language: string;
  code: string;
  stdin?: string;
}

/**
 * POST /api/execute
 * Execute code using JDoodle API
 */
app.post('/api/execute', async (req, res) => {
  try {
    const { language, code, stdin = '' } = req.body as ExecuteRequest;

    // Validate input
    if (!language || !code) {
      return res.status(400).json({
        success: false,
        error: 'Language and code are required',
      });
    }

    const langConfig = JDOODLE_LANGUAGES[language];
    if (!langConfig) {
      return res.status(400).json({
        success: false,
        error: `Language '${language}' not supported`,
      });
    }

    // Get JDoodle credentials from environment
    const clientId = process.env.JDOODLE_CLIENT_ID;
    const clientSecret = process.env.JDOODLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        success: false,
        error: 'JDoodle API credentials not configured',
      });
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
      return res.status(400).json({
        success: false,
        error: result.error,
      });
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

    return res.json({
      success: true,
      data: executionResult,
    });
  } catch (error) {
    console.error('Code execution error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Code execution failed',
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'code-execution' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Code execution server running on http://localhost:${PORT}`);
  console.log(`📝 API endpoint: POST http://localhost:${PORT}/api/execute`);
  console.log(`✅ Health check: GET http://localhost:${PORT}/health`);
});
