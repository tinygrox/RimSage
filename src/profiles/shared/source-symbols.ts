import { file, Glob } from 'bun'
import { existsSync } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'path'
import { Database } from 'bun:sqlite'
import { getGameIndexDbPath, getGameSourcePath } from '../../utils/env'
import { type SqlNamedParams } from '../../types'

interface SourceLanguageDefinition {
  language: 'csharp' | 'java' | 'c' | 'cpp'
  extensions: string[]
  symbolPatterns: Array<{
    kind:
      | 'class'
      | 'struct'
      | 'interface'
      | 'enum'
      | 'record'
      | 'function'
    regex: RegExp
    groupIndex?: number
  }>
}

interface SymbolIndexInsertRow {
  $language: string
  $symbolName: string
  $symbolKind: string
  $filePath: string
  $startLine: number
}

type SymbolIndexInsertParams = SqlNamedParams & SymbolIndexInsertRow

const languageDefinitions: SourceLanguageDefinition[] = [
  {
    language: 'csharp',
    extensions: ['.cs'],
    symbolPatterns: [
      {
        kind: 'class',
        regex:
          /^\s*(?:public|private|protected|internal|abstract|sealed|static|partial|readonly|unsafe|\s)*\s+(class|struct|interface|enum)\s+([a-zA-Z0-9_]+)/,
        groupIndex: 2,
      },
    ],
  },
  {
    language: 'java',
    extensions: ['.java'],
    symbolPatterns: [
      {
        kind: 'class',
        regex:
          /^\s*(?:public|protected|private|abstract|static|final|sealed|non-sealed|strictfp|\s)*\s+(class|interface|enum|record)\s+([a-zA-Z0-9_]+)/,
        groupIndex: 2,
      },
    ],
  },
  {
    language: 'c',
    extensions: ['.c', '.h'],
    symbolPatterns: [
      {
        kind: 'struct',
        regex: /^\s*(?:typedef\s+)?(struct|enum)\s+([a-zA-Z_][a-zA-Z0-9_]*)/,
        groupIndex: 2,
      },
      {
        kind: 'function',
        regex:
          /^\s*(?!if\b|for\b|while\b|switch\b)(?:[a-zA-Z_][\w\s\*]*\s+)+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^;]*\)\s*\{/,
        groupIndex: 1,
      },
    ],
  },
  {
    language: 'cpp',
    extensions: ['.cpp', '.cc', '.cxx', '.h', '.hh', '.hpp', '.hxx'],
    symbolPatterns: [
      {
        kind: 'class',
        regex:
          /^\s*(?:template\s*<[^>]+>\s*)?(class|struct|enum)\s+([a-zA-Z_][a-zA-Z0-9_]*)/,
        groupIndex: 2,
      },
      {
        kind: 'function',
        regex:
          /^\s*(?!if\b|for\b|while\b|switch\b)(?:template\s*<[^>]+>\s*)?(?:inline\s+|static\s+|virtual\s+|constexpr\s+|friend\s+|extern\s+)*[\w:<>,~\*&\s]+\s+([a-zA-Z_~][a-zA-Z0-9_:~]*)\s*\([^;]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:override\s*)?\{/,
        groupIndex: 1,
      },
    ],
  },
]

const supportedExtensions = Array.from(
  new Set(languageDefinitions.flatMap(definition => definition.extensions)),
)

async function ensureFileParent(path: string) {
  await mkdir(dirname(path), { recursive: true })
}

export function listSupportedSourceExtensions(): string[] {
  return supportedExtensions
}

export async function importSourceFiles(gameId: string, rootPath: string) {
  console.log(`Importing source files for '${gameId}'...`)

  const sourcePath = getGameSourcePath(gameId)
  const root = resolve(rootPath)
  const glob = new Glob('**/*')

  for await (const relativePath of glob.scan({ cwd: root, onlyFiles: true })) {
    const extension = extname(relativePath).toLowerCase()
    if (!supportedExtensions.includes(extension)) {
      continue
    }

    if (relativePath.startsWith('_') || relativePath.startsWith('-')) {
      continue
    }

    const source = file(join(root, relativePath))
    const partPath = relativePath.includes(sep)
      ? relativePath
      : join('Global', relativePath)
    const output = join(sourcePath, partPath)

    await ensureFileParent(output)
    await Bun.write(output, source)
  }

  console.log('Done!')
}

export async function indexSourceSymbols(gameId: string) {
  const sourcePath = getGameSourcePath(gameId)
  const indexDbPath = getGameIndexDbPath(gameId)

  if (!existsSync(sourcePath)) {
    console.log(
      `[SKIP] No source directory found for '${gameId}' at ${sourcePath}.`,
    )
    return
  }

  console.log(`Scanning source in: ${sourcePath}`)
  await ensureFileParent(indexDbPath)
  const db = new Database(indexDbPath, { create: true })

  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS source_symbol_index (
        language TEXT,
        symbolName TEXT,
        symbolKind TEXT,
        filePath TEXT,
        startLine INTEGER,
        PRIMARY KEY (language, symbolName, filePath, startLine)
      );
    `)

    db.run('DROP TABLE IF EXISTS csharp_index;')
    db.run(`
      CREATE TABLE csharp_index (
        typeName TEXT,
        filePath TEXT,
        startLine INTEGER,
        typeKind TEXT,
        PRIMARY KEY (typeName, filePath)
      );
    `)

    const symbolInsert = db.prepare<unknown, SymbolIndexInsertParams>(`
      INSERT OR REPLACE INTO source_symbol_index (language, symbolName, symbolKind, filePath, startLine)
      VALUES ($language, $symbolName, $symbolKind, $filePath, $startLine)
    `)

    const csharpInsert = db.prepare(`
      INSERT OR REPLACE INTO csharp_index (typeName, filePath, startLine, typeKind)
      VALUES ($typeName, $filePath, $startLine, $typeKind)
    `)

    const glob = new Glob('**/*')
    let fileCount = 0
    let symbolCount = 0
    const symbolBatch: SymbolIndexInsertParams[] = []
    const csharpBatch: Array<{
      $typeName: string
      $filePath: string
      $startLine: number
      $typeKind: string
    }> = []

    for await (const relativePath of glob.scan({ cwd: sourcePath, onlyFiles: true })) {
      const extension = extname(relativePath).toLowerCase()
      const matchedLanguages = languageDefinitions.filter(definition =>
        definition.extensions.includes(extension),
      )

      if (matchedLanguages.length === 0) {
        continue
      }

      fileCount += 1
      const absolutePath = join(sourcePath, relativePath)

      try {
        const content = await file(absolutePath).text()
        const lines = content.split(/\r?\n/)
        const normalizedPath = relativePath.replaceAll('\\', '/')

        for (const definition of matchedLanguages) {
          lines.forEach((line, index) => {
            for (const pattern of definition.symbolPatterns) {
              const match = line.match(pattern.regex)
              if (!match) {
                continue
              }

              const symbolName = match[pattern.groupIndex ?? 1]
              if (!symbolName) {
                continue
              }

              symbolBatch.push({
                $language: definition.language,
                $symbolName: symbolName,
                $symbolKind: pattern.kind,
                $filePath: normalizedPath,
                $startLine: index,
              })
              symbolCount++

              if (
                definition.language === 'csharp' &&
                ['class', 'struct', 'interface', 'enum'].includes(pattern.kind)
              ) {
                csharpBatch.push({
                  $typeName: symbolName,
                  $filePath: normalizedPath,
                  $startLine: index,
                  $typeKind: pattern.kind,
                })
              }

              break
            }
          })
        }
      } catch (error) {
        console.warn(`Failed to read ${relativePath}:`, error)
      }
    }

    console.log(`Found ${fileCount} files. Writing ${symbolCount} symbols to DB...`)

    const transaction = db.transaction(() => {
      for (const entry of symbolBatch) {
        symbolInsert.run(entry)
      }

      for (const entry of csharpBatch) {
        csharpInsert.run(entry)
      }
    })

    transaction()
    console.log('Indexing complete.')
  } finally {
    db.close()
  }
}

export async function cleanGameIndex(gameId: string) {
  const indexDbPath = getGameIndexDbPath(gameId)
  const filesToClean = [indexDbPath, `${indexDbPath}-shm`, `${indexDbPath}-wal`]

  for (const path of filesToClean) {
    const dbFile = file(path)
    if (!(await dbFile.exists())) continue

    console.log(`Removing file: ${path}`)
    try {
      await unlink(path)
      console.log(`Successfully deleted ${path}`)
    } catch (error) {
      console.error(`Failed to delete ${path}:`, error)
    }
  }

  console.log('Clean complete.')
}
