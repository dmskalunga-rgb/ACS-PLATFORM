# ADR-0002: Frontend stack

Status: `ACCEPTED_ON_PHASE_0_BRANCH`

Date: 2026-08-08

## Baseline sources

`VOL-VII-7.2`, `VOL-I-1.4`, `VOL-VIII-8.3`

## Context and criteria

The ACS frontend must support responsive operational dashboards, real-time updates,
accessibility, internationalization, low-bandwidth states, light/dark modes, modularity, and
long-term testing. No baseline requirement mandates server-side rendering.

## Alternatives

- Angular: integrated enterprise framework and strong conventions; higher framework coupling.
- Next.js/React: mature full-stack capabilities; server runtime and routing features exceed the
  current dashboard-shell need and increase coupling.
- React with Vite: mature component ecosystem, explicit architecture, fast standards-based
  build, and independently deployable static shell.

## Decision

Use TypeScript, React 19, and Vite 8 for the application shell. Add routing, server-state,
i18n, and design-system dependencies only when a traced slice requires them. Use semantic HTML,
WCAG-oriented tests, real API states, CSS color-scheme support, and Vitest/Testing Library.

## Consequences and risks

React does not impose application architecture; repository standards must enforce feature
boundaries and accessible state handling. SPA delivery requires explicit proxy and security
headers. Avoid ecosystem churn by pinning versions and admitting dependencies through review.

## Validation

Production build plus component tests for verified and disconnected backend states.
References: https://react.dev/ and https://vite.dev/guide/.
