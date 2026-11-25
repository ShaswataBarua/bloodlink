# Changelog

All notable changes to BloodLink are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), versioning follows [SemVer](https://semver.org/).

## [1.0.0] - 2026-11-25

### Added
- **Core system**: Blood bank inventory and emergency allocation for Bangladesh hospitals
- **Three interconnected modules**: Donors & Donations, Inventory, Requests & Allocation
- **Dashboard & Analytics**: Stock by group, expiring units, fulfilment rate, average fulfilment time
- **Audit system**: Hash-chained append-only audit log with tamper detection

### Authentication & Authorization
- Role-based access: ADMIN, BANK_STAFF, HOSPITAL, DONOR
- DB-backed sessions with hashed tokens, httpOnly + Secure + SameSite=Lax cookies
- Login rate limiting + account lockout (5 failures → 15 min lock)
- CSRF/origin check on mutating routes
- Central policy matrix (role × resource × action × ownership)

### Business Logic (M04)
- Donor eligibility: age 18-60, weight ≥50kg, 90-day interval, no same-day donation
- ABO/Rh red-cell compatibility matrix with exact-group-first + FEFO ordering
- Request state machine: PENDING → APPROVED → RESERVED → FULFILLED + WAITLISTED/REJECTED/CANCELLED/EXPIRED
- Priority queue: CRITICAL > URGENT > ROUTINE with automatic waitlist processing
- Idempotency keys on request creation (same key + same payload = stored response)

### Concurrency & Transactions (A05)
- Reservation in single DB transaction with `SELECT ... FOR UPDATE SKIP LOCKED`
- Partial unique index on allocations prevents double-allocation at DB level
- Bounded exponential backoff retry on serialization/deadlock errors (40001, 40P01, 55P03)
- Race Lab: concurrent reservation demo (10-50 parallel requests for last unit)
- Vitest concurrency test: 10 concurrent → exactly 1 winner, 0 double allocations

### Security & Access Control (A03)
- Resource isolation: hospitals see only own requests, donors only own profile
- Mass-assignment protection: strict Zod schemas reject unknown fields
- IDOR protection: cross-tenant access returns 404 + DENIED audit entry
- Security headers (CSP, frame-deny, nosniff, referrer policy)
- Security Lab: 6 live attack scenarios with real HTTP responses + audit entries
- Audit chain verification: admin page with "verify chain" button

### Search, Validation & UX (M05-M07)
- Server-side search, filter, sort, pagination on units, requests, donors
- Zod validation server + client side with friendly error messages
- Responsive layout (sidebar desktop, horizontal nav mobile)
- Semantic HTML, labelled inputs, visible focus rings, ARIA live regions
- AA color contrast (slate/white + deep red accent)

### DevOps & Quality
- Drizzle ORM + PostgreSQL (Neon-ready), Next.js 16 App Router, TypeScript strict
- 61 Vitest tests against real PostgreSQL (domain, policy, auth, allocation, audit, DB constraints)
- GitHub Actions CI: lint → typecheck → test (PostgreSQL service) → build
- Vercel deployment configuration
- Professional README with architecture, ER diagram, setup, demo script, viva Q&A

### Database
- Complete schema with constraints, CHECKs, partial unique indexes
- Append-only audit_log trigger (blocks UPDATE/DELETE/TRUNCATE)
- Seed script: 2 banks, 3 hospitals, 20 donors, ~120 units, 8 requests in all states
- Race demo fixture: exactly 1 available AB− unit

### Documentation
- README: problem, stack, architecture, ER diagram, business rules, A05/A03 deep dives
- CONTRIBUTING.md: branching, commits, PR process, testing, coding standards
- CHANGELOG.md: this file
- Demo script for YouTube video
- Viva Q&A sheet explaining each layer

---

## [Unreleased]

### Planned
- Vercel + Neon production deployment
- Platelet/plasma component support (beyond red-cell concentrates)
- Email/SMS notification hooks
- Multi-language support (Bangla/English)