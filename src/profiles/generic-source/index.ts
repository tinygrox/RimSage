import { genericSourceProfile, type GameProfile } from '../../games'
import {
  cleanGameIndex,
  importSourceFiles,
  indexSourceSymbols,
} from '../shared/source-symbols'
import { type GameAdapter } from '../types'

export function createGenericSourceAdapter(
  gameId: string,
  profile: GameProfile = genericSourceProfile,
): GameAdapter {
  return {
    profile,
    supports: {
      objectImport: false,
      symbolImport: true,
      objectIndex: false,
      symbolIndex: true,
    },
    commands: {
      importSymbols: rootPath => importSourceFiles(gameId, rootPath),
      indexSymbols: () => indexSourceSymbols(gameId),
      clean: () => cleanGameIndex(gameId),
    },
  }
}

export const genericSourceAdapter: GameAdapter = createGenericSourceAdapter(
  genericSourceProfile.id,
  genericSourceProfile,
)
