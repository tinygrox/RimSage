import { argv } from 'bun'
import {
  getActiveGameAdapter,
  runActiveGameCommandIfSupported,
  supportsActiveGameCommand,
} from '../profiles'
import { getGameBuildConfig, loadBuildConfig } from '../utils/build-config'

const commandName = 'importSymbols'

export async function main() {
  if (!supportsActiveGameCommand(commandName)) {
    await runActiveGameCommandIfSupported(commandName)
    return
  }

  const adapter = getActiveGameAdapter()
  let sourcePath = argv.at(2)

  if (!sourcePath) {
    const loaded = await loadBuildConfig()
    sourcePath = getGameBuildConfig(loaded.config, adapter.profile.id).sourcePath
  }

  if (!sourcePath) {
    throw new Error(
      `No source path configured for '${adapter.profile.id}'. Pass a path or set it in rimsage.config.local.json.`,
    )
  }

  await runActiveGameCommandIfSupported(commandName, sourcePath)
}

if (import.meta.main) {
  await main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
