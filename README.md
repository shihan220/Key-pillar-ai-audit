# Keypillar Audit & Task Tracking App

Keypillar Audit & Task Tracking App is a full-stack internal workflow application for managing projects, tasks, approvals, audit logs, developer work history, and notifications.

It includes a Next.js frontend, a NestJS backend, and a PostgreSQL database managed with Prisma.

## Tech Stack

- Next.js
- React
- TypeScript
- NestJS
- Node.js
- PostgreSQL
- Prisma
- Docker

## Features

- Admin dashboard
- Developer dashboard
- Project management
- Task management
- Task status workflow
- Admin approval flow
- Notifications
- Audit logs
- Developer clock-in / clock-out
- Work history tracking
- Password management

## Project Structure

```text
.
├── app/                  # Next.js app router frontend
├── backend/              # NestJS backend
├── components/           # Shared frontend UI components
├── lib/                  # Frontend API helpers and types
├── prisma/               # Prisma schema, migrations, and seed script
├── public/               # Static frontend assets
└── uploads/              # Local uploaded files for development
```

## Prerequisites

Before starting locally, make sure you have:

- Node.js 18 or later
- npm
- Docker
- A local terminal with access to `npx`

## Local Setup

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd <repository-folder-name>
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create `.env.local`

Copy the example file:

```bash
cp .env.example .env.local
```

Update `.env.local` with your local PostgreSQL user and any other local values you need.

Example:

```env
DATABASE_URL="postgresql://<local-postgres-user>:<local-postgres-password>@localhost:5432/key_pillar_ai?schema=public"
BACKEND_HOST="0.0.0.0"
BACKEND_PORT="4000"
NEXT_PUBLIC_API_BASE_URL="http://localhost:4000"
FRONTEND_ORIGIN="http://localhost:3000"
JWT_SECRET="replace-with-a-local-development-secret"
```

Example with sample local values:

```env
DATABASE_URL="postgresql://admin:password123@localhost:5432/key_pillar_ai?schema=public"
```

### 4. Start PostgreSQL with Docker

This repository does not currently include a `docker-compose.yml` file, so the quickest local option is a single Docker container:

```bash
docker run --name keypillar-postgres \
  -e POSTGRES_DB=key_pillar_ai \
  -e POSTGRES_USER=<local-postgres-user> \
  -e POSTGRES_PASSWORD=<local-postgres-password> \
  -p 5432:5432 \
  -d postgres:16
```

If you already have a local PostgreSQL instance running, you can use that instead.

### 5. Generate Prisma client

```bash
npx prisma generate
```

### 6. Apply database migrations

```bash
npx prisma migrate dev
```

### 7. Seed the database

```bash
npm run prisma:seed
```

This creates the initial local data required to use the app.

### 8. Start the backend

```bash
npm run backend:dev
```

### 9. Start the frontend

In a separate terminal:

```bash
npm run dev
```

## Local URLs

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend: [http://localhost:4000](http://localhost:4000)
- Database: `localhost:5432`

Useful backend health check:

- [http://localhost:4000/health](http://localhost:4000/health)

## Useful Commands

```bash
npm run dev
npm run backend:dev
npm run build
npm run backend:build
npm run lint
npx prisma generate
npx prisma migrate dev
npx prisma studio
```

Additional available scripts:

```bash
npm run backend:start
npm run prisma:validate
npm run prisma:push
npm run prisma:seed
```

## Troubleshooting

### Backend port 4000 already in use

Check what is using the port:

```bash
lsof -nP -iTCP:4000 -sTCP:LISTEN
```

Stop the existing process, then restart:

```bash
npm run backend:dev
```

### Frontend port 3000 already in use

Check the port:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Stop the process using it, then restart:

```bash
npm run dev
```

### Frontend cannot connect to backend

Check these points:

- `.env.local` contains `NEXT_PUBLIC_API_BASE_URL="http://localhost:4000"`
- the backend is running with `npm run backend:dev`
- [http://localhost:4000/health](http://localhost:4000/health) returns a healthy response
- the frontend is running on [http://localhost:3000](http://localhost:3000)

If you change `.env.local`, restart the frontend so Next.js picks up the new values.

### Database connection issue

Check these points:

- PostgreSQL is running on port `5432`
- `DATABASE_URL` in `.env.local` uses the correct local database user
- the database name exists
- Docker container is running if you are using Docker

Useful checks:

```bash
npx prisma validate
npx prisma studio
```

If migrations have not been applied yet:

```bash
npx prisma migrate dev
```

## Production Notes

- Use a managed or cloud PostgreSQL database in production.
- Replace localhost URLs with your production frontend and backend URLs.
- Run production migrations with:

```bash
npx prisma migrate deploy
```

- Never commit `.env.local`.
- Store production secrets in your deployment platform’s environment variable system.

## Environment Variables

The project expects these main variables:

- `DATABASE_URL`
- `BACKEND_HOST`
- `BACKEND_PORT`
- `NEXT_PUBLIC_API_BASE_URL`
- `FRONTEND_ORIGIN`
- `JWT_SECRET`

Use `.env.example` as the starting template for local development.
