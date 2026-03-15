# RimSage — Game Source MCP Server

[![bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.com/) [![ripgrep](https://img.shields.io/badge/ripgrep-%23000000.svg?style=flat&logo=rust&logoColor=white)](https://github.com/BurntSushi/ripgrep)

RimSage is an MCP server for searching and browsing game source assets plus optional RimWorld-style Def XML. It imports assets into `dist/games/<gameId>` and builds a SQLite index for fast symbol/object lookup.

## Current Capabilities

- Multi-game support via `rimsage.config.local.json` / `rimsage.config.json`
- Active game selected by `RIMSAGE_GAME` (defaults to `rimworld`)
- Source import + symbol indexing for `csharp`, `java`, `c`, and `cpp`
- Def XML import + object indexing for RimWorld-style `Data/*/Defs` trees (requires `Version.txt`)
- Stdio and HTTP transports
- Manifest resource at `rimsage://manifest`
- `bun run build` checks config files first, then prompts for missing paths in interactive terminals

## MCP Tools

- `search_content` - Search the active game content with regex
- `read_document` - Read a specific source/data file
- `list_documents` - List files and directories in the active asset root
- `search_objects` - Search structured game objects for the active game
- `get_object_details` - Read a structured game object by exact id
- `read_symbol` - Read a code symbol from a supported language index

The object and symbol tools only return results when their respective imports/indexes exist.

## Game Configuration

RimSage no longer relies on fixed profiles. Instead, each configured game id becomes a dynamic profile with capabilities inferred from your inputs and existing data. If a game only has a source path, object import/indexing is skipped. If it has a RimWorld-style data path, Def XML indexing is enabled.

## Build Config

You can let `bun run build` prompt for missing paths, or provide them manually in `rimsage.config.local.json`. You can also define multiple game ids:

```json
{
  "games": {
    "sts2": {
      "sourcePath": "D:/Games/SlayTheSpire2/Decompiled/Source"
    },
    "rimworld": {
      "objectsPath": "D:/Games/RimWorld",
      "sourcePath": "D:/RimWorldDecompiled"
    }
  }
}
```

- MCP tool calls can pass `game` to select a configured game id; otherwise the active `RIMSAGE_GAME` id is used.
- `bun run build --config <path>` can target a non-default config file.

## Workflow

1. Install dependencies

```sh
bun install
```

2. Select a game id(powershell)

```powershell
$env:RIMSAGE_GAME="rimworld" bun run start
$env:RIMSAGE_GAME="sts2" bun run start
```

3. Build the active game

```sh
bun run build
```

4. Run focused commands if needed

```sh
bun run import:objects /path/to/game/data
bun run import:symbols /path/to/source/root
bun run index:objects
bun run index:symbols
```

### Example: source-only Java / C / C++ / C# game

```sh
RIMSAGE_GAME=generic-source bun run build
RIMSAGE_GAME=generic-source bun run start
```

If no config file exists, `bun run build` prompts for missing paths and saves them to `rimsage.config.local.json`.

## Server Transports

- `bun run start` - MCP over stdio (default)
- `bun run start:http` - MCP over HTTP (`/mcp`, `/health`)

## Storage Layout

Generated data is stored under `dist/games/<gameId>`:

- `assets/Defs` - Imported Def XML (RimWorld-style)
- `assets/Source` - Imported source files
- `index.db` - Symbol and object indexes
- `Version.txt` - Copied from RimWorld data roots when present
