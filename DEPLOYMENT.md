# 🚀 Deployment Guide - Render (Full Stack)

## Prerequisites
- GitHub repository pushed
- Neon account (database)
- Render account
- Google OAuth app configured
- GitHub OAuth app configured

---

## 1. Database Setup (Neon)

1. Go to [Neon Console](https://console.neon.tech/)
2. Create a new project: `codescriet`
3. Copy the connection string:
   ```
   postgresql://username:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```

---

## 2. Backend Setup (Render)

### Deploy API Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. **Configure Service:**
   - **Name**: `codescriet-api`
   - **Root Directory**: Leave blank
   - **Runtime**: Node
   - **Build Command**: 
     ```bash
     npm install && npx prisma generate --schema=./prisma/schema.prisma && npm run build --workspace=apps/api
     ```
   - **Start Command**: 
     ```bash
     npx prisma migrate deploy --schema=./prisma/schema.prisma && npm run start --workspace=apps/api
     ```
   - **Plan**: Free

5. **Environment Variables:**

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | `postgresql://...@neon.tech/neondb?sslmode=require` |
   | `JWT_SECRET` | Generate: `openssl rand -hex 32` |
   | `FRONTEND_URL` | `https://codescriet-web.onrender.com` |
   | `BACKEND_URL` | `https://codescriet-api.onrender.com` |
   | `GOOGLE_CLIENT_ID` | Your Google OAuth client ID |
   | `GOOGLE_CLIENT_SECRET` | Your Google OAuth secret |
   | `GITHUB_CLIENT_ID` | Your GitHub OAuth client ID |
   | `GITHUB_CLIENT_SECRET` | Your GitHub OAuth secret |
   | `PORT` | `5001` |
   | `SUPER_ADMIN_EMAIL` | Your admin email (e.g., `admin@codescriet.com`) |
   | `SUPER_ADMIN_PASSWORD` | Strong password for admin |
   | `SUPER_ADMIN_NAME` | Admin display name (e.g., `Super Admin`) |

6. Click **Create Web Service**

**Note**: The backend will automatically create the super admin user and default settings on first startup using the environment variables provided.

---

## 3. Frontend Setup (Render)

### Deploy Static Site

1. In Render Dashboard, click **New** → **Static Site**
2. Connect the same GitHub repository
3. **Configure Service:**
   - **Name**: `codescriet-web`
   - **Root Directory**: Leave blank
   - **Build Command**: 
     ```bash
     npm install && npm run build --workspace=apps/web
     ```
   - **Publish Directory**: 
     ```
     apps/web/dist
     ```

4. **Environment Variables:**

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://codescriet-api.onrender.com/api` |

5. Click **Create Static Site**

---

## 4. Update OAuth Callbacks

After both services are deployed:

### Google Cloud Console
1. Go to **APIs & Services** → **Credentials**
2. Edit your OAuth 2.0 Client
3. Add Authorized redirect URI:
   ```
   https://codescriet-api.onrender.com/api/auth/google/callback
   ```

### GitHub Developer Settings
1. Go to **Settings** → **Developer settings** → **OAuth Apps**
2. Edit your application
3. Update Authorization callback URL:
   ```
   https://codescriet-api.onrender.com/api/auth/github/callback
   ```

---

## 5. Keep Backend Alive (Uptime Bot)

Render free tier spins down after 15 minutes of inactivity.

### Using UptimeRobot (Free)

1. Go to [UptimeRobot](https://uptimerobot.com/)
2. Sign up for free account
3. Click **Add New Monitor**
4. Configure:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: codescriet API
   - **URL**: `https://codescriet-api.onrender.com/ping`
   - **Monitoring Interval**: 5 minutes
5. Click **Create Monitor**

### Alternative: Cron-job.org

1. Go to [Cron-job.org](https://cron-job.org/)
2. Sign up
3. Create new cronjob:
   - **URL**: `https://codescriet-api.onrender.com/ping`
   - **Schedule**: Every 5 minutes

---

## 6. Custom Domain (Optional)

### For Frontend (Static Site):
1. In Render, go to your static site
2. Click **Settings** → **Custom Domain**
3. Add your domain: `codescriet.com`
4. Follow DNS configuration instructions

### For Backend (API):
1. In Render, go to your web service
2. Click **Settings** → **Custom Domain**
3. Add your domain: `api.codescriet.com`
4. Update `BACKEND_URL` env var

---

## 7. Verify Deployment

### Backend Health Check
Visit: `https://codescriet-api.onrender.com/health`

Should return:
```json
{
  "status": "ok",
  "timestamp": "2025-12-30T...",
  "environment": "production",
  "version": "1.0.0"
}
```

### Frontend
Visit: `https://codescriet-web.onrender.com`

Should load your homepage.

---

## Deployment Costs

| Service | Plan | Cost |
|---------|------|------|
| Neon Database | Free | $0/month |
| Render API | Free | $0/month |
| Render Static Site | Free | $0/month |
| UptimeRobot | Free | $0/month |
| **Total** | | **$0/month** |

**Note**: Render free services have 750 hours/month. With uptime bot keeping it alive 24/7, you'll use ~720 hours, well within limits.

---

## Troubleshooting

### Backend won't start
- Check logs in Render dashboard
- Verify all environment variables are set
- Ensure DATABASE_URL is correct

### Frontend shows API errors
- Verify `VITE_API_URL` is correct
- Check CORS settings in backend
- Ensure backend is running

### Database connection issues
- Verify Neon database is active
- Check connection string includes `?sslmode=require`
- Run migrations: `npx prisma migrate deploy`

---

## Future Updates

To deploy updates:
1. Push to GitHub main branch
2. Render auto-deploys both services
3. Monitor deployment in Render dashboard

---

## Support

- Render Docs: https://render.com/docs
- Neon Docs: https://neon.tech/docs
- Your app: https://codescriet-web.onrender.com
