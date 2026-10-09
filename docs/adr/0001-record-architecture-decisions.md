# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

The solution was built in phases, and many decisions were made along the way: some planned upfront (service split, messaging), others forced by what testing revealed (per-message retry in the outbox relay, handling of idle connection loss, readiness semantics for shared dependencies). Code shows _what_ was done but not _why_, nor which alternatives were considered. The code itself has no comments by convention, so the reasoning must live somewhere else.

## Decision

Architecturally significant decisions are recorded as lightweight Architecture Decision Records, following Michael Nygard's format, in `docs/adr/`:

- one file per decision, numbered sequentially and never renumbered;
- sections: Context, Decision, Alternatives considered, Consequences, and Evidence pointing to the code that implements the decision;
- an ADR is immutable once accepted; a change of direction is a new ADR that supersedes the old one, and the old one has its status updated to `Superseded by ADR-XXXX`;
- ADRs are written in English, like the rest of the technical documentation; the README (in Portuguese) keeps a summarized justification table and links here.

## Alternatives considered

| Alternative                         | Why it was not chosen                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| Comments in the code                | The project forbids comments; and comments describe code, not discarded alternatives |
| A wiki or document outside the repo | Drifts from the code and is lost when the repository is cloned or forked             |
| Only the README justification table | Good for a summary, but too short to record context and consequences                 |

## Consequences

- **Positive:** reviewers and future maintainers can understand trade-offs without reconstructing them; decisions are reviewed in pull requests together with the code that implements them.
- **Negative:** ADRs must be kept in sync when a decision is revisited; this is mitigated by the supersede rule instead of editing history.

## Evidence

- Index: [README.md](README.md)
- Summary in Portuguese: [README "Justificativa das decisões de arquitetura e tecnologia"](../../README.md#justificativa-das-decisões-de-arquitetura-e-tecnologia)
