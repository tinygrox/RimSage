import { expect, test, describe } from 'bun:test'
import {
  root,
  versionPath,
  defsPath,
  sourcePath,
  indexDbPath,
  activeGameId,
  getGameAssetsPath,
  getGameDefsPath,
  getGameDistPath,
  getGameIndexDbPath,
  getGameSourcePath,
  getGameVersionPath,
} from '../../src/utils/env'
import { join } from 'path'
import { existsSync } from 'node:fs'

describe('env', () => {
  test('root should point to project directory', () => {
    expect(existsSync(join(root, 'package.json'))).toBe(true)
  })

  test('derived paths should match legacy rimworld contract by default', () => {
    expect(versionPath).toBe(join(root, 'dist', 'Version.txt'))
    expect(defsPath).toBe(join(root, 'dist', 'assets', 'Defs'))
    expect(sourcePath).toBe(join(root, 'dist', 'assets', 'Source'))
    expect(indexDbPath).toBe(join(root, 'dist', 'index.db'))
  })

  test('activeGameId should default to rimworld', () => {
    expect(activeGameId).toBe('rimworld')
  })

  test('rimworld path helpers preserve legacy storage layout', () => {
    expect(getGameDistPath('rimworld')).toBe(join(root, 'dist'))
    expect(getGameAssetsPath('rimworld')).toBe(join(root, 'dist', 'assets'))
    expect(getGameVersionPath('rimworld')).toBe(join(root, 'dist', 'Version.txt'))
    expect(getGameDefsPath('rimworld')).toBe(join(root, 'dist', 'assets', 'Defs'))
    expect(getGameSourcePath('rimworld')).toBe(join(root, 'dist', 'assets', 'Source'))
    expect(getGameIndexDbPath('rimworld')).toBe(join(root, 'dist', 'index.db'))
  })

  test('non-rimworld paths are namespaced under dist/games', () => {
    expect(getGameDistPath('factorio')).toBe(join(root, 'dist', 'games', 'factorio'))
    expect(getGameAssetsPath('factorio')).toBe(join(root, 'dist', 'games', 'factorio', 'assets'))
    expect(getGameVersionPath('factorio')).toBe(join(root, 'dist', 'games', 'factorio', 'Version.txt'))
    expect(getGameIndexDbPath('factorio')).toBe(join(root, 'dist', 'games', 'factorio', 'index.db'))
  })
})
