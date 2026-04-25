import { existsSync } from 'node:fs'
import {
  activeGameId,
  getGameAssetsPath,
  getGameDefsPath,
  getGameObjectModelPath,
  getGameSourcePath,
} from '../utils/env'
import {
  getGameBuildConfig,
  getGameObjectBuildConfigs,
  getGameSourceBuildConfig,
  loadBuildConfigSync,
  type NormalizedGameObjectBuildConfig,
} from '../utils/build-config'
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
  importKind: 'rimworldDefXml',
}

const kspConfigObjectModel: GameObjectModel = {
  id: 'ksp_config',
  singularName: 'KSP config node',
  pluralName: 'KSP config nodes',
  description: 'Kerbal Space Program ConfigNode objects from .cfg files.',
  idFieldName: 'name',
  typeFieldName: 'nodeType',
  displayFieldName: 'title',
  importKind: 'kspConfigNode',
}

const jsonObjectModel: GameObjectModel = {
  id: 'json',
  singularName: 'JSON object',
  pluralName: 'JSON objects',
  description: 'Structured objects extracted from JSON files.',
  idFieldName: 'id',
  typeFieldName: 'type',
  displayFieldName: 'label',
  importKind: 'jsonFiles',
}

export interface GameCapabilities {
  hasObjectImporter: boolean
  hasSourceImporter: boolean
  hasObjectsPath: boolean
  hasSourcePath: boolean
  hasObjectsData: boolean
  hasSourceData: boolean
  objectModels: GameObjectModel[]
  symbolLanguages: string[]
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
  const sourceConfig = getGameSourceBuildConfig(gameConfig)
  const configuredObjectInputs = getGameObjectBuildConfigs(gameConfig, safeId)
  const objectModels = getObjectModels(
    safeId,
    configuredObjectInputs,
    gameConfig.objects !== undefined,
  )
  const symbolLanguages = getSymbolLanguages(sourceConfig.languages)

  const hasObjectsPath = configuredObjectInputs.some(item =>
    Boolean(item.path?.trim()),
  )
  const hasSourcePath = Boolean(sourceConfig.path?.trim())
  const hasObjectsData =
    existsSync(getGameDefsPath(safeId)) ||
    objectModels.some(model =>
      existsSync(getGameObjectModelPath(safeId, model.id)),
    )
  const hasSourceData = existsSync(getGameSourcePath(safeId))

  return {
    hasObjectImporter: objectModels.length > 0,
    hasSourceImporter: true,
    hasObjectsPath,
    hasSourcePath,
    hasObjectsData,
    hasSourceData,
    objectModels,
    symbolLanguages,
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
  const hasSource = capabilities.hasSourcePath || capabilities.hasSourceData
  const { config } = loadBuildConfigSync()
  const gameConfig = getGameBuildConfig(config, gameId)

  return {
    id: gameId,
    displayName: gameConfig.displayName ?? formatGameLabel(gameId),
    description:
      gameConfig.description ??
      'Universal game profile with configured and auto-detected data inputs.',
    assetRoot: getGameAssetsPath(gameId),
    defaultSearchGlobs: gameConfig.defaultSearchGlobs ?? [...DEFAULT_SEARCH_GLOBS],
    symbolLanguages: hasSource ? capabilities.symbolLanguages : [],
    sourceFileExtensions: [...SUPPORTED_SOURCE_EXTENSIONS],
    objectModels: capabilities.objectModels,
  }
}

function getObjectModels(
  gameId: string,
  configuredInputs: NormalizedGameObjectBuildConfig[],
  hasExplicitObjectConfig: boolean,
): GameObjectModel[] {
  const models = new Map<string, GameObjectModel>()

  for (const config of configuredInputs) {
    models.set(config.id, objectModelFromConfig(config))
  }

  if (models.size === 0 && !hasExplicitObjectConfig) {
    if (normalizeGameId(gameId) === 'rimworld' || existsSync(getGameDefsPath(gameId))) {
      models.set(defObjectModel.id, defObjectModel)
    }

    if (
      normalizeGameId(gameId) === 'ksp' ||
      existsSync(getGameObjectModelPath(gameId, kspConfigObjectModel.id))
    ) {
      models.set(kspConfigObjectModel.id, kspConfigObjectModel)
    }
  }

  return Array.from(models.values())
}

function objectModelFromConfig(
  config: NormalizedGameObjectBuildConfig,
): GameObjectModel {
  const base = getBaseObjectModel(config.kind)

  return {
    id: config.id,
    singularName: config.singularName ?? base.singularName,
    pluralName: config.pluralName ?? base.pluralName,
    description: config.description ?? base.description,
    idFieldName: config.idFieldName ?? base.idFieldName,
    typeFieldName: config.typeFieldName ?? base.typeFieldName,
    displayFieldName: config.displayFieldName ?? base.displayFieldName,
    importKind: config.kind,
  }
}

function getBaseObjectModel(importKind: NormalizedGameObjectBuildConfig['kind']) {
  switch (importKind) {
    case 'kspConfigNode':
      return kspConfigObjectModel
    case 'jsonFiles':
      return jsonObjectModel
    case 'rimworldDefXml':
    default:
      return defObjectModel
  }
}

function getSymbolLanguages(configuredLanguages?: string[]): string[] {
  if (!configuredLanguages || configuredLanguages.length === 0) {
    return [...SUPPORTED_SYMBOL_LANGUAGES]
  }

  const supported = new Set(SUPPORTED_SYMBOL_LANGUAGES)
  return configuredLanguages
    .map(language => normalizeGameId(language))
    .filter(language => supported.has(language as (typeof SUPPORTED_SYMBOL_LANGUAGES)[number]))
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
