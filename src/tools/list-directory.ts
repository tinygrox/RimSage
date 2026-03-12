import { readdir } from 'fs/promises'
import { PathSandbox } from '../utils/path-sandbox'
import { textResponse } from '../utils/mcp-response'

export interface ListDirectoryResult {
  items: string[]
  total: number
  shown: number
}

export async function listDirectoryImpl(
  sandbox: PathSandbox,
  relativePath: string = '',
  limit: number = 100,
): Promise<ListDirectoryResult> {
  const fullPath = sandbox.validateAndResolve(relativePath)
  const files = (await readdir(fullPath, { withFileTypes: true }))
    .map(dirent => `${dirent.isDirectory() ? '[DIR]' : '[FILE]'} ${dirent.name}`)
    .sort((left, right) => left.localeCompare(right))

  const slicedFiles = files.slice(0, limit)

  return {
    items: slicedFiles,
    total: files.length,
    shown: slicedFiles.length,
  }
}

export async function listDirectory(
  sandbox: PathSandbox,
  relativePath: string = '',
  limit: number = 100,
) {
  try {
    const result = await listDirectoryImpl(sandbox, relativePath, limit)

    if (result.total === 0) {
      return textResponse('Directory is empty.')
    }

    let finalOutput = result.items.join('\n')

    if (result.shown < result.total) {
      finalOutput += `\n\n[TRUNCATED] Showing ${result.shown}/${result.total} items.`
      finalOutput += '\n(Tip: Increase `limit` or refine the path.)'
    }

    return textResponse(finalOutput)
  } catch (error: unknown) {
    const fsError = error as NodeJS.ErrnoException

    if (fsError.code === 'ENOENT') {
      throw new Error(`Directory not found: ${relativePath}`)
    }

    if (fsError.code === 'ENOTDIR') {
      throw new Error(
        `Path is not a directory: ${relativePath}. Use read_document instead.`,
      )
    }

    throw error
  }
}
