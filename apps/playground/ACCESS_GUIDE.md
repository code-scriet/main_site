# 🎮 Code.Scriet Playground - Access Guide

## ✅ Current Status

- **Local Development**: ✅ Running at http://localhost:5174
- **Production Domain**: ⏳ Ready to deploy to playground.codescriet.dev

---

## 🌐 Access Locally

The playground is **currently running** and accessible at:

### **http://localhost:5174**

Simply open your browser and navigate to this URL.

---

## 🚀 Deploy to playground.codescriet.dev

### Quick Deploy (3 steps)

```bash
# Step 1: Navigate to playground
cd apps/playground

# Step 2: Run deployment script
./deploy.sh

# Step 3: Add custom domain in Vercel dashboard
```

### Detailed Steps

#### 1. Deploy to Vercel

```bash
cd apps/playground

# Login to Vercel (first time only)
vercel login

# Deploy to production
vercel --prod
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Select your account
- Link to existing project? **N** (first time)
- Project name? **playground** (or any name)
- Directory? **.**
- Override settings? **N**

#### 2. Add Custom Domain

After deployment completes:

1. Click the provided Vercel dashboard link
2. Go to **Settings** → **Domains**
3. Click **Add Domain**
4. Enter: `playground.codescriet.dev`
5. Click **Add**

#### 3. Configure DNS

In your domain DNS settings (where you manage codescriet.dev):

**Add CNAME Record:**
```
Type:  CNAME
Name:  playground
Value: cname.vercel-dns.com
TTL:   Auto or 3600
```

Or use the specific value Vercel provides (shown in Vercel dashboard).

#### 4. Wait for DNS Propagation

- Usually takes 5-30 minutes
- Check status: https://dnschecker.org
- Vercel will show "Valid" when ready

#### 5. Access Your Playground

Once DNS propagates:
- Visit: **https://playground.codescriet.dev**
- Automatic HTTPS enabled by Vercel

---

## 📋 Available Commands

### Development
```bash
npm run playground              # Start dev server (already running)
```

### Build & Deploy
```bash
npm run playground:build        # Build for production
npm run playground:preview      # Preview production build locally
npm run playground:deploy       # Deploy to Vercel (uses deploy.sh)
```

### Combined
```bash
npm run dev:all                # Start API + Web + Playground
npm run build:all              # Build all three apps
```

---

## 🔧 Troubleshooting

### Can't Access Localhost

**Issue**: "This site can't be reached"

**Solution**: 
```bash
# Check if server is running
ps aux | grep vite

# If not running, start it
npm run playground

# Wait for "ready in XXX ms" message
# Then open http://localhost:5174
```

### Port Already in Use

```bash
# Kill process on port 5174
lsof -ti:5174 | xargs kill -9

# Or change port in vite.config.ts
server: { port: 5175 }
```

### Build Fails

```bash
# Clean and rebuild
cd apps/playground
rm -rf node_modules dist
cd ../..
npm install
npm run playground:build
```

### Custom Domain Not Working

1. **Check DNS Propagation**: https://dnschecker.org
   - Search for: `playground.codescriet.dev`
   - Should show CNAME pointing to Vercel

2. **Verify in Vercel**:
   - Domain should show "Valid" status
   - SSL certificate should be "Active"

3. **Wait**: DNS can take up to 48 hours (usually 5-30 mins)

4. **Clear Cache**:
   ```bash
   # Chrome: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
   # Or use Incognito mode
   ```

---

## 🎯 Quick Reference

| Environment | URL | Status |
|-------------|-----|--------|
| **Local Dev** | http://localhost:5174 | ✅ Running Now |
| **Production** | https://playground.codescriet.dev | ⏳ Ready to Deploy |

---

## 📖 Documentation

- [README.md](README.md) - Full feature documentation
- [DEPLOYMENT.md](DEPLOYMENT.md) - Detailed deployment guide
- [CUSTOM_DOMAIN_SETUP.md](CUSTOM_DOMAIN_SETUP.md) - Domain configuration
- [QUICKSTART.md](QUICKSTART.md) - Quick command reference

---

## ✨ Next Steps

### Right Now (Local)
1. Open http://localhost:5174 in your browser
2. Select a language (JavaScript, Python, C++, etc.)
3. Write or edit code
4. Click "Run Code" or press Ctrl+Enter
5. See output in the terminal panel

### For Production
1. Run: `cd apps/playground && ./deploy.sh`
2. Add domain in Vercel dashboard
3. Configure DNS CNAME record
4. Wait for DNS propagation (5-30 mins)
5. Access at https://playground.codescriet.dev

---

**Need Help?**
- Check terminal output for errors
- Review build logs in Vercel dashboard
- Verify DNS settings
- Clear browser cache

**All Set!** 🎉
