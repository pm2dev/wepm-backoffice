# 0001 — One user today; contractor portal later

**Status:** Accepted (2026-11-25)

## Context

Backoffice is used by one person, the owner. Contractors log time in wepm.app and are paid through Backoffice. The owner wants contractors to eventually see their own payroll (what's owed, what's been paid) in a portal, but not now.

## Decision

- A **User** is a Backoffice login. Today there is one: the owner (`AUTH_USERNAME`).
- A **Contractor** is a person who logs time. Contractors are not Users and cannot sign in.
- The contractor portal is out of scope. Leave room for it:
  - Keep every payroll fact (finalized payroll, adjustments, payments) keyed by `contractorId`, so a contractor's view is a filter, not a rewrite.
  - Keep `Contractor.email` so it can become the portal login identity.
  - Don't put owner-only notes in fields a contractor would later see without marking them private.

## Consequences

- No roles or permissions now.
- Adding the portal later means adding contractor logins and a read-only, contractor-scoped view; the data model shouldn't need to change.
