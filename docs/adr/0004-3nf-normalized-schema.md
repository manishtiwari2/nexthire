# ADR 0004: Third Normal Form (3NF) Relational Database Schema

## Status
Accepted (Frozen Architecture)

## Context
NextHire requires strict data integrity across questions, contests, test cases, starter templates, tags, and participation records without data corruption or ambiguity.

## Decision
1. Eliminate JSON strings in database tables in favor of normalized relational entities (`TestCase`, `StarterCode`, `ContestQuestion`, `Hint`, `Editorial`, `ProfileSkill`, `QuestionTagMap`, `CompanyTagMap`).
2. Enforce Prisma enums for all state fields (`Role`, `Difficulty`, `Language`, `ContestStatus`, `InterviewStatus`, `SubmissionStatus`, `SubmissionContext`, `ParticipantRole`, `NotificationType`).
3. Model participation explicitly using `ContestParticipant` (with `startedAt`, `finishedAt`, `lastHeartbeatAt`, `score`, `penalty`, `isDisqualified`) and `InterviewParticipant`.

## Consequences
- Clean relational join queries and strict foreign key cascading deletes.
- Easy indexing and high query performance on PostgreSQL.
