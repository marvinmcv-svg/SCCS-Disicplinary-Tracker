# Discipline Tracker Pro

A full-stack school discipline tracking web application built with modern tech.

## Tech Stack

- **Backend:** Node.js + Express + TypeScript
- **Database:** SQLite (better-sqlite3)
- **Auth:** JWT + bcryptjs
- **Frontend:** React 18 + Vite + TypeScript
- **Styling:** Tailwind CSS
- **Charts:** Recharts

## Features

- ✅ Student management (CRUD)
- ✅ Incident recording with 45+ violation types
- ✅ 12 violation categories (Attendance, Classroom, Physical, Academic, etc.)
- ✅ Points system (merits/demerits)
- ✅ Parent contact tracking
- ✅ Dashboard with real-time analytics
- ✅ MTSS interventions tracking (Tiers 1-3)
- ✅ Alert thresholds (repeat offenders, chronic absences)
- ✅ Rewards system for positive behavior

## Quick Start

### 1. Install Dependencies
```bash
npm run install:all
```

### 2. Run Development Server
```bash
npm run dev
```

This opens:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### 3. Login
```
Username: admin
Password: admin123
```

## Project Structure
```
discipline-tracker-app/
├── server/           # Express API server
│   ├── db.ts        # Database setup & seeds
│   ├── routes.ts   # API endpoints
│   └── index.ts    # Server entry
├── client/         # React frontend
│   ├── src/
│   │   ├── pages/   # Page components
│   │   ├── components/ # Shared components
│   │   ├── lib/    # API client
│   │   └── App.tsx # Main app
│   └── ...
├── data/            # SQLite database
├── package.json
└── README.md
```

## Screenshots Flow

1. **Login** → Enter credentials
2. **Dashboard** → Stats & charts overview
3. **Students** → Manage student roster
4. **Incidents** → Record & track violations
5. **Violations** → View violation reference
6. **Rewards** → Award merit points
7. **MTSS** → Track interventions
8. **Settings** → Configure system

## Database Schema

- `users` - Staff accounts
- `students` - Student records
- `violations` - Violation types with consequences
- `incidents` - Incident logs
- `mtss_interventions` - MTSS plans
- `rewards` - Merit awards
- `alerts` - Alert thresholds

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login |
| GET | /api/students | List students |
| GET | /api/incidents | List incidents |
| POST | /api/incidents | Create incident |
| PUT | /api/incidents/:id | Update incident |
| GET | /api/dashboard/stats | Dashboard data |
| GET | /api/violations | Violation types |

## Note

- This is a development version. For production, add HTTPS, proper JWT secret, input validation.
- Default admin: `admin` / `admin123`
- Change password after first login!