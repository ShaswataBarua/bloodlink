# Contributing to BloodLink

Thank you for your interest in contributing to BloodLink — a blood bank inventory and emergency allocation system for Bangladesh.

## Code of Conduct

This project adheres to a professional standard. Be respectful, constructive, and focused on the code.

## Development Setup

```bash
# Prerequisites: Node.js 20+, PostgreSQL 16
cp .env.example .env
# Edit .env with your local PostgreSQL connection
npm install
npm run db:reset    # Creates schema, runs migrations, seeds demo data
npm run dev         # http://localhost:3000
```

## Branching & Commits

- **main/master**: Production-ready code only
- **feature/***: New features or improvements
- **fix/***: Bug fixes
- **chore/***: Maintenance (dependencies, config, CI)

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add donor eligibility override for medical staff
fix: prevent double allocation in race condition
chore: update dependencies
docs: add architecture decision record for Drizzle migration
```

## Pull Request Process

1. Fork the repo and create a feature branch
2. Make changes with tests covering new behavior
3. Run the full check suite locally:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```
4. Open a PR against `master` with a clear description
5. CI must pass (lint, typecheck, tests, build)
6. At least one maintainer review required
7. Squash and merge

## Testing

- **Unit/Integration**: `npm test` (Vitest + real PostgreSQL)
- **Type safety**: `npm run typecheck` (strict TypeScript)
- **Linting**: `npm run lint` (ESLint + Next.js config)
- **Build**: `npm run build` (production Next.js build)

All tests run against a real PostgreSQL database (test containers in CI, local instance in dev). No mocks for database layer.

## Database Migrations

- Migrations live in `drizzle/` as raw SQL
- Generate new migration: `npm run db:generate`
- Apply migrations: `npm run db:migrate`
- **Never edit applied migrations** — create a new one instead
- Seed data: `npm run db:seed` (idempotent, safe to re-run)

## Coding Standards

- **TypeScript strict mode** — no `any`, no implicit any
- **Domain logic in `src/domain/`** — pure functions, no side effects, fully tested
- **Services in `src/services/`** — business logic, transactions, audit writes
- **API routes in `src/app/api/`** — thin: auth → policy → validation → service
- **Components in `src/components/`** — presentational, no business rules
- **Zod schemas** — shared between client and server (`src/domain/schemas.ts`)
- **Security** — all routes use central policy matrix (`src/server/policy.ts`)

## Security

- Report vulnerabilities privately via GitHub Security Advisories
- Never commit secrets (`.env`, keys, tokens)
- Audit log is append-only; tampering is detectable via hash chain

## Releases

- Version bump in `package.json` (semver)
- Tag: `v<major>.<minor>.<patch>`
- Changelog maintained in `CHANGELOG.md`
- Deployment: push to `master` triggers Vercel production deploy via CI

## Questions?

Open a GitHub Discussion or check the [README](./README.md) for architecture details.