# Code.Scriet Club Platform - AI Reference Guide

**Last Updated:** January 20, 2026  
**Purpose:** Quick reference for AI assistants to understand the project without scanning the entire codebase.

---

## 🏗️ Project Architecture

### Monorepo Structure (npm workspaces)
```
club_site/
├── apps/
│   ├── api/          # Backend (Express + TypeScript)
│   └── web/          # Frontend (React + Vite + TypeScript)
├── packages/
│   └── shared/       # Shared types/constants
└── prisma/           # Database schema & migrations
```

### Tech Stack Overview
| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS |
| **UI Library** | Shadcn/ui (Radix UI primitives) |
| **Animations** | Framer Motion |
| **State** | React Context + TanStack Query |
| **Routing** | React Router DOM v7 |
| **Forms** | React Hook Form + Zod |
| **Backend** | Express.js, TypeScript, Node.js |
| **Database** | PostgreSQL + Prisma ORM |
| **Auth** | Passport.js (OAuth2: Google/GitHub) + JWT |
| **Security** | Helmet, CORS, bcrypt, rate limiting |
| **Real-time** | Socket.io |

---

## 🗄️ Database Schema (Prisma)

### User Roles Hierarchy
```
PUBLIC → USER → MEMBER → CORE_MEMBER → ADMIN
```

### Core Models
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **User** | Authentication & profiles | email, password, role, phone, course, branch, year, profileCompleted |
| **Settings** | Global app config | clubName, clubEmail, registrationOpen, showLeaderboard, showQOTD, showAchievements, **hiringEnabled** |
| **Event** | Club activities | title, status, startDate, endDate, registrationStartDate, registrationEndDate, capacity |
| **EventRegistration** | User event sign-ups | userId, eventId, timestamp |
| **Announcement** | Club updates | title, body, priority (LOW/MEDIUM/HIGH/URGENT), createdBy |
| **HiringApplication** | Team recruitment | name, email, department, year, applyingRole, status, skills |
| **QOTD** | Daily coding challenge | question, problemLink, difficulty, date |
| **QOTDSubmission** | User submissions | userId, qotdId, answer, submittedAt |
| **TeamMember** | Public team display | name, role, bio, avatar, social links |
| **Achievement** | Club milestones | title, description, icon, date |
| **AuditLog** | Admin activity tracking | action, entity, userId, metadata |

### Enums
- **Role**: PUBLIC, USER, MEMBER, CORE_MEMBER, ADMIN
- **EventStatus**: UPCOMING, ONGOING, PAST
- **AnnouncementPriority**: LOW, MEDIUM, HIGH, URGENT
- **ApplyingRole**: TECHNICAL, DESIGNING, VIDEO_EDITING, MANAGEMENT
- **ApplicationStatus**: PENDING, INTERVIEW_SCHEDULED, SELECTED, REJECTED

---

## 🔐 Authentication Flow

### Methods Supported
1. **OAuth2** (Google, GitHub) - Production-ready
2. **Email/Password** - Basic auth with bcrypt hashing
3. **Dev Login** (Optional) - Quick dev environment access

### JWT Token Structure
```typescript
{
  id: string,        // User ID
  email: string,
  role: Role,
  iat: number,       // Issued at
  exp: number        // Expires (7 days default)
}
```

### Protected Route Levels
- **USER**: Basic dashboard access
- **MEMBER**: Can view member-only content
- **CORE_MEMBER**: Can create events, announcements, QOTD
- **ADMIN**: Full access (user management, settings, hiring apps, team management)

---

## 📁 Frontend Structure (`apps/web/src/`)

### Pages Organization
```
pages/
├── HomePage.tsx              # Landing page with hero
├── AboutPage.tsx             # Club information
├── EventsPage.tsx            # Public events listing
├── AnnouncementsPage.tsx     # Public announcements
├── TeamPage.tsx              # Team member showcase
├── AchievementsPage.tsx      # Club achievements
├── SignInPage.tsx            # Authentication page
├── JoinUsPage.tsx            # Hiring application form
├── AuthCallbackPage.tsx      # OAuth redirect handler
├── dashboard/                # User-level protected pages
│   ├── DashboardOverview.tsx
│   ├── DashboardEvents.tsx
│   ├── DashboardAnnouncements.tsx
│   ├── DashboardLeaderboard.tsx
│   ├── ProfilePage.tsx
│   ├── CreateEvent.tsx       # CORE_MEMBER+
│   ├── CreateAnnouncement.tsx # CORE_MEMBER+
│   └── CreateQOTD.tsx        # CORE_MEMBER+
└── admin/                    # Admin-only pages
    ├── AdminUsers.tsx        # User management
    ├── AdminTeam.tsx         # Team member management
    ├── AdminHiring.tsx       # Hiring applications
    ├── AdminEventRegistrations.tsx
    ├── AdminSettings.tsx     # Global settings
    └── EditEvent.tsx
```

### Component Organization
```
components/
├── auth/
│   └── ProtectedRoute.tsx    # Role-based access control
├── dashboard/
│   ├── DashboardLayout.tsx   # Main layout with sidebar
│   └── QOTDWidget.tsx        # Daily challenge widget
├── home/
│   └── Hero.tsx              # Homepage hero section
├── layout/
│   ├── Layout.tsx            # Public page wrapper
│   └── Header.tsx            # Navigation bar
└── ui/                       # Shadcn/ui components
    ├── button.tsx
    ├── card.tsx
    ├── input.tsx
    ├── badge.tsx
    └── ... (40+ reusable components)
```

### Public Assets (`apps/web/public/`)
```
public/
├── logo.jpeg                 # Club logo (used in header, hero, signin)
├── logo.svg                  # SVG version
├── robots.txt               # SEO crawlers config
├── sitemap.xml              # SEO sitemap
└── _redirects               # Vercel/Netlify redirects
```
**Note**: The logo file is tracked in git and should NOT be ignored.

### Context Providers
```typescript
// apps/web/src/context/
AuthContext.tsx       // user, token, login, logout, isAuthenticated
SettingsContext.tsx   // Global settings from API
SocketContext.tsx     // Real-time notifications
```

---

## 🔌 Backend API Structure (`apps/api/src/`)

### Route Endpoints

#### Authentication (`/api/auth`)
- `POST /auth/register` - Email/password signup
- `POST /auth/login` - Email/password login
- `GET /auth/me` - Get current user (requires JWT)
- `PUT /auth/profile` - Update profile
- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - Google OAuth callback
- `GET /auth/github` - Initiate GitHub OAuth
- `GET /auth/github/callback` - GitHub OAuth callback
- `GET /auth/providers` - Get enabled auth methods

#### Events (`/api/events`)
- `GET /events` - List all events (public)
- `GET /events/:id` - Get single event
- `POST /events` - Create event (CORE_MEMBER+)
- `PUT /events/:id` - Update event (CORE_MEMBER+)
- `DELETE /events/:id` - Delete event (ADMIN)

#### Registrations (`/api/registrations`)
- `GET /registrations/my` - User's registrations (USER+)
- `POST /registrations` - Register for event (USER+)
- `DELETE /registrations/:eventId` - Unregister (USER+)
- `GET /registrations/event/:eventId` - Get event registrations (ADMIN)
- `POST /registrations/export/:eventId` - Export to Excel (ADMIN)

#### Announcements (`/api/announcements`)
- `GET /announcements` - List announcements (public)
- `POST /announcements` - Create (CORE_MEMBER+)
- `PUT /announcements/:id` - Update (CORE_MEMBER+)
- `DELETE /announcements/:id` - Delete (ADMIN)

#### Hiring (`/api/hiring`)
- `POST /hiring/apply` - Submit application
- `GET /hiring/my-application` - Check own status (USER+)
- `GET /hiring/applications` - List all applications (ADMIN)
- `PATCH /hiring/applications/:id` - Update status (ADMIN)

#### QOTD (`/api/qotd`)
- `GET /qotd/today` - Get today's challenge
- `POST /qotd` - Create QOTD (CORE_MEMBER+)
- `POST /qotd/submit` - Submit answer (USER+)
- `GET /qotd/my-submissions` - User's submissions (USER+)

#### Team (`/api/team`)
- `GET /team` - List team members (public)
- `POST /team` - Add member (ADMIN)
- `PUT /team/:id` - Update member (ADMIN)
- `DELETE /team/:id` - Remove member (ADMIN)

#### Users (`/api/users`)
- `GET /users` - List all users (ADMIN)
- `PATCH /users/:id/role` - Update user role (ADMIN)
- `DELETE /users/:id` - Delete user (ADMIN)

#### Settings (`/api/settings`)
- `GET /settings/public` - Public settings (no auth)
- `GET /settings` - Full settings (ADMIN)
- `PUT /settings` - Update settings (ADMIN)
- `PATCH /settings/:key` - Update single setting (ADMIN)

#### Stats (`/api/stats`)
- `GET /stats/overview` - Dashboard stats (ADMIN)

#### Achievements (`/api/achievements`)
- `GET /achievements` - List achievements (public)
- `POST /achievements` - Create (ADMIN)
- `PUT /achievements/:id` - Update (ADMIN)
- `DELETE /achievements/:id` - Delete (ADMIN)

---

## ⚙️ Settings System (Feature Toggles)

Global settings control app behavior dynamically without code changes:

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `clubName` | String | "code.scriet" | Displayed everywhere |
| `clubEmail` | String | contact@codescriet.com | Contact email |
| `clubDescription` | String | ... | Homepage description |
| `registrationOpen` | Boolean | true | Allow event registrations |
| `maxEventsPerUser` | Number | 5 | Concurrent event limit |
| `announcementsEnabled` | Boolean | true | Show announcements |
| `showLeaderboard` | Boolean | false | Display leaderboard |
| `showQOTD` | Boolean | true | Display QOTD widget |
| `showAchievements` | Boolean | true | Display achievements |
| **`hiringEnabled`** | Boolean | true | **Show/hide hiring features** |

### Hiring Toggle Implementation (hiringEnabled)
When `hiringEnabled = false`:
- ❌ "Join Our Team" button hidden (Hero, Header)
- ❌ `/join-us` page redirects to home
- ❌ "Hiring Applications" admin menu hidden
- ❌ "Join the Team" dashboard widget hidden
- ❌ OAuth hiring flow skipped

**Files affected:**
- `apps/web/src/components/home/Hero.tsx`
- `apps/web/src/components/layout/Header.tsx`
- `apps/web/src/components/dashboard/DashboardLayout.tsx`
- `apps/web/src/pages/JoinUsPage.tsx`
- `apps/web/src/pages/dashboard/DashboardOverview.tsx`
- `apps/web/src/pages/AuthCallbackPage.tsx`

---

## 🎨 UI/UX Features

### Animations (Framer Motion)
- Hero section: Typing effect, floating particles, gradient animations
- Page transitions: Fade in/scale effects
- Cards: Hover states with scale/shadow
- Mobile optimizations: Reduced motion for performance

### Responsive Design
- Mobile-first approach
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Collapsible sidebar on mobile
- Touch-friendly UI elements

### Theme
- Primary color: Amber/Orange gradient (`from-amber-500 to-orange-500`)
- Design system: Consistent spacing, typography, shadows
- Dark mode: Not implemented (potential future feature)

---

## 🚀 Deployment

### Environment Variables
```bash
# Backend (.env)
DATABASE_URL=postgresql://...
JWT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
PORT=5001
NODE_ENV=production
FRONTEND_URL=https://...
ALLOWED_ORIGINS=https://...

# Frontend (.env)
VITE_API_URL=https://api.example.com/api
```

### Build Commands
```bash
# Development
npm run dev              # Run both API & Web concurrently

# Production
npm run build            # Build both apps
npm run start:prod       # Start production servers

# Database
npm run db:migrate       # Run migrations (dev)
npm run db:migrate:deploy # Deploy migrations (prod)
npm run db:seed          # Seed database
```

### Deployment Platforms
- **Backend**: Render, Railway, Heroku (Dockerfile available)
- **Frontend**: Vercel, Netlify, Render (Static site)
- **Database**: Render PostgreSQL, Supabase, Neon

---

## 🔒 Security Measures

1. **Helmet.js**: Security headers
2. **CORS**: Strict origin whitelisting
3. **Rate Limiting**: 100 requests/15 min per IP
4. **JWT**: 7-day expiration, secret key rotation
5. **Password Hashing**: bcrypt (10 rounds)
6. **Input Validation**: Zod schemas on all endpoints
7. **SQL Injection**: Prevented via Prisma parameterization
8. **XSS**: React auto-escaping + sanitization
9. **Audit Logs**: All admin actions tracked

---

## 📝 Common Development Tasks

### Add New Page
1. Create `apps/web/src/pages/YourPage.tsx`
2. Add route in `apps/web/src/App.tsx`
3. Add navigation link in `Header.tsx` or `DashboardLayout.tsx`

### Add New API Endpoint
1. Create route file: `apps/api/src/routes/yourRoute.ts`
2. Import in `apps/api/src/index.ts`
3. Register: `app.use('/api/your-route', yourRouter)`
4. Add type definitions in `apps/web/src/lib/api.ts`

### Update Database Schema
1. Modify `prisma/schema.prisma`
2. Run `npm run db:migrate` (creates migration)
3. Update seed file if needed
4. Regenerate Prisma Client (automatic after migrate)

### Add New Settings Toggle
1. Add field to `Settings` model in Prisma
2. Create migration: `npx prisma migrate dev --name add_your_setting`
3. Update `apps/api/src/routes/settings.ts` (add to selects/updates)
4. Update `apps/web/src/lib/api.ts` Settings interface
5. Update `apps/web/src/context/SettingsContext.tsx` defaults
6. Add UI toggle in `apps/web/src/pages/admin/AdminSettings.tsx`
7. Implement conditional logic in relevant components

---

## 🐛 Known Issues & Quirks

1. **Profile Completion**: Users redirected to profile page until academic fields filled
2. **OAuth Redirect**: Hiring intent stored in localStorage during OAuth flow
3. **File Uploads**: Not implemented (resume uploads pending)
4. **Email Service**: Not configured (notifications/credentials sending disabled)
5. **Backup Files**: `hiring_old.ts`, `hiring.ts.backup` exist for reference (should be removed)

---

## 📦 Dependencies to Note

### Frontend Critical
- `framer-motion` - Complex animations, can impact performance
- `@tanstack/react-query` - Server state management
- `socket.io-client` - Real-time updates

### Backend Critical
- `passport` - OAuth strategies
- `prisma` - Database ORM, regenerate client after schema changes
- `socket.io` - Real-time server

---

## 🎯 Future Enhancements (Not Implemented)

- Dark mode toggle
- Email notifications (Nodemailer/SendGrid)
- Resume file uploads
- Advanced leaderboard with points system
- Event capacity management UI
- Bulk user operations
- Advanced analytics dashboard
- Multi-language support (i18n)

---

## 📞 Quick Reference

### NPM Scripts
```bash
npm run dev              # Start dev servers
npm run web              # Frontend only
npm run api              # Backend only
npm run db:studio        # Open Prisma Studio
npm run db:reset         # Reset database (destructive!)
npm run setup            # Install + migrate + seed
```

### Port Configuration
- Frontend: `http://localhost:5173` (Vite default)
- Backend: `http://localhost:5001`
- Database: `localhost:5432` (PostgreSQL default)

### Testing Accounts (After seed)
Check `prisma/seed.ts` for test user credentials

---

## 🔍 Code Search Tips

### Find Feature Implementation
- **Authentication**: Search `authMiddleware`, `requireRole`
- **Settings usage**: Search `settings?.` in components
- **API calls**: Check `apps/web/src/lib/api.ts`
- **Database queries**: Search `prisma.` in API routes
- **Role checks**: Search `user?.role` or `getAuthUser`

### Common File Locations
- **Middleware**: `apps/api/src/middleware/`
- **Utils**: `apps/api/src/utils/` & `apps/web/src/lib/`
- **Types**: `packages/shared/src/types/`
- **Constants**: `packages/shared/src/constants/`

---

**Last Note**: This platform is designed to be modular. Settings system allows feature toggling without code changes. Always check Settings model for available toggles before hardcoding feature visibility.
