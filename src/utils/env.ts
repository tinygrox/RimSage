import { existsSync } from 'node:fs'
import { join } from 'path'

export const root = join(import.meta.dir, '../../')
export const activeGameId = process.env.RIMSAGE_GAME?.trim().toLowerCase() || 'rimworld'
const distPath = join(root, 'dist')

function normalizeGameId(gameId: string): string {
  return gameId.trim().toLowerCase()
}

export function getGameDistPath(gameId: string = activeGameId): string {
  return join(distPath, 'games', normalizeGameId(gameId))
}

export function getGameAssetsPath(gameId: string = activeGameId): string {
  return join(getGameDistPath(gameId), 'assets')
}

export function getGameVersionPath(gameId: string = activeGameId): string {
  return join(getGameDistPath(gameId), 'Version.txt')
}

export function getGameDefsPath(gameId: string = activeGameId): string {
  return join(getGameAssetsPath(gameId), 'Defs')
}

export function getGameObjectsPath(gameId: string = activeGameId): string {
  return join(getGameAssetsPath(gameId), 'Objects')
}

export function getGameObjectModelPath(gameId: string, modelId: string): string {
  return join(getGameObjectsPath(gameId), normalizeGameId(modelId))
}

export function getGameSourcePath(gameId: string = activeGameId): string {
  return join(getGameAssetsPath(gameId), 'Source')
}

export function getGameIndexDbPath(gameId: string = activeGameId): string {
  return join(getGameDistPath(gameId), 'index.db')
}

export function hasGameStorage(gameId: string = activeGameId): boolean {
  return (
    existsSync(getGameAssetsPath(gameId)) ||
    existsSync(getGameIndexDbPath(gameId)) ||
    existsSync(getGameVersionPath(gameId))
  )
}

export const versionPath = getGameVersionPath()
export const defsPath = getGameDefsPath()
export const sourcePath = getGameSourcePath()
export const indexDbPath = getGameIndexDbPath()
