import { resolveGame } from '../games'
import { PathSandbox } from '../utils/path-sandbox'
import { readFile } from './read-file'

export async function readDocument(
  relativePath: string,
  startLine: number = 0,
  lineCount: number = 400,
  game?: string,
) {
  const resolved = resolveGame(game)
  if (!resolved.ok) {
    return resolved.response
  }

  const sandbox = new PathSandbox(resolved.profile.assetRoot)
  return readFile(sandbox, relativePath, startLine, lineCount)
}
