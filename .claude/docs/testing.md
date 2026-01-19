# Testing

Worker tests use Vitest with Cloudflare's test pool:

```bash
pnpm --filter worker run test
```

Test files: `apps/worker/test/*.spec.ts`

## Pattern

```typescript
import {env, SELF} from "cloudflare:test"
import {describe, it, expect} from "vitest"

describe("Feature", () => {
  it("works", async () => {
    const response = await SELF.fetch("https://example.com/endpoint")
    expect(response.status).toBe(200)
  })
})
```
