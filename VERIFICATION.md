# Verification Checklist

Use this checklist to verify the setup is working correctly.

## ✅ Pre-Setup Verification

- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] PostgreSQL database available
- [ ] Database connection string ready

## ✅ Environment Configuration

- [ ] `.env` file exists in project root
- [ ] `DATABASE_URL` configured with valid PostgreSQL connection
- [ ] `SUPER_ADMIN_EMAIL` set (or using default: developer.aary@gmail.com)
- [ ] `SUPER_ADMIN_PASSWORD` set (or using default: Dk261135@)
- [ ] `JWT_SECRET` configured
- [ ] `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` configured
- [ ] OAuth redirect URIs configured in Google Console

## ✅ Installation

Run these commands and verify success:

```bash
# Install dependencies
npm install
# Expected: No errors, all packages installed

# Run database migrations
npm run db:migrate
# Expected: Migrations applied successfully

# Seed database with super admin
npm run db:seed
# Expected: "✅ Database seeded successfully!"
# Expected: Shows super admin email
```

## ✅ Development Mode

```bash
# Start development servers
npm run dev
```

Verify:
- [ ] Backend starts on http://localhost:5000
- [ ] Frontend starts on http://localhost:5173
- [ ] No error messages in console
- [ ] Can access frontend in browser
- [ ] Backend health check responds: http://localhost:5000/health

## ✅ Super Admin Login

1. [ ] Open http://localhost:5173
2. [ ] Click "Sign In" or navigate to login
3. [ ] Use OAuth or direct login with:
   - Email: developer.aary@gmail.com (or your configured email)
   - Password: Dk261135@ (or your configured password)
4. [ ] Successfully logged in as admin
5. [ ] Can access admin dashboard
6. [ ] Dashboard shows no pre-populated data

## ✅ Admin Panel Functionality

Test admin can:
- [ ] Create events
- [ ] Create announcements
- [ ] Add team members
- [ ] Add achievements
- [ ] Manage users
- [ ] View statistics

## ✅ Database State

Connect to database and verify:
```sql
-- Check users table
SELECT id, name, email, role FROM users;
-- Expected: 1 user with ADMIN role

-- Check other tables are empty
SELECT COUNT(*) FROM events;      -- Expected: 0
SELECT COUNT(*) FROM announcements; -- Expected: 0
SELECT COUNT(*) FROM team_members; -- Expected: 0
SELECT COUNT(*) FROM achievements;  -- Expected: 0
```

Or use Prisma Studio:
```bash
npm run db:studio
```

## ✅ Production Build

```bash
# Build both applications
npm run build
```

Verify:
- [ ] Frontend builds successfully (apps/web/dist created)
- [ ] Backend builds successfully (apps/api/dist created)
- [ ] No TypeScript errors
- [ ] No build warnings

## ✅ Production Start

```bash
# Using the script
./start-production.sh
```

Verify:
- [ ] Script validates environment variables
- [ ] Both servers start successfully
- [ ] Can access application in production mode
- [ ] All features work correctly

## 🐛 Troubleshooting

### Database Connection Failed
- Check PostgreSQL is running
- Verify DATABASE_URL format: `postgresql://user:password@host:5432/database`
- Test connection: `psql <DATABASE_URL>`

### Seed Script Fails
- Ensure database migrations are run first: `npm run db:migrate`
- Check .env file exists and is readable
- Verify SUPER_ADMIN_EMAIL is a valid email format

### OAuth Not Working
- Verify OAuth credentials in .env
- Check redirect URIs in OAuth provider console:
  - Google: http://localhost:5000/api/auth/google/callback
  - GitHub: http://localhost:5000/api/auth/github/callback
- Ensure BACKEND_URL and FRONTEND_URL are correct

### Build Errors
- Clear node_modules: `rm -rf node_modules && npm install`
- Clear build outputs: `rm -rf apps/web/dist apps/api/dist`
- Check TypeScript version: `npx tsc --version`

### Port Already in Use
- Backend (5000): `lsof -ti:5000 | xargs kill`
- Frontend (5173): `lsof -ti:5173 | xargs kill`

## 📝 Notes

- Super admin cannot use OAuth for first login if password-based auth isn't implemented
- For OAuth-only authentication, the super admin must be associated with an OAuth provider
- In production, always use environment variables for sensitive data
- Never commit .env file to version control

## ✨ Success Criteria

Your setup is complete when:
1. ✅ All installations completed without errors
2. ✅ Database is seeded with super admin only
3. ✅ Can start development servers with `npm run dev`
4. ✅ Can login as super admin
5. ✅ Dashboard is empty (no sample data)
6. ✅ Admin can create new content
7. ✅ Production build completes successfully
