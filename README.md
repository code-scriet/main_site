# code.scriet Platform

A modern, scalable, and professional club website for **code.scriet** - a coding/DSA club.

![code.scriet](https://via.placeholder.com/800x400/FBBF24/78350F?text=code.scriet)

## 🚀 Features

- **Public Pages**: Home, About, Events, Team, Achievements
- **User Dashboard**: Event registration, QOTD, Leaderboard, Announcements
- **Core Member Tools**: Create/manage events and announcements
- **Admin Panel**: User management, role assignment, team management
- **Authentication**: Google and GitHub OAuth 2.0
- **Role-Based Access Control**: PUBLIC → USER → CORE_MEMBER → ADMIN
- **Clean Setup**: No pre-seeded data - Admin adds all content after initialization

## 🛠 Tech Stack

### Frontend
- React 18+ with Vite
- TypeScript
- Tailwind CSS
- shadcn/ui components
- Framer Motion (animations)
- React Router v6
- TanStack Query (React Query)
- React Hook Form + Zod

### Backend
- Node.js 18+ with Express.js
- TypeScript
- Passport.js (OAuth)
- JWT Authentication
- Zod validation

### Database
- PostgreSQL (Neon)
- Prisma ORM

## 📁 Project Structure

```
code-scriet-platform/
├── apps/
│   ├── web/                    # Frontend (Vite + React)
│   │   ├── src/
│   │   │   ├── components/     # UI components
│   │   │   ├── pages/          # Page components
│   │   │   ├── context/        # React context
│   │   │   ├── lib/            # Utilities
│   │   │   └── hooks/          # Custom hooks
│   │   └── public/
│   │
│   └── api/                    # Backend (Express + TypeScript)
│       └── src/
│           ├── routes/         # API routes
│           ├── middleware/     # Auth, role middleware
│           ├── config/         # Passport config
│           ├── lib/            # Prisma client
│           └── utils/          # Utilities
│
├── packages/
│   └── shared/                 # Shared types & constants
│
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── seed.ts                 # Seed script (creates super admin only)
│
├── start-production.sh         # Production start script
├── SETUP.md                    # Detailed setup guide
└── README.md
```

## 🏁 Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- PostgreSQL database (or use Neon, Supabase, etc.)

### Development Setup

1. **Clone and install**
   ```bash
   git clone https://github.com/your-org/code-scriet-platform.git
   cd code-scriet-platform
   npm install
   ```

2. **Configure environment**
   ```bash
   # .env file is created automatically from .env.example
   # Edit .env with your database URL and OAuth credentials
   ```

3. **Setup database**
   ```bash
   npm run db:migrate   # Run migrations
   npm run db:seed      # Create super admin
   ```

4. **Start development servers**
   ```bash
   npm run dev          # Starts both frontend and backend
   ```

### Production Deployment

See [SETUP.md](./SETUP.md) for detailed production deployment instructions.

**Quick production start:**
```bash
./start-production.sh
```

Or manually:
```bash
npm install
npm run db:migrate
npm run db:seed
npm run build
npm run start:prod
```

## 🔐 Super Admin

The database seed creates a **single super admin** account with no sample data.

**Default credentials (development):**
- Email: `developer.aary@gmail.com`
- Password: `Dk261135@`

**Production:** Set these via environment variables:
```env
SUPER_ADMIN_EMAIL=your.email@example.com
SUPER_ADMIN_PASSWORD=your_secure_password
SUPER_ADMIN_NAME=Your Name
```

**Important:** All events, teams, announcements, and other content should be added through the admin panel after login.

## 📝 Available Scripts

### Root Level
- `npm run dev` - Start both frontend and backend in development
- `npm run build` - Build both applications for production
- `npm run start:prod` - Start production servers
- `npm run web` - Start frontend only
- `npm run api` - Start backend only
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with super admin
- `npm run db:reset` - Reset database (⚠️ deletes all data)
- `npm run setup` - Complete setup (install + migrate + seed)

## 🌐 Environment Variables

Required variables in `.env`:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Super Admin (for initial seed)
SUPER_ADMIN_EMAIL=developer.aary@gmail.com
SUPER_ADMIN_PASSWORD=Dk261135@
SUPER_ADMIN_NAME=Super Admin

# JWT
JWT_SECRET=your_super_secret_key_change_this_in_production
JWT_EXPIRES_IN=7d

# OAuth - Google
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# OAuth - GitHub (Optional)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# URLs
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5000

# Node Environment
NODE_ENV=development
PORT=5000
```

See [SETUP.md](./SETUP.md) for detailed environment configuration.

## 🌟 What's Changed

This setup has been optimized for production with the following improvements:

1. **Clean Database**: No pre-seeded sample data - admin adds everything via dashboard
2. **Secure Admin**: Super admin credentials from environment variables
3. **Production Ready**: Complete production start script with environment validation
4. **Easy Setup**: One-command setup with `npm run setup`
5. **Flexible Deployment**: Works in development and production environments
   - API: http://localhost:5000

## 🔐 OAuth Setup

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:5000/api/auth/google/callback`
6. Copy Client ID and Client Secret to `.env`

### GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set Authorization callback URL: `http://localhost:5000/api/auth/github/callback`
4. Copy Client ID and Client Secret to `.env`

## 📚 API Documentation

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/google` | Initiate Google OAuth |
| GET | `/api/auth/github` | Initiate GitHub OAuth |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Logout |

### Events
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/events` | Get all events | Public |
| GET | `/api/events/:id` | Get event by ID | Public |
| POST | `/api/events` | Create event | CORE_MEMBER+ |
| PUT | `/api/events/:id` | Update event | CORE_MEMBER+ |
| DELETE | `/api/events/:id` | Delete event | ADMIN |

### Registrations
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/api/registrations` | Register for event | USER+ |
| DELETE | `/api/registrations/:id` | Cancel registration | USER+ |
| GET | `/api/registrations/me` | Get my registrations | USER+ |

### Announcements
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/announcements` | Get all announcements | Public |
| POST | `/api/announcements` | Create announcement | CORE_MEMBER+ |
| PUT | `/api/announcements/:id` | Update announcement | CORE_MEMBER+ |
| DELETE | `/api/announcements/:id` | Delete announcement | ADMIN |

### Team
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/team` | Get all team members | Public |
| POST | `/api/team` | Add team member | ADMIN |
| PUT | `/api/team/:id` | Update team member | ADMIN |
| DELETE | `/api/team/:id` | Delete team member | ADMIN |

### Users (Admin)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/users` | Get all users | ADMIN |
| PUT | `/api/users/:id/role` | Update user role | ADMIN |
| DELETE | `/api/users/:id` | Delete user | ADMIN |

## 🚢 Deployment

### Frontend (Vercel)

1. Connect your GitHub repository
2. Set root directory: `apps/web`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add environment variables:
   - `VITE_API_URL`: Your backend API URL

### Backend (Render)

1. Create new Web Service
2. Connect your GitHub repository
3. Root directory: `apps/api`
4. Build command: `npm install && npm run build`
5. Start command: `npm start`
6. Add all environment variables

### Database (Neon)

1. Create a new Neon project
2. Copy the connection string
3. Add to backend environment as `DATABASE_URL`
4. Run migrations: `npx prisma migrate deploy`

## 🎨 Design System

### Colors
- **Primary (Yellow)**: `#FBBF24` (amber-400)
- **Secondary (Orange)**: `#F97316` (orange-500)
- **Accent (Brown)**: `#78350F` (amber-900)
- **Background**: `#FFFBEB` (amber-50)

### Typography
- Headings: Inter Bold
- Body: Inter Regular
- Code: JetBrains Mono

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 📧 Contact

- **Club**: code.scriet
- **Email**: contact@codescriet.com
- **GitHub**: [github.com/codescriet](https://github.com/codescriet)

---

Built with ❤️ by the code.scriet team
