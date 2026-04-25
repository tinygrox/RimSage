# RimSage — 游戏源码 MCP 服务器

[![bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.com/) [![ripgrep](https://img.shields.io/badge/ripgrep-%23000000.svg?style=flat&logo=rust&logoColor=white)](https://github.com/BurntSushi/ripgrep)

RimSage 是一个用于搜索和浏览游戏源码资源的 MCP 服务器，并支持可选的 RimWorld 风格 Def XML。它会把资源导入到 `dist/games/<gameId>`，并构建 SQLite 索引以支持快速的符号/对象查询。

## 当前能力

- 通过 `rimsage.config.local.json` / `rimsage.config.json` 支持多游戏配置
- 活动游戏由 `RIMSAGE_GAME` 指定（默认 `rimworld`）
- `csharp` / `java` / `c` / `cpp` 源码导入与符号索引
- 通过配置化导入器索引结构化对象：
  - `rimworldDefXml`：RimWorld 风格 `Data/*/Defs` 目录（要求存在 `Version.txt`）
  - `kspConfigNode`：Kerbal Space Program `.cfg` ConfigNode 文件
  - `jsonFiles`：从任意 JSON 文件中抽取结构化对象
- 支持 stdio 与 HTTP 两种传输方式
- 提供 `rimsage://manifest` 资源
- `bun run build` 会先检查配置文件，交互式终端下可提示输入缺失路径

## MCP 工具

- `search_content` - 用正则搜索活动游戏内容
- `read_document` - 读取指定源码/数据文件
- `list_documents` - 列出活动资源根目录下的文件/目录
- `search_objects` - 搜索活动游戏的结构化对象
- `get_object_details` - 按精确 id 读取结构化对象
- `search_symbols` - 按名称、类型、基类/接口或文件路径搜索源码符号
- `read_symbol` - 从源码索引读取符号

对象与符号相关工具仅在完成相应导入/索引后才会返回结果。升级后如果要用 `search_symbols` 的 `base_type` 过滤，需要重新构建符号索引。

## 游戏配置

RimSage 不再依赖固定 profile。每个配置的 `gameId` 会成为一个动态 profile，其能力根据配置和已导入数据推断。只有源码的游戏可以只设置 `source` / `sourcePath`；有结构化数据的游戏可以显式添加 `objects`。如果某个已知游戏只想当源码项目使用，可以设置 `objects: []` 禁用对象导入提示。

## 构建配置

你可以让 `bun run build` 提示缺失路径，也可以在 `rimsage.config.local.json` 手动填写。示例：

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

- MCP 调用可传 `game` 来选择配置的 `gameId`；否则使用 `RIMSAGE_GAME` 指定的 id
- `bun run build --config <path>` 可指定非默认配置文件
- 旧的 `sourcePath` / `objectsPath` 仍然可用；新配置建议优先使用 `source` 和 `objects`
- `jsonFiles` 支持顶层数组、顶层对象中的数组分组、单个对象；未配置字段名时会尝试 `id/name/type/label/title` 等常见字段

## 工作流

1. 安装依赖

```sh
bun install
```

2. 选择 game id

```sh
RIMSAGE_GAME=rimworld bun run start
RIMSAGE_GAME=sts2 bun run start
```

3. 构建活动游戏

```sh
bun run build
```

4. 需要时运行单独命令

```sh
bun run import:objects /path/to/game/data
bun run import:symbols /path/to/source/root
bun run index:objects
bun run index:symbols
```

### 示例：仅源码的 Java / C / C++ / C# 游戏

```sh
RIMSAGE_GAME=generic-source bun run build
RIMSAGE_GAME=generic-source bun run start
```

如果没有配置文件，`bun run build` 会提示缺失路径并写入 `rimsage.config.local.json`。

## 传输方式

- `bun run start` - stdio（默认）
- `bun run start:http` - HTTP（`/mcp`、`/health`）

## MCPorter

项目内已经附带一份 MCPorter 配置，可以把 RimSage 当成本地 stdio MCP 来列工具或生成独立 CLI：

```powershell
npx mcporter list rimsage --config .\config\mcporter.json
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-mcporter-cli.ps1
node .\tools\generated\rimsage-cli.js --help
```

- `config/mcporter.json` 会通过 `scripts/start-rimsage-stdio.ps1` 启动 RimSage
- `RIMSAGE_GAME` 用来指定默认 game id
- 如果 `bun` 不在 `PATH` 里，可以设置 `RIMSAGE_BUN_PATH`

## 存储结构

生成数据位于 `dist/games/<gameId>`：

- `assets/Defs` - 导入的 Def XML（RimWorld 风格）
- `assets/Objects/<modelId>` - 非 RimWorld 导入器导入的结构化对象源文件
- `assets/Source` - 导入的源码文件
- `index.db` - 符号与对象索引
- `Version.txt` - 当存在 RimWorld 数据路径时复制
