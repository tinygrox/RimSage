import { describe, expect, test } from 'bun:test'
import { getDefaultBuildConfigPath } from '../../src/utils/build-config'
import { root } from '../../src/utils/env'
import { join } from 'path'

describe('build-config', () => {
  test('uses project-local config path by default', () => {
    expect(getDefaultBuildConfigPath()).toBe(join(root, 'rimsage.config.local.json'))
  })
})
