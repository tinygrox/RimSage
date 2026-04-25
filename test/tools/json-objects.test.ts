import { describe, expect, test } from 'bun:test'
import { extractJsonObjects } from '../../src/profiles/shared/object-operations'
import { type NormalizedGameObjectBuildConfig } from '../../src/utils/build-config'

const config = {
  id: 'content',
  model: 'content',
  kind: 'jsonFiles',
  idFieldName: 'id',
  typeFieldName: 'type',
  displayFieldName: 'label',
} satisfies NormalizedGameObjectBuildConfig

describe('JSON object extraction', () => {
  test('indexes arrays grouped under top-level object keys', () => {
    const objects = extractJsonObjects(
      {
        elements: [
          {
            id: 'lantern',
            label: 'Lantern',
            aspects: {
              light: 1,
            },
          },
          {
            id: 'forge',
            type: 'aspect',
            label: 'Forge',
          },
        ],
        recipes: [
          {
            id: 'study',
            label: 'Study',
          },
        ],
      },
      config,
      'core/content.json',
    )

    expect(objects).toEqual([
      {
        objectId: 'lantern',
        objectType: 'elements',
        displayName: 'Lantern',
        payload: {
          id: 'lantern',
          label: 'Lantern',
          aspects: {
            light: 1,
          },
        },
      },
      {
        objectId: 'forge',
        objectType: 'aspect',
        displayName: 'Forge',
        payload: {
          id: 'forge',
          type: 'aspect',
          label: 'Forge',
        },
      },
      {
        objectId: 'study',
        objectType: 'recipes',
        displayName: 'Study',
        payload: {
          id: 'study',
          label: 'Study',
        },
      },
    ])
  })

  test('indexes a single root object', () => {
    const objects = extractJsonObjects(
      {
        id: 'legacy',
        label: 'Legacy',
      },
      config,
      'legacies.json',
    )

    expect(objects).toEqual([
      {
        objectId: 'legacy',
        objectType: 'legacies',
        displayName: 'Legacy',
        payload: {
          id: 'legacy',
          label: 'Legacy',
        },
      },
    ])
  })
})
