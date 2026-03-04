# ✅ Playground Fixes & Deployment Summary

## 🐛 Bugs Fixed

### 1. **"Unexpected token '<', "<!DOCTYPE"... not valid JSON" Error**
**Problem**: Backend execution server wasn't properly configured, causing frontend to receive HTML error pages instead of JSON responses.

**Solution**:
- Fixed `VITE_API_URL` default value in `pistonApi.ts` (was `http://localhost:5001/api`, now `http://localhost:5002`)
- Added better error handling to detect HTML responses
- Added console logging for debugging
- Created production-ready PORT handling (uses `PORT` env variable for Render/Railway)

### 2. **Environment Variable Not Loading**
**Problem**: Vite wasn't picking up the new `VITE_API_URL` after changing `.env`

**Solution**:
- Restart frontend server to reload environment variables
- Created `.env.production` for production builds
- Added helper script (`start-dev.sh`) to properly restart services

### 3. **Port Conflicts**
**Problem**: Multiple processes running on same ports

**Solution**:
- Created `start-dev.sh` script that kills existing processes before starting
- Updated `npm run playground` to use concurrently for both services
- Added proper port detection and cleanup

---

## 🎯 How to Run Locally

### **Option 1: Quick Start (Recommended)**
```bash
cd apps/playground
./start-dev.sh
```

### **Option 2: From Project Root**
```bash
npm run playground
```

### **Option 3: Manual (Two Terminals)**

Terminal 1:
```bash
cd apps/playground
node execute-server.js
```

Terminal 2:
```bash
cd apps/playground
npm run dev
```

Then open: **http://localhost:5174**

---

## 🚀 How to Deploy on Render

### **Step 1: Deploy Backend (Execution Server)**

1. Go to https://render.com → **New** → **Web Service**
2. Connect your GitHub repository
3. Configure:
   ```
   Name: playground-api
   Runtime: Node
   Region: Oregon (US West)
   Branch: main
   Root Directory: apps/playground
   Build Command: npm install
   Start Command: node execute-server.js
   ```

4. Add Environment Variables:
   ```
   JDOODLE_CLIENT_ID=48c12c7c4f88518681775a915c6dea0
   JDOODLE_CLIENT_SECRET=f495de418da280ee0329aa118e8d09c7c27af69c671da1c083faf2cae0187e00
   NODE_ENV=production
   ```

5. Click **Create Web Service**

6. **Important**: Copy the deployed URL (e.g., `https://playground-api.onrender.com`)

### **Step 2: Deploy Frontend (Static Site)**

1. Go to Render Dashboard → **New** → **Static Site**
2. Connect your GitHub repository
3. Configure:
   ```
   Name: playground-frontend
   Branch: main
   Root Directory: apps/playground
   Build Command: npm install && npm run build
   Publish Directory: dist
   ```

4. Add Environment Variable:
   ```
   VITE_API_URL=https://playground-api.onrender.com
   ```
   ⚠️ **Use the backend URL from Step 1!**

5. Click **Create Static Site**

### **Step 3: Add Custom Domains (Optional)**

**For Backend:**
1. In playground-api service → **Settings** → **Custom Domain**
2. Add: `playground-api.codescriet.dev`
3. Update DNS (add CNAME record):
   ```
   Type: CNAME
   Name: playground-api
   Value: playground-api.onrender.com
   ```

**For Frontend:**
1. In playground-frontend service → **Settings** → **Custom Domain**
2. Add: `playground.codescriet.dev`
3. Update DNS (add CNAME record):
   ```
   Type: CNAME
   Name: playground
   Value: playground-frontend.onrender.com
   ```

4. **Update frontend environment variable**:
   ```
   VITE_API_URL=https://playground-api.codescriet.dev
   ```

5. **Redeploy frontend** to use new domain

---

## 📋 Deployment Checklist

- [ ] Backend deployed on Render
- [ ] Frontend deployed on Render
- [ ] Environment variables set correctly
- [ ] Frontend `VITE_API_URL` points to backend URL
- [ ] Test Python code execution
- [ ] Test C++ code execution
- [ ] Test stdin input functionality
- [ ] (Optional) Custom domains configured
- [ ] (Optional) DNS records added

---

## 🔍 Verify Deployment

### Test Backend
```bash
curl https://your-backend-url.onrender.com/health
# Should return: {"status":"ok","service":"code-execution"}
```

### Test Code Execution
```bash
curl -X POST https://your-backend-url.onrender.com/api/execute \
  -H "Content-Type: application/json" \
  -d '{"language":"python","code":"print(\"Hello, Render!\")","stdin":""}'
```

### Test Frontend
Open `https://your-frontend-url.onrender.com` in browser and run code.

---

## 🌐 Navigation Bar Setup

The "Playground" link is **already added** to your main website navigation!

**File**: `apps/web/src/components/layout/Header.tsx` (Line 20)

```tsx
{ 
  name: 'Playground', 
  href: import.meta.env.DEV 
    ? 'http://localhost:5174' 
    : 'https://playground.codescriet.dev', 
  external: true 
}
```

This means:
- **Development**: Links to `http://localhost:5174`
- **Production**: Links to `https://playground.codescriet.dev`
- **Opens in new tab** (because `external: true`)

---

## 📁 Files Created/Modified

### New Files
1. `apps/playground/execute-server.js` - Backend proxy server
2. `apps/playground/start-dev.sh` - Development start script
3. `apps/playground/start-production.sh` - Production start script
4. `apps/playground/render.yaml` - Render deployment config
5. `apps/playground/.env.production` - Production environment
6. `apps/playground/EXECUTION_SETUP.md` - Detailed setup guide
7. `apps/playground/DEPLOYMENT.md` - Deployment guide (updated)

### Modified Files
1. `apps/playground/.env` - Updated API URL to port 5002
2. `apps/playground/src/utils/pistonApi.ts` - Fixed backend URL, added error handling
3. `apps/playground/package.json` - Added execute-server script
4. `package.json` (root) - Updated playground scripts
5. `apps/web/src/components/layout/Header.tsx` - Already has Playground link

---

## 🎉 What's Working Now

✅ **JavaScript** - Runs client-side (instant)
✅ **Python** - Runs via backend + JDoodle
✅ **C++** - Runs via backend + JDoodle
✅ **Java** - Runs via backend + JDoodle
✅ **C** - Runs via backend + JDoodle
✅ **TypeScript** - Runs via backend + JDoodle
✅ **HTML/CSS/JS** - Runs in iframe
✅ **stdin Input** - Supported for all languages
✅ **Navigation** - Playground link in header
✅ **Separate Deployment** - Independent frontend & backend
✅ **Auto-save** - Code saved to localStorage
✅ **Themes** - Light/dark mode
✅ **Download** - Save code to file
✅ **Format** - Basic code formatting
✅ **Fullscreen** - Distraction-free mode

---

## 💰 Costs

### Free Option
- **Render Free Tier**: Backend spins down after 15 minutes of inactivity (will be slow on first request)
- **Render Static**: Frontend always available
- **JDoodle Free**: 200 calls/day

### Production Option
- **Render Starter**: $7/month for backend (always on)
- **Render Static**: Free
- **JDoodle**: $7/month for 2000 calls/day
- **Total**: ~$14/month

---

## 🆘 Quick Fixes

### If playground shows error after deployment:
1. Check backend is running (visit `/health` endpoint)
2. Verify frontend `VITE_API_URL` is correct
3. Check browser console for exact error
4. Redeploy frontend after env variable changes

### If backend deployment fails:
1. Check Render logs for errors
2. Verify all environment variables are set
3. Ensure `package.json` has correct scripts
4. Check Node version (should be 18+)

---

## 📞 Support

For detailed guides:
- **Setup**: `apps/playground/EXECUTION_SETUP.md`
- **Deployment**: `apps/playground/DEPLOYMENT.md`
- **README**: `apps/playground/README.md`

---

**🎯 Next Steps**: Deploy to Render following Step 1 & Step 2 above!
