# eBay Platform - Modular Version

**Created**: 2025-11-19
**Based on**: ebay-price-reducer
**Status**: Initial Setup

## About This Repository

This is a modular refactor of the eBay Price Reducer application. The goal is to create a flexible, node-based architecture that combines:

- The security and infrastructure of the original app
- The modularity and workflow flexibility of n8n
- A visual workflow builder for users

## Current Status

**Phase**: Repository Setup
- ✅ Codebase copied from ebay-price-reducer
- ✅ Git repository initialized
- ⏳ Next: Build modular architecture

## Original App (ebay-price-reducer)

This codebase started as a serverless eBay price reduction tool with:
- Netlify Functions backend
- React + Vite frontend
- Supabase PostgreSQL database
- eBay OAuth integration with PKCE
- Automated price reduction scheduling

## Modular Vision

Transform into a platform where users can:
- Build custom workflows visually
- Use pre-built node modules (eBay, Keepa, Sheets, AI, etc.)
- Create complex automation without coding
- Share and reuse workflow templates

## Architecture Plan

See `MODULAR-ARCHITECTURE-PROPOSAL.md` for the full technical design.

### Key Components (Planned):
```
/modules/
├── core/
│   ├── workflow-engine/    # Execute node graphs
│   ├── node-registry/      # Available operations
│   └── auth/              # OAuth & credentials
├── nodes/
│   ├── ebay/              # eBay API operations
│   ├── keepa/             # Product research
│   ├── sheets/            # Google Sheets
│   ├── ai/                # AI operations
│   └── database/          # Database operations
└── frontend/
    └── WorkflowBuilder/   # Visual editor
```

## Development

This is a work-in-progress. Development will be done incrementally with frequent commits.

### Getting Started

*Instructions will be added as we build the modular features*

```bash
# Install dependencies (original app)
cd frontend && npm install
cd ../netlify/functions && npm install

# Run development server (original app still works)
netlify dev
```

## Relationship to Original

- **Original repo**: `~/Projects/ebay-price-reducer` (still maintained)
- **This repo**: `~/Projects/ebay-platform-modular` (new modular version)
- Both repos will coexist during development
- Migration strategy TBD (gradual rollout recommended)

## Documentation

- `MODULAR-ARCHITECTURE-PROPOSAL.md` - Full architecture design
- `ARCHITECTURE.md` - Original app architecture
- `CLAUDE.md` - Development guidelines

## Next Steps

1. Design module structure
2. Extract first node module from existing functions
3. Build basic workflow engine
4. Create simple workflow builder UI

---

**Note**: This is an experimental refactor. The original app in `ebay-price-reducer` continues to work as-is.
