import { describe, expect, test } from 'bun:test'
import {
  getDefaultBuildConfigPath,
  getGameObjectBuildConfigs,
} from '../../src/utils/build-config'
import { root } from '../../src/utils/env'
import { join } from 'path'

describe('build-config', () => {
  test('uses project-local config path by default', () => {
    expect(getDefaultBuildConfigPath()).toBe(join(root, 'rimsage.config.local.json'))
  })

  test('normalizes configured JSON object importers', () => {
    const configs = getGameObjectBuildConfigs(
      {
        objects: [
          {
            id: 'content',
            kind: 'jsonFiles',
            path: '/games/cultist/StreamingAssets',
            importGlob: '**/*.json',
          },
        ],
      },
      'cultist-simulator',
    )

    expect(configs).toEqual([
      {
        id: 'content',
        model: 'content',
        kind: 'jsonFiles',
        path: '/games/cultist/StreamingAssets',
        importGlob: '**/*.json',
      },
    ])
  })
})
