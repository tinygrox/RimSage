import { resolveGame } from '../games'
import { PathSandbox } from '../utils/path-sandbox'
import { searchSource } from './search-source'

export async function searchContent(
  query: string,
  caseSensitive: boolean = false,
  filePattern?: string,
  game?: string,
) {
  const resolved = resolveGame(game)
  if (!resolved.ok) {
    return resolved.response
  }

  const sandbox = new PathSandbox(resolved.profile.assetRoot)
  return searchSource(sandbox, query, caseSensitive, filePattern)
}
