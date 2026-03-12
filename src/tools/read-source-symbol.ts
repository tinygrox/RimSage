import { file } from 'bun'
import { join } from 'path'
import { getDb } from '../utils/db'
import { getGameSourcePath } from '../utils/env'
import { type SqlNamedParams } from '../types'
import { textResponse } from '../utils/mcp-response'

interface IndexRow {
  filePath: string
  startLine: number
  symbolKind: string
  language: string
}

interface CodeBlock {
  startLine: number
  lineCount: number
  code: string
}

const MAX_LINES_THRESHOLD = 400
const CONTAINER_KINDS = new Set(['class', 'struct', 'interface', 'enum', 'record'])

export interface SourceSymbolResult {
  filePath: string
  startLine: number
  lineCount: number
  code: string
  isTruncated: boolean
  fileExists: boolean
  symbolKind: string
  language: string
}

export async function readSourceSymbolImpl(
  symbolName: string,
  language: string,
  memberName?: string,
  gameId?: string,
): Promise<SourceSymbolResult[]> {
  const rows = getSourceIndexRows(symbolName, language, gameId)
  const results: SourceSymbolResult[] = []
  const sourcePath = getGameSourcePath(gameId)

  for (const row of rows) {
    const fullPath = join(sourcePath, row.filePath)

    if (!(await file(fullPath).exists())) {
      results.push({
        filePath: row.filePath,
        startLine: row.startLine,
        lineCount: 0,
        code: `// Error: Source file not found: ${row.filePath}`,
        isTruncated: false,
        fileExists: false,
        symbolKind: row.symbolKind,
        language: row.language,
      })
      continue
    }

    const content = await file(fullPath).text()
    const allLines = content.split(/\r?\n/)
    const symbolBlock = extractScopedBlock(allLines, row.startLine)
    const blocks = memberName && CONTAINER_KINDS.has(row.symbolKind)
      ? extractNamedMembers(allLines, row.startLine, symbolBlock.lineCount, memberName)
      : [symbolBlock]

    for (const block of blocks) {
      results.push({
        filePath: row.filePath,
        startLine: block.startLine,
        lineCount: block.lineCount,
        code: memberName ? dedentCode(block.code) : block.code,
        isTruncated: block.lineCount > MAX_LINES_THRESHOLD,
        fileExists: true,
        symbolKind: row.symbolKind,
        language: row.language,
      })
    }
  }

  return results
}

export async function readSourceSymbol(
  symbolName: string,
  language: string,
  memberName?: string,
  gameId?: string,
) {
  const results = await readSourceSymbolImpl(symbolName, language, memberName, gameId)

  if (results.length === 0) {
    const health = getSourceIndexHealth(language, gameId)
    let extraHint = ''

    if (!health.available) {
      extraHint =
        ` Note: ${language} symbol index is unavailable or empty. Run 'bun run index:symbols' to rebuild it.`
    }

    const symbolLabel = memberName
      ? `Member '${memberName}' in symbol '${symbolName}'`
      : `Symbol '${symbolName}'`

    return textResponse(
      `${symbolLabel} not found in index for language '${language}'. Please check the name.${extraHint}`,
    )
  }

  const parts: string[] = []
  let isTruncatedMode = false

  for (const result of results) {
    let finalCode = result.code
    let header = `// File: ${result.filePath} (Lines ${result.startLine + 1}-${
      result.startLine + result.lineCount
    }) [${result.language}:${result.symbolKind}]`

    if (result.isTruncated) {
      isTruncatedMode = true
      finalCode = generateSignature(result.code)
      header += ' [AUTO-SUMMARY: Hidden method bodies due to size]'
    }

    parts.push(`${header}\n${finalCode}`)
  }

  let output = parts.join('\n\n')

  if (isTruncatedMode) {
    output += '\n\n[SYSTEM NOTE] Some code was automatically summarized because it exceeded the output limit.'
    output += "\nTo read the implementation of a specific member, use the 'read_document' tool with the specific line numbers shown above."
  }

  return textResponse(output)
}

function getSourceIndexRows(
  symbolName: string,
  language: string,
  gameId?: string,
): IndexRow[] {
  const db = getDb(gameId)

  const hasGenericTable = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'source_symbol_index'",
    )
    .get()

  if (hasGenericTable) {
    return db
      .query<IndexRow, SqlNamedParams>(
        'SELECT filePath, startLine, symbolKind, language FROM source_symbol_index WHERE symbolName = $name AND language = $language',
      )
      .all({ $name: symbolName, $language: language })
  }

  if (language === 'csharp') {
    return db
      .query<
        { filePath: string; startLine: number; typeKind: string },
        SqlNamedParams
      >('SELECT filePath, startLine, typeKind FROM csharp_index WHERE typeName = $name')
      .all({ $name: symbolName })
      .map(row => ({
        filePath: row.filePath,
        startLine: row.startLine,
        symbolKind: row.typeKind,
        language,
      }))
  }

  return []
}

function extractNamedMembers(
  lines: string[],
  typeStartLine: number,
  typeLineCount: number,
  memberName: string,
): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const memberPattern = new RegExp(`\\b${escapeRegExp(memberName)}\\s*\\(`)
  const typeEndLine = typeStartLine + typeLineCount
  let depth = 0

  for (let index = typeStartLine; index < typeEndLine; index++) {
    const line = lines[index]
    const trimmed = line.trim()

    if (
      index > typeStartLine &&
      depth === 1 &&
      trimmed &&
      !trimmed.startsWith('//') &&
      memberPattern.test(line)
    ) {
      blocks.push(extractScopedBlock(lines, index))
    }

    depth += countBraceDelta(line)
  }

  return blocks
}

function extractScopedBlock(lines: string[], startLine: number): CodeBlock {
  const buffer: string[] = []
  let braceCount = 0
  let foundBrace = false

  for (let index = startLine; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.trim()

    buffer.push(line)
    braceCount += countBraceDelta(line)

    if (line.includes('{')) {
      foundBrace = true
    }

    if (foundBrace && braceCount === 0) {
      break
    }

    if (!foundBrace && trimmed.endsWith(';')) {
      break
    }
  }

  return {
    startLine,
    code: buffer.join('\n'),
    lineCount: buffer.length,
  }
}

function dedentCode(code: string): string {
  const lines = code.split('\n')
  let commonIndent: string | null = null

  for (const line of lines) {
    if (!line.trim()) continue

    const indent = line.match(/^\s*/)?.[0] ?? ''

    if (commonIndent === null) {
      commonIndent = indent
      continue
    }

    while (commonIndent && !indent.startsWith(commonIndent)) {
      commonIndent = commonIndent.slice(0, -1)
    }
  }

  if (!commonIndent) {
    return code
  }

  return lines
    .map(line => (line.startsWith(commonIndent) ? line.slice(commonIndent.length) : line))
    .join('\n')
}

function countBraceDelta(line: string): number {
  let delta = 0

  for (const char of line) {
    if (char === '{') delta += 1
    if (char === '}') delta -= 1
  }

  return delta
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function generateSignature(code: string): string {
  const lines = code.split('\n')
  const output: string[] = []
  let depth = 0

  for (const line of lines) {
    let currentLineDepthChange = 0
    for (const char of line) {
      if (char === '{') currentLineDepthChange++
      if (char === '}') currentLineDepthChange--
    }

    if (depth <= 1) {
      if (depth === 1 && currentLineDepthChange > 0) {
        output.push(line)
        if (!line.includes('}')) {
          output.push('    // ... implementation hidden ...')
        }
      } else {
        output.push(line)
      }
    } else if (depth + currentLineDepthChange <= 1) {
      const indent = line.match(/^\s*/)?.[0] || ''
      output.push(`${indent}}`)
    }

    depth += currentLineDepthChange
  }

  return output.join('\n')
}

function getSourceIndexHealth(language: string, gameId?: string) {
  const db = getDb(gameId)

  const genericTable = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'source_symbol_index'",
    )
    .get()

  if (!genericTable) {
    if (language !== 'csharp') {
      return { available: false }
    }

    const legacyTable = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'csharp_index'",
      )
      .get()

    if (!legacyTable) {
      return { available: false }
    }

    const countRow = db
      .query<{ rowCount: number }, []>('SELECT COUNT(*) AS rowCount FROM csharp_index')
      .get()

    return { available: (countRow?.rowCount ?? 0) > 0 }
  }

  const countRow = db
    .query<{ rowCount: number }, SqlNamedParams>(
      'SELECT COUNT(*) AS rowCount FROM source_symbol_index WHERE language = $language',
    )
    .get({ $language: language })

  return {
    available: (countRow?.rowCount ?? 0) > 0,
  }
}
