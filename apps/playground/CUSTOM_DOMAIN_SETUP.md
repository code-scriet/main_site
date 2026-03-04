# Deploying to playground.codescriet.dev

## Quick Deployment Steps

### 1. Deploy to Vercel

```bash
cd apps/playground

# Login to Vercel (if not already)
vercel login

# Deploy to production
vercel --prod
```

### 2. Add Custom Domain

After deployment:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Domains**
3. Add custom domain: `playground.codescriet.dev`

### 3. Configure DNS

Add these DNS records to your domain provider:

**Option A: Using Vercel DNS (Recommended)**
- Vercel will provide you with nameservers
- Update your domain's nameservers to Vercel's nameservers

**Option B: Using CNAME**
```
Type: CNAME
Name: playground
Value: cname.vercel-dns.com
```

Or use the specific value Vercel provides like:
```
Type: CNAME
Name: playground
Value: your-project-name.vercel.app
```

### 4. Verify Deployment

Once DNS propagates (usually 5-60 minutes):
- Visit: https://playground.codescriet.dev
- Should see your playground running

## Alternative: Deploy via GitHub

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Add playground"
   git push
   ```

2. **Connect to Vercel**:
   - Go to https://vercel.com/new
   - Import your repository
   - Select **apps/playground** as root directory
   - Deploy

3. **Configure Build Settings**:
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Root Directory: `apps/playground`

4. **Add Domain** as described above

## Environment Variables (Vercel)

In Vercel project settings → Environment Variables, add:

```
VITE_PISTON_API_URL=https://emkc.org/api/v2/piston
VITE_API_URL=https://api.codescriet.dev  (if using backend)
```

## Quick Deploy Command

```bash
# From root directory
cd apps/playground
vercel --prod

# Follow prompts:
# - Set root directory: .
# - Build command: npm run build
# - Output directory: dist
```

## Troubleshooting

### Domain Not Working
- Check DNS propagation: https://dnschecker.org
- Verify CNAME is pointing correctly
- Wait 5-60 minutes for DNS to propagate

### Build Fails on Vercel
- Ensure all dependencies in package.json
- Check build logs in Vercel dashboard
- Verify Node.js version (should be 18+)

### 404 Errors
- Ensure vercel.json has proper rewrites (already configured)
- Check build output includes all files

## Current Status

✅ **Local Development**: http://localhost:5174  
⏳ **Production**: Pending deployment to playground.codescriet.dev

## Next Steps

1. Run `cd apps/playground && vercel --prod`
2. Follow Vercel prompts
3. Add custom domain in Vercel dashboard
4. Configure DNS
5. Wait for DNS propagation
6. Access at https://playground.codescriet.dev
