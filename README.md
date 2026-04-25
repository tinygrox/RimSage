# RimSage — Game Source MCP Server

[![bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.com/) [![ripgrep](https://img.shields.io/badge/ripgrep-%23000000.svg?style=flat&logo=rust&logoColor=white)](https://github.com/BurntSushi/ripgrep)

RimSage is an MCP server for searching and browsing game source assets plus optional RimWorld-style Def XML. It imports assets into `dist/games/<gameId>` and builds a SQLite index for fast symbol/object lookup.

## Current Capabilities

- Multi-game support via `rimsage.config.local.json` / `rimsage.config.json`
- Active game selected by `RIMSAGE_GAME` (defaults to `rimworld`)
- Source import + symbol indexing for `csharp`, `java`, `c`, and `cpp`
- Structured object indexing through configured importers:
  - `rimworldDefXml` for RimWorld-style `Data/*/Defs` trees (requires `Version.txt`)
  - `kspConfigNode` for Kerbal Space Program `.cfg` ConfigNode files
  - `jsonFiles` for structured objects extracted from arbitrary JSON files
- Stdio and HTTP transports
- Manifest resource at `rimsage://manifest`
- `bun run build` checks config files first, then prompts for missing paths in interactive terminals

## MCP Tools

- `search_content` - Search the active game content with regex
- `read_document` - Read a specific source/data file
- `list_documents` - List files and directories in the active asset root
- `search_objects` - Search structured game objects for the active game
- `get_object_details` - Read a structured game object by exact id
- `search_symbols` - Search indexed code symbols by name, kind, base type, or file path
- `read_symbol` - Read a code symbol from a supported language index

The object and symbol tools only return results when their respective imports/indexes exist. Rebuild the symbol index after upgrading if you want `search_symbols` to filter by `base_type`.

## Game Configuration

RimSage no longer relies on fixed profiles. Instead, each configured game id becomes a dynamic profile with capabilities inferred from your config and existing imported data. Source-only games can set only `source`/`sourcePath`; games with structured data can add explicit `objects` entries. Use `objects: []` to mark a known game as source-only.

## Build Config

You can let `bun run build` prompt for missing paths, or provide them manually in `rimsage.config.local.json`. You can also define multiple game ids:

```json
{
  "games": {
    "sts2": {
      "source": {
        "path": "D:/Games/SlayTheSpire2/Decompiled/Source",
        "languages": ["csharp"]
      },
      "objects": []
    },
    "ksp": {
      "source": {
        "path": "D:/Games/KSP/Decompiled/Source",
        "languages": ["csharp"]
      },
      "objects": [
        {
          "id": "ksp_config",
          "kind": "kspConfigNode",
          "path": "D:/Games/KSP/GameData",
          "importGlob": "**/*.cfg"
        }
      ]
    },
    "cultist-simulator": {
      "displayName": "Cultist Simulator",
      "objects": [
        {
          "id": "content",
          "kind": "jsonFiles",
          "path": "D:/Games/Cultist Simulator/cultistsimulator_Data/StreamingAssets",
          "importGlob": "**/*.json",
          "idFieldName": "id",
          "typeFieldName": "type",
          "displayFieldName": "label"
        }
      ]
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
- Legacy `sourcePath` / `objectsPath` still work. New configs should prefer `source` and `objects`.
- `jsonFiles` supports top-level arrays, arrays grouped under a top-level object, and single objects. Without explicit field names, it tries common fields such as `id`, `name`, `type`, `label`, and `title`.

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

## MCPorter

Use the bundled MCPorter config to treat RimSage as a local stdio MCP server and generate a standalone CLI:

```powershell
npx mcporter list rimsage --config .\config\mcporter.json
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-mcporter-cli.ps1
node .\tools\generated\rimsage-cli.js --help
```

- `config/mcporter.json` points MCPorter at `scripts/start-rimsage-stdio.ps1`
- `RIMSAGE_GAME` selects the default game id before launch
- `RIMSAGE_BUN_PATH` overrides the Bun executable if it is not available on `PATH`

## Storage Layout

Generated data is stored under `dist/games/<gameId>`:

- `assets/Defs` - Imported Def XML (RimWorld-style)
- `assets/Objects/<modelId>` - Imported structured object source files for non-RimWorld importers
- `assets/Source` - Imported source files
- `index.db` - Symbol and object indexes
- `Version.txt` - Copied from RimWorld data roots when present
