# Complete Implementation Prompt for code.scriet Club Website

## Executive Summary
Build a modern, scalable, and professional club website for **code.scriet** - a coding/DSA club. The site must be production-ready, maintainable by non-technical admins, and built with extensibility in mind for future features like contests and leaderboards.

---

## Design System & Brand Identity

### Color Palette
**Primary Colors:**
- Yellow: `#FBBF24` (amber-400) - Primary accent, CTAs, highlights
- Orange: `#F97316` (orange-500) - Secondary accent, hover states
- Brown: `#78350F` (amber-900) - Text, headers, depth

**Supporting Colors:**
- Dark Brown: `#451A03` (amber-950) - Background overlays, cards
- Light Yellow: `#FEF3C7` (amber-100) - Subtle backgrounds
- Cream: `#FFFBEB` (amber-50) - Page backgrounds
- White: `#FFFFFF` - Primary text on dark backgrounds
- Charcoal: `#1F2937` (gray-800) - Body text on light backgrounds

**Gradients:**
- Hero gradient: `from-amber-400 via-orange-500 to-amber-900`
- Card hover: `from-amber-50 to-orange-50`
- Button gradient: `from-orange-500 to-amber-600`

### Typography
- Headings: Inter or Poppins (Bold/Semibold)
- Body: Inter (Regular/Medium)
- Code: JetBrains Mono or Fira Code
- Font sizes follow Tailwind's scale

### Logo Usage
- Logo file: `/public/logo.svg` or `/public/logo.png`
- Header logo size: h-12 to h-16
- Favicon: generated from logo
- Use logo with club name "code.scriet" in header
- Footer: logo + club name stacked

### Component Design Principles
- Use shadcn/ui components as base
- Subtle shadows and gradients for depth
- Smooth transitions (duration-300)
- Hover effects on interactive elements
- Rounded corners (rounded-lg to rounded-xl)
- Glass-morphism effects for overlays
- Micro-animations for engagement

---

## Tech Stack (Mandatory)

### Frontend
- **Framework:** React 18+ with Vite
- **Styling:** Tailwind CSS v3+
- **UI Components:** shadcn/ui (install all necessary components)
- **Icons:** lucide-react
- **Routing:** React Router v6
- **State Management:** React Context API + React Query (TanStack Query)
- **Forms:** React Hook Form + Zod validation
- **Animations:** Framer Motion
- **Deployment:** Vercel

### Backend
- **Runtime:** Node.js 18+ with Express.js
- **Language:** TypeScript
- **Authentication:** Passport.js with OAuth 2.0 (Google, GitHub)
- **Authorization:** JWT + Role-Based Access Control (RBAC)
- **Validation:** Zod
- **Rate Limiting:** express-rate-limit
- **Security:** helmet, cors, express-validator
- **Deployment:** Render (Free Tier)

### Database
- **Provider:** Neon (PostgreSQL)
- **ORM:** Prisma
- **Migrations:** Prisma Migrate
- **Seeding:** Prisma seed script

### Project Structure (Monorepo)
```
code-scriet-platform/
├── apps/
│   ├── web/                    # Frontend (Vite + React)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/        # shadcn components
│   │   │   │   ├── layout/    # Header, Footer, Sidebar
│   │   │   │   ├── home/      # Home page sections
│   │   │   │   ├── dashboard/ # User dashboard components
│   │   │   │   └── admin/     # Admin panel components
│   │   │   ├── pages/
│   │   │   ├── lib/
│   │   │   ├── hooks/
│   │   │   ├── context/
│   │   │   └── utils/
│   │   ├── public/
│   │   │   └── logo.svg       # Club logo
│   │   └── package.json
│   │
│   └── api/                    # Backend (Express + TypeScript)
│       ├── src/
│       │   ├── routes/
│       │   ├── controllers/
│       │   ├── middleware/
│       │   ├── services/
│       │   └── utils/
│       └── package.json
│
├── packages/
│   └── shared/                 # Shared types & constants
│       ├── types/
│       └── constants/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── .env.example
├── turbo.json                  # (if using Turborepo)
└── README.md
```

---

## Database Schema (PostgreSQL - Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  PUBLIC
  USER
  CORE_MEMBER
  ADMIN
}

enum EventStatus {
  UPCOMING
  ONGOING
  PAST
}

enum AnnouncementPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

model User {
  id            String    @id @default(uuid())
  name          String
  email         String    @unique
  avatar        String?
  oauthProvider String    @map("oauth_provider")
  oauthId       String    @map("oauth_id")
  role          Role      @default(USER)
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  
  registrations EventRegistration[]
  announcements Announcement[]
  qotdSubmissions QOTDSubmission[]
  
  @@index([email])
  @@map("users")
}

model Event {
  id          String       @id @default(uuid())
  title       String
  description String       @db.Text
  status      EventStatus  @default(UPCOMING)
  startDate   DateTime     @map("start_date")
  endDate     DateTime?    @map("end_date")
  location    String?
  capacity    Int?
  imageUrl    String?      @map("image_url")
  createdBy   String       @map("created_by")
  createdAt   DateTime     @default(now()) @map("created_at")
  updatedAt   DateTime     @updatedAt @map("updated_at")
  
  registrations EventRegistration[]
  
  @@index([status, startDate])
  @@map("events")
}

model EventRegistration {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  eventId   String   @map("event_id")
  timestamp DateTime @default(now())
  
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  
  @@unique([userId, eventId])
  @@index([eventId])
  @@map("event_registrations")
}

model Announcement {
  id        String               @id @default(uuid())
  title     String
  body      String               @db.Text
  priority  AnnouncementPriority @default(MEDIUM)
  createdBy String               @map("created_by")
  createdAt DateTime             @default(now()) @map("created_at")
  updatedAt DateTime             @updatedAt @map("updated_at")
  
  creator User @relation(fields: [createdBy], references: [id])
  
  @@index([createdAt])
  @@map("announcements")
}

model TeamMember {
  id        String   @id @default(uuid())
  name      String
  role      String
  team      String
  imageUrl  String   @map("image_url")
  github    String?
  linkedin  String?
  twitter   String?
  order     Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at")
  
  @@index([team, order])
  @@map("team_members")
}

model Achievement {
  id          String   @id @default(uuid())
  title       String
  description String   @db.Text
  eventName   String?  @map("event_name")
  achievedBy  String   @map("achieved_by")
  imageUrl    String?  @map("image_url")
  date        DateTime
  createdAt   DateTime @default(now()) @map("created_at")
  
  @@index([date])
  @@map("achievements")
}

model QOTD {
  id          String   @id @default(uuid())
  date        DateTime @unique
  question    String   @db.Text
  problemLink String   @map("problem_link")
  difficulty  String
  createdAt   DateTime @default(now()) @map("created_at")
  
  submissions QOTDSubmission[]
  
  @@index([date])
  @@map("qotd")
}

model QOTDSubmission {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  qotdId    String   @map("qotd_id")
  timestamp DateTime @default(now())
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  qotd QOTD @relation(fields: [qotdId], references: [id], onDelete: Cascade)
  
  @@unique([userId, qotdId])
  @@index([qotdId])
  @@map("qotd_submissions")
}

model AuditLog {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  action    String
  entity    String
  entityId  String?  @map("entity_id")
  metadata  Json?
  timestamp DateTime @default(now())
  
  @@index([userId, timestamp])
  @@map("audit_logs")
}
```

---

## Core Pages & Features

### 1. Public Pages (No Authentication Required)

#### 1.1 Home Page (`/`)
**Sections:**
1. **Hero Section**
   - Animated gradient background (yellow-orange-brown)
   - Club logo + "code.scriet"
   - Tagline: "Building Tomorrow's Problem Solvers"
   - CTA buttons: "Join Us" (primary) + "Sign In" (secondary)
   - Subtle floating animation on hero elements

2. **Stats Section**
   - Live counters: Total Members, Events Conducted, Achievements
   - Grid layout with cards
   - Count-up animation on scroll into view

3. **About Preview**
   - Brief mission statement
   - 3 USP cards (e.g., "Learn DSA", "Build Projects", "Network")
   - CTA: "Learn More" → /about

4. **Upcoming Events**
   - Horizontal scrollable cards (3-4 visible)
   - Event card: image, title, date, status badge
   - CTA: "View All Events" → /events

5. **Achievements Showcase**
   - Masonry grid or carousel
   - Achievement cards with images
   - CTA: "See All Achievements" → /achievements

6. **Team Highlight**
   - 4-6 featured team members
   - Circular avatars with hover effects
   - CTA: "Meet the Team" → /team

7. **Footer**
   - Logo + club description
   - Quick links (About, Events, Team, Contact)
   - Social media icons
   - Copyright notice

#### 1.2 About Page (`/about`)
- Vision & Mission statement
- Club history timeline
- What we do (3-4 focus areas)
- What we are NOT (set expectations)
- Long-term roadmap (Phase 1, 2, 3 overview)

#### 1.3 Team Page (`/team`)
- Team hierarchy sections: Admin → Core Members → Volunteers
- Filter by team (Technical, Management, Design, etc.)
- Member cards:
  - Avatar (circular, hover zoom)
  - Name + Role
  - Social links (GitHub, LinkedIn, Twitter)
  - Smooth fade-in animation

#### 1.4 Events Page (`/events`)
- Tabs: Upcoming | Ongoing | Past
- Event cards in grid layout
- Each card:
  - Cover image
  - Title + brief description
  - Date & location
  - Status badge
  - "View Details" button
- Click → Event detail modal or page
- "Register" CTA (redirects to sign-in if not authenticated)

#### 1.5 Achievements Page (`/achievements`)
- Filter by: Event Type, Year
- Achievement cards:
  - Image
  - Title + description
  - Achieved by (person/team)
  - Date
- Lightbox view for images

### 2. Authenticated Pages (Require Sign-In)

#### 2.1 User Dashboard (`/dashboard`)
**Layout:**
- Sidebar navigation (collapsible on mobile)
- Main content area

**Sections:**
1. **Welcome Banner**
   - "Welcome back, [Name]!"
   - Profile avatar + quick stats (events registered, QOTD streak)

2. **My Events**
   - List of registered events
   - Status: Upcoming, Completed
   - Quick actions: View Details, Cancel Registration

3. **Announcements Feed**
   - Sorted by priority + timestamp
   - Priority badges (color-coded)
   - Markdown rendering
   - Pagination or infinite scroll

4. **QOTD Widget**
   - Today's problem
   - Link to external platform
   - "Mark as Done" button
   - Current streak display

5. **Leaderboard Widget**
   - Top 10 participants
   - User's rank highlighted
   - Link to full leaderboard page

6. **Quick Links**
   - External recruitment portal
   - Resource library (if added later)

#### 2.2 Event Registration Flow
1. User clicks "Register" on event card
2. If not signed in → redirect to /signin
3. If signed in → confirm registration modal
4. Check capacity limit
5. Success → show confirmation + add to "My Events"
6. Email confirmation (future enhancement)

#### 2.3 Announcements Page (`/announcements`)
- Full list of announcements
- Filter by priority
- Search functionality

#### 2.4 Leaderboard Page (`/leaderboard`)
- Table view: Rank, Name, Points/Participation
- Sorting options
- User's row highlighted
- Cached data (update daily)

### 3. Core Member Pages

#### 3.1 Core Member Dashboard (`/core/dashboard`)
Extends user dashboard with:
- "Create Announcement" button
- "Create Event" button
- Recent activity log

#### 3.2 Create/Edit Event (`/core/events/new`, `/core/events/:id/edit`)
**Form Fields:**
- Title (required)
- Description (Markdown editor)
- Status dropdown
- Start Date & Time (date picker)
- End Date & Time (optional)
- Location
- Capacity (optional, number input)
- Cover Image (upload or URL)
- Submit + Preview buttons

**Validation:**
- All required fields
- Start date < End date
- Positive capacity

#### 3.3 Create/Edit Announcement (`/core/announcements/new`)
**Form Fields:**
- Title
- Body (Markdown editor with preview)
- Priority (dropdown)
- Submit button

#### 3.4 Manage Events (`/core/events`)
- Table view: Title, Status, Date, Registrations
- Actions: Edit, Delete, View Registrations
- Search & filter

### 4. Admin Pages

#### 4.1 Admin Dashboard (`/admin/dashboard`)
**Widgets:**
- User statistics
- Event statistics
- System health
- Recent audit logs

#### 4.2 User Management (`/admin/users`)
- Table: Name, Email, Role, Created At
- Actions: Change Role, View Profile, Delete
- Search by email/name
- Bulk actions (future)

#### 4.3 Role Assignment (`/admin/users/:id/roles`)
- Current role display
- Role dropdown (USER, CORE_MEMBER, ADMIN)
- Confirmation modal before change
- Audit log entry created

#### 4.4 Content Moderation (`/admin/content`)
- Tabs: Events, Announcements, Achievements
- Review & approve/reject (future workflow)
- Bulk delete

#### 4.5 Team Management (`/admin/team`)
- CRUD for team members
- Upload avatar
- Set display order
- Drag-and-drop reordering

#### 4.6 System Settings (`/admin/settings`)
- Toggle features (QOTD, Leaderboard)
- Site maintenance mode
- Clear cache
- Export data

---

## API Endpoints (RESTful)

### Authentication (`/api/auth`)
```
POST   /auth/google          # Initiate Google OAuth
POST   /auth/github          # Initiate GitHub OAuth
GET    /auth/callback        # OAuth callback handler
POST   /auth/logout          # Logout (clear JWT)
GET    /auth/me              # Get current user profile
```

### Events (`/api/events`)
```
GET    /events               # Get all events (query: status, limit, offset)
GET    /events/:id           # Get event by ID
POST   /events               # Create event (CORE_MEMBER+)
PUT    /events/:id           # Update event (CORE_MEMBER+)
DELETE /events/:id           # Delete event (ADMIN)
GET    /events/:id/registrations  # Get registrations (CORE_MEMBER+)
```

### Event Registrations (`/api/registrations`)
```
POST   /registrations        # Register for event (USER+)
DELETE /registrations/:id    # Cancel registration (USER+)
GET    /registrations/me     # Get user's registrations
```

### Announcements (`/api/announcements`)
```
GET    /announcements        # Get all announcements (query: priority, limit)
GET    /announcements/:id    # Get announcement by ID
POST   /announcements        # Create announcement (CORE_MEMBER+)
PUT    /announcements/:id    # Update announcement (CORE_MEMBER+)
DELETE /announcements/:id    # Delete announcement (ADMIN)
```

### Team (`/api/team`)
```
GET    /team                 # Get all team members (query: team, order)
POST   /team                 # Add team member (ADMIN)
PUT    /team/:id             # Update team member (ADMIN)
DELETE /team/:id             # Delete team member (ADMIN)
```

### Achievements (`/api/achievements`)
```
GET    /achievements         # Get all achievements (query: year, event)
POST   /achievements         # Add achievement (CORE_MEMBER+)
PUT    /achievements/:id     # Update achievement (CORE_MEMBER+)
DELETE /achievements/:id     # Delete achievement (ADMIN)
```

### QOTD (`/api/qotd`)
```
GET    /qotd/today           # Get today's QOTD
POST   /qotd                 # Create QOTD (CORE_MEMBER+)
POST   /qotd/:id/submit      # Mark QOTD as done (USER+)
GET    /qotd/streak          # Get user's streak
```

### Leaderboard (`/api/leaderboard`)
```
GET    /leaderboard          # Get leaderboard (cached)
GET    /leaderboard/me       # Get user's rank
```

### Users (`/api/users`)
```
GET    /users                # Get all users (ADMIN)
GET    /users/:id            # Get user by ID (ADMIN)
PUT    /users/:id/role       # Update user role (ADMIN)
DELETE /users/:id            # Delete user (ADMIN)
```

### Stats (`/api/stats`)
```
GET    /stats/public         # Public stats (members, events, achievements)
GET    /stats/dashboard      # User dashboard stats (USER+)
GET    /stats/admin          # Admin dashboard stats (ADMIN)
```

---

## Middleware & Security

### Authentication Middleware (`authMiddleware.ts`)
```typescript
// Verify JWT token from Authorization header
// Attach user to req.user
// Reject if invalid/expired
```

### Authorization Middleware (`roleMiddleware.ts`)
```typescript
export const requireRole = (minRole: Role) => {
  return (req, res, next) => {
    if (!req.user || !hasPermission(req.user.role, minRole)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
};

// Role hierarchy: PUBLIC < USER < CORE_MEMBER < ADMIN
```

### Rate Limiting
```typescript
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use("/api", limiter);
```

### Input Validation (with Zod)
```typescript
import { z } from "zod";

const createEventSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  capacity: z.number().positive().optional(),
});

// Use in controller
const validateRequest = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (error) {
    res.status(400).json({ error: error.errors });
  }
};
```

### Audit Logging
```typescript
export const auditLog = async (userId: string, action: string, entity: string, entityId?: string) => {
  await prisma.auditLog.create({
    data: { userId, action, entity, entityId },
  });
};

// Use after critical actions (role change, delete, etc.)
```

### Security Headers (Helmet)
```typescript
import helmet from "helmet";
app.use(helmet());
```

### CORS Configuration
```typescript
import cors from "cors";
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));
```

---

## Frontend Implementation Details

### shadcn/ui Components to Install
```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card input label textarea select dialog dropdown-menu avatar badge tabs table form sheet alert toast separator
```

### State Management (React Query)
```typescript
// Use TanStack Query for server state
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Example: Fetch events
const { data: events, isLoading } = useQuery({
  queryKey: ["events", status],
  queryFn: () => api.getEvents(status),
});

// Example: Register for event
const registerMutation = useMutation({
  mutationFn: (eventId: string) => api.registerForEvent(eventId),
  onSuccess: () => {
    queryClient.invalidateQueries(["events"]);
    toast.success("Registered successfully!");
  },
});
```

### Authentication Context
```typescript
import { createContext, useContext, useState, useEffect } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch user from /api/auth/me on mount
    const token = localStorage.getItem("token");
    if (token) {
      api.getMe().then(setUser).catch(() => setUser(null)).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = (token: string) => {
    localStorage.setItem("token", token);
    api.getMe().then(setUser);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
```

### Protected Route Component
```typescript
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export const ProtectedRoute = ({ minRole = "USER" }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/signin" replace />;
  if (!hasPermission(user.role, minRole)) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
};
```

### Animation Examples (Framer Motion)
```typescript
import { motion } from "framer-motion";

// Fade in on scroll
<motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
  viewport={{ once: true }}
>
  {/* Content */}
</motion.div>

// Stagger children
<motion.div
  variants={{
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }}
  initial="hidden"
  animate="show"
>
  {items.map((item) => (
    <motion.div key={item.id} variants={{ hidden: { y: 20 }, show: { y: 0 } }}>
      {item.name}
    </motion.div>
  ))}
</motion.div>
```

---

## Deployment Instructions

### Environment Variables

**Backend (.env)**
```
DATABASE_URL=postgresql://user:password@host/dbname
JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=7d

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

FRONTEND_URL=https://code-scriet.vercel.app
BACKEND_URL=https://code-scriet-api.onrender.com

NODE_ENV=production
PORT=5000
```

**Frontend (.env)**
```
VITE_API_URL=https://code-scriet-api.onrender.com/api
```

### Vercel Deployment (Frontend)
1. Connect GitHub repo
2. Set root directory: `apps/web`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add environment variables
6. Deploy

### Render Deployment (Backend)
1. Create new Web Service
2. Connect GitHub repo
3. Set root directory: `apps/api`
4. Build command: `npm install && npm run build`
5. Start command: `npm start`
6. Add environment variables
7. Deploy

### Neon Database Setup
1. Create new project
2. Copy connection string
3. Add to backend .env as `DATABASE_URL`
4. Run migrations: `npx prisma migrate deploy`
5. Run seed: `npx prisma db seed`

---

## Testing & Quality Assurance

### Unit Tests (Vitest)
- Test utility functions
- Test API endpoints (with mock DB)
- Test React components (React Testing Library)

### Integration Tests
- Test OAuth flow end-to-end
- Test registration flow
- Test admin actions

### Manual Testing Checklist
- [ ] Sign in with Google
- [ ] Sign in with GitHub
- [ ] Register for event
- [ ] Cancel registration
- [ ] View announcements
- [ ] Core member creates event
- [ ] Admin changes user role
- [ ] Mobile responsiveness
- [ ] Accessibility (keyboard navigation, screen readers)

---

## Accessibility Requirements

- Semantic HTML (`<nav>`, `<main>`, `<article>`, etc.)
- ARIA labels where needed
- Keyboard navigation support (Tab, Enter, Escape)
- Focus indicators on all interactive elements
- Alt text for all images
- Sufficient color contrast (WCAG AA compliant)
- Screen reader testing with NVDA/JAWS

---

## Performance Optimization

- Code splitting (React.lazy)
- Image optimization (next-gen formats, lazy loading)
- API response caching (React Query)
- Database indexing (already in schema)
- CDN for static assets
- Gzip compression
- Minimize bundle size (analyze with `vite-bundle-visualizer`)

---

## Future Enhancements (Phase 2+)

### Phase 2: Recruitment Portal Integration
- Deep linking from main site
- Optional SSO (JWT trust between platforms)
- Unified user profiles

### Phase 3: DSA Contest Platform
- External compute service (Judge0 API or similar)
- Real-time leaderboard
- Contest creation interface
- Submission history

### Phase 4: Analytics Dashboard
- User engagement metrics
- Event attendance tracking
- Growth trends
- A/B testing framework

---

## Additional Notes

- **Logo:** Ensure logo is in SVG format for scalability. Place in `/apps/web/public/logo.svg`
- **Favicon:** Generate from logo using online tools (realfavicongenerator.net)
- **Brand Voice:** Professional yet approachable. Avoid overly casual language.
- **Responsive Design:** Mobile-first approach. Test on devices: iPhone SE, iPad, Desktop (1920x1080)
- **Browser Support:** Chrome, Firefox, Safari, Edge (latest 2 versions)
- **Documentation:** Maintain README with setup instructions, API docs with Swagger (future)
- **Monitoring:** Set up error tracking (Sentry) and analytics (Plausible or Google Analytics)

---

## Final Checklist Before Launch

- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] Seed data populated
- [ ] OAuth credentials verified
- [ ] SSL certificates active (Vercel/Render handle this)
- [ ] Rate limiting tested
- [ ] Role-based access tested
- [ ] Mobile UI tested on real devices
- [ ] Accessibility audit passed
- [ ] Load testing completed (Artillery or k6)
- [ ] Backup strategy in place (Neon automatic backups)
- [ ] Monitoring alerts configured
- [ ] Documentation updated

---

## Success Metrics (Track These)

- User signups per week
- Event registration rate
- Announcement engagement (views)
- QOTD participation rate
- Page load time (< 2s)
- API response time (< 200ms)
- Error rate (< 1%)
- Bounce rate (< 40%)

---

## Contact & Support

For questions or issues:
- **Development Lead:** [Your Name]
- **GitHub Issues:** [Repo URL]/issues
- **Discord/Slack:** [Club server]

---

**END OF IMPLEMENTATION GUIDE**

This document contains all requirements to build the code.scriet club website from scratch. Every decision has been made to prioritize scalability, maintainability, and user experience. Follow this guide strictly, and you'll have a production-ready, professional club website that can grow with your club's needs.