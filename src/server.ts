import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getActiveGameProfile, listGameProfiles } from './games'
import {
  searchContent,
  readDocument,
  listDocuments,
  getObjectDetails,
  searchObjects,
  readSymbol,
  searchSymbols,
} from './tools'

const name = 'rimsage'
const version = '0.11.0'
const activeProfile = getActiveGameProfile()
const supportedGames = listGameProfiles()
const supportedGameIds = supportedGames.map(profile => profile.id)
const supportedGameList = supportedGameIds.join(', ') || 'none'

function registerToolsAndResources(server: McpServer) {
  server.registerTool(
    'search_content',
    {
      description: 'Search game content using regex.',
      inputSchema: {
        game: z
          .string()
          .optional()
          .describe(
            `Optional game id. Defaults to active game '${activeProfile.id}'. Supported: ${supportedGameList}.`,
          ),
        query: z.string().describe('Regex pattern.'),
        file_pattern: z
          .string()
          .optional()
          .describe('Optional glob filter for the active source/content tree.'),
        case_sensitive: z
          .boolean()
          .default(false)
          .describe('Enforce exact case matching.'),
      },
    },
    async ({ game, query, file_pattern, case_sensitive }) =>
      searchContent(query, case_sensitive, file_pattern, game),
  )

  server.registerTool(
    'read_document',
    {
      description: 'Read a document from the selected game asset set.',
      inputSchema: {
        game: z
          .string()
          .optional()
          .describe(
            `Optional game id. Defaults to active game '${activeProfile.id}'. Supported: ${supportedGameList}.`,
          ),
        relative_path: z.string().describe('Relative path inside the game asset root.'),
        start_line: z
          .number()
          .int()
          .min(0)
          .max(2_000_000)
          .optional()
          .default(0)
          .describe('0-indexed start line.'),
        line_count: z
          .number()
          .int()
          .min(1)
          .max(2_000)
          .optional()
          .default(400)
          .describe('Max lines to return.'),
      },
    },
    async ({ game, relative_path, start_line, line_count }) =>
      readDocument(relative_path, start_line, line_count, game),
  )

  server.registerTool(
    'list_documents',
    {
      description: 'List directories or files from the selected game asset root.',
      inputSchema: {
        game: z
          .string()
          .optional()
          .describe(
            `Optional game id. Defaults to active game '${activeProfile.id}'. Supported: ${supportedGameList}.`,
          ),
        relative_path: z
          .string()
          .default('')
          .describe('Path relative to the game asset root. Empty for root.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .describe('Max items to return.'),
      },
    },
    async ({ game, relative_path, limit }) =>
      listDocuments(relative_path, limit, game),
  )

  server.registerTool(
    'search_objects',
    {
      description: 'Search structured game objects if object data is available.',
      inputSchema: {
        game: z
          .string()
          .optional()
          .describe(
            `Optional game id. Defaults to active game '${activeProfile.id}'. Supported: ${supportedGameList}.`,
          ),
        model: z
          .string()
          .optional()
          .describe(
            `Object model id for the selected game. Active game offers: ${activeProfile.objectModels.map(model => model.id).join(', ') || 'none'}.`,
          ),
        query: z.string().describe('Case-insensitive keyword.'),
        object_type: z
          .string()
          .optional()
          .describe('Optional type/category filter for the selected object model.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe('Max results to return.'),
      },
    },
    async ({ game, model, query, object_type, limit }) =>
      searchObjects(query, model, object_type, limit, game),
  )

  server.registerTool(
    'get_object_details',
    {
      description: 'Read a structured object if object data is available.',
      inputSchema: {
        game: z
          .string()
          .optional()
          .describe(
            `Optional game id. Defaults to active game '${activeProfile.id}'. Supported: ${supportedGameList}.`,
          ),
        model: z
          .string()
          .optional()
          .describe(
            `Object model id for the selected game. Active game offers: ${activeProfile.objectModels.map(model => model.id).join(', ') || 'none'}.`,
          ),
        object_id: z.string().describe('Exact object identifier.'),
        object_type: z
          .string()
          .optional()
          .describe('Optional type/category filter for the selected object model.'),
        inheritance: z
          .enum(['merged', 'raw'])
          .default('merged')
          .describe('Return resolved/merged content or the raw indexed content.'),
      },
    },
    async ({ game, model, object_id, object_type, inheritance }) =>
      getObjectDetails(object_id, model, object_type, inheritance, game),
  )

  server.registerTool(
    'search_symbols',
    {
      description: 'Search indexed code symbols by name, kind, base type, or file path.',
      inputSchema: {
        game: z
          .string()
          .optional()
          .describe(
            `Optional game id. Defaults to active game '${activeProfile.id}'. Supported: ${supportedGameList}.`,
          ),
        query: z.string().describe('Case-insensitive symbol name keyword.'),
        language: z
          .string()
          .optional()
          .describe(
            `Optional language filter. Active game offers: ${activeProfile.symbolLanguages.join(', ') || 'none'}.`,
          ),
        symbol_kind: z
          .string()
          .optional()
          .describe('Optional symbol kind filter, e.g. class, struct, interface, enum, record, function.'),
        base_type: z
          .string()
          .optional()
          .describe('Optional base class or interface keyword, available after rebuilding the symbol index.'),
        file_pattern: z
          .string()
          .optional()
          .describe('Optional file path keyword filter inside the imported source tree.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe('Max results to return.'),
      },
    },
    async ({ game, query, language, symbol_kind, base_type, file_pattern, limit }) =>
      searchSymbols(query, language, symbol_kind, base_type, file_pattern, limit, game),
  )

  server.registerTool(
    'read_symbol',
    {
      description: 'Read a code symbol from the available source index.',
      inputSchema: {
        game: z
          .string()
          .optional()
          .describe(
            `Optional game id. Defaults to active game '${activeProfile.id}'. Supported: ${supportedGameList}.`,
          ),
        language: z
          .string()
          .default(activeProfile.symbolLanguages[0] ?? 'csharp')
          .describe(
            `Language identifier for the selected game. Active game offers: ${activeProfile.symbolLanguages.join(', ') || 'none'}.`,
          ),
        typeName: z.string().describe('Exact type, symbol, or container name.'),
        memberName: z
          .string()
          .optional()
          .describe('Optional member name within the symbol container.'),
      },
    },
    async ({ game, language, typeName, memberName }) =>
      readSymbol(typeName, memberName, language, game),
  )

  const genericTools = [
    'search_content',
    'read_document',
    'list_documents',
    'search_objects',
    'get_object_details',
    'search_symbols',
    'read_symbol',
  ]

  server.registerResource(
    'manifest',
    'rimsage://manifest',
    {
      title: 'RimSage Manifest',
      description: 'Server metadata and available capabilities.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'rimsage://manifest',
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              name,
              version,
              activeGame: activeProfile.id,
              supportedGames: supportedGames.map(profile => ({
                id: profile.id,
                displayName: profile.displayName,
                objectModels: profile.objectModels.map(model => model.id),
                symbolLanguages: profile.symbolLanguages,
              })),
              resources: ['rimsage://manifest'],
              tools: genericTools,
            },
            null,
            2,
          ),
        },
      ],
    }),
  )
}

export function createServer() {
  const server = new McpServer({ name, version })
  registerToolsAndResources(server)
  return server
}
