/**
 * SDD artifact templates aligned with GitHub spec-kit structure.
 * @see https://github.com/github/spec-kit
 */

export const CONSTITUTION_TEMPLATE = `# Project Constitution

> Governing principles for Spec-Driven Development in this workspace.
> Reference this document during specify, plan, and implement phases.

## Code quality

- [ ] Tests accompany behavior changes
- [ ] Public APIs are documented
- [ ] No secrets in source control

## User experience

- [ ] Consistent terminology and error messages
- [ ] Accessibility baseline met for UI work

## Performance & security

- [ ] Performance budgets defined for hot paths
- [ ] OWASP-style review for auth and data handling

## Governance

Decisions that conflict with this constitution require an explicit exception note in the feature spec or plan.
`;

export const SPEC_TEMPLATE = (featureName: string, userInput: string): string => `# Feature Specification: ${featureName}

**Status**: Draft

**Input**: ${userInput || 'Describe what you want to build (what & why, not tech stack).'}

## User Scenarios & Testing

### User Story 1 (Priority: P1)

[Describe the primary user journey]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

## Requirements

### Functional Requirements

- **FR-001**: System MUST [capability]

## Success Criteria

- **SC-001**: [Measurable outcome]

## Review & Acceptance Checklist

- [ ] Requirements are testable
- [ ] Edge cases documented
- [ ] Out of scope items listed
`;

export const PLAN_TEMPLATE = (featureName: string): string => `# Implementation Plan: ${featureName}

**Status**: Draft

## Technical context

- **Stack**: [e.g. Node 20, React, Postgres]
- **Constraints**: [deployment, compliance, integrations]

## Architecture

[High-level components and data flow]

## Implementation phases

1. [Phase 1]
2. [Phase 2]

## Research notes

[Optional: versions, APIs, risks]
`;

export const TASKS_TEMPLATE = (featureName: string): string => `# Tasks: ${featureName}

> Generated from the implementation plan. Execute in order; `[P]` = parallelizable.

## Phase 1 — Setup

- [ ] T001 Create project structure
- [ ] T002 [P] Configure dependencies

## Phase 2 — Core implementation

- [ ] T003 Implement [component] in \`path/to/file\`

## Checkpoints

- [ ] User Story 1 independently testable
`;

export const CHECKLIST_TEMPLATE = (featureName: string): string => `# Quality Checklist: ${featureName}

> "Unit tests for English" — validate spec clarity before implementation.

## Requirements completeness

- [ ] Every FR maps to a user story or task
- [ ] No unresolved [NEEDS CLARIFICATION] markers

## Consistency

- [ ] Plan references all functional requirements
- [ ] Tasks cover all plan phases
`;

export const CLARIFICATIONS_TEMPLATE = `# Clarifications

> Record answers from structured clarification (spec-kit /speckit.clarify).

| # | Topic | Decision |
|---|-------|----------|
| 1 | | |
`;
