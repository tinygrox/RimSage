import { activeGameId } from '../utils/env'
import {
  getGameCapabilities,
  getGameProfile,
  listGameProfiles,
} from '../games'
import {
  importConfiguredObjects,
  indexConfiguredObjects,
} from './shared/object-operations'
import {
  cleanGameIndex,
  importSourceFiles,
  indexSourceSymbols,
} from './shared/source-symbols'
import { type GameAdapter } from './types'
import {
  getGameBuildConfig,
  getGameSourceBuildConfig,
  loadBuildConfigSync,
} from '../utils/build-config'

export type { GameAdapter }
export type GameCommandName = keyof GameAdapter['commands']

export function listGameAdapters(): readonly GameAdapter[] {
  return listGameProfiles().map(profile => createGameAdapter(profile.id))
}

export function getGameAdapter(gameId: string): GameAdapter | undefined {
  if (!gameId) return undefined
  return createGameAdapter(gameId)
}

export function getActiveGameAdapter(): GameAdapter {
  return getGameAdapter(activeGameId) ?? createGameAdapter(activeGameId)
}

export function listSupportedGameIds(): string[] {
  return listGameProfiles().map(profile => profile.id)
}

export function supportsGameCommand(
  adapter: GameAdapter,
  commandName: GameCommandName,
): boolean {
  const capabilities = getGameCapabilities(adapter.profile.id)

  switch (commandName) {
    case 'importObjects':
      return capabilities.hasObjectImporter
    case 'indexObjects':
      return capabilities.hasObjectImporter &&
        (capabilities.hasObjectsData || capabilities.hasObjectsPath)
    case 'importSymbols':
      return capabilities.hasSourceImporter
    case 'indexSymbols':
      return capabilities.hasSourceImporter &&
        (capabilities.hasSourceData || capabilities.hasSourcePath)
    case 'clean':
      return true
    default:
      return false
  }
}

export function supportsActiveGameCommand(commandName: GameCommandName): boolean {
  return supportsGameCommand(getActiveGameAdapter(), commandName)
}

export function requireActiveGameCommand(
  commandName: GameCommandName,
): NonNullable<GameAdapter['commands'][typeof commandName]> {
  const adapter = getActiveGameAdapter()
  const command = adapter.commands[commandName]

  if (!supportsGameCommand(adapter, commandName) || !command) {
    throw new Error(
      `Active game '${adapter.profile.id}' does not implement command '${commandName}'.`,
    )
  }

  return command as NonNullable<GameAdapter['commands'][typeof commandName]>
}

export async function runActiveGameCommandIfSupported(
  commandName: GameCommandName,
  ...args: string[]
): Promise<boolean> {
  const adapter = getActiveGameAdapter()

  if (!supportsGameCommand(adapter, commandName)) {
    console.log(
      `[SKIP] Active game '${adapter.profile.id}' does not support '${commandName}'.`,
    )
    return false
  }

  const command = requireActiveGameCommand(commandName)
  await (command as (...commandArgs: string[]) => Promise<void>)(...args)
  return true
}

function createGameAdapter(gameId: string): GameAdapter {
  const profile = getGameProfile(gameId)
  const capabilities = getGameCapabilities(profile.id)

  return {
    profile,
    supports: {
      objectImport: capabilities.hasObjectImporter,
      symbolImport: capabilities.hasSourceImporter,
      objectIndex: capabilities.hasObjectImporter,
      symbolIndex: capabilities.hasSourceImporter,
    },
    commands: {
      importObjects: rootPath => importConfiguredObjects(profile.id, rootPath),
      importSymbols: rootPath =>
        importSourceFiles(profile.id, rootPath, getSourceImportOptions(profile.id)),
      indexObjects: () => indexConfiguredObjects(profile.id),
      indexSymbols: () => indexSourceSymbols(profile.id),
      clean: () => cleanGameIndex(profile.id),
    },
  }
}

function getSourceImportOptions(gameId: string) {
  const { config } = loadBuildConfigSync()
  const gameConfig = getGameBuildConfig(config, gameId)
  const sourceConfig = getGameSourceBuildConfig(gameConfig)

  return {
    languages: sourceConfig.languages,
    extensions: sourceConfig.extensions,
  }
}
