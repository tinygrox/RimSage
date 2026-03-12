import { rimworldProfile, type GameProfile } from '../../games'
import {
  cleanGameIndex,
  importSourceFiles,
  indexSourceSymbols,
} from '../shared/source-symbols'
import {
  importRimworldObjects,
  indexRimworldObjects,
} from './operations'
import { type GameAdapter } from '../types'

export function createRimworldAdapter(
  gameId: string,
  profile: GameProfile = rimworldProfile,
): GameAdapter {
  return {
    profile,
    supports: {
      objectImport: true,
      symbolImport: true,
      objectIndex: true,
      symbolIndex: true,
    },
    commands: {
      importObjects: rootPath => importRimworldObjects(rootPath, gameId),
      importSymbols: rootPath => importSourceFiles(gameId, rootPath),
      indexObjects: () => indexRimworldObjects(gameId),
      indexSymbols: () => indexSourceSymbols(gameId),
      clean: () => cleanGameIndex(gameId),
    },
  }
}

export const rimworldAdapter: GameAdapter = createRimworldAdapter(
  rimworldProfile.id,
  rimworldProfile,
)
