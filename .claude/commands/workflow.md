# Workflow

## Parse Command Arguments

Input format: `/personal:workflow [task/feature/request/PRD/PRP] [--flags]`

Available flags:

- `--seq`: Use sequential thinking MCP server for deep analytical reasoning
- `--serena`: Use Serena MCP server for enhanced coding context
- `--c7`: Use context7 MCP server for best practices research and documentation
- `--ultrathink`: Enable ultra-deep thinking mode
- `--thinkhard`: Enable intensive thinking mode
- `--thinkharder`: Enable maximum thinking mode

Parse the input: $ARGUMENTS

## Prime

- READ the @docs/changelog.md and use these are your northstar for guiding principles and guardrails.
- READ the @ai_docs/ai-personality-traits.md to understand your personality traits.
- READ the `The Work` below which will have the feature, bug, or task the user needs completed.

## The Work

- Listed below in the `user_data` XML tag below is the work you should complete. The format will be either as a github issue, a task documented in natural lanugage from the user, or a product requirement document (PRD) in markdown format.

<user_data>
[task/feature/request/PRD]
</user_data>

- READ <user_data>.
- PLAN a comprehensive implementation plan from <user_data> and document the full plan persistently in @docs/changelog.md.
- ENGINEER based on the the plan and update progress in the @docs/changelog.md consistently.
- VERIFY all completed work in the @docs/changelog.md based on the `Personality Traits` below with 100% completeness.
- ENSURE the verified work meeting the business outcome and intentions documented in <user_data> for 100% completeness. 
- All agents to leverage SPARC and the `Personality Traits` below.
- OPERATE autonmously until everything is complete and do not get lazy.
- ULTRATHINK.

### Rules
**EXTREMELY IMPORTANT:**: Follow the personality traits in the `Personality Traits` section.
**EXTREMELY IMPORTANT:**: Use sequential thinking and serena mcp servers to assist where needed.
**IMPORTANT:** Make sure @docs/changelog.md uses accurate timestamps documenting each update.
**IMPORTANT:** Please use the gh and git cli for all work related to github.
**IMPORTANT:** Do not commit or push to git unless explicitly told to.
**IMPORTANT:** Put all documentation in the docs/ directory. 
**IMPORTANT:** Do not put files in the root of the project unless required. Maintain the directory structure below:
map-enforcer/
├── .claude/                    # Claude Code directory
├── .claude/                    # Claude Flow Directory
├── docs/                       # Documentation directory
├── mobile/                         # Expo React Native app (MVP focus)
│   ├── app/                        # Expo Router tabs/stacks (Dashboard, Violations, Policies, Settings)
│   ├── components/                 # Small reusable UI pieces
│   ├── features/
│   │   ├── policies/               # List/detail; hooks/services colocated
│   │   └── violations/             # List/detail; hooks/services colocated
│   ├── services/
│   │   ├── api/                    # Convex client wrapper
│   │   └── voice/                  # TTS/STT adapters (fallback to text)
│   ├── assets/                     # Images/fonts/icons
│   ├── utils/                      # Tiny helpers (formatters)
│   ├── types/                      # Local TS types (optional)
│   ├── app.json
│   ├── package.json
│   └── tsconfig.json
│
├── web/                            # Next.js dashboard (data management)
│   ├── app/                        # Or pages/ — list, detail, settings
│   ├── components/                 # Table, forms, layout
│   ├── features/                   # Mirrors mobile domains (policies, violations)
│   ├── lib/                        # Convex client, csv helpers
│   ├── public/
│   ├── styles/
│   ├── next.config.js
│   ├── package.json
│   └── tsconfig.json
│
├── convex/                         # Shared backend (single Convex project)
│   ├── schema.ts                   # Tables + indexes (policies, violations, runs, notices)
│   ├── policies.ts                 # CRUD mutations/queries
│   ├── violations.ts               # List/create + filters
│   ├── sp-api.ts                   # Offers/title fetch actions (rate-limited)
│   ├── runs.ts                     # Detection run bookkeeping (minimal)
│   └── notices.ts                  # Notice create/list
│
├── shared/                         # Optional: shared TS only (no React)
│   ├── types/                      # DTOs/interfaces shared by web/mobile/backend
│   │   └── index.ts
│   ├── utils/                      # CSV parsing/validation helpers for web
│   │   ├── csv.ts
│   │   └── validation.ts
│   └── README.md
│
├── package.json                    # (optional) workspaces to manage web/mobile
├── tsconfig.base.json              # (optional) TS base config for shared paths
├── pnpm-workspace.yaml             # or yarn/npm workspaces (optional)
└── README.md

## Flag-Based Enhancement Instructions

### If --seq flag is present:

**Sequential Thinking MCP**: Apply systematic, step-by-step reasoning to:

- Break down complex problems into logical task sequences
- Validate each step against task structure before proceeding
- Document reasoning chains in task descriptions
- Ensure no logical gaps in task dependency planning

### If --serena flag is present:

**Serena MCP Integration**: Enhance with:

- Code architecture understanding mapped to tasks
- Integration point identification reflected in task dependencies
- Technical dependency mapping in task structure
- Cross-service coordination through task orchestration

### If --c7 flag is present:

**Context7 MCP**: Provide:

- Best practices research integrated into task descriptions
- Industry standard patterns documented in task acceptance criteria
- Framework documentation insights added to task context
- Technical decision validation stored in task notes
- Comprehensive knowledge base access for informed task creation

### Thinking Flags:

**Enhanced Thinking Modes**:

- **--ultrathink**: Analyze every angle using task breakdown, generate multiple solution approaches as task alternatives, document extensive pros/cons in task descriptions
- **--thinkhard**: Thorough analysis reflected in tasks, comprehensive risk assessment in task descriptions, detailed technical trade-offs in acceptance criteria
- **--thinkharder**: Exhaustive solution space exploration mapped to tasks, deep implementation implications in task criteria, extensive impact analysis in dependencies

## Outcome

The outcome should be a system that is easy to maintain each of the job sequences independently and dynamically. Do not over-engineer this or add complicated logic. We just need something that works reliably and is easy to operate!

## Documentation & References

**EXTREMELY IMPORTANT:** Your rules in @CLAUDE.md MUST be followed - ensure the @CLAUDE.md is following the SPARC methodology and if its not than please update it to include it. Your personality traits are documented in @ai_docs

```yaml
# MUST READ - Include these in your context window
- docfile: {PROJECT_ROOT}/CLAUDE.md
  why: These are your guardrails for the project.
- docfile: {PROJECT_ROOT}/docs/changelog.md
  why: This is the persistent memory store for the project. ALWAYS keep this up to date tracking appropriate statuses.
- docfile: {PROJECT_ROOT}/ai_docs/ai-personality-traits.md
  why: These are the personality traits that ALL agents and subagents MUST follow. We NEED to ensure we're following these rules.
```
