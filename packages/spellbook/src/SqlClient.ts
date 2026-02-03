import type { SqlStorage } from "@cloudflare/workers-types/experimental"
import { SqliteClient } from "@effect/sql-sqlite-do"
import { String as EffectString } from "effect"

export interface Config {
  readonly db: SqlStorage
}

export const layer = (config: Config) =>
  SqliteClient.layer({
    db: config.db,
    transformQueryNames: EffectString.camelToSnake,
    transformResultNames: EffectString.snakeToCamel,
  })
