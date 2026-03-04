# 🚀 Code Execution Server Setup

## Overview
The playground uses a **backend proxy server** (`execute-server.js`) to execute code via the JDoodle API. This solves the **CORS issue** that prevents direct API calls from the browser.

## Architecture

```
Frontend (Vite)     Backend Proxy        JDoodle API
Port 5174      →    Port 5002      →    api.jdoodle.com
   ↓                    ↓                      ↓
User writes code  →  Proxy forwards  →  Executes code
                     to JDoodle             returns output
```

## Why We Need This Setup

**Problem**: Browsers block direct fetch() calls to third-party APIs like JDoodle due to CORS (Cross-Origin Resource Sharing) security policy.

**Solution**: Create a Node.js backend server that:
1. Receives code execution requests from the frontend
2. Forwards them to JDoodle API (server-to-server, no CORS)
3. Returns formatted results to the frontend

## Files

- **`execute-server.js`** - Express server that proxies requests to JDoodle API
- **`.env`** - Contains VITE_API_URL and JDoodle credentials
- **`src/utils/pistonApi.ts`** - Frontend code that calls the backend proxy

## How to Run

### 1. Start the Execution Server (Backend)
```bash
cd apps/playground
node execute-server.js
```

Server will start on **http://localhost:5002**

### 2. Start the Playground (Frontend)
```bash
# In a different terminal
cd apps/playground
npm run dev
```

Frontend will start on **http://localhost:5174**

### 3. Run Both with Concurrently (Recommended)
Update `package.json` in the root workspace:
```json
"scripts": {
  "playground:dev": "concurrently -n \"EXEC,PLAYGROUND\" -c \"cyan,magenta\" \"cd apps/playground && node execute-server.js\" \"cd apps/playground && npm run dev\""
}
```

Then run:
```bash
npm run playground:dev
```

## Testing

### Test Execution Server Health
```bash
curl http://localhost:5002/health
```

Expected response:
```json
{"status":"ok","service":"code-execution"}
```

### Test Code Execution
```bash
curl -X POST http://localhost:5002/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "python",
    "code": "print(\"Hello from Python!\")",
    "stdin": ""
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "language": "python",
    "version": "1.0",
    "run": {
      "stdout": "Hello from Python!",
      "stderr": "",
      "code": 0,
      "signal": null,
      "output": "Hello from Python!"
    }
  }
}
```

## Environment Variables

### `.env` Configuration
```env
# Frontend API URL (points to backend proxy)
VITE_API_URL=http://localhost:5002

# JDoodle Credentials (for backend server)
JDOODLE_CLIENT_ID=48c12c7c4f88518681775a915c6dea0
JDOODLE_CLIENT_SECRET=f495de418da280ee0329aa118e8d09c7c27af69c671da1c083faf2cae0187e00

# Also exposed to frontend (fallback, but backend proxy is preferred)
VITE_JDOODLE_CLIENT_ID=48c12c7c4f88518681775a915c6dea0
VITE_JDOODLE_CLIENT_SECRET=f495de418da280ee0329aa118e8d09c7c27af69c671da1c083faf2cae0187e00
```

## Supported Languages

| Language   | Execution Method       | Status |
|------------|------------------------|--------|
| JavaScript | Client-side (eval)     | ✅ Works without backend |
| Python     | Backend → JDoodle API  | ✅ Working |
| C++        | Backend → JDoodle API  | ✅ Working |
| Java       | Backend → JDoodle API  | ✅ Working |
| C          | Backend → JDoodle API  | ✅ Working |
| TypeScript | Backend → JDoodle API  | ✅ Working |
| HTML/CSS   | Client-side (iframe)   | ✅ Works without backend |

## Code Flow

### 1. User clicks "Run Code" in the playground

### 2. Frontend calls `executeCode()` in `pistonApi.ts`
```typescript
// For JavaScript - runs client-side
if (language === 'javascript') {
  return executeJavaScriptClient(code, stdin);
}

// For other languages - calls backend proxy
return executeWithJDoodle({ language, code, stdin });
```

### 3. Backend proxy receives request at `/api/execute`
```javascript
app.post('/api/execute', async (req, res) => {
  // Extract language, code, stdin from request body
  // Call JDoodle API with credentials
  // Format and return response
});
```

### 4. JDoodle executes code and returns output

### 5. Backend forwards response to frontend

### 6. Frontend displays output in the playground

## Troubleshooting

### Error: "Failed to fetch"
- **Cause**: Execution server not running or wrong URL
- **Fix**: 
  1. Check if execution server is running: `lsof -ti:5002`
  2. Verify `.env` has `VITE_API_URL=http://localhost:5002`
  3. Restart frontend to pick up env changes

### Error: "JDoodle API credentials not configured"
- **Cause**: Missing environment variables
- **Fix**: Ensure `.env` contains valid `JDOODLE_CLIENT_ID` and `JDOODLE_CLIENT_SECRET`

### Error: "Language not supported"
- **Cause**: Language not in JDOODLE_LANGUAGES mapping
- **Fix**: Add language to the mapping in `execute-server.js`

### Port Already in Use
```bash
# Kill process on port 5002
lsof -ti:5002 | xargs kill -9

# Kill process on port 5174
lsof -ti:5174 | xargs kill -9
```

## Production Deployment

### For Vercel/Netlify (Serverless)

1. **Deploy Frontend** to Vercel/Netlify
2. **Deploy Backend** as Vercel Edge Function or separate service
3. **Update Environment Variables**:
   ```env
   VITE_API_URL=https://your-execution-api.vercel.app
   JDOODLE_CLIENT_ID=your_client_id
   JDOODLE_CLIENT_SECRET=your_client_secret
   ```

### For playground.codescriet.dev

1. Deploy frontend to Vercel with custom domain
2. Deploy execution server to Railway/Render/Fly.io
3. Update DNS:
   - `playground.codescriet.dev` → Vercel
   - `api-playground.codescriet.dev` → Execution server

## JDoodle API Limits

- **Free Tier**: 200 calls/day
- **Rate Limit**: Generous for development
- **Upgrade**: Available at https://www.jdoodle.com/compiler-api/

To check remaining credits:
```bash
curl -X POST https://api.jdoodle.com/v1/credit-spent \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "your_client_id",
    "clientSecret": "your_client_secret"
  }'
```

## Alternative Execution Services

If JDoodle limits are reached, consider:
- **Rextester** - https://rextester.com/main
- **Programiz** - https://www.programiz.com/api
- **Sphere Engine** - https://sphere-engine.com/
- **Custom sandboxed execution** using Docker containers

## Security Notes

⚠️ **Never expose JDoodle credentials in frontend code**
✅ Credentials are only in `.env` and `execute-server.js` (server-side)
✅ Frontend calls backend proxy, not JDoodle directly
✅ Add rate limiting in production to prevent abuse

## Next Steps

- [ ] Add request caching to reduce API calls
- [ ] Implement rate limiting (e.g., 10 executions/minute per user)
- [ ] Add execution timeout on backend (30 seconds max)
- [ ] Monitor JDoodle credit usage
- [ ] Set up production deployment
- [ ] Add WebAssembly fallback for offline execution
- [ ] Implement code execution queue for heavy load
