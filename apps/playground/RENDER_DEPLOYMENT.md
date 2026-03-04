# 🚀 Deploying Playground on Render

This guide walks you through deploying the Code.Scriet Playground on Render as **two separate services** with completely independent commands from your main site.

## 📋 Overview

The Playground consists of **two services**:

1. **Backend API** (`codescriet-playground-api`) - Node.js server for code execution
2. **Frontend Web** (`codescriet-playground-web`) - Static Vite site

Both are completely independent from your main site (codescriet-api and codescriet-web).

---

## 🎯 Method 1: Auto-Deploy via render.yaml (Recommended)

### Step 1: Push Updated render.yaml

The `render.yaml` file in the root of your repository now includes the Playground services:

```yaml
services:
  # ... existing main site services ...
  
  # Playground Backend (Code Execution Server)
  - type: web
    name: codescriet-playground-api
    runtime: node
    plan: free
    buildCommand: cd apps/playground && npm install
    startCommand: cd apps/playground && node execute-server.js
    healthCheckPath: /health
    
  # Playground Frontend (Static Site)  
  - type: web
    name: codescriet-playground-web
    runtime: static
    plan: free
    buildCommand: cd apps/playground && npm install && npm run build
    staticPublishPath: ./apps/playground/dist
```

### Step 2: Deploy via Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New Blueprint Instance"**
3. Connect your GitHub repository
4. Render will detect `render.yaml` and show all 4 services:
   - ✅ codescriet-api (existing)
   - ✅ codescriet-web (existing)
   - ✅ codescriet-playground-api (new)
   - ✅ codescriet-playground-web (new)
5. Click **"Apply"** to deploy all services

### Step 3: Configure Environment Variables

#### For `codescriet-playground-api` (Backend):

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | (Auto-set) |
| `PORT` | `10000` | (Auto-set by Render) |
| `JDOODLE_CLIENT_ID` | Your JDoodle Client ID | Get from https://www.jdoodle.com/compiler-api |
| `JDOODLE_CLIENT_SECRET` | Your JDoodle Secret | Get from https://www.jdoodle.com/compiler-api |
| `ALLOWED_ORIGINS` | `https://playground.codescriet.dev` | Frontend URL for CORS |

#### For `codescriet-playground-web` (Frontend):

| Variable | Value | Description |
|----------|-------|-------------|
| `VITE_API_URL` | `https://codescriet-playground-api.onrender.com` | Backend API URL |

> **Note**: After deploying the backend, copy its URL and set it as `VITE_API_URL` for the frontend.

---

## 🔧 Method 2: Manual Deploy (Alternative)

### Deploy Backend First

1. **Create New Web Service**
   - Go to Render Dashboard → **New** → **Web Service**
   - Connect your repository
   - Name: `codescriet-playground-api`
   
2. **Configure Build Settings**
   - **Root Directory**: Leave blank (uses repo root)
   - **Build Command**: 
     ```bash
     cd apps/playground && npm install
     ```
   - **Start Command**:
     ```bash
     cd apps/playground && node execute-server.js
     ```
   - **Plan**: Free

3. **Set Environment Variables**
   - `NODE_ENV` = `production`
   - `JDOODLE_CLIENT_ID` = Your Client ID
   - `JDOODLE_CLIENT_SECRET` = Your Client Secret
   - `ALLOWED_ORIGINS` = `https://playground.codescriet.dev`

4. **Advanced Settings**
   - Health Check Path: `/health`
   - Auto-Deploy: Yes

5. **Deploy** and wait for it to complete

6. **Copy the deployed URL** (e.g., `https://codescriet-playground-api.onrender.com`)

### Deploy Frontend Second

1. **Create New Static Site**
   - Go to Render Dashboard → **New** → **Static Site**
   - Connect your repository
   - Name: `codescriet-playground-web`

2. **Configure Build Settings**
   - **Root Directory**: Leave blank
   - **Build Command**:
     ```bash
     cd apps/playground && npm install && npm run build
     ```
   - **Publish Directory**: `apps/playground/dist`

3. **Set Environment Variables**
   - `VITE_API_URL` = `https://codescriet-playground-api.onrender.com` (Backend URL from step 1)

4. **Advanced Settings**
   - Auto-Deploy: Yes
   - Add rewrite rule: `/*` → `/index.html` (for SPA routing)

5. **Deploy** and wait for it to complete

---

## 🌐 Custom Domain Setup (Optional)

### For Backend API:

1. Go to `codescriet-playground-api` settings
2. Navigate to **"Custom Domain"**
3. Add: `playground-api.codescriet.dev`
4. Add DNS records in your domain provider:
   ```
   Type: CNAME
   Name: playground-api
   Value: codescriet-playground-api.onrender.com
   ```

### For Frontend:

1. Go to `codescriet-playground-web` settings
2. Navigate to **"Custom Domain"**
3. Add: `playground.codescriet.dev`
4. Add DNS records in your domain provider:
   ```
   Type: CNAME
   Name: playground
   Value: codescriet-playground-web.onrender.com
   ```

5. **Update Environment Variables**:
   - Backend: `ALLOWED_ORIGINS` = `https://playground.codescriet.dev`
   - Frontend: `VITE_API_URL` = `https://playground-api.codescriet.dev`

---

## ✅ Verification Checklist

After deployment, verify everything works:

### Backend Health Check:
```bash
curl https://codescriet-playground-api.onrender.com/health
# Expected: {"status":"ok","service":"code-execution"}
```

### Test Code Execution:
```bash
curl -X POST https://codescriet-playground-api.onrender.com/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "python",
    "code": "print(\"Hello from Render!\")",
    "stdin": ""
  }'
# Expected: {"success":true,"data":{"run":{"stdout":"Hello from Render!","code":0}}}
```

### Frontend:
1. Visit `https://codescriet-playground-web.onrender.com` (or your custom domain)
2. Try running code in all languages:
   - ✅ JavaScript (client-side)
   - ✅ Python
   - ✅ C++
   - ✅ Java
   - ✅ C
   - ✅ TypeScript
   - ✅ HTML/CSS/JS
3. Test stdin input with a program that uses `input()` or `cin`
4. Check browser console for any CORS errors

---

## 🔄 Deployment Commands Summary

All commands are **completely independent** from your main site:

| Service | Build Command | Start Command |
|---------|---------------|---------------|
| **Main API** | `npm install && npx prisma generate && npm run build --workspace=apps/api` | `npx prisma migrate deploy && npm run start --workspace=apps/api` |
| **Main Web** | `npm install && npm run build --workspace=apps/web` | Static files served |
| **Playground API** | `cd apps/playground && npm install` | `cd apps/playground && node execute-server.js` |
| **Playground Web** | `cd apps/playground && npm install && npm run build` | Static files served |

---

## 🐛 Troubleshooting

### Backend Issues:

**"JDoodle API error" in logs**
- Verify `JDOODLE_CLIENT_ID` and `JDOODLE_CLIENT_SECRET` are set correctly
- Check JDoodle account hasn't exceeded free tier limits (200 calls/day)

**"Port already in use"**
- Render automatically assigns `PORT` environment variable
- execute-server.js uses: `process.env.PORT || 5002`

**Health check failing**
- Verify `/health` endpoint is accessible
- Check server logs for startup errors

### Frontend Issues:

**"Failed to fetch" errors**
- Verify `VITE_API_URL` points to correct backend URL
- Check CORS settings: `ALLOWED_ORIGINS` must include frontend URL
- Open browser DevTools → Network tab to see actual error

**Blank page after deployment**
- Check build logs for errors
- Verify `apps/playground/dist` folder was created
- Check publish directory is set to `apps/playground/dist`

**404 on page refresh**
- Ensure rewrite rule exists: `/*` → `/index.html`

### CORS Errors:

If you see CORS errors in browser console:

1. **Backend** `ALLOWED_ORIGINS` must include frontend URL
2. **Restart backend** after changing CORS settings
3. Clear browser cache and try again

Example backend CORS config:
```javascript
// In execute-server.js
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));
```

---

## 📊 Resource Usage (Free Tier)

### Render Free Tier Limits:
- ✅ 750 hours/month per service (enough for 24/7)
- ✅ Services spin down after 15 min inactivity
- ✅ First request after spin-down takes ~30-60 seconds

### JDoodle Free Tier:
- ✅ 200 API calls/day
- ✅ No credit card required
- ✅ Sufficient for testing and small-scale use

### Tips to stay within limits:
- Use client-side execution for JavaScript/HTML
- Cache frequently executed code results
- Monitor JDoodle usage in their dashboard

---

## 🎉 Success!

Once both services are deployed and environment variables are configured:

1. ✅ Backend running at: `https://codescriet-playground-api.onrender.com`
2. ✅ Frontend running at: `https://playground.codescriet.dev`
3. ✅ Main site can link to Playground (already configured in Header.tsx)
4. ✅ All 7 languages working with code execution

---

## 🔗 Useful Links

- [Render Dashboard](https://dashboard.render.com/)
- [JDoodle API](https://www.jdoodle.com/compiler-api)
- [Render Docs - Node.js](https://render.com/docs/deploy-node-express-app)
- [Render Docs - Static Sites](https://render.com/docs/static-sites)
- [Render Docs - Environment Variables](https://render.com/docs/environment-variables)

---

## 📝 Next Steps

1. **Update Main Site Header**: Already done ✅ (Header.tsx line 20)
2. **Monitor Deployments**: Check Render dashboard for logs and metrics
3. **Set Up Alerts**: Configure Render alerts for downtime
4. **Upgrade if Needed**: If you exceed free tier, upgrade to paid plan
5. **Add Analytics**: Track playground usage (optional)

Need help? Check the logs in Render dashboard or reach out to support!
