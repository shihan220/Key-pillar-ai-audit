# Keypillar Audit & Task Tracking App Backend

This branch contains the backend code for the Keypillar Audit & Task Tracking App.

It includes:
- NestJS API source in `backend/`
- Prisma schema, migrations, and seed script in `prisma/`
- backend-only root scripts and environment examples

It does not include the Next.js frontend application.

## Stack

- NestJS
- TypeScript
- Prisma
- PostgreSQL
- Node.js

## Branch Layout

```text
.
├── backend/        # NestJS source code
├── prisma/         # Prisma schema, migrations, seed
├── package.json    # Backend-only scripts and dependencies
├── .env.example    # Local backend environment example
└── README.md
```

## Local Setup

```bash
git clone <repository-url>
cd <repository-folder-name>
npm install
cp .env.example .env.local
```

Update `.env.local` with your local values.

Example:

```env
DATABASE_URL="postgresql://<local-postgres-user>:<local-postgres-password>@localhost:5432/key_pillar_ai?schema=public"
BACKEND_HOST="0.0.0.0"
BACKEND_PORT="4000"
FRONTEND_ORIGIN="http://localhost:3000"
JWT_SECRET="replace-with-a-local-development-secret"
```

## Prisma Commands

Run these from the repository root:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run prisma:validate
npm run prisma:studio
```

## Start the Backend

From the repository root:

```bash
npm run dev
```

Backend URL:
- [http://localhost:4000](http://localhost:4000)
- Health check: [http://localhost:4000/health](http://localhost:4000/health)

## Notes

- Prisma schema and migrations stay in `prisma/`.
- Local uploads are served from `uploads/`.
- `FRONTEND_ORIGIN` controls which frontend URL is allowed by CORS.
