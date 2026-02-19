
## Context

You are working on the Code.Scriet Club Platform — a monorepo at `club_site/` 
with an Express + TypeScript backend (`apps/api`), a React + Vite + TypeScript 
frontend (`apps/web`), and a Prisma/PostgreSQL database (`prisma/schema.prisma`).

The full project context is in PROJECT_HANDBOOK.md (attached). Read it fully 
before making any changes. Follow the "How to safely make changes" playbook 
(Section 13) for every change you make.

---

## Feature Request: Network Section

### Overview

Add a dedicated **Network** section to the platform that showcases industry 
professionals — CEOs, CTOs, working professionals, guest speakers, mentors, 
alumni — who have connected with the club in any capacity (guest sessions, 
GMeet talks, event appearances, partnerships, etc.).

Network members are a distinct user class from regular club members. They have 
their own role, their own public-facing profile card, a separate admin 
verification flow, and a different email behavior than regular users.

---

## 1. Database Changes (`prisma/schema.prisma`)

### 1a. New Role value
Add `NETWORK` to the existing `Role` enum:
```
Role { PUBLIC, USER, MEMBER, CORE_MEMBER, ADMIN, NETWORK }
```

### 1b. New `NetworkProfile` model
Create a separate `NetworkProfile` model (do NOT reuse or extend the existing 
`TeamMember` model). Fields to include:

```prisma
model NetworkProfile {
  id               String              @id @default(cuid())
  userId           String              @unique
  user             User                @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Professional details
  fullName         String
  designation      String              // e.g. "CEO", "Senior Engineer"
  company          String
  industry         String              // e.g. "FinTech", "EdTech", "Product"
  bio              String?             @db.Text
  profilePhoto     String?             // URL (can use existing upload infra)

  // Social/professional links
  linkedinUsername String?
  twitterUsername  String?
  githubUsername   String?
  personalWebsite  String?

  // Connection context
  connectionType   NetworkConnectionType   // enum — how they connected
  connectionNote   String?             @db.Text  // optional story / context

  // Verification
  status           NetworkStatus       @default(PENDING)
  verifiedAt       DateTime?
  verifiedBy       String?             // Admin userId who approved

  // Visibility
  isPublic         Boolean             @default(true)
  displayOrder     Int                 @default(0)

  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt
}

enum NetworkConnectionType {
  GUEST_SPEAKER
  GMEET_SESSION
  EVENT_JUDGE
  MENTOR
  INDUSTRY_PARTNER
  ALUMNI
  OTHER
}

enum NetworkStatus {
  PENDING
  VERIFIED
  REJECTED
}
```

### 1c. Settings toggle
Add `showNetwork Boolean @default(true)` to the `Settings` model so admins 
can hide the entire Network section without code changes.

### After schema changes:
- Run `npm run db:migrate`
- Regenerate Prisma client

---

## 2. Auth Flow Changes

When a user completes OAuth (Google or GitHub) and their role is `NETWORK` 
OR when they arrive via a special route `/join-our-network` (see Section 5), 
route them to a **Network Profile Onboarding** form instead of the normal 
dashboard.

Gate: if a NETWORK-role user has no `NetworkProfile` record, redirect them to 
`/network/onboard` before anything else. Once submitted (status=PENDING), show 
a "Thank you, your profile is under review" holding page.

---

## 3. Backend API (`apps/api/src/routes/network.ts`)

Create a new route file and mount it at `/api/network` in `index.ts`.

### Public endpoints (no auth required):
- `GET /api/network` — list all VERIFIED, isPublic=true network profiles. 
  Support query params: `?industry=`, `?connectionType=`, `?search=`
- `GET /api/network/:id` — single verified profile

### Authenticated endpoints (NETWORK role, own profile):
- `POST /api/network/profile` — submit onboarding form (creates NetworkProfile 
  with status=PENDING)
- `PATCH /api/network/profile` — update own profile (re-triggers PENDING state 
  if substantive fields change, admin must re-verify)
- `GET /api/network/profile/me` — get own profile + status

### Admin endpoints (`requireRole('ADMIN')`):
- `GET /api/network/admin/pending` — list all PENDING profiles
- `GET /api/network/admin/all` — list all profiles with status filter
- `PATCH /api/network/admin/:id/verify` — approve (sets status=VERIFIED, 
  verifiedAt, verifiedBy, triggers thank-you email)
- `PATCH /api/network/admin/:id/reject` — reject with optional reason 
  (triggers rejection email)
- `PATCH /api/network/admin/:id` — edit any field (admin override)
- `DELETE /api/network/admin/:id` — remove profile

All admin mutations should create an `AuditLog` entry.

---

## 4. Email Behavior (CRITICAL — different from regular users)

Network members must NEVER receive event reminder emails, announcement emails, 
or any club-operational bulk emails.

Only two emails should ever be sent to NETWORK-role users:

1. **Verification thank-you email** — sent automatically when admin approves. 
   Use a new email template stored in `Settings` as `emailNetworkVerifiedBody`. 
   Template variables: `{name}`, `{designation}`, `{company}`, `{profileUrl}`

2. **Rejection notification email** (optional, only if admin provides reason) — 
   brief, polite message.

In `apps/api/src/utils/email.ts`, add a guard: before sending any bulk or 
event/announcement email, check if the recipient user has role `NETWORK` and 
skip if so.

Add `emailNetworkVerifiedBody` and `emailNetworkRejectedBody` to the `Settings` 
model and expose them in the settings admin page.

---

## 5. Frontend Pages & Routes (`apps/web`)

### Public pages:
- `/network` — Network landing page showing verified profile cards  
  - Filter bar: by industry, connection type, search by name/company
  - Responsive card grid; each card shows: photo, name, designation, company, 
    connection type badge, LinkedIn/GitHub/Twitter icons
  - Respect the `showNetwork` settings toggle — if disabled, hide from nav 
    and return 404-style page
  
- `/network/:id` — Individual profile detail page  
  - Full bio, all social links, connection context/story, company info

### Auth/onboarding pages:
- `/join-our-network` — Public landing page explaining the Network program  
  - Brief pitch copy, benefits of joining, CTA button "Join via LinkedIn/Google/GitHub"  
  - Clicking CTA triggers OAuth with `intent=network` param so the callback 
    handler knows to assign `NETWORK` role and redirect to onboarding

- `/network/onboard` — Protected (NETWORK role only) multi-step onboarding form  
  - Step 1: Professional details (fullName, designation, company, industry, bio)  
  - Step 2: Social links (LinkedIn username, GitHub, Twitter, personal site)  
  - Step 3: Connection context (connectionType dropdown, connectionNote textarea)  
  - Step 4: Profile photo upload (use existing `/api/upload` infra)  
  - Step 5: Review & submit  
  - On submit → POST `/api/network/profile` → show "Under Review" confirmation

- `/network/status` — Protected (NETWORK role) — shows current profile 
  status (PENDING / VERIFIED / REJECTED with reason). If verified, show 
  link to their public profile card.

### Admin pages:
- `/admin/network` — Admin Network management page  
  - Tab 1: Pending — list of PENDING profiles with Verify / Reject actions  
    Each row: photo thumbnail, name, designation, company, connectionType, 
    submitted date, View Full / Verify / Reject buttons  
  - Tab 2: All Members — full list with status badges, edit/delete actions  
  - Tab 3: Settings — toggle `showNetwork`, edit email templates for 
    `emailNetworkVerifiedBody` and `emailNetworkRejectedBody`

Add `/admin/network` to the admin sidebar nav.
Add `/network` to the public header nav (conditionally on `showNetwork` toggle).

---

## 6. Settings Context & Feature Flag

- Fetch `showNetwork` from `GET /api/settings` (already a public endpoint)
- In `SettingsContext`, expose `showNetwork`
- In the public `<Header />`, conditionally render the "Network" nav link
- On `/network` page, if `showNetwork` is false, show a disabled / coming-soon 
  state rather than a hard error

---

## 7. Admin Verification UX Behavior

When admin clicks **Verify** on a pending profile:
1. `PATCH /api/network/admin/:id/verify` fires
2. Backend sets `status=VERIFIED`, `verifiedAt=now()`, `verifiedBy=adminId`
3. Backend sends the network verified thank-you email automatically
4. Profile card becomes live on `/network` immediately
5. AuditLog entry created: `action: "NETWORK_PROFILE_VERIFIED"`, `targetId: profileId`

When admin clicks **Reject**:
1. Modal prompts for optional rejection reason
2. `PATCH /api/network/admin/:id/reject` fires with `{ reason }`
3. Backend sets `status=REJECTED`
4. If reason provided, send rejection email
5. AuditLog entry created

---

## 8. Frontend API Client (`apps/web/src/lib/api.ts`)

Add typed methods for all new endpoints:
- `getNetworkProfiles(filters?)` 
- `getNetworkProfile(id)`
- `submitNetworkProfile(data)`
- `updateMyNetworkProfile(data)`
- `getMyNetworkProfile()`
- Admin: `getPendingNetworkProfiles()`, `getAllNetworkProfiles()`, 
  `verifyNetworkProfile(id)`, `rejectNetworkProfile(id, reason?)`, 
  `adminUpdateNetworkProfile(id, data)`, `deleteNetworkProfile(id)`

---

## 9. Additional Features Worth Adding

Consider implementing these as part of this feature for a polished experience:

- **Connection badge on profile cards** — color-coded chips per `connectionType` 
  (e.g. "Guest Speaker" = purple, "Mentor" = green, "Alumni" = blue)

- **"Connected Since"** — display the year they first connected with the club 
  on their public card

- **Network count on public `/network` page header** — "X+ Industry Professionals 
  in Our Network" as a social proof stat

- **Admin dashboard stat widget** — add a "Network" stat to the existing stats 
  page showing total verified / pending / this month counts

- **Re-verification on profile edit** — if a NETWORK user edits their 
  designation, company, or bio after being verified, auto-set status back to 
  PENDING and notify admin via the existing socket or a simple DB flag

- **`displayOrder` field for admin sorting** — drag-to-reorder or manual 
  number input so admins can feature certain profiles at the top of the grid

- **Public profile shareable link with OG meta tags** — `/network/:id` should 
  have dynamic `<meta og:title>`, `og:description`, `og:image` using the 
  profile photo and bio for good LinkedIn share previews

---

## 10. Implementation Order (Vertical Slice)

Follow this order to avoid broken states:

1. `prisma/schema.prisma` changes → migrate → regenerate client  
2. Email guard in `utils/email.ts`  
3. `apps/api/src/routes/network.ts` (all endpoints)  
4. Mount router in `apps/api/src/index.ts`  
5. Settings model + migration for `showNetwork` + email template fields  
6. Frontend `apps/web/src/lib/api.ts` typed methods  
7. `SettingsContext` — add `showNetwork`  
8. Auth callback — handle `intent=network` to assign NETWORK role  
9. Pages: `/join-our-network` → `/network/onboard` → `/network/status`  
10. Public pages: `/network` (list) → `/network/:id` (detail)  
11. Admin page: `/admin/network` (pending + all tabs + settings tab)  
12. Nav updates (public header + admin sidebar)  
13. `npm run build` — fix any type errors  
14. Validate: role guards, email suppression for NETWORK users, IST timestamps 
    on `verifiedAt` display, `showNetwork` toggle behavior end-to-end

---

## Constraints & Rules to Preserve

- All date/time display must use IST (`Asia/Kolkata`) — use existing `dateUtils.ts`
- Preserve all existing auth guards and role checks
- Network profile emails must NEVER be sent via bulk event/announcement flows
- NETWORK users should have NO access to `/dashboard` routes — redirect to 
  `/network/status` instead
- NETWORK role users must NOT appear in the regular admin `/admin/users` 
  member management flows in a way that allows assigning them event roles
- Follow existing Zod validation patterns for all new API inputs
- Add AuditLog for all admin actions on NetworkProfile
- Do not touch or break existing OAuth callback logic beyond adding the 
  `intent=network` branch
