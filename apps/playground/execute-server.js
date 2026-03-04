import express from 'express';
import cors from 'cors';

const app = express();
// Use PORT for production (Render/Railway), EXECUTE_PORT for local, or default to 5002
const PORT = process.env.PORT || process.env.EXECUTE_PORT || 5002;

// Middleware
app.use(cors());
app.use(express.json());

// Language configuration for JDoodle API
const JDOODLE_LANGUAGES = {
  javascript: { language: 'nodejs', versionIndex: 4 },
  python: { language: 'python3', versionIndex: 4 },
  cpp: { language: 'cpp17', versionIndex: 0 },
  java: { language: 'java', versionIndex: 4 },
  c: { language: 'c', versionIndex: 5 },
  typescript: { language: 'nodejs', versionIndex: 4 },
};

/**
 * POST /api/execute
 * Execute code using JDoodle API
 */
app.post('/api/execute', async (req, res) => {
  try {
    const { language, code, stdin = '' } = req.body;

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
    const clientId = process.env.JDOODLE_CLIENT_ID || '48c12c7c4f88518681775a915c6dea0';
    const clientSecret = process.env.JDOODLE_CLIENT_SECRET || 'f495de418da280ee0329aa118e8d09c7c27af69c671da1c083faf2cae0187e00';

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

    console.log(`Executing ${language} code...`);

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

    console.log(`✅ Execution completed for ${language}`);

    return res.json({
      success: true,
      data: executionResult,
    });
  } catch (error) {
    console.error('❌ Code execution error:', error);
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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Code Execution API',
    version: '1.0.0',
    endpoints: {
      execute: 'POST /api/execute',
      health: 'GET /health',
    },
  });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 Code Execution Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Server running on:  http://localhost:${PORT}`);
  console.log(`📝 API endpoint:       POST http://localhost:${PORT}/api/execute`);
  console.log(`✅ Health check:       GET  http://localhost:${PORT}/health`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});
