import { Context } from "effect"
import type { DurableObjectState } from "@cloudflare/workers-types/experimental"

export class DurableObjectCtx extends Context.Tag(
  "@kampus/spellbook/DurableObjectCtx"
)<DurableObjectCtx, DurableObjectState>() {}
