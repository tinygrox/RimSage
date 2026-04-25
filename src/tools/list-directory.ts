import { readdir } from 'fs/promises'
import { join } from 'path'
import { PathSandbox } from '../utils/path-sandbox'
import { textResponse } from '../utils/mcp-response'

export interface DirectoryEntry {
  name: string
  type: 'directory' | 'file'
  path: string
}

export interface ListDirectoryResult {
  entries: DirectoryEntry[]
  total: number
}

export async function listDirectoryImpl(
  sandbox: PathSandbox,
  relativePath: string = '',
  limit: number = 100,
): Promise<ListDirectoryResult> {
  const fullPath = sandbox.validateAndResolve(relativePath)
  const entries = (await readdir(fullPath, { withFileTypes: true }))
    .filter(dirent => !dirent.name.startsWith('.'))
    .map(dirent => ({
      name: dirent.name,
      type: dirent.isDirectory() ? 'directory' as const : 'file' as const,
      path: relativePath ? join(relativePath, dirent.name) : dirent.name,
    }))
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : 1
      }

      return left.name.localeCompare(right.name)
    })

  const slicedEntries = entries.slice(0, limit)

  return {
    entries: slicedEntries,
    total: entries.length,
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

    let finalOutput = result.entries
      .map(entry => (entry.type === 'directory' ? `${entry.name}/` : entry.name))
      .join('\n')

    if (result.entries.length < result.total) {
      finalOutput += `\n\n[TRUNCATED] Showing ${result.entries.length}/${result.total} items.`
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
