# Spec-Driven Development

Every feature is specified before implementation.

**CRITICAL: NEVER IMPLEMENT WITHOUT FOLLOWING THE COMPLETE SPEC FLOW**

## Authorization Protocol

Before proceeding to any phase (2-5):
1. Present completed work from current phase
2. Explicitly ask for user authorization
3. Wait for clear approval
4. NEVER assume permission

## Phases

| Phase | Deliverable | Gate |
|-------|-------------|------|
| 1 | `instructions.md` - requirements, stories, acceptance criteria | — |
| 2 | `requirements.md` - functional/non-functional requirements | **APPROVAL** |
| 3 | `design.md` - architecture, Effect patterns | **APPROVAL** |
| 4 | `plan.md` - implementation roadmap | **APPROVAL** |
| 5 | `prd.json` - task list with status tracking | **APPROVAL** |

## Structure

```
specs/
├── README.md                    # Checkbox list of features
└── [feature-name]/
    ├── instructions.md
    ├── requirements.md
    ├── design.md
    ├── plan.md
    └── prd.json
```

## Best Practices

- One feature per spec folder
- Cross-reference between files
- Update plan.md during implementation
- Consider Effect patterns in design phase
