# Client/Project Management App

A full-stack client and project management web application.

## Tech Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query + React Router v6
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL 16 (raw SQL migrations via `node-postgres`, no ORM)
- **Auth:** JWT + bcrypt
- **Containerization:** Docker + Docker Compose

## Project Structure

```
project-root/
├── backend/          # Express + TypeScript API
├── frontend/         # React + Vite + TypeScript SPA
├── docker-compose.yml
├── .env.example
└── README.md
```

## Getting Started

1. Copy `.env.example` to `.env` and adjust values as needed:

   ```
   cp .env.example .env
   ```

2. Start all services with Docker Compose:

   ```
   docker compose up --build
   ```

   - Frontend: http://localhost:5173
   - Backend API: http://localhost:4000
   - PostgreSQL: localhost:5432

### Local development (without Docker)

**Backend**

```
cd backend
npm install
npm run dev
```

**Frontend**

```
cd frontend
npm install
npm run dev
```

## Status

This is an early scaffold. Database schema, API routes, and application UI are added in later stages.
