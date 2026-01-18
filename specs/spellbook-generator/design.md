# Design: Spellbook Generator CLI

Technical design derived from [requirements.md](./requirements.md).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    @effect/cli Layer                         │
│  Command.make("generate") → Command.make("spellbook")       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   @opentui/react Layer                       │
│  <GeneratorApp /> - TUI for column input & progress         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Generator Services                          │
│  NamingService │ TemplateService │ IntegrationService       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              @effect/platform FileSystem                     │
│  Write files, execute drizzle-kit, update existing files    │
└─────────────────────────────────────────────────────────────┘
```

## Module Structure

```
apps/cli/
├── bin/kampus-effect.tsx           # Entry: add generate command
├── commands/
│   └── generate/
│       ├── generate.ts             # Parent command
│       └── spellbook/
│           ├── spellbook.ts        # Command definition
│           ├── App.tsx             # TUI root component
│           ├── components/
│           │   ├── ColumnInput.tsx # Column name/type/nullable form
│           │   ├── ColumnList.tsx  # Summary display
│           │   ├── Progress.tsx    # File generation progress
│           │   └── Summary.tsx     # Final success/error
│           └── hooks/
│               └── useGenerator.ts # Effect-backed generator logic
├── generators/
│   └── spellbook/
│       ├── naming.ts               # Naming convention utils
│       ├── templates/
│       │   ├── package.ts          # Package layer templates
│       │   ├── worker.ts           # Worker layer templates
│       │   ├── test.ts             # Test file template
│       │   └── graphql.ts          # GraphQL scaffolds
│       └── integrations.ts         # index.ts/wrangler updates
└── services/
    └── SpellbookGenerator.ts       # Effect Service for file ops
```

## Command Definition

```typescript
// commands/generate/generate.ts
import {Command} from "@effect/cli";
import {Console} from "effect";
import {spellbook} from "./spellbook/spellbook";

export const generate = Command.make("generate", {}, () =>
  Console.log("Usage: kampus generate spellbook <feature-name>")
).pipe(
  Command.withSubcommands([spellbook]),
  Command.withDescription("Generate code scaffolds")
);
```

```typescript
// commands/generate/spellbook/spellbook.ts
import {Args, Command, Options} from "@effect/cli";
import {Effect} from "effect";
import {renderApp} from "./App";

export const spellbook = Command.make(
  "spellbook",
  {
    featureName: Args.text({name: "feature-name"}),
    table: Options.text("table").pipe(Options.optional),
    idPrefix: Options.text("id-prefix").pipe(Options.optional),
    skipWrangler: Options.boolean("skip-wrangler").pipe(Options.withDefault(false)),
    skipIndex: Options.boolean("skip-index").pipe(Options.withDefault(false)),
    skipDrizzle: Options.boolean("skip-drizzle").pipe(Options.withDefault(false)),
    withTest: Options.boolean("with-test").pipe(Options.withDefault(false)),
    withGraphql: Options.boolean("with-graphql").pipe(Options.withDefault(false)),
    withRoute: Options.boolean("with-route").pipe(Options.withDefault(false)),
    withAll: Options.boolean("with-all").pipe(Options.withDefault(false)),
    dryRun: Options.boolean("dry-run").pipe(Options.withDefault(false)),
  },
  (args) => renderApp(args)
).pipe(Command.withDescription("Generate a new Spellbook feature"));
```

## TUI Components

### App.tsx (Root)

```typescript
import {createCliRenderer} from "@opentui/core";
import {createRoot} from "@opentui/react";
import {Effect} from "effect";

export const renderApp = (args: SpellbookArgs) =>
  Effect.gen(function* () {
    const renderer = yield* Effect.promise(() => createCliRenderer());
    const root = createRoot(renderer);

    // Render returns a promise that resolves when generator completes
    return yield* Effect.async<void, Error>((resume) => {
      root.render(
        <GeneratorApp
          args={args}
          onComplete={() => resume(Effect.succeed(void 0))}
          onError={(err) => resume(Effect.fail(err))}
        />
      );
    });
  });
```

### GeneratorApp State Machine

```typescript
type State =
  | {phase: "input"; columns: Column[]; currentColumn: Partial<Column>}
  | {phase: "confirm"; columns: Column[]}
  | {phase: "generating"; columns: Column[]; progress: string[]}
  | {phase: "success"; files: string[]}
  | {phase: "error"; message: string};

const GeneratorApp = ({args, onComplete, onError}) => {
  const [state, setState] = useState<State>({
    phase: "input",
    columns: [],
    currentColumn: {},
  });

  // ... state transitions
};
```

### ColumnInput Component

Note: @opentui/react provides `<box>`, `<text>`, `<input>`. For type selection and
nullable toggle, we use keyboard navigation with visual feedback (no native select/checkbox).

```tsx
const COLUMN_TYPES = ["text", "integer", "boolean", "timestamp"] as const;
type ColumnType = typeof COLUMN_TYPES[number];

const ColumnInput = ({onAdd, onFinish}: {
  onAdd: (col: Column) => void;
  onFinish: () => void;
}) => {
  const [name, setName] = useState("");
  const [typeIndex, setTypeIndex] = useState(0);
  const [nullable, setNullable] = useState(false);
  const [field, setField] = useState<"name" | "type" | "nullable">("name");

  useKeyboard((key) => {
    // Empty name + Enter = finish adding columns
    if (key.name === "return" && field === "name" && name === "") {
      onFinish();
      return;
    }

    // Tab cycles through fields
    if (key.name === "tab") {
      setField((f) => f === "name" ? "type" : f === "type" ? "nullable" : "name");
      return;
    }

    // Type selection: left/right arrows cycle options
    if (field === "type") {
      if (key.name === "left") {
        setTypeIndex((i) => (i - 1 + COLUMN_TYPES.length) % COLUMN_TYPES.length);
      } else if (key.name === "right") {
        setTypeIndex((i) => (i + 1) % COLUMN_TYPES.length);
      }
    }

    // Nullable toggle: space or left/right
    if (field === "nullable") {
      if (key.name === "space" || key.name === "left" || key.name === "right") {
        setNullable((n) => !n);
      }
    }

    // Enter on nullable = submit column
    if (key.name === "return" && field === "nullable" && name !== "") {
      onAdd({name, type: COLUMN_TYPES[typeIndex], nullable});
      setName("");
      setTypeIndex(0);
      setNullable(false);
      setField("name");
    }
  });

  return (
    <box flexDirection="column">
      <box title="Column Name" style={{border: true, width: 40, height: 3}}>
        <input
          value={name}
          onInput={setName}
          focused={field === "name"}
          placeholder="Enter column name (empty to finish)"
        />
      </box>

      {/* Type selector: visual buttons, arrow keys to navigate */}
      <box style={{marginTop: 1, flexDirection: "row"}}>
        <text style={{marginRight: 1}}>Type:</text>
        {COLUMN_TYPES.map((t, i) => (
          <text
            key={t}
            style={{
              marginRight: 1,
              bg: i === typeIndex ? (field === "type" ? "#4a90d9" : "#555") : undefined,
              fg: i === typeIndex ? "#fff" : "#888",
            }}
          >
            [{t}]
          </text>
        ))}
        {field === "type" && <text style={{fg: "#666"}}> ←/→ to change</text>}
      </box>

      {/* Nullable toggle */}
      <box style={{marginTop: 1, flexDirection: "row"}}>
        <text style={{marginRight: 1}}>Nullable:</text>
        <text style={{
          bg: field === "nullable" ? "#4a90d9" : undefined,
          fg: nullable ? "#0f0" : "#f00",
        }}>
          [{nullable ? "YES" : "NO"}]
        </text>
        {field === "nullable" && <text style={{fg: "#666"}}> space to toggle, enter to add</text>}
      </box>
    </box>
  );
};
```

## Shared Types

```typescript
// generators/spellbook/types.ts
export type ColumnType = "text" | "integer" | "boolean" | "timestamp";

export interface Column {
  name: string;
  type: ColumnType;
  nullable: boolean;
}

export interface Naming {
  featureName: string;    // book-shelf (original kebab-case)
  className: string;      // BookShelf (PascalCase)
  tableName: string;      // book_shelf (snake_case)
  bindingName: string;    // BOOK_SHELF (SCREAMING_SNAKE)
  idPrefix: string;       // bks_ (3-4 char)
  packageName: string;    // @kampus/book-shelf
}

export interface GeneratorOptions {
  featureName: string;
  table?: string;
  idPrefix?: string;
  skipWrangler: boolean;
  skipIndex: boolean;
  skipDrizzle: boolean;
  withTest: boolean;
  withGraphql: boolean;
  withRoute: boolean;
  withAll: boolean;
  dryRun: boolean;
}
```

## Feature Validation

```typescript
// generators/spellbook/validation.ts
import {FileSystem} from "@effect/platform";
import {Effect} from "effect";

export class FeatureExistsError extends Data.TaggedError("FeatureExistsError")<{
  featureName: string;
  existingPath: string;
}> {}

export class InvalidFeatureNameError extends Data.TaggedError("InvalidFeatureNameError")<{
  featureName: string;
  reason: string;
}> {}

const KEBAB_CASE_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const validateFeatureName = (name: string) =>
  Effect.gen(function* () {
    if (!KEBAB_CASE_REGEX.test(name)) {
      return yield* Effect.fail(new InvalidFeatureNameError({
        featureName: name,
        reason: "Must be kebab-case (e.g., 'book-shelf', 'user-profile')",
      }));
    }
    return name;
  });

export const checkFeatureExists = (featureName: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const packagePath = `packages/${featureName}`;
    const workerPath = `apps/worker/src/features/${featureName}`;

    const packageExists = yield* fs.exists(packagePath);
    if (packageExists) {
      return yield* Effect.fail(new FeatureExistsError({
        featureName,
        existingPath: packagePath,
      }));
    }

    const workerExists = yield* fs.exists(workerPath);
    if (workerExists) {
      return yield* Effect.fail(new FeatureExistsError({
        featureName,
        existingPath: workerPath,
      }));
    }

    return true;
  });
```

## Naming Service

```typescript
// generators/spellbook/naming.ts
export interface Naming {
  featureName: string;    // book-shelf (original kebab-case)
  className: string;      // BookShelf (PascalCase)
  tableName: string;      // book_shelf (snake_case)
  bindingName: string;    // BOOK_SHELF (SCREAMING_SNAKE)
  idPrefix: string;       // bks_ (3-4 char)
  packageName: string;    // @kampus/book-shelf
}

export const deriveNaming = (
  featureName: string,
  tableOverride?: string,
  idPrefixOverride?: string
): Naming => {
  const className = featureName
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");

  const tableName = tableOverride ?? featureName.replace(/-/g, "_");

  const bindingName = tableName.toUpperCase();

  const idPrefix = idPrefixOverride ??
    featureName
      .split("-")
      .map((s) => s.charAt(0))
      .join("")
      .slice(0, 4);

  return {
    featureName,
    className,
    tableName,
    bindingName,
    idPrefix,
    packageName: `@kampus/${featureName}`,
  };
};
```

## Template Functions

### Package Layer

```typescript
// generators/spellbook/templates/package.ts
export const packageJson = (naming: Naming) => `{
  "name": "${naming.packageName}",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "dependencies": {
    "@effect/rpc": "catalog:",
    "effect": "catalog:"
  }
}`;

export const rpcTs = (naming: Naming, columns: Column[]) => `import {Rpc, RpcGroup} from "@effect/rpc";
import {Schema} from "effect";
import {${naming.className}} from "./schema.js";

export const ${naming.className}Rpcs = RpcGroup.make(
  Rpc.make("get${naming.className}", {
    payload: {id: Schema.String},
    success: Schema.NullOr(${naming.className}),
  }),

  Rpc.make("list${naming.className}s", {
    payload: Schema.Void,
    success: Schema.Array(${naming.className}),
  }),
);

export type ${naming.className}Rpcs = typeof ${naming.className}Rpcs;
`;

export const schemaTs = (naming: Naming, columns: Column[]) => {
  const fields = columns.map((col) => {
    const schemaType = columnTypeToSchema(col.type, col.nullable);
    return `  ${col.name}: ${schemaType},`;
  }).join("\n");

  return `import {Schema} from "effect";

export const ${naming.className} = Schema.Struct({
  id: Schema.String,
${fields}
  createdAt: Schema.String,
  updatedAt: Schema.NullOr(Schema.String),
});

export type ${naming.className} = typeof ${naming.className}.Type;
`;
};
```

### Worker Layer

```typescript
// generators/spellbook/templates/worker.ts
export const doClass = (naming: Naming) => `import {${naming.className}Rpcs} from "${naming.packageName}";
import * as Spellbook from "../../shared/Spellbook";
import * as schema from "./drizzle/drizzle.schema";
import migrations from "./drizzle/migrations/migrations";
import * as handlers from "./handlers";

export const ${naming.className} = Spellbook.make({
  rpcs: ${naming.className}Rpcs,
  handlers,
  migrations,
  schema,
});
`;

export const handlersTs = (naming: Naming) => `import {SqliteDrizzle} from "@effect/sql-drizzle/Sqlite";
import {eq} from "drizzle-orm";
import {Effect} from "effect";
import * as schema from "./drizzle/drizzle.schema";

export const get${naming.className} = ({id}: {id: string}) =>
  Effect.gen(function* () {
    const db = yield* SqliteDrizzle;
    const [row] = yield* db.select().from(schema.${naming.tableName}).where(eq(schema.${naming.tableName}.id, id));
    if (!row) return null;
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  });

export const list${naming.className}s = () =>
  Effect.gen(function* () {
    const db = yield* SqliteDrizzle;
    const rows = yield* db.select().from(schema.${naming.tableName});
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt?.toISOString() ?? null,
    }));
  });
`;

export const drizzleSchema = (naming: Naming, columns: Column[]) => {
  const columnDefs = columns.map((col) => {
    const drizzleType = columnTypeToDrizzle(col.type, col.nullable);
    return `    ${col.name}: ${drizzleType},`;
  }).join("\n");

  return `import {id} from "@usirin/forge";
import {index, integer, sqliteTable, text} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, {mode: "timestamp"});

export const ${naming.tableName} = sqliteTable(
  "${naming.tableName}",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => id("${naming.idPrefix}")),
${columnDefs}
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("idx_${naming.tableName}_created_at").on(table.createdAt),
  ],
);
`;
};
```

## Integration Logic

```typescript
// generators/spellbook/integrations.ts
import {FileSystem} from "@effect/platform";
import {Effect} from "effect";

export const updateWorkerIndex = (naming: Naming) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const indexPath = "apps/worker/src/index.ts";
    const content = yield* fs.readFileString(indexPath);

    // Find last feature export line
    const exportLine = `export {${naming.className}} from "./features/${naming.featureName}/${naming.className}";`;

    // Insert after last export {X} from "./features/..."
    const lines = content.split("\n");
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('from "./features/')) {
        insertIndex = i + 1;
      }
    }

    lines.splice(insertIndex, 0, exportLine);
    yield* fs.writeFileString(indexPath, lines.join("\n"));
  });

export const updateWranglerJsonc = (naming: Naming) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = "apps/worker/wrangler.jsonc";
    const content = yield* fs.readFileString(path);

    // Use jsonc-parser (VS Code's parser) - preserves comments via edit operations
    // npm: jsonc-parser
    const {parse, modify, applyEdits} = yield* Effect.promise(() => import("jsonc-parser"));

    const config = parse(content);

    // Calculate next migration tag
    const lastTag = config.migrations?.[config.migrations.length - 1]?.tag ?? "v0";
    const nextTag = `v${parseInt(lastTag.slice(1)) + 1}`;

    // Apply edits - jsonc-parser returns text edits that preserve comments
    let edits = modify(
      content,
      ["durable_objects", "bindings", -1], // -1 = append to array
      {name: naming.bindingName, class_name: naming.className},
      {formattingOptions: {tabSize: 1, insertSpaces: false}}
    );

    let updated = applyEdits(content, edits);

    edits = modify(
      updated,
      ["migrations", -1], // append to migrations array
      {tag: nextTag, new_sqlite_classes: [naming.className]},
      {formattingOptions: {tabSize: 1, insertSpaces: false}}
    );

    updated = applyEdits(updated, edits);

    yield* fs.writeFileString(path, updated);
  });
```

## Drizzle-Kit Execution

```typescript
export const runDrizzleKit = (naming: Naming) =>
  Effect.gen(function* () {
    const command = yield* Command.make(
      "pnpm",
      "exec",
      "drizzle-kit",
      "generate",
      "--config",
      `apps/worker/src/features/${naming.featureName}/drizzle/drizzle.config.ts`
    );

    const process = yield* command.start();
    const output = yield* process.stdout.pipe(
      Stream.decodeText(),
      Stream.runCollect,
      Effect.map(Chunk.join(""))
    );

    return output;
  });
```

## Data Flow

```
1. User runs: kampus generate spellbook book-shelf

2. @effect/cli parses args → SpellbookArgs

3. renderApp(args) creates TUI:
   - Phase: input → user enters columns via ColumnInput
   - Phase: confirm → user reviews ColumnList, presses Enter
   - Phase: generating → Progress shows file creation
   - Phase: success → Summary shows created files

4. Generator executes:
   a. deriveNaming("book-shelf") → Naming object
   b. For each template file:
      - Generate content from template function
      - Write to disk via FileSystem
   c. updateWorkerIndex() → insert export
   d. updateWranglerJsonc() → add binding + migration
   e. runDrizzleKit() → generate SQL migrations

5. TUI shows success, process exits
```

## Error Handling

| Error | Handling |
|-------|----------|
| Feature exists | Check before generation, show error in TUI |
| Invalid feature name | Validate kebab-case, show error |
| File write failure | Catch in Effect, display in TUI |
| Drizzle-kit failure | Show output in TUI, allow retry |
| JSONC parse error | Fallback to manual instructions |

## Testing Strategy

1. **Unit tests**: Naming utils, template functions (pure)
2. **Integration tests**: Full generator run with temp directory
3. **Manual testing**: `kampus generate spellbook test-feature --dry-run`
