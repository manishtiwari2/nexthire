# ADR-0006: Run/Submit split with server-authoritative submission fields

## Status
Accepted.

## Context
Users need a low-stakes way to try their code against the visible sample cases without it counting
toward progress, streaks, acceptance rate, or a contest score — and a separate "final" submission
judged against every test. Separately, the fields that decide **consequences** (is this a contest
submission? which contest? what's the verdict?) must not be forgeable by the client.

## Decision
- Add an **`isTrialRun`** boolean to `Submission`. A **Run** (`mode: "run"`) is judged on **sample
  cases only**, is excluded from submission history, and never touches progress or score. A **Submit**
  is judged on **all** cases and records consequences. Both share the entire judging pipeline and
  verdict-delivery mechanism.
- The trial flag is read from the **stored row**, not from the job payload, so it cannot be changed
  after the submission is created.
- Make submission consequence-fields **server-authoritative**: the practice `execute` endpoint pins
  `context = PRACTICE` and ignores any client-supplied `context`/`contestId`; only the dedicated
  contest submit endpoint creates `CONTEST` submissions. `status` and score are set by the server.

## Alternatives considered
- **A separate trial endpoint and/or table** — would duplicate the compile/run/verdict/delivery
  pipeline for little benefit. Rejected in favour of one table with a flag and an index that filters
  trial runs out of history/progress queries.
- **Trusting client-supplied `context`/`contestId`** — this was the earlier behaviour and was
  **exploitable**: a client could post `context: 'CONTEST', contestId: <any>` to the practice endpoint
  and bypass contest rules. Rejected and fixed; regression-tested.

## Rationale
Documented in `Submission.isTrialRun`'s schema comment and in `submitCodeExecution`
(`server/src/features/question-bank/questionController.js`): "`context`/`contestId` are deliberately
NOT read from the body." Backed by `runVsSubmit.test.js` and `submissionExposure.test.js`.

## Consequences
- **Positive:** one pipeline serves both modes; consequence-bearing fields cannot be forged; history
  and progress queries stay clean via `@@index([userId, isTrialRun])`.
- **Negative / cost:** every run/submit creates a `Submission` row (a trial still needs a row to
  carry its verdict), so trial runs contribute rows that queries must filter out.

## Future
None outstanding.
