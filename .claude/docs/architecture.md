# Architecture

## Monorepo Structure

```
apps/
├── kamp-us/   # React frontend (Cloudflare Worker)
├── worker/    # Backend API (Cloudflare Worker + Durable Objects)
└── cli/       # Effect-based CLI application
```

## Request Flow

```
Browser → kamp-us Worker → Backend Worker (service binding)
           ├─ /rpc/*      → Effect RPC (Durable Objects)
           ├─ /api/auth/* → Better Auth
           └─ static      → Vite assets
```

## Core Principles

- **Effect.ts** for all async/error handling
- **Effect Schema** for data structures
- **Base UI** for interactive components
- **Drizzle + SQLite** for DO persistence
