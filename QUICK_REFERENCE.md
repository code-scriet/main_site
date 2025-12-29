# Quick Reference

## 🚀 Common Commands

### Setup & Installation
```bash
npm install              # Install dependencies
npm run setup           # Complete setup (install + migrate + seed)
```

### Development
```bash
npm run dev             # Start both frontend and backend
npm run web             # Start frontend only (port 5173)
npm run api             # Start backend only (port 5000)
```

### Database
```bash
npm run db:migrate      # Run migrations (development)
npm run db:seed         # Seed database with super admin
npm run db:studio       # Open Prisma Studio GUI
npm run db:reset        # Reset database (⚠️ deletes all data)
```

### Production
```bash
npm run build           # Build both apps
npm run start:prod      # Start production servers
./start-production.sh   # Production start with validation
```

## 🔑 Super Admin Credentials

**Development:**
- Email: `developer.aary@gmail.com`
- Password: `Dk261135@`

**Production:** Set in `.env`:
```env
SUPER_ADMIN_EMAIL=your.email@example.com
SUPER_ADMIN_PASSWORD=your_secure_password
```

## 🌐 URLs

- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- Health Check: http://localhost:5000/health
- Prisma Studio: http://localhost:5555 (when running db:studio)

## 📋 Environment Variables

### Required
```env
DATABASE_URL=postgresql://user:password@host:5432/database
JWT_SECRET=your_secret_key
SUPER_ADMIN_EMAIL=developer.aary@gmail.com
SUPER_ADMIN_PASSWORD=Dk261135@
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### Optional
```env
SUPER_ADMIN_NAME=Super Admin
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5000
PORT=5000
NODE_ENV=development
```

## 🐛 Quick Fixes

### Kill processes on ports
```bash
lsof -ti:5000 | xargs kill  # Backend
lsof -ti:5173 | xargs kill  # Frontend
```

### Reset everything
```bash
rm -rf node_modules
npm install
npm run db:reset
npm run setup
```

### Check errors
```bash
npm run build  # Check for TypeScript errors
```

## 📁 Important Files

- `.env` - Environment variables (not in git)
- `.env.example` - Environment template
- `prisma/schema.prisma` - Database schema
- `prisma/seed.ts` - Seed script
- `package.json` - Scripts and dependencies

## 📚 Documentation

- [SETUP.md](./SETUP.md) - Complete setup guide
- [CHANGES.md](./CHANGES.md) - What changed
- [VERIFICATION.md](./VERIFICATION.md) - Testing checklist
- [COMPLETE.md](./COMPLETE.md) - Setup summary
- [README.md](./README.md) - Project overview
