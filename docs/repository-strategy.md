# Repository Strategy

Renderizer should start as a monorepo.

## Decision

Keep `@renderizer/core`, `@renderizer/vue`, `@renderizer/create`, and future `@renderizer/js` / `@renderizer/react` packages in one repository.

## Why

- The packages share one protocol: frame names, IPC channel names, bridge shape, document sync, and config semantics need to evolve together.
- The CLI should generate code that matches the installed framework packages, so versioning them together reduces drift.
- Examples and integration tests can cover cross-package behavior in one place.
- Early API changes will be frequent, and a monorepo keeps refactors cheap.
- Publishing can still happen as separate npm packages from one repo.

## When To Split

Splitting repositories may make sense later if one adapter develops a separate team, release cadence, or platform roadmap. Until then, separate repositories would add coordination cost without much benefit.
