# ADIA Cake — Agent Workflow

Full 5-agent pipeline for every task. Claude (coordinator) launches agents in sequence and passes output between them.

---

## Pipeline Overview

```
User Task
    │
    ▼
┌─────────────────┐
│  adia-planner   │  Step 1 — Plans task, identifies files, no stylistic questions
│  model: haiku   │
└────────┬────────┘
         │ Structured plan + file list
         ▼
┌─────────────────┐
│  adia-reader    │  Step 2 — Reads actual files, finds exact paths & line numbers
│  model: haiku   │
└────────┬────────┘
         │ File context (selectors, functions, variables)
         ▼
┌─────────────────┐
│  adia-designer  │  Step 3 — Implements CSS/SCSS, compiles, notes HTML changes
│  model: sonnet  │
└────────┬────────┘
         │ Styling result + new class names
         ▼
┌─────────────────┐
│  adia-developer │  Step 4 — Implements JS logic, wires entry points
│  model: sonnet  │
└────────┬────────┘
         │ All changes complete
         ▼
┌─────────────────┐
│  adia-reviewer  │  Step 5 — Reviews, approves or triggers retry
│  model: haiku   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
  ✅ Commit  🔄 Retry → back to adia-designer or adia-developer
```

---

## Handoff Format Between Agents

### planner → reader
```
## → Handoff to adia-reader
Read these files: [exact paths]
Look for: [specific functions, selectors, patterns]
Context: [what we're about to change and why]
```

### reader → designer
```
## → Handoff to adia-designer
SCSS files to modify: [paths + line ranges]
Current selectors: [list]
Variables available: [from _variables.scss]
HTML structure (do not change): [relevant snippet]
Task: [what needs to be styled]
```

### designer → developer
```
## → Handoff to adia-developer
HTML changes made: [list or "none"]
New CSS classes added: [list — developer must not rename]
State classes in use: [.is-active, .visible, etc.]
JS needed: [what logic/events to implement]
SCSS compiled: [yes/no]
```

### developer → reviewer
```
## → Handoff to adia-reviewer
Files changed: [complete list — HTML, SCSS, JS]
Feature: [one-line description]
Test this: [specific user flow to validate]
Risk areas: [auth, RLS, mobile layout, animations]
```

### reviewer → commit or retry
```
## ✅ Approve — safe to commit
git add [files]
git commit -m "feat: [description]"

-- OR --

## 🔄 Retry Required
Issue: [what's wrong, file:line]
Agent: [adia-designer | adia-developer]
Fix prompt: "[Exact corrective instruction]"
```

---

## Coordinator Rules (Claude)

1. **Always launch adia-planner first** for any non-trivial task (more than one file or layer)
2. **Pass full context** in each agent prompt — agents don't see the conversation
3. **Skip agents that don't apply:**
   - Pure CSS task → skip adia-developer
   - Pure JS task → skip adia-designer
   - Simple one-file fix → can skip planner and reader if context is already clear
4. **Compile SCSS after designer** if designer didn't: `sass styles/main.scss styles/main.css`
5. **Never skip adia-reviewer** — always review before committing

---

## Task Type → Agent Sequence

| Task Type | Agents |
|-----------|--------|
| New feature (JS + CSS + HTML) | planner → reader → designer → developer → reviewer |
| Visual redesign (CSS/SCSS only) | planner → reader → designer → reviewer |
| JS feature (no styling) | planner → reader → developer → reviewer |
| Bug fix (single file) | reader → [designer or developer] → reviewer |
| Admin panel feature | planner → reader → developer → reviewer |
| Mobile layout fix | reader → designer → reviewer |
| Supabase schema change | planner → developer → reviewer |

---

## Example Prompts by Agent

### adia-planner
```
Plan this task for ADIA Cake: [task description]
Read guide-planner skill. Build step-by-step plan with file paths, risks, and handoff to adia-reader.
No stylistic questions — make design decisions autonomously.
```

### adia-reader
```
You received this plan from adia-planner: [plan]
Read these files: [paths]
Output file context: exact line numbers, selectors, functions, variables.
End with handoff to adia-designer.
```

### adia-designer
```
You received this context from adia-reader: [context]
Implement CSS/SCSS changes. Use guide-designer skill.
Files to modify: [paths]
End with handoff to adia-developer.
```

### adia-developer
```
You received this handoff from adia-designer: [handoff]
Implement JS logic. Use guide-developer skill.
New CSS classes to use: [list]
End with handoff to adia-reviewer.
```

### adia-reviewer
```
Review these changes: [file list]
Feature: [description]
Use guide-reviewer skill. Output ✅/❌/⚠️ report.
If issues found, output 🔄 Retry with exact corrective prompt.
```

---

## Retry Cycle

When reviewer finds issues:

1. Reviewer outputs `🔄 Retry Required` with exact corrective prompt
2. Coordinator launches the target agent with that prompt
3. Target agent fixes the issue
4. Coordinator re-runs reviewer on the changed files only
5. Repeat until approved

Maximum retry depth: 2 cycles. If still failing after 2 retries, report to user.
