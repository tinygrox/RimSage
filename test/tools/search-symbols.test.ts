import { describe, expect, mock, test } from 'bun:test'
import * as realDbModule from '../../src/utils/db'

const originalDbModule = { ...realDbModule }

describe.serial('search-symbols', () => {
  test('searchSymbolsImpl searches symbol metadata and formats base types', async () => {
    mock.module('../../src/utils/db', () => ({
      ...originalDbModule,
      getDb: () =>
        ({
          query: (sql: string) => ({
            get: () => ({ count: 2 }),
            all: () => {
              if (sql.startsWith('PRAGMA')) {
                return [
                  { name: 'language' },
                  { name: 'symbolName' },
                  { name: 'symbolKind' },
                  { name: 'filePath' },
                  { name: 'startLine' },
                  { name: 'declaration' },
                  { name: 'namespaceName' },
                  { name: 'baseTypes' },
                ]
              }

              return [
                {
                  language: 'csharp',
                  symbolName: 'MockFirePower',
                  symbolKind: 'class',
                  filePath: 'MegaCrit.Sts2.Core.Models.Powers.Mocks/MockFirePower.cs',
                  startLine: 4,
                  declaration: 'public sealed class MockFirePower : PowerModel',
                  namespaceName: 'MegaCrit.Sts2.Core.Models.Powers.Mocks',
                  baseTypes: 'PowerModel',
                },
              ]
            },
          }),
        }) as any,
    }))

    try {
      const { searchSymbolsImpl } = await import('../../src/tools/search-symbols')
      const result = searchSymbolsImpl(
        'sts2',
        'Power',
        'csharp',
        'class',
        'PowerModel',
      )

      expect(result.total).toBe(2)
      expect(result.results[0].symbolName).toBe('MockFirePower')
      expect(result.results[0].baseTypes).toBe('PowerModel')
    } finally {
      mock.module('../../src/utils/db', () => originalDbModule)
    }
  })

  test('searchSymbolsImpl detects indexes that need rebuild for base type filters', async () => {
    mock.module('../../src/utils/db', () => ({
      ...originalDbModule,
      getDb: () =>
        ({
          query: (sql: string) => ({
            get: () => ({ count: 1 }),
            all: () =>
              sql.startsWith('PRAGMA')
                ? [
                    { name: 'language' },
                    { name: 'symbolName' },
                    { name: 'symbolKind' },
                    { name: 'filePath' },
                    { name: 'startLine' },
                  ]
                : [],
          }),
        }) as any,
    }))

    try {
      const { searchSymbolsImpl } = await import('../../src/tools/search-symbols')
      const result = searchSymbolsImpl('sts2', 'Power', 'csharp', 'class', 'PowerModel')

      expect(result.needsReindexForBaseType).toBe(true)
    } finally {
      mock.module('../../src/utils/db', () => originalDbModule)
    }
  })
})
