# RimSage — Game Source MCP Server

[![bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.com/) [![ripgrep](https://img.shields.io/badge/ripgrep-%23000000.svg?style=flat&logo=rust&logoColor=white)](https://github.com/BurntSushi/ripgrep)

RimSage is an MCP server for searching and browsing game source assets. It now exposes a profile-based core so the server can grow beyond RimWorld while keeping RimWorld compatibility.

## Current Status

- Active built-in profile: `rimworld`
- New generic tools: `search_content`, `read_document`, `list_documents`, `search_objects`, `get_object_details`, `read_symbol`
- Legacy RimWorld tools remain available for backward compatibility
- Import/index scripts now dispatch through a game adapter registry
- Non-RimWorld games are expected to store generated data under `dist/games/<gameId>`

## Available Tools

### Generic tools

- `search_content` - Search the active game content with regex
- `read_document` - Read a specific source/data file
- `list_documents` - List files and directories in the active asset root
- `search_objects` - Search structured game objects for the active profile
- `get_object_details` - Read a structured game object by exact id
- `read_symbol` - Read a code symbol from a supported language index

### Legacy RimWorld aliases

- `search_source` - Alias of `search_content`
- `read_file` - Alias of `read_document`
- `list_directory` - Alias of `list_documents`
- `search_defs` - Alias of `search_objects` with `model=def`
- `get_def_details` - Alias of `get_object_details` with `model=def`
- `read_csharp_symbol` - Alias of `read_symbol` with `language=csharp`

## Quick Start

The easiest way to use RimSage is through the online service:

```
https://mcp.rimsage.com/mcp
```

You can find the integration methods for different Agent clients in the [wiki](https://github.com/realloon/RimSage/wiki).
 
Most clients support `mcp.json` configuration:

```json
{
  "mcpServers": {
    "rimsage": {
      "url": "https://mcp.rimsage.com/mcp"
    }
  }
}
```

## Self-Hosted

RimSage supports stdio transport for local deployment.

1. Clone the repository

```sh
git clone https://github.com/realloon/RimSage.git
```

2. Install dependencies

```sh
bun install
```

3. Import and build the active game profile

```sh
bun run import:objects /path/to/game/data
bun run import:symbols /path/to/decompiled/or/source/root
bun run build
```

For RimWorld, these commands map to Def XML import plus decompiled C# indexing. You'll need local RimWorld files and a decompiled C# project, which is allowed under the [RimWorld EULA](https://rimworldgame.com/eula).

4. Add this MCP server

Most Agent clients support `mcp.json` configuration:

```json
{
  "mcpServers": {
    "rimsage": {
      "command": "bun",
      "args": ["run", "/path/to/this/repo"]
    }
  }
}
```

### Profile selection

By default the server loads the `rimworld` profile.

```sh
RIMSAGE_GAME=rimworld bun run start
```

## Development

```sh
bun run start # stdio
bun run start:http # Streamable HTTP
bun run clean
bun run index:objects
bun run index:symbols
```
