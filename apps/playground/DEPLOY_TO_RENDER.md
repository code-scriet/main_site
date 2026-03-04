# 🚀 Deploy Playground to Render (Quick Guide)

Your main site is already deployed. This guide is **only for deploying the Playground**.

---

## 🎯 Option 1: Auto-Deploy via Blueprint (Recommended)

### Step 1: Push to GitHub

```bash
git add .
git commit -m "Add Playground with Render deployment config"
git push
```

### Step 2: Create Blueprint Instance

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New"** → **"Blueprint Instance"**
3. Connect your GitHub repository (if not already connected)
4. Render will find `apps/playground/render.yaml`
5. It will show **2 services**:
   - ✅ codescriet-playground-api (Backend)
   - ✅ codescriet-playground-web (Frontend)
6. Click **"Apply"** to deploy both services

### Step 3: Set Environment Variables

#### Backend Service (`codescriet-playground-api`):

After deployment starts, go to the service settings and add:

| Variable | Value |
|----------|-------|
| `JDOODLE_CLIENT_ID` | `48c12c7c4f88518681775a915c6dea0` |
| `JDOODLE_CLIENT_SECRET` | `f495de418da280ee0329aa118e8d09c7c27af69c671da1c083faf2cae0187e00` |

#### Frontend Service (`codescriet-playground-web`):

After backend deploys, copy its URL and add to frontend:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://codescriet-playground-api.onrender.com` |

Then **manually redeploy** the frontend service.

---

## 🎯 Option 2: Manual Deploy (Alternative)

If Blueprint doesn't work, deploy manually:

### Step 1: Deploy Backend

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New"** → **"Web Service"**
3. Connect your repository
4. **Configure:**
   - **Name:** `codescriet-playground-api`
   - **Root Directory:** (leave blank)
   - **Build Command:** `cd apps/playground && npm install`
   - **Start Command:** `cd apps/playground && node execute-server.js`
   - **Health Check Path:** `/health`
5. **Environment Variables:**
   - `NODE_ENV` = `production`
   - `JDOODLE_CLIENT_ID` = `48c12c7c4f88518681775a915c6dea0`
   - `JDOODLE_CLIENT_SECRET` = `f495de418da280ee0329aa118e8d09c7c27af69c671da1c083faf2cae0187e00`
   - `ALLOWED_ORIGINS` = `https://playground.codescriet.dev`
6. Click **"Create Web Service"**
7. **Wait 5-10 minutes** for deployment
8. **Copy the deployed URL** (e.g., `https://codescriet-playground-api.onrender.com`)

### Step 2: Deploy Frontend

1. Click **"New"** → **"Static Site"**
2. Connect your repository
3. **Configure:**
   - **Name:** `codescriet-playground-web`
   - **Root Directory:** (leave blank)
   - **Build Command:** `cd apps/playground && npm install && npm run build`
   - **Publish Directory:** `apps/playground/dist`
4. **Environment Variables:**
   - `VITE_API_URL` = (paste backend URL from step 1)
5. **Advanced Settings:**
   - Add rewrite rule: `/*` → `/index.html`
6. Click **"Create Static Site"**
7. **Wait 3-5 minutes** for deployment

---

## ✅ Verify Deployment

### Test Backend:
```bash
curl https://codescriet-playground-api.onrender.com/health
# Expected: {"status":"ok","service":"code-execution"}
```

### Test Code Execution:
```bash
curl -X POST https://codescriet-playground-api.onrender.com/api/execute \
  -H "Content-Type: application/json" \
  -d '{"language":"python","code":"print(\"Works!\")","stdin":""}'
# Expected: {"success":true,"data":{"run":{"stdout":"Works!\n","code":0}}}
```

### Test Frontend:
1. Visit `https://codescriet-playground-web.onrender.com`
2. Try running code in all 7 languages
3. Check browser console for errors

---

## 🌐 Custom Domain (Optional)

### Backend: `playground-api.codescriet.dev`

1. Go to backend service → **Custom Domain**
2. Add: `playground-api.codescriet.dev`
3. Add DNS record in your domain provider:
   ```
   Type: CNAME
   Name: playground-api
   Value: codescriet-playground-api.onrender.com
   ```

### Frontend: `playground.codescriet.dev`

1. Go to frontend service → **Custom Domain**
2. Add: `playground.codescriet.dev`
3. Add DNS record in your domain provider:
   ```
   Type: CNAME
   Name: playground
   Value: codescriet-playground-web.onrender.com
   ```

4. **Update Environment Variables:**
   - Backend: `ALLOWED_ORIGINS` = `https://playground.codescriet.dev`
   - Frontend: `VITE_API_URL` = `https://playground-api.codescriet.dev`
   - **Redeploy both services** after updating

---

## 🎉 Done!

Once deployed:
- ✅ Playground Frontend: `https://codescriet-playground-web.onrender.com` or `https://playground.codescriet.dev`
- ✅ Playground Backend: `https://codescriet-playground-api.onrender.com` or `https://playground-api.codescriet.dev`
- ✅ Main site already has the Playground link in navigation (Header.tsx)

---

## 🐛 Troubleshooting

**"JDoodle API error" in backend logs:**
- Verify credentials are set correctly
- Check JDoodle free tier limit (200 calls/day)

**"Failed to fetch" in frontend:**
- Verify `VITE_API_URL` points to correct backend
- Check backend `ALLOWED_ORIGINS` includes frontend URL
- Redeploy frontend after changing URL

**Backend shows "Application failed to respond":**
- Check `/health` endpoint works
- Review startup logs for errors
- Verify `node execute-server.js` works locally

**Frontend shows blank page:**
- Check build logs for errors
- Verify publish directory: `apps/playground/dist`
- Ensure rewrite rule exists: `/*` → `/index.html`

---

## 📞 Quick Support

- [Render Dashboard](https://dashboard.render.com/)
- [Render Docs](https://render.com/docs)
- [JDoodle API](https://www.jdoodle.com/compiler-api)

Need help? Check the backend logs in Render dashboard for detailed error messages.
