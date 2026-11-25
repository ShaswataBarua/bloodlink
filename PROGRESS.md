# BloodLink - build progress

Hack the Vibe 2026 (CODE-ARENAX). Track: World Problem Solver. Declared challenges: **A05** (Concurrency & Transactions), **A03** (Security & Access Control).

Status as of 2026-11-25: **phases 0-11 complete and verified locally**. Phase 12 (deployment) is the only open item.

## Decisions that override the original master prompt
- **ORM is Drizzle, not Prisma.** Prisma engines download from binaries.prisma.sh, which is blocked in the build sandbox, so Prisma could not run or be verified. Drizzle + `pg` is pure npm. Schema: `src/db/schema.ts`. Migrations: `drizzle/`.
- Everything else in the stack is unchanged (Next.js App Router, TS strict, Tailwind, Postgres, zod, bcryptjs, Vitest, Vercel + Neon).
- Race demo: AB- has exactly 1 AVAILABLE unit (+1 EXPIRED decoy). Race Lab uses an **exact-match-only** reservation mode, because AB- is otherwise compatible with A-, B-, O- stock.
- Race Lab fixture requests are backdated by one day so they do not consume a hospital's real daily unit cap.

## Local environment (this machine)
- Portable PostgreSQL 16.9 lives at `C:\Users\shaswata barua\AppData\Local\Temp\opencode\pg\pgsql`, data dir `...\pg\data`, port **5433**.
- Start: `& "...\pg\pgsql\bin\pg_ctl.exe" -D "...\pg\data" -o "-p 5433" -l "...\pg\data\server.log" start`
- `.env` -> `postgresql://postgres@localhost:5433/bloodlink`; `.env.test` -> `.../bloodlink_test`.
- `npm run db:reset` = drop schema + migrate + seed. (Audit trigger blocks TRUNCATE/DELETE, hence DROP SCHEMA.)
- Demo accounts (password `Passw0rd!demo`): admin@, staff.dhaka@, staff.ctg@, dmch@, square@, cmch@, donor1@, donor2@ `bloodlink.test`.

## Phases
- [x] 0. Scaffold (Next.js 16, Tailwind, Vitest, lint, .env.example)
- [x] 1. Schema, constraints, partial unique index, append-only audit trigger, seed, reset. 9 DB tests pass.
- [x] 2. Auth: login/logout, DB sessions (hashed token cookie), DB lockout, in-memory rate limit, middleware
- [x] 3. Policy module (role x action x ownership) + hash-chained audit logger + tests
- [x] 4. Donors & Donations (eligibility rules, one donation per donor per day)
- [x] 5. Inventory (search/filter/sort, expiry job)
- [x] 6. Requests & Allocation (state machine, compatibility, FEFO, waitlist, `FOR UPDATE SKIP LOCKED`, idempotency)
- [x] 7. Race Lab + concurrency tests
- [x] 8. Security Lab (6 live scenarios) + audit viewer + chain verify
- [x] 9. Dashboard & analytics
- [x] 10. UI polish + accessibility (keyboard, focus states, responsive, no emoji/gradients)
- [x] 11. Full test pass vs rubric: `tsc` clean, `next build` clean, **61 tests / 6 files** pass, end-to-end HTTP smoke test passes
- [ ] 12. Deploy (Vercel + Neon) - blocked on accounts/connection strings; README, demo script and viva notes are done

## Verification evidence
- `npx tsc --noEmit` -> exit 0
- `npm run build` -> all routes compile
- `npm test` -> 61 passed (domain, policy, auth, allocation/concurrency, audit chain, DB constraints)
- HTTP smoke test: login -> create (201) -> replay (200) -> changed payload (422) -> approve -> reserve -> fulfil -> race (1 winner, 0 double allocations) -> all 6 attacks blocked -> audit chain `ok=true`

## Known issues / limits
- Login rate limiting is in-memory (per instance); durable account lockout is DB-backed (`failedLogins`, `lockedUntil`).
- Security Lab runs the real service/policy code with seeded attacker identities rather than a separate harness.
- Not deployed yet: needs a Neon database URL and a Vercel project (or any Node host with Postgres).
