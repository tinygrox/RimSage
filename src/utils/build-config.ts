import { existsSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'path'
import { root } from './env'

export interface GameBuildConfig {
  objectsPath?: string
  sourcePath?: string
}

export interface ProjectBuildConfig {
  games?: Record<string, GameBuildConfig>
}

const defaultConfigFiles = ['rimsage.config.local.json', 'rimsage.config.json']

export function getDefaultBuildConfigPath(): string {
  return join(root, defaultConfigFiles[0])
}

export function resolveBuildConfigPath(configPath?: string): string | undefined {
  if (configPath) {
    return isAbsolute(configPath) ? configPath : resolve(root, configPath)
  }

  for (const fileName of defaultConfigFiles) {
    const fullPath = join(root, fileName)
    if (existsSync(fullPath)) {
      return fullPath
    }
  }

  return undefined
}

export async function loadBuildConfig(configPath?: string): Promise<{
  path?: string
  config: ProjectBuildConfig
}> {
  const resolvedPath = resolveBuildConfigPath(configPath)

  if (!resolvedPath || !existsSync(resolvedPath)) {
    return { config: {} }
  }

  const file = Bun.file(resolvedPath)
  const text = await file.text()
  return {
    path: resolvedPath,
    config: text.trim() ? (JSON.parse(text) as ProjectBuildConfig) : {},
  }
}

export function loadBuildConfigSync(configPath?: string): {
  path?: string
  config: ProjectBuildConfig
} {
  const resolvedPath = resolveBuildConfigPath(configPath)

  if (!resolvedPath || !existsSync(resolvedPath)) {
    return { config: {} }
  }

  const text = readFileSync(resolvedPath, 'utf-8')
  return {
    path: resolvedPath,
    config: text.trim() ? (JSON.parse(text) as ProjectBuildConfig) : {},
  }
}

export function getGameBuildConfig(
  config: ProjectBuildConfig,
  gameId: string,
): GameBuildConfig {
  const games = config.games ?? {}
  if (games[gameId]) {
    return games[gameId] ?? {}
  }

  const normalized = gameId.trim().toLowerCase()
  const matchKey = Object.keys(games).find(
    key => key.trim().toLowerCase() === normalized,
  )

  return (matchKey ? games[matchKey] : {}) ?? {}
}

export async function saveGameBuildConfig(
  gameId: string,
  gameConfig: GameBuildConfig,
  configPath?: string,
) {
  const targetPath = resolveBuildConfigPath(configPath) ?? getDefaultBuildConfigPath()
  const existing = await loadBuildConfig(targetPath)
  const merged: ProjectBuildConfig = {
    games: {
      ...(existing.config.games ?? {}),
      [gameId]: {
        ...(existing.config.games?.[gameId] ?? {}),
        ...gameConfig,
      },
    },
  }

  await mkdir(dirname(targetPath), { recursive: true })
  await Bun.write(targetPath, `${JSON.stringify(merged, null, 2)}\n`)
  return targetPath
}
