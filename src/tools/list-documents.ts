import { resolveGame } from '../games'
import { PathSandbox } from '../utils/path-sandbox'
import { listDirectory } from './list-directory'

export async function listDocuments(
  relativePath: string = '',
  limit: number = 100,
  game?: string,
) {
  const resolved = resolveGame(game)
  if (!resolved.ok) {
    return resolved.response
  }

  const sandbox = new PathSandbox(resolved.profile.assetRoot)
  return listDirectory(sandbox, relativePath, limit)
}
