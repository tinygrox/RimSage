import { getDb, type IndexedObjectRow } from '../utils/db'
import { type SqlNamedParams } from '../types'
import { textResponse } from '../utils/mcp-response'
import {
  getGameCapabilities,
  resolveGame,
  getObjectModel,
  unsupportedObjectModelResponse,
} from '../games'

type SearchObjectRow = Pick<
  IndexedObjectRow,
  'objectId' | 'objectType' | 'displayName' | 'objectModel'
>

export interface SearchObjectsResult {
  results: SearchObjectRow[]
  total: number
}

export function searchObjectsImpl(
  gameId: string,
  objectModel: string,
  query: string,
  objectType?: string,
  limit: number = 20,
): SearchObjectsResult {
  const db = getDb(gameId)
  let whereClause = 'objectModel = $model AND (objectId LIKE $query OR displayName LIKE $query)'

  const params: SqlNamedParams = {
    $model: objectModel,
    $query: `%${query}%`,
  }

  if (objectType) {
    whereClause += ' AND objectType = $type'
    params.$type = objectType
  }

  const countSql = `SELECT COUNT(*) as count FROM objects WHERE ${whereClause}`
  const countRow = db
    .query<{ count: number }, SqlNamedParams>(countSql)
    .get(params)
  const total = countRow?.count ?? 0

  if (total === 0) {
    return { results: [], total: 0 }
  }

  const dataSql = `
    SELECT objectId, objectType, displayName, objectModel
    FROM objects
    WHERE ${whereClause}
    ORDER BY objectId ASC
    LIMIT $limit
  `

  const results = db
    .query<SearchObjectRow, SqlNamedParams>(dataSql)
    .all({ ...params, $limit: limit })

  return { results, total }
}

export function searchObjects(
  query: string,
  model?: string,
  objectType?: string,
  limit: number = 20,
  game?: string,
) {
  const resolved = resolveGame(game)
  if (!resolved.ok) {
    return resolved.response
  }

  const capabilities = getGameCapabilities(resolved.gameId)
  if (!capabilities.hasObjectsData) {
    if (capabilities.hasObjectsPath) {
      return textResponse(
        `Object data for '${resolved.gameId}' is not indexed yet. Run 'bun run build' to import and index it.`,
      )
    }

    return textResponse(
      `No object data configured for '${resolved.gameId}'. Set 'objects' or 'objectsPath' if you want structured object search.`,
    )
  }

  const objectModel = getObjectModel(resolved.profile, model)
  if (!objectModel) {
    return unsupportedObjectModelResponse(resolved.profile, model)
  }

  const { results, total } = searchObjectsImpl(
    resolved.gameId,
    objectModel.id,
    query,
    objectType,
    limit,
  )

  if (total === 0) {
    return textResponse('No objects found. Try a shorter keyword.')
  }

  const formatted = results
    .map(result => {
      const typePart = result.objectType ? `[${result.objectType}] ` : ''
      const displayPart = result.displayName ? ` (name: "${result.displayName}")` : ''
      return `${typePart}${result.objectId}${displayPart}`
    })
    .join('\n')

  let output = formatted

  if (results.length < total) {
    output += `\n\n[TRUNCATED] Showing ${results.length}/${total} results.`
    output += '\n(Tip: Increase `limit` or refine query.)'
  }

  return textResponse(output)
}
