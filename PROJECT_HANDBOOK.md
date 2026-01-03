# Project Handbook: Code.Scriet Club Platform

**Generated Date:** January 3, 2026
**Version:** 1.0.0

## 1. Project Overview

The **Code.Scriet Club Platform** is a full-stack web application designed to manage the activities, events, and membership of the "Code.Scriet" technical club. It features a robust event management system, user role management (students, members, admins), hiring portal, coding challenges (Question of the Day), and a public-facing informative website.

The project is structured as a **Monorepo** containing separate frontend (`apps/web`) and backend (`apps/api`) applications.

## 2. Technology Stack

### **Frontend (`apps/web`)**
- **Framework:** React 19 (via Vite)
- **Language:** TypeScript
- **Styling:** Tailwind CSS, PostCSS, Autoprefixer
- **UI Components:** Shadcn/ui (based on Radix UI), Lucide React (Icons)
- **Animations:** Framer Motion
- **State Management & Data Fetching:** React Query (TanStack Query)
- **Routing:** React Router DOM v7
- **Forms:** React Hook Form + Zod Validation
- **Utilities:** `clsx`, `tailwind-merge`, `class-variance-authority`

### **Backend (`apps/api`)**
- **Runtime:** Node.js
- **Framework:** Express.js
- **Language:** TypeScript
- **Database ORM:** Prisma
- **Database:** PostgreSQL
- **Authentication:** Passport.js (Google, GitHub strategies), JWT (JSON Web Tokens)
- **Validation:** Zod
- **Security:** Helmet, CORS, Express Rate Limit
- **Password Hashing:** Bcrypt.js
- **File Processing:** ExcelJS (for data exports)

### **DevOps & Tooling**
- **Package Manager:** npm (with workspaces)
- **Monorepo Structure:** `workspaces` in root `package.json`
- **Linting:** ESLint

---

## 3. Project Structure

### **Root Directory**
- `package.json`: Orchestrates the monorepo, defines workspaces, and global scripts (e.g., `npm run dev` runs both api and web).
- `prisma/`: Contains the master database schema (`schema.prisma`) and seed scripts.

### **Frontend Structure (`apps/web/src`)**
- `pages/`: Application views/routes.
  - `admin/`: Admin-specific dashboards (Stats, User Management, etc.).
  - `dashboard/`: User/Member dashboards.
  - `AuthCallbackPage.tsx`: Handles OAuth redirects.
  - Public pages: `HomePage`, `EventsPage`, `TeamPage`, `AboutPage`, `JoinUsPage`, etc.
- `components/`: Reusable UI components (likely organized by atomicity or feature).
- `context/`: React Context providers (e.g., AuthProvider, ThemeProvider).
- `hooks/`: Custom React hooks (e.g., `useAuth`, `useToast`).
- `lib/`: Utility libraries and configurations (e.g., `axios` instance, `utils.ts`).
- `assets/`: Static assets like images and fonts.

### **Backend Structure (`apps/api/src`)**
- `routes/`: Express route definitions (API endpoints).
  - `auth.ts`, `events.ts`, `users.ts`, `hiring.ts`, `qotd.ts`, etc.
- `controllers/`: (Implied) Logic handling request/response, often inline in routes or separated.
- `middleware/`: Custom middleware (Auth checks, Error handling, Logging).
- `utils/`: Helper functions.
- `config/`: Configuration files (Env vars, Passport setup).
- `index.ts`: Entry point, server setup.

---

## 4. Database Schema (Prisma)

The database is designed around usage roles and event participation.

### **Core Models**
1.  **User**: Central entity.
    -   Fields: `email`, `password` (hashed), `role`, `profileCompleted`, academic details (`course`, `branch`, `year`), social links (`github`, `linkedin`).
    -   **Roles (`enum Role`)**: `PUBLIC` (Visitor), `USER` (Registered), `CORE_MEMBER`, `ADMIN`.
2.  **Event**: Activities hosted by the club.
    -   Fields: `title`, `description`, `status` (`UPCOMING`, `ONGOING`, `PAST`), `dates`, `location`, `registrationTimeline`.
3.  **EventRegistration**: Link between User and Event.
    -   Tracks: `timestamp` of registration. ensures unique user-event pairs.
4.  **Announcement**: Club updates.
    -   Fields: `title`, `body`, `priority` (`LOW` to `URGENT`), `createdBy`.
5.  **HiringApplication**: Applications for club roles.
    -   Fields: `department`, `applyingRole`, `status`, `resume/skills`.
    -   **Applying Roles**: `TECHNICAL`, `DESIGNING`, `VIDEO_EDITING`, `MANAGEMENT`.
6.  **QOTD (Question of the Day)**: Coding challenges.
    -   Fields: `question`, `problemLink`, `difficulty`, `date`.
7.  **QOTDSubmission**: Tracks user submissions for QOTD.
8.  **TeamMember**: For displaying the core team on the public site.
9.  **AuditLog**: Security and tracking (`action`, `entity`, `userId`, `metadata`).

---

## 5. Key Features & Workflows

### **1. Authentication & Authorization**
-   **Methods**: Email/Password login, Google OAuth, GitHub OAuth.
-   **Flow**:
    -   Frontend sends credentials to `/api/auth/login`.
    -   Backend validates and issues a **JWT**.
    -   Frontend stores JWT (likely HTTPOnly cookie or LocalStorage) and includes it in `Authorization` header.
-   **RBAC**: Middleware checks `user.role` before allowing access to Admin/Core routes.

### **2. Event Management**
-   **Admin**: Can Create, Update, Delete events. Can view registrations and export them to Excel.
-   **User**: Can view event details and Register (`EventRegistration`).
-   **Logic**: Users cannot register if registration date is past or capacity is full.

### **3. Hiring Portal**
-   Allows users to apply for specific club roles (Tech, Design, etc.).
-   **Admin**: Can view applications, change status (`SELECTED`, `REJECTED`, `INTERVIEW_SCHEDULED`).

### **4. Question of the Day (QOTD)**
-   Daily coding problems posted by admins.
-   Users can submit solutions (links/text).
-   Gamification aspect (Leaderboard is togglable via `Settings`).

### **5. Public Information**
-   **Team Page**: Showcases core members (dynamic from DB).
-   **Achievements**: Highlights club wins and milestones.
-   **Announcements**: News feed for members.

### **6. Global Settings**
-   Admins can toggle features via `Settings` table:
    -   `registrationOpen`
    -   `showLeaderboard`
    -   `showQOTD`
-   This allows dynamic control of the site without redeploying.

---

## 6. API Reference (High-Level)

All routes are prefixed with `/api` (configured in Nginx or Express Router).

| Resource | Method | Endpoint | Description |
| :--- | :--- | :--- | :--- |
| **Auth** | POST | `/auth/login` | User login |
| | GET | `/auth/google` | OAuth Start |
| **Events** | GET | `/events` | List all public events |
| | POST | `/events` | Create event (Admin) |
| | POST | `/events/:id/register` | Register for event |
| **Users** | GET | `/users/me` | Get current user profile |
| | PUT | `/users/profile` | Update profile |
| **Hiring** | POST | `/hiring/apply` | Submit application |
| | GET | `/hiring/applications` | List applications (Admin) |
| **Stats** | GET | `/stats/dashboard` | Admin dashboard metrics |

---

## 7. Deployment & Environment

-   **Development Scripts**:
    -   `npm run dev`: Runs both API and Web concurrently.
    -   `npm run db:studio`: Opens Prisma Studio to view DB data.
-   **Environment Variables (`.env`)**:
    -   `DATABASE_URL`: PostgreSQL connection string.
    -   `JWT_SECRET`: Secret for signing tokens.
    -   `GOOGLE_CLIENT_ID` / `_SECRET`: OAuth credentials.
    -   `GITHUB_CLIENT_ID` / `_SECRET`: OAuth credentials.
    -   `PORT`: Backend port (usually 3000 or 8080).

## 8. Common Workflows for Developers

**Adding a New Feature:**
1.  **Database**: Update `prisma/schema.prisma` -> Run `npm run db:migrate`.
2.  **Backend**: Create route in `apps/api/src/routes/` -> Add controller logic -> Register in `index.ts`.
3.  **Frontend**: Create API hook (React Query) -> Build UI Component -> Add Page Route.

**Seeding Data:**
-   Run `npm run db:seed` to populate the database with initial Event/User/Setting data.
