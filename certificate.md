# Certificate System — Full Audit Report

**Date:** 2026-03-12
**Scope:** Backend, Frontend, Automation, Infrastructure, Security

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema Analysis](#2-database-schema-analysis)
3. [Backend API Audit](#3-backend-api-audit)
4. [PDF Generation Audit](#4-pdf-generation-audit)
5. [Frontend Audit](#5-frontend-audit)
6. [Security Analysis](#6-security-analysis)
7. [Automation & Integration Gaps](#7-automation--integration-gaps)
8. [Infrastructure & Deployment](#8-infrastructure--deployment)
9. [Bugs & Critical Issues](#9-bugs--critical-issues)
10. [Feature Gap Matrix](#10-feature-gap-matrix)
11. [Recommendations](#11-recommendations)

---

## 1. Architecture Overview

### Current Flow

```
Admin Panel ──POST /generate──▶ API ──▶ generateCertificatePDF() ──▶ Upload (R2/Cloudinary/Local)
                                │                                          │
                                │                                    pdfUrl saved to DB
                                │                                          │
                                ▼                                          ▼
                          Prisma insert                        sendCertificateIssued() email
                                │
                                ▼
                    Public verify: GET /verify/:certId
```

### Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `apps/api/src/routes/certificates.ts` | 623 | All API endpoints |
| `apps/api/src/utils/generateCertificatePDF.ts` | 756 | PDF rendering via @react-pdf/renderer |
| `apps/api/src/utils/generateCertId.ts` | 14 | Nanoid-based ID generator (XXXX-XXXX-XXXX) |
| `apps/api/src/utils/uploadCertificate.ts` | 113 | Upload: R2 > Cloudinary > local disk fallback |
| `apps/api/src/utils/email.ts` | 1298 | `sendCertificateIssued()` at line 1253 |
| `apps/web/src/pages/admin/AdminCertificates.tsx` | 653 | Admin generation + management UI |
| `apps/web/src/pages/dashboard/DashboardCertificates.tsx` | 241 | User's own certificates |
| `apps/web/src/pages/VerifyCertificatePage.tsx` | 449 | Public verification + QR scanner |

---

## 2. Database Schema Analysis

### Current Model (`prisma/schema.prisma:627-671`)

```prisma
model Certificate {
  id, certId (unique), recipientId?, recipientName, recipientEmail,
  eventId?, eventName, type (CertType enum), position?, domain?,
  template (default "gold"), pdfUrl?, qrCodeUrl?, issuedBy,
  issuedAt, emailSent, emailSentAt, isRevoked, revokedAt,
  revokedBy?, revokedReason?, viewCount, createdAt, updatedAt
}

enum CertType { PARTICIPATION, COMPLETION, WINNER, SPEAKER }
```

### Issues Found

| Issue | Severity | Detail |
|-------|----------|--------|
| `qrCodeUrl` column never populated | Low | QR is generated as a data URL embedded directly in the PDF. Column is dead weight. |
| No `description` column | Medium | The `/generate` endpoint accepts `description` in the request body, passes it to the PDF renderer, but **never saves it to the database**. Data is silently lost. |
| No `expiresAt` column | Low | All certificates are permanent. No support for time-limited certs. |
| No unique constraint on `(recipientEmail, eventId, type)` | Medium | Same person can receive duplicate certificates for the same event. |
| Missing index on `(eventId, issuedAt)` | Low | No efficient way to fetch all certificates for a specific event sorted by date. |
| `recipientId` is nullable with `onDelete: SetNull` | Info | If a user is deleted, their certificates become orphaned (only findable by email). Intentional but worth noting. |

---

## 3. Backend API Audit

### Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/certificates` | GET | ADMIN | List all (paginated, filterable) |
| `/certificates/generate` | POST | ADMIN | Generate single certificate |
| `/certificates/bulk` | POST | ADMIN | Bulk generate (max 200, batch size 5) |
| `/certificates/verify/:certId` | GET | Public | Public verification (rate-limited 60/5min) |
| `/certificates/mine` | GET | USER | User's own certificates |
| `/certificates/download/:certId` | GET | ADMIN or owner | Download PDF |
| `/certificates/files/:filename` | GET | Public | Serve local PDF files |
| `/certificates/:certId/revoke` | PATCH | ADMIN | Revoke a certificate |
| `/certificates/:certId/resend` | POST | ADMIN | Resend email |
| `/certificates/:certId` | GET | ADMIN | Single cert details |

### Bugs in Route Handlers

**1. CertId collision silently proceeds (certificates.ts:263-269)**

```typescript
let certId = generateCertId();
let attempts = 0;
while (attempts < 5 && await prisma.certificate.findUnique({ where: { certId } })) {
  certId = generateCertId();
  attempts++;
}
// BUG: After 5 collisions, does NOT throw — silently uses a
// potentially-colliding ID and crashes at prisma.certificate.create()
// with a unique constraint violation
```

**2. `description` accepted but never persisted (certificates.ts:292-307)**

The Zod schema validates `description`, the PDF generator receives it, but `prisma.certificate.create()` never includes it. The field doesn't even exist on the Prisma model.

**3. Bulk email failures silently swallowed (certificates.ts:402-412)**

```typescript
if (sendEmail) {
  emailService.sendCertificateIssued(...)
    .then(async (sent) => { ... })
    .catch(() => {}); // silently swallowed — no logging, no admin feedback
}
```

**4. Case sensitivity on revoke (certificates.ts:539)**

The revoke endpoint looks up `certId` without `.toUpperCase()`, while the verify endpoint does normalize case. Inconsistent — could fail if admin copies a lowercase ID.

**5. `/mine` has no pagination (certificates.ts:493-523)**

Returns ALL certificates for a user with no limit. A user with hundreds of event participations could trigger an expensive unbounded query.

**6. No validation that `recipientId`/`eventId` exist**

The generate endpoint accepts arbitrary IDs without checking whether they correspond to actual User/Event records.

**7. Resend endpoint has no per-cert rate limit (certificates.ts:569-604)**

An admin could spam a recipient by resending repeatedly. No cooldown.

---

## 4. PDF Generation Audit

### `generateCertificatePDF.ts` (756 lines)

**Architecture:** Server-side rendering with `@react-pdf/renderer`. A4 landscape (841.89 x 595.28 points). 14 visual layers: background, glows, ribbons, borders, logos, text, QR code, etc.

### Issues

| Issue | Severity | Detail |
|-------|----------|--------|
| Hardcoded domain | High | `https://codescriet.dev/verify/${certId}` at lines 110, 751. QR code and fine print both use hardcoded URLs. Should use `process.env.FRONTEND_URL`. |
| Template system non-functional | High | Four templates (`gold`, `dark`, `white`, `emerald`) are accepted as a parameter but the PDF always renders the exact same design. The `template` param is unused in the rendering logic. |
| 756-line monolith | Medium | Entire document rendered in a single function. Extremely hard to maintain, test, or extend with new templates. |
| Font loading from relative paths | Medium | Looks for TTF in `apps/api/public/logos/`. No error if fonts are missing — falls back gracefully but silently degrades certificate quality. |
| No input sanitization | Medium | `position`, `domain`, `signatoryName`, `facultyName`, `description` are rendered directly into the PDF. The codebase has `sanitizeText()` utility but it is not used here. |
| Hardcoded signatory | Low | Defaults to "CLUB PRESIDENT". Configurable via param but should come from Settings DB. |

### Text Mappings

```
PARTICIPATION → "Certificate of Participation"
COMPLETION    → "Certificate of Achievement"
WINNER        → "Certificate of Excellence"
SPEAKER       → "Certificate of Recognition"
```

### QR Code

Generated via `qrcode` library as data URL (`QRCode.toDataURL()`). Embedded directly in the PDF. The `qrCodeUrl` DB column is never populated.

---

## 5. Frontend Audit

### Admin Panel (`AdminCertificates.tsx`, 653 lines)

**What works:**
- Single + bulk certificate generation with forms
- Paginated certificate list (20 per page) with search and type filter
- Revoke with reason, resend email, download PDF, copy verify link

**Issues:**

| Issue | Severity | Detail |
|-------|----------|--------|
| Raw `fetch()` instead of API wrapper | High | All API calls use direct `fetch()` with manual token handling instead of the centralized `api.ts` wrapper. No consistent error handling. |
| Missing form fields | Medium | Backend supports `facultyName`, `description`, `eventId`, `recipientId` — none exposed in the admin form. |
| CSV email validation weak | Medium | Bulk CSV parser only checks `.includes('@')`. `a@b` would pass. |
| No bulk CSV template download | Medium | Users must guess the format. Should offer a downloadable template. |
| No CSV preview before submission | Medium | Bulk generation starts immediately. No preview step. |
| No search debounce | Low | Search triggers fetch on every keystroke. |
| No certificate editing | Low | Only option is revoke + regenerate. No way to fix a typo. |
| No export to CSV/Excel | Low | Can't download the certificate list. |

### User Dashboard (`DashboardCertificates.tsx`, 241 lines)

**What works:**
- Card grid layout, responsive (3 > 2 > 1 columns)
- Template-aware styling (colors adapt to gold/dark/white/emerald)
- Download PDF, copy verify link, external verify link

**Issues:**

| Issue | Severity | Detail |
|-------|----------|--------|
| No pagination | High | Loads ALL user certificates at once. No limit. |
| No sorting/filtering | Low | Can't filter by type or sort by date. |
| No PDF preview | Low | Must download to see the certificate. |
| No sharing (social, QR) | Low | Only copy-link available. |
| Silent redirect when feature disabled | Low | Redirects to `/dashboard` with no message explaining why. |

### Verify Page (`VerifyCertificatePage.tsx`, 449 lines)

**What works:**
- Manual cert ID entry + QR scanner (via `jsqr`)
- Auto-verify from URL parameter
- Color-coded results (green = valid, red = invalid/revoked)
- Specific error reasons shown

**Issues:**

| Issue | Severity | Detail |
|-------|----------|--------|
| PDF download requires auth on verify page | Medium | Verify page is public but download endpoint requires authentication. Public verification can't download the PDF. |
| No jsqr import fallback | Medium | If dynamic import fails, QR scanner silently breaks. |
| Camera error messages not user-friendly | Low | Generic "Camera access denied" without browser-specific guidance. |
| No share button on verification result | Low | Can't reshare a verified certificate easily. |

---

## 6. Security Analysis

| Issue | Severity | Detail |
|-------|----------|--------|
| Unsanitized text in PDF | High | `position`, `domain`, `signatoryName`, `facultyName`, `description` go directly into PDF without `sanitizeText()`. Could break layout or inject content. |
| Frontend uses raw `fetch()` | Medium | Bypasses any centralized CSRF or auth token management in `api.ts`. |
| No audit logging for cert ops | Medium | Generate, revoke, resend, bulk operations have zero audit trail. |
| Resend has no rate limit per cert | Medium | Admin can spam a recipient's email. |
| `viewCount` race condition | Low | Concurrent verifications increment without locking. Count may undercount. |
| CertId alphabet is 30 chars, 12-char ID | Info | ~30^12 = ~5.3 x 10^17 possibilities. Effectively unguessable. |
| Verify endpoint is public | Info | Intentional for sharing. Rate-limited at 60/5min. |

---

## 7. Automation & Integration Gaps

### What Exists

- `certificatesEnabled` feature flag in Settings (toggleable by PRESIDENT/super admin)
- Event reminder scheduler (every 6 hours) — but has NO certificate integration
- Event status tracking (UPCOMING > ONGOING > PAST) — but does NOT trigger cert generation

### What's Missing

| Gap | Impact | Detail |
|-----|--------|--------|
| **No auto-generation after events** | Critical | When an event moves to PAST status, nothing happens. Admin must manually go to the cert page, type every recipient's details or prepare CSV, and click generate. For a 200-person event, this is painful. |
| **No event-certificate linking in UI** | High | Backend supports `eventId` on certificates, but the admin form has no event picker. Can't query "show all certs for Event X" from the UI. |
| **No background job queue** | High | Bulk generation (up to 200 certs) runs synchronously in the request handler. No Bull/BullMQ/Agenda queue. Long bulk requests risk timeout on Render free tier. |
| **No audit logging** | High | `audit.ts` route exists but certificate routes write zero audit entries. No compliance trail for who generated/revoked what. |
| **No certificate email templates in DB** | Medium | Unlike events and announcements which use configurable templates from Settings, certificate emails are entirely hardcoded in `email.ts`. |
| **No webhook/notification system** | Medium | No way to trigger external workflows when certs are issued (e.g., Slack notification, LinkedIn integration). |
| **No retry/recovery for failed bulk ops** | Medium | If bulk generation fails midway (e.g., 50 of 200 created before crash), there's no way to resume. Must manually identify which recipients got certs and re-run the rest. |
| **Zero test coverage** | High | No unit tests, integration tests, or E2E tests for any certificate functionality. PDF generation, upload, email, and verification are completely untested. |

### Ideal Automation Flow (Not Implemented)

```
Event ends (status → PAST)
  ↓
Scheduler detects event completion
  ↓
Auto-generates certificates for all registrants
  (using event-specific template, type, signatory from event config)
  ↓
Uploads PDFs in background batches
  ↓
Sends emails with configurable delay
  ↓
Logs to audit trail
  ↓
Notifies admin via dashboard + optional webhook
```

---

## 8. Infrastructure & Deployment

### `render.yaml` Analysis

| Service | Concern |
|---------|---------|
| `codescriet-api` | No memory limits. PDF generation is CPU/memory-intensive. Bulk ops (200 certs) could exhaust heap on free tier. |
| `codescriet-api` | No request timeout config. Long bulk requests may timeout at Render's default (unclear) or the Express default. |
| Local disk fallback | Render free tier has ephemeral disk. PDFs saved locally will be lost on redeploy. |

### Upload Path

```
R2 (if configured) → Cloudinary (if configured) → Local Disk (fallback)
```

- R2: Uses S3-compatible SDK with dynamic import. Paths: `certificates/{certId}.pdf`.
- Cloudinary: `public_id: certificates/{certId}`, `resource_type: raw`, `overwrite: false`.
- Local: `uploads/certificates/{certId}.pdf`. Served via `/api/certificates/files/:filename` with regex validation.

### Font & Logo Dependencies

- Fonts: `GreatVibes.ttf`, `Cinzel.ttf`, `CormorantGaramond-Regular.ttf`, `CormorantGaramond-Italic.ttf`
- Logos: `codescriet-logo.{png,jpg,jpeg}`, `ccsu-logo.{png,jpg,jpeg}`
- Location: `apps/api/public/logos/`
- **No CI check** verifies these files exist at build time.

---

## 9. Bugs & Critical Issues

### Confirmed Bugs

| # | Bug | File:Line | Severity |
|---|-----|-----------|----------|
| 1 | CertId collision after 5 retries silently proceeds instead of throwing | `certificates.ts:263-269` | High |
| 2 | `description` field accepted by API, rendered in PDF, but never saved to DB (no column exists) | `certificates.ts:292-307`, `schema.prisma` | High |
| 3 | Bulk email failures silently swallowed (`.catch(() => {})`) | `certificates.ts:402-412` | Medium |
| 4 | Revoke endpoint doesn't normalize certId case (missing `.toUpperCase()`) | `certificates.ts:539` | Medium |
| 5 | `/mine` endpoint returns unbounded results (no pagination) | `certificates.ts:493-523` | Medium |
| 6 | Template parameter accepted but ignored — all PDFs render identically | `generateCertificatePDF.ts` | Medium |
| 7 | `qrCodeUrl` column defined in schema but never populated anywhere | `schema.prisma:648` | Low |
| 8 | Hardcoded `https://codescriet.dev` in QR code and PDF fine print | `generateCertificatePDF.ts:110,751` | Medium |
| 9 | Weak email validation in bulk CSV parser (only `.includes('@')`) | `AdminCertificates.tsx:222` | Medium |
| 10 | Frontend sends no `eventId` — backend field always null for UI-generated certs | `AdminCertificates.tsx` | Low |

---

## 10. Feature Gap Matrix

### Admin Capabilities

| Feature | Status | Notes |
|---------|--------|-------|
| Generate single cert | Done | Missing `facultyName`, `description`, `eventId` in form |
| Bulk generate certs | Done | Max 200, batch of 5. No progress bar, no resume on failure |
| List/search/filter certs | Done | Paginated, searchable. No export. |
| Revoke certificate | Done | With optional reason. No bulk revoke. |
| Resend email | Done | No rate limit. No cooldown. |
| Download PDF | Done | Works for admin and owner. |
| Edit certificate | Missing | Only option is revoke + regenerate |
| Bulk revoke | Missing | Must revoke one by one |
| Certificate statistics | Missing | No dashboard widget, no charts |
| Event-linked generation | Missing | No event picker, no auto-gen from event registrants |
| Template preview | Missing | Can't preview before generating |
| Custom email template | Missing | Hardcoded in `email.ts` |
| Audit trail | Missing | No logging of any certificate operations |
| Export cert list | Missing | No CSV/Excel download |

### User Capabilities

| Feature | Status | Notes |
|---------|--------|-------|
| View own certificates | Done | Card grid, template-aware styling |
| Download PDF | Done | Via authenticated endpoint |
| Copy verify link | Done | Clipboard API |
| View cert in browser | Missing | Must download to see |
| Share on social media | Missing | No share buttons |
| Request correction | Missing | No way to flag errors |
| Filter/sort certs | Missing | Shows all, no controls |
| Pagination | Missing | Loads everything at once |

### Public Verification

| Feature | Status | Notes |
|---------|--------|-------|
| Manual cert ID lookup | Done | With auto-uppercase |
| QR code scanner | Done | Via jsqr library |
| URL-based auto-verify | Done | `/verify/:certId` |
| Revocation status shown | Done | With reason if provided |
| PDF download from verify | Missing | Requires auth even though verify page is public |
| Share verified result | Missing | No share/embed options |

---

## 11. Recommendations

### P0 — Fix Now (Bugs)

1. **Throw error on certId collision** after max retries instead of silently proceeding.
2. **Either add `description` column to Prisma schema or remove it from the API/PDF**.
3. **Log email failures** in bulk generation instead of `.catch(() => {})`.
4. **Normalize certId case** in the revoke endpoint (add `.toUpperCase()`).
5. **Add pagination** to `/mine` endpoint.
6. **Use `process.env.FRONTEND_URL`** instead of hardcoded `https://codescriet.dev` in PDF/QR.
7. **Sanitize text fields** (`position`, `domain`, `signatoryName`, `facultyName`) before passing to PDF renderer.

### P1 — Short Term (1-2 weeks)

1. **Implement actual certificate templates** — the 4 template options should produce visually different PDFs, or remove the option to avoid confusion.
2. **Add event picker to admin form** — link certificates to events via `eventId`. This enables filtering certs by event.
3. **Add `facultyName` and `description` to admin form** — backend already supports them.
4. **Add audit logging** — log all certificate generate/revoke/resend operations to `AuditLog`.
5. **Add rate limiting to resend** — cooldown per certId (e.g., 1 resend per 10 minutes).
6. **Migrate frontend to use `api.ts` wrapper** — replace raw `fetch()` calls with centralized API methods.
7. **Remove `qrCodeUrl` column** — it's unused dead weight. Clean migration.
8. **Add unique constraint on `(recipientEmail, eventId, type)`** — prevent duplicate certs.
9. **Add pagination to user dashboard** — currently loads all certs at once.

### P2 — Medium Term (1-2 months)

1. **Event-end auto-generation** — when event status moves to PAST, auto-trigger certificate generation for all registered attendees. Admin sets template/type/signatory per event.
2. **Background job queue** — use Bull or BullMQ for async bulk operations with progress tracking and retry.
3. **Certificate edit** — allow editing recipient name/email before email is sent (not after).
4. **Bulk operations UI** — select multiple certs to revoke, resend, or export.
5. **In-browser PDF preview** — render cert preview before generating (or use PDF.js viewer).
6. **CSV template download** — provide downloadable bulk CSV template with headers.
7. **Configurable email templates** — move certificate email HTML to Settings DB like events/announcements.
8. **Bulk CSV preview** — show parsed recipients with validation before submitting.
9. **Certificate statistics dashboard** — total issued, by type, by event, by month.

### P3 — Long Term (3+ months)

1. **Comprehensive test suite** — unit tests for PDF generation, integration tests for the full flow, E2E tests for admin and user journeys.
2. **Refactor PDF generator** — break the 756-line monolith into composable template components.
3. **Social sharing** — share certificates on LinkedIn, Twitter with Open Graph previews.
4. **Public PDF download on verify page** — allow anyone verifying a cert to download the PDF.
5. **Webhook/notification system** — fire events when certs are issued for external integrations.
6. **Certificate signing** — cryptographic signature embedded in PDF for offline verification.
7. **Render deployment hardening** — set memory limits, configure timeouts, ensure persistent storage for PDFs.
8. **CI pipeline checks** — verify fonts/logos exist, validate PDF rendering in CI.

---

## Summary

The certificate system has a solid foundation — the schema design is reasonable, the upload fallback chain (R2 > Cloudinary > local) is well-thought-out, and the public verification flow with QR scanning works. However, there are **10 confirmed bugs** (most notably the silent certId collision and missing `description` persistence), **zero test coverage**, **zero audit logging**, and a **non-functional template system** that promises four visual styles but delivers one.

The biggest architectural gap is the complete absence of automation: certificates must be manually generated one-by-one or via CSV, with no integration to the event lifecycle. For a club that runs regular events, automating certificate generation on event completion would save significant admin time and reduce human error.
