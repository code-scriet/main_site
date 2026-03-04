# Playground Deployment Checklist 

Use this checklist when deploying to Render for the first time.

## 📋 Pre-Deployment

- [ ] JDoodle account created at https://www.jdoodle.com/compiler-api
- [ ] JDoodle Client ID obtained
- [ ] JDoodle Client Secret obtained
- [ ] GitHub repository pushed with latest changes
- [ ] `render.yaml` updated with Playground services

## 🎯 Deployment Steps

### 1. Deploy Backend API Service

- [ ] Go to [Render Dashboard](https://dashboard.render.com/)
- [ ] Click "New Blueprint Instance" (or "New Web Service")
- [ ] Connect your GitHub repository
- [ ] Service name: `codescriet-playground-api`
- [ ] Build command: `cd apps/playground && npm install`
- [ ] Start command: `cd apps/playground && node execute-server.js`
- [ ] Health check path: `/health`
- [ ] Set environment variables:
  - [ ] `NODE_ENV` = `production`
  - [ ] `JDOODLE_CLIENT_ID` = (your Client ID)
  - [ ] `JDOODLE_CLIENT_SECRET` = (your Client Secret)
  - [ ] `ALLOWED_ORIGINS` = `https://playground.codescriet.dev`
- [ ] Click "Create Web Service"
- [ ] Wait for deployment to complete (5-10 minutes)
- [ ] Copy the deployed URL (e.g., `https://codescriet-playground-api.onrender.com`)

### 2. Deploy Frontend Static Site

- [ ] Go to [Render Dashboard](https://dashboard.render.com/)
- [ ] Click "New Static Site"
- [ ] Connect your GitHub repository
- [ ] Service name: `codescriet-playground-web`
- [ ] Build command: `cd apps/playground && npm install && npm run build`
- [ ] Publish directory: `apps/playground/dist`
- [ ] Set environment variables:
  - [ ] `VITE_API_URL` = (Backend URL from step 1)
- [ ] Add rewrite rule: `/*` → `/index.html`
- [ ] Click "Create Static Site"
- [ ] Wait for deployment to complete (3-5 minutes)
- [ ] Copy the deployed URL (e.g., `https://codescriet-playground-web.onrender.com`)

### 3. Update Backend CORS (if needed)

- [ ] Go back to backend service settings
- [ ] Update `ALLOWED_ORIGINS` to include actual frontend URL
- [ ] Save and redeploy

## ✅ Verification

### Backend Health Check
```bash
curl https://codescriet-playground-api.onrender.com/health
```
Expected: `{"status":"ok","service":"code-execution"}`

### Test Code Execution
```bash
curl -X POST https://codescriet-playground-api.onrender.com/api/execute \
  -H "Content-Type: application/json" \
  -d '{"language":"python","code":"print(\"Hello!\")","stdin":""}'
```
Expected: `{"success":true,"data":{"run":{"stdout":"Hello!\n","code":0}}}`

### Test Frontend
- [ ] Visit frontend URL in browser
- [ ] Test JavaScript execution (client-side, should be instant)
- [ ] Test Python execution (backend, should take 2-3 seconds)
- [ ] Test C++ with stdin input
- [ ] Test Java execution
- [ ] Check browser console for errors
- [ ] Verify all 7 languages work

## 🌐 Custom Domains (Optional)

### Backend Domain
- [ ] Go to backend service → Custom Domain
- [ ] Add: `playground-api.codescriet.dev`
- [ ] Copy CNAME target
- [ ] Add DNS record in domain provider:
  ```
  Type: CNAME
  Name: playground-api
  Value: [Render's CNAME target]
  ```
- [ ] Wait for DNS propagation (up to 24 hours)
- [ ] Update frontend `VITE_API_URL` to use custom domain
- [ ] Redeploy frontend

### Frontend Domain
- [ ] Go to frontend service → Custom Domain
- [ ] Add: `playground.codescriet.dev`
- [ ] Copy CNAME target
- [ ] Add DNS record in domain provider:
  ```
  Type: CNAME
  Name: playground
  Value: [Render's CNAME target]
  ```
- [ ] Wait for DNS propagation
- [ ] Update backend `ALLOWED_ORIGINS` to include custom domain
- [ ] Redeploy backend

## 🔄 Update Main Site Header

The Header is already configured, but verify the production URL:

- [ ] Check `apps/web/src/components/layout/Header.tsx` line 20
- [ ] Verify production URL matches: `https://playground.codescriet.dev`
- [ ] Test the link from main site

## 🎉 Post-Deployment

- [ ] Bookmark both Render service dashboards
- [ ] Set up Render email notifications for downtime
- [ ] Monitor JDoodle usage (200 calls/day limit on free tier)
- [ ] Test all features end-to-end
- [ ] Share the playground link!

## 🐛 Troubleshooting

**Backend won't start:**
- Check environment variables are set correctly
- Review logs in Render dashboard
- Verify health check endpoint returns 200

**Frontend shows "Failed to fetch":**
- Verify `VITE_API_URL` is correct
- Check CORS settings in backend
- Open browser DevTools → Network tab for details

**Code execution fails:**
- Verify JDoodle credentials are valid
- Check JDoodle daily limit (200 calls)
- Test backend directly with curl

**Slow to load (first time):**
- Render free tier spins down after 15 min inactivity
- First request after spin-down takes 30-60 seconds
- This is normal for free tier

## 📊 Monitoring

After successful deployment, monitor:
- [ ] Render dashboard for service health
- [ ] JDoodle dashboard for API usage
- [ ] Browser console for frontend errors
- [ ] Backend logs for execution errors

## 📝 Notes

- Free tier services spin down after 15 minutes of inactivity
- First request after spin-down takes ~30-60 seconds to wake up
- JDoodle free tier: 200 API calls per day
- Backend and Frontend have completely independent builds from main site
- All deployment commands are in `render.yaml`

---

✅ Once all checkboxes are complete, your Playground is live!

For detailed instructions, see [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md)
