# Project Instructions — Natel628

## Project Overview
This repository contains multiple mostly standalone HTML websites and tools, hosted primarily through GitHub Pages.

The repository is a collection of projects, not one unified web application.

## Project Structure
- Root HTML files: Individual websites and applications.
- sites/: Additional organized website projects.
- sites/assets/: Shared assets for projects under sites.
- sites/curio/: Curio project.
- sites/gta6/: GTA 6 project.
- sites/whats-happening/: What's Happening project.
- curio/: Root-level Curio resources.
- scripts/: Utility and automation scripts.
- tools/: Project tools and utilities.
- .github/: GitHub configuration and workflows.
- .freebuff/: Freebuff project metadata.

Always inspect the relevant project before making changes. Do not assume every HTML file belongs to the same website.

## Technology Guidelines
- Prefer vanilla HTML, CSS, and JavaScript.
- Preserve existing technology choices and architecture.
- Do not introduce React, Vue, build systems, frameworks, or dependencies without a clear reason and approval.
- Preserve GitHub Pages compatibility.
- Avoid unnecessary external dependencies.
- Follow existing coding and formatting conventions.

## Change Management
- Work only on the project or files relevant to the assigned task.
- Avoid unrelated refactoring.
- Do not overwrite existing functionality without understanding it.
- Preserve existing integrations, APIs, authentication, and user data flows.
- Check relative paths and asset references before changing directory structures.
- Consider mobile, tablet, and desktop layouts.
- Test changes and check browser console errors where possible.

## Security
- Never expose API keys, tokens, passwords, or credentials.
- Never weaken authentication or access controls.
- Treat user-provided content and external data as untrusted.
- Do not remove security protections to make something work.

## Git Rules
- Inspect git status before editing.
- Never discard or overwrite another agent's work.
- Use separate branches or Git worktrees for independent parallel tasks.
- Do not force-push.
- Do not commit, merge, or push to GitHub without user approval.
- Keep changes focused and reviewable.

## AI Team Responsibilities

### Freebuff
Project coordinator. Analyze requests, break work into phases, delegate tasks, track progress, and coordinate reviews.

### Cline
Primary implementation agent. Build features, modify HTML/CSS/JavaScript, and fix bugs.

### Kilo
UX/UI specialist. Evaluate visual design, usability, accessibility, responsiveness, and consistency.

### OpenCode
Independent reviewer. Review code, identify bugs, security issues, regressions, and architectural problems.

These are default responsibilities, not restrictions. Agents may take other roles when explicitly assigned.

## Collaboration Workflow
1. Understand the requested outcome.
2. Identify the affected website and files.
3. Inspect existing implementation before proposing changes.
4. Create a clear implementation plan.
5. Assign independent work to isolated branches or worktrees.
6. Implement changes.
7. Have another agent review significant changes.
8. Test functionality and responsive layouts.
9. Summarize modified files, test results, and outstanding concerns.
10. Wait for user approval before merging or deploying.

## General Principles
- Favor working, maintainable solutions over unnecessary complexity.
- Do not invent requirements.
- Ask questions when a consequential decision is unclear.
- Explain tradeoffs and potential regressions.
- Keep the user informed of significant decisions.
