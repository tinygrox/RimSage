import { existsSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'path'
import { root } from './env'

export type ObjectImportKind = 'rimworldDefXml' | 'kspConfigNode' | 'jsonFiles'

export interface GameSourceBuildConfig {
  path?: string
  languages?: string[]
  extensions?: string[]
}

export interface GameObjectBuildConfig {
  id?: string
  model?: string
  kind?: ObjectImportKind
  path?: string
  importGlob?: string
  singularName?: string
  pluralName?: string
  description?: string
  idFieldName?: string
  typeFieldName?: string
  displayFieldName?: string
}

export interface NormalizedGameObjectBuildConfig extends GameObjectBuildConfig {
  id: string
  kind: ObjectImportKind
}

export interface GameBuildConfig {
  displayName?: string
  description?: string
  objectsPath?: string
  sourcePath?: string
  source?: string | GameSourceBuildConfig
  objects?: GameObjectBuildConfig[]
  defaultSearchGlobs?: string[]
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

export function getGameSourceBuildConfig(
  gameConfig: GameBuildConfig,
): GameSourceBuildConfig {
  const source =
    typeof gameConfig.source === 'string'
      ? { path: gameConfig.source }
      : gameConfig.source ?? {}

  return {
    ...source,
    path: source.path ?? gameConfig.sourcePath,
  }
}

export function getGameObjectBuildConfigs(
  gameConfig: GameBuildConfig,
  gameId: string,
): NormalizedGameObjectBuildConfig[] {
  const configuredObjects = gameConfig.objects ?? []

  if (configuredObjects.length > 0) {
    return configuredObjects.map(item =>
      normalizeObjectConfig(
        {
          ...item,
          path: item.path ?? gameConfig.objectsPath,
        },
        gameId,
      ),
    )
  }

  if (gameConfig.objectsPath) {
    return [
      normalizeObjectConfig(
        {
          id: defaultObjectModelId(gameId),
          kind: defaultObjectImportKind(gameId),
          path: gameConfig.objectsPath,
        },
        gameId,
      ),
    ]
  }

  return []
}

export function hasConfiguredObjectPath(
  gameConfig: GameBuildConfig,
  gameId: string,
): boolean {
  return getGameObjectBuildConfigs(gameConfig, gameId).some(item =>
    Boolean(item.path?.trim()),
  )
}

function normalizeObjectConfig(
  config: GameObjectBuildConfig,
  gameId: string,
): NormalizedGameObjectBuildConfig {
  const id = normalizeId(config.id ?? config.model ?? defaultObjectModelId(gameId))

  return {
    ...config,
    id,
    model: config.model ?? id,
    kind: config.kind ?? defaultObjectImportKind(gameId),
    path: config.path,
  }
}

function defaultObjectImportKind(gameId: string): ObjectImportKind {
  return normalizeId(gameId) === 'ksp' ? 'kspConfigNode' : 'rimworldDefXml'
}

function defaultObjectModelId(gameId: string): string {
  return normalizeId(gameId) === 'ksp' ? 'ksp_config' : 'def'
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase()
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
