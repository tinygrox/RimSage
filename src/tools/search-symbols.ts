import {
  getGameCapabilities,
  resolveGame,
  unsupportedSymbolLanguageResponse,
} from '../games'
import { type SqlNamedParams } from '../types'
import { getDb } from '../utils/db'
import { textResponse } from '../utils/mcp-response'

export interface SearchSymbolsResultRow {
  language: string
  symbolName: string
  symbolKind: string
  filePath: string
  startLine: number
  declaration: string | null
  namespaceName: string | null
  baseTypes: string | null
}

export interface SearchSymbolsResult {
  results: SearchSymbolsResultRow[]
  total: number
  needsReindexForBaseType: boolean
}

export function searchSymbolsImpl(
  gameId: string,
  query: string,
  language?: string,
  symbolKind?: string,
  baseType?: string,
  filePattern?: string,
  limit: number = 20,
): SearchSymbolsResult {
  const db = getDb(gameId)
  const table = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'source_symbol_index'",
    )
    .get()

  if (!table) {
    return { results: [], total: 0, needsReindexForBaseType: false }
  }

  const columns = getSourceSymbolColumns(gameId)
  const hasColumn = (name: string) => columns.has(name)
  const selectDeclaration = hasColumn('declaration')
    ? 'declaration'
    : 'NULL AS declaration'
  const selectNamespace = hasColumn('namespaceName')
    ? 'namespaceName'
    : 'NULL AS namespaceName'
  const selectBaseTypes = hasColumn('baseTypes') ? 'baseTypes' : 'NULL AS baseTypes'
  let whereClause = 'symbolName LIKE $query'
  const params: SqlNamedParams = {
    $query: `%${query}%`,
  }

  if (language) {
    whereClause += ' AND language = $language'
    params.$language = language
  }

  if (symbolKind) {
    whereClause += ' AND symbolKind = $kind'
    params.$kind = symbolKind
  }

  if (filePattern) {
    whereClause += ' AND filePath LIKE $filePattern'
    params.$filePattern = `%${filePattern}%`
  }

  const needsReindexForBaseType = Boolean(baseType) && !hasColumn('baseTypes')
  if (baseType && hasColumn('baseTypes')) {
    whereClause += " AND (',' || baseTypes || ',') LIKE $baseType"
    params.$baseType = `%,${baseType},%`
  }

  const countSql = `SELECT COUNT(*) as count FROM source_symbol_index WHERE ${whereClause}`
  const countRow = db
    .query<{ count: number }, SqlNamedParams>(countSql)
    .get(params)
  const total = countRow?.count ?? 0

  if (total === 0) {
    return { results: [], total: 0, needsReindexForBaseType }
  }

  const dataSql = `
    SELECT
      language,
      symbolName,
      symbolKind,
      filePath,
      startLine,
      ${selectDeclaration},
      ${selectNamespace},
      ${selectBaseTypes}
    FROM source_symbol_index
    WHERE ${whereClause}
    ORDER BY symbolName ASC, filePath ASC
    LIMIT $limit
  `

  const results = db
    .query<SearchSymbolsResultRow, SqlNamedParams>(dataSql)
    .all({ ...params, $limit: limit })

  return { results, total, needsReindexForBaseType }
}

export function searchSymbols(
  query: string,
  language?: string,
  symbolKind?: string,
  baseType?: string,
  filePattern?: string,
  limit: number = 20,
  game?: string,
) {
  const resolved = resolveGame(game)
  if (!resolved.ok) {
    return resolved.response
  }

  const capabilities = getGameCapabilities(resolved.gameId)
  if (!capabilities.hasSourceData) {
    if (capabilities.hasSourcePath) {
      return textResponse(
        `Source index for '${resolved.gameId}' is not ready. Run 'bun run build' to import and index it.`,
      )
    }

    return textResponse(
      `No source configured for '${resolved.gameId}'. Set 'sourcePath' or 'source.path' to enable symbol search.`,
    )
  }

  if (language && !resolved.profile.symbolLanguages.includes(language)) {
    return unsupportedSymbolLanguageResponse(resolved.profile, language)
  }

  const normalizedKind = symbolKind?.trim().toLowerCase()
  const { results, total, needsReindexForBaseType } = searchSymbolsImpl(
    resolved.gameId,
    query,
    language,
    normalizedKind,
    baseType,
    filePattern,
    limit,
  )

  if (needsReindexForBaseType) {
    return textResponse(
      `The symbol index for '${resolved.gameId}' was built with an older schema. Run 'bun run index:symbols' before filtering by base_type.`,
    )
  }

  if (total === 0) {
    return textResponse('No symbols found. Try a shorter keyword or remove filters.')
  }

  const formatted = results
    .map(result => formatSymbolResult(result))
    .join('\n')

  let output = formatted
  if (results.length < total) {
    output += `\n\n[TRUNCATED] Showing ${results.length}/${total} results.`
    output += '\n(Tip: Increase `limit`, add `symbol_kind`, or refine `query`.)'
  }

  return textResponse(output)
}

function getSourceSymbolColumns(gameId: string): Set<string> {
  const db = getDb(gameId)
  const rows = db
    .query<{ name: string }, []>('PRAGMA table_info(source_symbol_index)')
    .all()

  return new Set(rows.map(row => row.name))
}

function formatSymbolResult(result: SearchSymbolsResultRow): string {
  const namespacePrefix = result.namespaceName ? `${result.namespaceName}.` : ''
  const basePart = result.baseTypes
    ? ` : ${result.baseTypes.split(',').join(', ')}`
    : ''
  const declarationPart = result.declaration ? ` - ${result.declaration}` : ''

  return `[${result.language}:${result.symbolKind}] ${namespacePrefix}${result.symbolName}${basePart} (${result.filePath}:${result.startLine + 1})${declarationPart}`
}
