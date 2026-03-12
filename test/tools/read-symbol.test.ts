import { describe, expect, mock, test } from 'bun:test'
import { textResponse } from '../../src/utils/mcp-response'
import * as realReadSourceSymbolModule from '../../src/tools/read-source-symbol'

const originalReadSourceSymbolModule = { ...realReadSourceSymbolModule }

describe.serial('generic symbol tool', () => {
  test('readSymbol delegates to generic source symbol reader', async () => {
    mock.module('../../src/tools/read-source-symbol', () => ({
      ...originalReadSourceSymbolModule,
      readSourceSymbol: async () => textResponse('// delegated source symbol'),
    }))

    try {
      const { readSymbol } = await import('../../src/tools/read-symbol')
      const result = await readSymbol('ThingDef')
      expect(result.content[0].text).toContain('// delegated source symbol')
    } finally {
      mock.module('../../src/tools/read-source-symbol', () => originalReadSourceSymbolModule)
    }
  })

  test('readSymbol rejects unsupported languages', async () => {
    const { readSymbol } = await import('../../src/tools/read-symbol')
    const result = await readSymbol('ThingDef', undefined, 'lua')
    expect(result.content[0].text).toContain("does not support symbol language 'lua'")
  })
})
