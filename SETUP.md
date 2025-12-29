# Club Site Setup Guide

## Quick Start

### Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   - Copy `.env.example` to `.env`
   - Update the following required variables in `.env`:
     ```env
     DATABASE_URL=postgresql://user:password@localhost:5432/club_site
     SUPER_ADMIN_EMAIL=developer.aary@gmail.com
     SUPER_ADMIN_PASSWORD=Dk261135@
     JWT_SECRET=your_secure_jwt_secret
     GOOGLE_CLIENT_ID=your_google_client_id
     GOOGLE_CLIENT_SECRET=your_google_client_secret
     ```

3. **Setup database:**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

4. **Start development servers:**
   ```bash
   npm run dev
   ```
   This will start both frontend (http://localhost:5173) and backend (http://localhost:5000)

### Production Setup

1. **Set environment variables:**
   ```env
   NODE_ENV=production
   DATABASE_URL=your_production_database_url
   SUPER_ADMIN_EMAIL=your_admin_email
   SUPER_ADMIN_PASSWORD=your_secure_password
   JWT_SECRET=your_production_jwt_secret
   FRONTEND_URL=https://your-frontend-domain.com
   BACKEND_URL=https://your-backend-domain.com
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GITHUB_CLIENT_ID=your_github_client_id (optional)
   GITHUB_CLIENT_SECRET=your_github_client_secret (optional)
   ```

2. **Deploy:**
   ```bash
   npm install
   npm run db:migrate
   npm run db:seed
   npm run build
   npm run start:prod
   ```

## Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run build` - Build both frontend and backend for production
- `npm run start:prod` - Start production servers
- `npm run web` - Start only frontend
- `npm run api` - Start only backend
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with super admin
- `npm run db:reset` - Reset database (WARNING: deletes all data)
- `npm run setup` - Complete setup (install, migrate, seed)

## Super Admin

The super admin is created during database seeding. Default credentials:
- **Email**: developer.aary@gmail.com
- **Password**: Dk261135@

In production, these should be set via environment variables:
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `SUPER_ADMIN_NAME` (optional, defaults to "Super Admin")

## Initial Data

The database is seeded with ONLY the super admin user. No sample events, teams, or announcements are included. The admin should add all content through the admin panel after logging in.

## Environment Variables

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `SUPER_ADMIN_EMAIL` - Super admin email
- `SUPER_ADMIN_PASSWORD` - Super admin password
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

### Optional
- `SUPER_ADMIN_NAME` - Super admin display name (default: "Super Admin")
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret
- `FRONTEND_URL` - Frontend URL (default: http://localhost:5173)
- `BACKEND_URL` - Backend URL (default: http://localhost:5000)
- `PORT` - Backend port (default: 5000)
- `JWT_EXPIRES_IN` - JWT expiration time (default: 7d)
- `NODE_ENV` - Environment (development/production)

## Troubleshooting

### Database connection errors
- Ensure PostgreSQL is running
- Verify DATABASE_URL is correct
- Check database user has proper permissions

### Seed errors
- Run `npm run db:reset` to reset database
- Ensure .env file exists with correct variables
- Check that SUPER_ADMIN_EMAIL is valid

### OAuth errors
- Verify OAuth credentials in .env
- Ensure redirect URIs are configured in Google/GitHub console
- Check FRONTEND_URL and BACKEND_URL match your deployment
