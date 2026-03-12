import { existsSync } from 'node:fs'
import {
  activeGameId,
  getGameAssetsPath,
  getGameDefsPath,
  getGameSourcePath,
} from '../utils/env'
import { getGameBuildConfig, loadBuildConfigSync } from '../utils/build-config'
import { textResponse } from '../utils/mcp-response'
import { type GameObjectModel, type GameProfile } from './types'

const SUPPORTED_SYMBOL_LANGUAGES = ['csharp', 'java', 'c', 'cpp'] as const
const SUPPORTED_SOURCE_EXTENSIONS = [
  '.cs',
  '.java',
  '.c',
  '.cc',
  '.cpp',
  '.cxx',
  '.h',
  '.hh',
  '.hpp',
  '.hxx',
]
const DEFAULT_SEARCH_GLOBS = [
  '*.cs',
  '*.java',
  '*.c',
  '*.cc',
  '*.cpp',
  '*.cxx',
  '*.h',
  '*.hh',
  '*.hpp',
  '*.hxx',
  'Defs/**/*.xml',
  '*.xml',
  '*.json',
  '*.txt',
  '*.lua',
  '*.js',
  '*.ts',
]

const defObjectModel: GameObjectModel = {
  id: 'def',
  singularName: 'Def',
  pluralName: 'Defs',
  description: 'XML Def definitions with optional inheritance merging.',
  idFieldName: 'defName',
  typeFieldName: 'defType',
  displayFieldName: 'label',
}

export interface GameCapabilities {
  hasObjectsPath: boolean
  hasSourcePath: boolean
  hasObjectsData: boolean
  hasSourceData: boolean
}

export type { GameObjectModel, GameProfile }

export function listGameProfiles(): readonly GameProfile[] {
  const configured = getConfiguredGameIds()
  const ids = new Set(configured)
  const active = normalizeGameId(activeGameId)

  if (active && isSafeGameId(active)) {
    ids.add(active)
  }

  return Array.from(ids).map(id => createGameProfile(id, getGameCapabilities(id)))
}

export function getActiveGameProfile(): GameProfile {
  return getGameProfile(activeGameId)
}

export function getGameProfile(gameId: string): GameProfile {
  const safeId = normalizeOrFallback(gameId)
  return createGameProfile(safeId, getGameCapabilities(safeId))
}

export function resolveGame(gameId?: string) {
  const target = gameId ? normalizeGameId(gameId) : normalizeGameId(activeGameId)

  if (!target || !isSafeGameId(target)) {
    return {
      ok: false as const,
      response: textResponse(`Invalid game id '${gameId ?? activeGameId}'.`),
    }
  }

  const configuredIds = new Set(getConfiguredGameIds())
  if (!configuredIds.has(target) && target !== normalizeGameId(activeGameId)) {
    return {
      ok: false as const,
      response: textResponse(
        `Unknown game '${gameId}'. Configure it in rimsage.config.local.json first.`,
      ),
    }
  }

  return {
    ok: true as const,
    profile: createGameProfile(target, getGameCapabilities(target)),
    gameId: target,
  }
}

export function getGameCapabilities(gameId: string): GameCapabilities {
  const safeId = normalizeOrFallback(gameId)
  const { config } = loadBuildConfigSync()
  const gameConfig = getGameBuildConfig(config, safeId)

  const hasObjectsPath = Boolean(gameConfig.objectsPath?.trim())
  const hasSourcePath = Boolean(gameConfig.sourcePath?.trim())
  const hasObjectsData = existsSync(getGameDefsPath(safeId))
  const hasSourceData = existsSync(getGameSourcePath(safeId))

  return {
    hasObjectsPath,
    hasSourcePath,
    hasObjectsData,
    hasSourceData,
  }
}

export function getObjectModel(
  profile: GameProfile,
  modelId?: string,
): GameObjectModel | undefined {
  const normalizedModel = normalizeGameId(modelId ?? profile.objectModels[0]?.id)
  return profile.objectModels.find(model => model.id === normalizedModel)
}

export function unsupportedObjectModelResponse(
  profile: GameProfile,
  model?: string,
) {
  const available = profile.objectModels.map(item => item.id).join(', ')
  return textResponse(
    `Game '${profile.id}' does not support object model '${model ?? ''}'. ` +
      `Available models: ${available || 'none'}.`,
  )
}

export function unsupportedSymbolLanguageResponse(
  profile: GameProfile,
  language?: string,
) {
  const available = profile.symbolLanguages.join(', ')
  return textResponse(
    `Game '${profile.id}' does not support symbol language '${language ?? ''}'. ` +
      `Available languages: ${available || 'none'}.`,
  )
}

function createGameProfile(gameId: string, capabilities: GameCapabilities): GameProfile {
  const hasObjects = capabilities.hasObjectsPath || capabilities.hasObjectsData
  const hasSource = capabilities.hasSourcePath || capabilities.hasSourceData

  return {
    id: gameId,
    displayName: formatGameLabel(gameId),
    description: 'Universal game profile with auto-detected data inputs.',
    assetRoot: getGameAssetsPath(gameId),
    defaultSearchGlobs: [...DEFAULT_SEARCH_GLOBS],
    symbolLanguages: hasSource ? [...SUPPORTED_SYMBOL_LANGUAGES] : [],
    sourceFileExtensions: [...SUPPORTED_SOURCE_EXTENSIONS],
    objectModels: hasObjects ? [defObjectModel] : [],
  }
}

function normalizeGameId(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function normalizeOrFallback(value: string): string {
  const normalized = normalizeGameId(value)
  return isSafeGameId(normalized) ? normalized : 'invalid'
}

function isSafeGameId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/.test(value) && !value.includes('..')
}

function formatGameLabel(gameId: string): string {
  return gameId
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, value => value.toUpperCase())
}

function getConfiguredGameIds(): string[] {
  const { config } = loadBuildConfigSync()
  const games = config.games ?? {}

  return Object.keys(games)
    .map(key => normalizeGameId(key))
    .filter(key => key && isSafeGameId(key))
}
