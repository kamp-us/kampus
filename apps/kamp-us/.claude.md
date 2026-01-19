# kamp-us

React 19 frontend with Effect-based state management.

## Stack

- **React 19** - UI framework
- **Vite** - Build tool
- **effect-atom** - Reactive state with Effect integration
- **@effect/rpc** - Type-safe RPC client
- **react-router** - Client-side routing
- **CSS Modules** - Scoped styling (`.module.css`)
- **Base UI** - Unstyled component primitives

## Important

Import from `react-router`, not `react-router-dom`:
```typescript
import {Link, useSearchParams, useNavigate} from "react-router"
```

## Design System

Components in `src/design/` follow these patterns:

- `.tsx` file paired with `.module.css`
- Extend **Base UI** primitives (`@base-ui/react/*`)
- Props **omit `className`** to prevent style overrides (intentional)
- State styling via data attributes: `[data-focused]`, `[data-invalid]`
- Tokens in `phoenix.ts` (types) and `phoenix.css` (CSS variables)

### Rules

- Never apply custom styles via `className` or inline
- Add new variants to components, not one-off styles
- Use compound component pattern for complex components

## RPC

Client setup in `src/rpc/client.ts`, atoms in `src/rpc/atoms.ts`.
