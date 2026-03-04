# Deploying the Playground

This guide explains how to deploy the Code.Scriet Playground as a standalone application.

## 🚀 Quick Deploy Options

### Option 1: Vercel (Recommended)

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Configure**
   Create `vercel.json` in `apps/playground/`:
   ```json
   {
     "buildCommand": "npm run build",
     "outputDirectory": "dist",
     "devCommand": "npm run dev",
     "framework": "vite",
     "rewrites": [
       { "source": "/(.*)", "destination": "/index.html" }
     ]
   }
   ```

3. **Deploy**
   ```bash
   cd apps/playground
   vercel --prod
   ```

4. **Environment Variables**
   Set in Vercel Dashboard:
   - `VITE_PISTON_API_URL`: https://emkc.org/api/v2/piston
   - `VITE_API_URL`: (optional) Your backend API URL

### Option 2: Netlify

1. **Install Netlify CLI**
   ```bash
   npm i -g netlify-cli
   ```

2. **Configure**
   Create `netlify.toml` in `apps/playground/`:
   ```toml
   [build]
     command = "npm run build"
     publish = "dist"

   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

3. **Deploy**
   ```bash
   cd apps/playground
   netlify deploy --prod
   ```

### Option 3: Railway

1. **Create `railway.json`**:
   ```json
   {
     "build": {
       "builder": "NIXPACKS",
       "buildCommand": "npm run build"
     },
     "deploy": {
       "startCommand": "npm run preview -- --host 0.0.0.0 --port $PORT",
       "restartPolicyType": "ON_FAILURE"
     }
   }
   ```

2. **Deploy**:
   - Push to GitHub
   - Connect repository to Railway
   - Deploy automatically

### Option 4: Docker

1. **Create Dockerfile**:
   ```dockerfile
   FROM node:18-alpine AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build

   FROM nginx:alpine
   COPY --from=builder /app/dist /usr/share/nginx/html
   COPY nginx.conf /etc/nginx/conf.d/default.conf
   EXPOSE 80
   CMD ["nginx", "-g", "daemon off;"]
   ```

2. **Create `nginx.conf`**:
   ```nginx
   server {
     listen 80;
     server_name _;
     root /usr/share/nginx/html;
     index index.html;

     location / {
       try_files $uri $uri/ /index.html;
     }

     location /api {
       proxy_pass http://your-api-url;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
     }
   }
   ```

3. **Build and run**:
   ```bash
   docker build -t playground .
   docker run -p 80:80 playground
   ```

## 🔧 Build Configuration

### Production Build

```bash
# From root
npm run playground:build

# Or from playground directory
cd apps/playground
npm run build
```

### Preview Locally

```bash
npm run playground:preview
# Opens on http://localhost:5174
```

### Environment Variables

Create `.env.production` in `apps/playground/`:

```env
VITE_PISTON_API_URL=https://emkc.org/api/v2/piston
VITE_API_URL=https://your-api-domain.com
```

## 🌐 Domain Configuration

### Custom Domain on Vercel

1. Go to Project Settings → Domains
2. Add your domain (e.g., `playground.codescriet.dev`)
3. Configure DNS:
   ```
   Type: CNAME
   Name: playground
   Value: cname.vercel-dns.com
   ```

### Custom Domain on Netlify

1. Go to Domain Settings
2. Add custom domain
3. Configure DNS:
   ```
   Type: CNAME
   Name: playground
   Value: your-site.netlify.app
   ```

## 🔐 Security Considerations

### Content Security Policy

Add to `index.html`:

```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-eval' 'unsafe-inline'; 
               style-src 'self' 'unsafe-inline'; 
               connect-src 'self' https://emkc.org; 
               frame-src 'self';">
```

### CORS Configuration

Piston API allows CORS by default, but if using your own backend:

```typescript
// In your API
app.use(cors({
  origin: ['https://playground.yourdomain.com'],
  credentials: true
}));
```

## 📊 Performance Optimization

### Build Optimizations

Already configured in `vite.config.ts`:

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'monaco-editor': ['@monaco-editor/react', 'monaco-editor'],
        'vendor': ['react', 'react-dom', 'react-router-dom'],
      },
    },
  },
}
```

### CDN Configuration

For faster asset loading, use Vercel's/Netlify's built-in CDN.

Or configure CloudFlare:
1. Point domain to CloudFlare
2. Enable "Auto Minify" for JS, CSS, HTML
3. Enable "Rocket Loader"
4. Set Browser Cache TTL to 1 year

## 🐛 Troubleshooting

### Monaco Editor Not Loading

Ensure proper asset paths:
```typescript
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      assetFileNames: 'assets/[name]-[hash][extname]'
    }
  }
}
```

### API CORS Errors

1. Check VITE_PISTON_API_URL is set correctly
2. Verify production environment variables
3. Check browser console for specific errors

### Build Fails

```bash
# Clear cache and rebuild
rm -rf node_modules dist
npm install
npm run build
```

### Large Bundle Size

Monaco Editor is large (~800KB). Options:
1. Use code splitting (already implemented)
2. Lazy load Monaco:
   ```typescript
   import { lazy, Suspense } from 'react';
   const CodeEditor = lazy(() => import('./CodeEditor'));
   ```

## 📈 Monitoring

### Add Analytics (Google Analytics)

In `index.html`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Add Error Tracking (Sentry)

```bash
npm install @sentry/react
```

```typescript
// main.tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "your-sentry-dsn",
  environment: "production",
});
```

## ✅ Pre-Deploy Checklist

- [ ] All environment variables configured
- [ ] Build completes without errors
- [ ] Preview works locally
- [ ] All features tested
- [ ] Console has no errors
- [ ] Mobile responsive design works
- [ ] Lighthouse score > 90
- [ ] CORS configured if using backend
- [ ] Analytics/monitoring set up
- [ ] Domain configured (if using custom domain)

## 🔄 CI/CD Setup (GitHub Actions)

Create `.github/workflows/deploy-playground.yml`:

```yaml
name: Deploy Playground

on:
  push:
    branches: [main]
    paths:
      - 'apps/playground/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        working-directory: ./apps/playground
        run: npm run build
        env:
          VITE_PISTON_API_URL: ${{ secrets.VITE_PISTON_API_URL }}
          
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          working-directory: ./apps/playground
```

---

Need help? Check the [main README](README.md) or open an issue.
