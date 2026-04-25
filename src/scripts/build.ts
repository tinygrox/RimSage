import { argv } from 'bun'
import { existsSync } from 'node:fs'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { getGameProfile } from '../games'
import { getActiveGameAdapter, runActiveGameCommandIfSupported } from '../profiles'
import { getGameDefsPath, getGameObjectModelPath, getGameSourcePath } from '../utils/env'
import {
  getDefaultBuildConfigPath,
  getGameBuildConfig,
  getGameObjectBuildConfigs,
  getGameSourceBuildConfig,
  loadBuildConfig,
  saveGameBuildConfig,
  type GameBuildConfig,
} from '../utils/build-config'

function getConfigArg(): string | undefined {
  const configFlagIndex = argv.indexOf('--config')
  if (configFlagIndex === -1) {
    return undefined
  }

  return argv[configFlagIndex + 1]
}

function hasImportedObjects(gameId: string): boolean {
  return (
    existsSync(getGameDefsPath(gameId)) ||
    getGameProfile(gameId).objectModels.some(model =>
      existsSync(getGameObjectModelPath(gameId, model.id)),
    )
  )
}

function hasImportedSymbols(gameId: string): boolean {
  return existsSync(getGameSourcePath(gameId))
}

async function promptForMissingBuildConfig(
  gameId: string,
  initialConfig: GameBuildConfig,
  needsObjectsPath: boolean,
  needsSourcePath: boolean,
  configPath?: string,
): Promise<GameBuildConfig> {
  const missingAnything = needsObjectsPath || needsSourcePath

  if (!missingAnything) {
    return initialConfig
  }

  if (!input.isTTY || !output.isTTY) {
    console.log(
      `Build inputs are incomplete for '${gameId}'. Set paths in ${getDefaultBuildConfigPath()} or rerun in an interactive terminal to be prompted.`,
    )
    return initialConfig
  }

  const prompt = createInterface({ input, output })
  const nextConfig = { ...initialConfig }

  try {
    console.log(
      `No complete build config found for '${gameId}'. You can enter paths now or manually edit ${getDefaultBuildConfigPath()}.`,
    )

    if (needsObjectsPath) {
      const value = (await prompt.question(
        'Enter object/data path (leave blank to skip object import): ',
      )).trim()

      if (value) {
        nextConfig.objectsPath = value
      }
    }

    if (needsSourcePath) {
      const value = (await prompt.question(
        'Enter source code path (leave blank to skip source import): ',
      )).trim()

      if (value) {
        nextConfig.sourcePath = value
      }
    }
  } finally {
    prompt.close()
  }

  if (
    nextConfig.objectsPath !== initialConfig.objectsPath ||
    nextConfig.sourcePath !== initialConfig.sourcePath
  ) {
    const savedPath = await saveGameBuildConfig(gameId, nextConfig, configPath)
    console.log(`Saved build config to ${savedPath}`)
  }

  return nextConfig
}

export async function main() {
  const adapter = getActiveGameAdapter()
  const configArg = getConfigArg()
  const loaded = await loadBuildConfig(configArg)
  let gameConfig = getGameBuildConfig(loaded.config, adapter.profile.id)
  let sourceConfig = getGameSourceBuildConfig(gameConfig)
  let objectConfigs = getGameObjectBuildConfigs(gameConfig, adapter.profile.id)

  const needsObjectsPath =
    adapter.supports.objectImport &&
    !objectConfigs.some(config => Boolean(config.path?.trim())) &&
    !hasImportedObjects(adapter.profile.id)
  const needsSourcePath =
    adapter.supports.symbolImport &&
    !sourceConfig.path &&
    !hasImportedSymbols(adapter.profile.id)

  gameConfig = await promptForMissingBuildConfig(
    adapter.profile.id,
    gameConfig,
    needsObjectsPath,
    needsSourcePath,
    configArg,
  )
  sourceConfig = getGameSourceBuildConfig(gameConfig)
  objectConfigs = getGameObjectBuildConfigs(gameConfig, adapter.profile.id)

  const firstObjectPath = objectConfigs.find(config => config.path)?.path
  if (firstObjectPath) {
    await runActiveGameCommandIfSupported('importObjects', firstObjectPath)
  }

  if (sourceConfig.path) {
    await runActiveGameCommandIfSupported('importSymbols', sourceConfig.path)
  }

  await runActiveGameCommandIfSupported('clean')
  await runActiveGameCommandIfSupported('indexObjects')
  await runActiveGameCommandIfSupported('indexSymbols')
}

if (import.meta.main) {
  await main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
