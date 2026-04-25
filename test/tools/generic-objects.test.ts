import { describe, expect, mock, test } from 'bun:test'
import { textResponse } from '../../src/utils/mcp-response'
import * as realDbModule from '../../src/utils/db'

const originalDbModule = { ...realDbModule }

describe.serial('generic object tools', () => {
  test('searchObjects formats generic object search results', async () => {
    mock.module('../../src/utils/db', () => ({
      ...originalDbModule,
      getDb: () =>
        ({
          query: (sql: string) => ({
            get: () => ({ count: 2 }),
            all: () =>
              sql.includes('FROM objects')
                ? [
                    {
                      objectId: 'Gun_Revolver',
                      objectType: 'ThingDef',
                      displayName: 'revolver',
                      objectModel: 'def',
                    },
                  ]
                : [],
          }),
        }) as any,
    }))

    try {
      const { searchObjects } = await import('../../src/tools/search-objects')
      const result = searchObjects('Gun_Revolver', 'def')
      expect(result.content[0].text).toContain('[ThingDef] Gun_Revolver')
    } finally {
      mock.module('../../src/utils/db', () => originalDbModule)
    }
  })

  test('searchObjects rejects unsupported model ids', async () => {
    const { searchObjects } = await import('../../src/tools/search-objects')
    const result = searchObjects('anything', 'prototype')
    expect(result.content[0].text).toContain("does not support object model 'prototype'")
  })

  test('getObjectDetails renders XML payloads from generic object rows', async () => {
    mock.module('../../src/utils/db', () => ({
      ...originalDbModule,
      getDb: () =>
        ({
          query: () => ({
            all: () => [
              {
                objectType: 'ThingDef',
                payloadFormat: 'xml',
                payload: JSON.stringify({ objectId: 'Gun_Revolver', displayName: 'revolver' }),
              },
            ],
          }),
        }) as any,
    }))

    try {
      const { getObjectDetails } = await import('../../src/tools/get-object-details')
      const result = getObjectDetails('Gun_Revolver', 'def')
      expect(result.content[0].text).toContain('<ThingDef>')
      expect(result.content[0].text).toContain('<objectId>Gun_Revolver</objectId>')
    } finally {
      mock.module('../../src/utils/db', () => originalDbModule)
    }
  })

  test('getObjectDetails renders JSON payloads from generic object rows', async () => {
    mock.module('../../src/utils/db', () => ({
      ...originalDbModule,
      getDb: () =>
        ({
          query: () => ({
            all: () => [
              {
                objectType: 'elements',
                payloadFormat: 'json',
                payload: JSON.stringify({ id: 'lantern', label: 'Lantern' }),
              },
            ],
          }),
        }) as any,
    }))

    try {
      const { getObjectDetails } = await import('../../src/tools/get-object-details')
      const result = getObjectDetails('lantern', 'def')
      expect(result.content[0].text).toContain('"id": "lantern"')
      expect(result.content[0].text).toContain('"label": "Lantern"')
    } finally {
      mock.module('../../src/utils/db', () => originalDbModule)
    }
  })
})
