import { Database } from 'bun:sqlite'
import { activeGameId, getGameIndexDbPath } from './env'

export interface SourceSymbolIndexRow {
  language: string
  symbolName: string
  symbolKind: string
  filePath: string
  startLine: number
  declaration?: string | null
  namespaceName?: string | null
  baseTypes?: string | null
}

export interface IndexedObjectRow {
  objectModel: string
  objectId: string
  objectType: string | null
  displayName: string | null
  payloadFormat: 'xml' | 'json' | 'text'
  rawPayload: string
  resolvedPayload: string
}

const runtimeDbs = new Map<string, Database>()

function normalizeGameId(gameId?: string): string {
  return (gameId ?? activeGameId).trim().toLowerCase()
}

export function getDb(gameId?: string): Database {
  const normalized = normalizeGameId(gameId)
  const existing = runtimeDbs.get(normalized)
  if (existing) {
    return existing
  }

  const db = new Database(getGameIndexDbPath(normalized), { readonly: true })
  runtimeDbs.set(normalized, db)
  return db
}

export function closeDb(gameId?: string): void {
  if (gameId) {
    const normalized = normalizeGameId(gameId)
    const db = runtimeDbs.get(normalized)
    if (db) {
      db.close()
      runtimeDbs.delete(normalized)
    }
    return
  }

  for (const db of runtimeDbs.values()) {
    db.close()
  }
  runtimeDbs.clear()
}

export function createBuilderDb(gameId?: string): Database {
  const normalized = normalizeGameId(gameId)
  const db = new Database(getGameIndexDbPath(normalized), { create: true })

  db.run('PRAGMA journal_mode = WAL;')
  db.run('PRAGMA synchronous = NORMAL;')

  return db
}
