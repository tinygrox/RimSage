import { argv } from 'bun'
import {
  getActiveGameAdapter,
  runActiveGameCommandIfSupported,
  supportsActiveGameCommand,
} from '../profiles'
import { getGameBuildConfig, loadBuildConfig } from '../utils/build-config'

const commandName = 'importObjects'

export async function main() {
  if (!supportsActiveGameCommand(commandName)) {
    await runActiveGameCommandIfSupported(commandName)
    return
  }

  const adapter = getActiveGameAdapter()
  let objectsPath = argv.at(2)

  if (!objectsPath) {
    const loaded = await loadBuildConfig()
    objectsPath = getGameBuildConfig(loaded.config, adapter.profile.id).objectsPath
  }

  if (!objectsPath) {
    throw new Error(
      `No object/data path configured for '${adapter.profile.id}'. Pass a path or set it in rimsage.config.local.json.`,
    )
  }

  await runActiveGameCommandIfSupported(commandName, objectsPath)
}

if (import.meta.main) {
  await main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
