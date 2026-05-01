---
name: requirement-analysis-workflow
description: Run a cross-project requirement analysis workflow from problem framing to testable stories and prioritized scope. Use when requirements are ambiguous, conflicting, or solution-first.
intent: >-
  Turn vague asks into a clear requirement package by combining problem framing,
  hypothesis validation, story decomposition, acceptance criteria, prioritization,
  and risk checks. This skill is designed for reuse across different projects,
  not tied to one domain.
type: workflow
theme: requirements-analysis
best_for:
  - "Converting unclear requests into actionable requirements"
  - "Aligning product, design, and engineering before implementation"
  - "Producing testable stories with clear acceptance criteria"
scenarios:
  - "We have a feature request but no clear user problem"
  - "Multiple stakeholders want different outcomes"
  - "Need a development-ready requirement package this week"
estimated_time: "30-90 min"
---

## Purpose

Use this workflow to move from noisy input to a decision-ready requirement package.

This skill is for demand analysis across projects. It keeps the process problem-first,
outcome-focused, and testable, while avoiding solution smuggling and scope sprawl.

## Key Concepts

### 1) Problem First, Not Solution First

Start from user pain and business outcome. Do not begin with a predefined feature.

### 2) Evidence Chain

Every major requirement should map to at least one evidence source:

- user interview signal
- product data signal
- support or field signal
- strategic signal

### 3) Vertical Slicing

Break large asks into thin end-to-end increments that deliver visible user value.
Avoid horizontal slices like "frontend first" or "database first" as standalone stories.

### 4) Testable Requirements

Each story must include acceptance criteria in Given/When/Then form.
If it cannot be tested, it is not ready.

### 5) Scope Discipline

Explicitly label out-of-scope, dependencies, and assumptions to reduce churn later.

## Application

### Step 0: Intake and Mode Selection

Collect what exists and choose the working mode.

- Guided: one question at a time
- Context dump: user pastes all current context
- Best guess: infer missing details and mark assumptions

Minimum input checklist:

- request origin and stakeholder
- target users
- current pain or trigger event
- business objective and timeline
- known constraints

### Step 1: Frame the Problem Narrative

Use this structure:

- I am: who is blocked
- Trying to: desired outcome
- But: barrier
- Because: likely root cause
- Which makes me feel: impact and urgency

Output:

- one-sentence final problem statement
- 3 to 5 discovery questions that must be answered

### Step 2: Define Outcomes and Constraints

Create explicit targets before discussing detailed features.

- primary success metric and target shift
- guardrail metrics
- hard constraints (legal, technical, data, timeline)
- soft constraints (team capacity, operational limits)

Output:

- success table with baseline and target
- constraint list ranked by impact

### Step 3: Build Requirement Hypotheses

Translate the problem into falsifiable hypotheses.

Template:
"We believe [persona] needs [capability] because [evidence].
If true, [metric] should move from [baseline] to [target] within [timebox]."

Output:

- hypothesis set (usually 1 to 3)
- validation plan per hypothesis

### Step 4: Decompose to Epics and Stories

From each hypothesis, derive epics then stories.
Use these split patterns first:

1. workflow steps (thin end-to-end)
2. operations (create/read/update/delete)
3. rule or data variations

Quality rule:
Each split must preserve user-visible value.

Output:

- epic map
- story list with IDs and ordering

### Step 5: Write Story and Acceptance Criteria

Use story format:

- As a [persona]
- I want to [action]
- so that [outcome]

Use acceptance format:

- Scenario
- Given
- When
- Then

Readiness check:

- one clear When
- one clear Then
- measurable Then outcome

Output:

- development-ready stories
- acceptance criteria set

### Step 6: Prioritize and Sequence

Score each story using a simple method:

- user impact
- confidence
- effort
- risk reduction

Then sequence by:

- value first
- risk retirement early
- dependency-aware ordering

Output:

- prioritized backlog slice
- release slice recommendation (now, next, later)

### Step 7: Risk, Dependency, and Out-of-Scope Gate

Before handoff, publish:

- top risks with mitigation
- dependency list with owner
- explicit out-of-scope list
- assumptions to validate

Output:

- requirement handoff package

## Deliverable Template

```markdown
# Requirement Analysis Pack

## 1. Problem Statement

- Final statement:
- Evidence:

## 2. Outcomes and Metrics

- Primary metric:
- Guardrails:
- Baseline -> Target:

## 3. Constraints

- Hard:
- Soft:

## 4. Hypotheses

1. ...
2. ...

## 5. Epic and Story Breakdown

- Epic A:
  - Story A1
  - Story A2

## 6. Acceptance Criteria (Given/When/Then)

- Story A1:
  - Scenario:
  - Given:
  - When:
  - Then:

## 7. Prioritization

- Now:
- Next:
- Later:

## 8. Risks, Dependencies, Out of Scope

- Risks:
- Dependencies:
- Out of Scope:

## 9. Open Questions

- ...
```

## Common Pitfalls

### Pitfall 1: Solution Smuggling

Symptom: "The requirement is to build feature X" before defining the user problem.

Consequence: team optimizes implementation quality, not problem-value fit.

Fix: freeze solution details until problem statement and metric target are agreed.

### Pitfall 2: Story Lists Without Outcomes

Symptom: backlog items describe screens and endpoints but not user value.

Consequence: shipped output cannot prove business or user impact.

Fix: enforce "so that" outcome and measurable Then criteria.

### Pitfall 3: Horizontal Split

Symptom: separate stories like UI work, API work, DB work with no user-visible increment.

Consequence: long integration delay and weak learning loops.

Fix: split by end-to-end slices that can be observed by a real user.

### Pitfall 4: Missing Out-of-Scope

Symptom: every request is implied in scope.

Consequence: scope creep and timeline instability.

Fix: publish an explicit out-of-scope list in every package.

### Pitfall 5: No Assumption Tracking

Symptom: implicit assumptions stay hidden until delivery risk materializes.

Consequence: late rework and stakeholder trust loss.

Fix: maintain a visible assumptions-to-validate list.

## References

This skill is distilled from methods and patterns in Product-Manager-Skills.
Primary source set:

- C:/Users/maoqh/Desktop/项目文件/Product-Manager-Skills/skills/problem-statement/SKILL.md
- C:/Users/maoqh/Desktop/项目文件/Product-Manager-Skills/skills/user-story/SKILL.md
- C:/Users/maoqh/Desktop/项目文件/Product-Manager-Skills/skills/prd-development/SKILL.md
- C:/Users/maoqh/Desktop/项目文件/Product-Manager-Skills/skills/discovery-process/SKILL.md
- C:/Users/maoqh/Desktop/项目文件/Product-Manager-Skills/skills/epic-breakdown-advisor/SKILL.md
- C:/Users/maoqh/Desktop/项目文件/Product-Manager-Skills/skills/workshop-facilitation/SKILL.md

If local path access fails, use the fallback repository:

- https://github.com/mmm-05610/Product-Manager-Skills.git
