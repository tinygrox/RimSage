import {
  getGameCapabilities,
  resolveGame,
  unsupportedSymbolLanguageResponse,
} from '../games'
import { textResponse } from '../utils/mcp-response'
import { readSourceSymbol } from './read-source-symbol'

export async function readSymbol(
  typeName: string,
  memberName?: string,
  language: string = 'csharp',
  game?: string,
) {
  const resolved = resolveGame(game)
  if (!resolved.ok) {
    return resolved.response
  }

  const capabilities = getGameCapabilities(resolved.gameId)
  if (!capabilities.hasSourceData) {
    if (capabilities.hasSourcePath) {
      return textResponse(
        `Source index for '${resolved.gameId}' is not ready. Run 'bun run build' to import and index it.`,
      )
    }

    return textResponse(
      `No source configured for '${resolved.gameId}'. Set 'sourcePath' to enable symbol lookup.`,
    )
  }

  if (!resolved.profile.symbolLanguages.includes(language)) {
    return unsupportedSymbolLanguageResponse(resolved.profile, language)
  }

  return readSourceSymbol(typeName, language, memberName, resolved.gameId)
}
