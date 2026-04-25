import { builder } from '../utils/xml-utils'
import { getDb, type IndexedObjectRow } from '../utils/db'
import { type SqlNamedParams } from '../types'
import { textResponse } from '../utils/mcp-response'
import {
  getGameCapabilities,
  resolveGame,
  getObjectModel,
  unsupportedObjectModelResponse,
} from '../games'

export type ObjectInheritanceMode = 'merged' | 'raw'

type ObjectDetailRow = Pick<
  IndexedObjectRow,
  'objectType' | 'payloadFormat'
> & {
  payload: string
}

export function getObjectDetailsImpl(
  gameId: string,
  objectModel: string,
  objectId: string,
  objectType?: string,
  inheritance: ObjectInheritanceMode = 'merged',
): ObjectDetailRow[] {
  const db = getDb(gameId)
  const params: SqlNamedParams = {
    $model: objectModel,
    $id: objectId,
  }
  const payloadColumn = inheritance === 'raw' ? 'rawPayload' : 'resolvedPayload'
  let query = `
    SELECT objectType, payloadFormat, ${payloadColumn} AS payload
    FROM objects
    WHERE objectModel = $model AND objectId = $id
  `

  if (objectType) {
    query += ' AND objectType = $type'
    params.$type = objectType
  }

  return db.query<ObjectDetailRow, SqlNamedParams>(query).all(params)
}

export function getObjectDetails(
  objectId: string,
  model?: string,
  objectType?: string,
  inheritance: ObjectInheritanceMode = 'merged',
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
      `No object data configured for '${resolved.gameId}'. Set 'objects' or 'objectsPath' if you want structured object lookup.`,
    )
  }

  const objectModel = getObjectModel(resolved.profile, model)
  if (!objectModel) {
    return unsupportedObjectModelResponse(resolved.profile, model)
  }

  const rows = getObjectDetailsImpl(
    resolved.gameId,
    objectModel.id,
    objectId,
    objectType,
    inheritance,
  )

  if (rows.length === 0) {
    return textResponse(
      `Object '${objectId}'${objectType ? ` (type: ${objectType})` : ''} not found. Try using 'search_objects' to verify the exact identifier.`,
    )
  }

  const rendered = rows.map(row => renderPayload(row)).join('\n\n')
  return textResponse(rendered)
}

function renderPayload(row: ObjectDetailRow): string {
  switch (row.payloadFormat) {
    case 'json':
      return JSON.stringify(JSON.parse(row.payload), null, 2)
    case 'text':
      return row.payload
    case 'xml': {
      const object = JSON.parse(row.payload)
      return builder.build({ [row.objectType ?? 'Object']: object })
    }
    default:
      return row.payload
  }
}
