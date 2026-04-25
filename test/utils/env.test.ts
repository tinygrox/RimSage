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
  getGameObjectModelPath,
  getGameObjectsPath,
  getGameSourcePath,
  getGameVersionPath,
} from '../../src/utils/env'
import { join } from 'path'
import { existsSync } from 'node:fs'

describe('env', () => {
  test('root should point to project directory', () => {
    expect(existsSync(join(root, 'package.json'))).toBe(true)
  })

  test('derived paths should point at the active game namespace by default', () => {
    expect(versionPath).toBe(join(root, 'dist', 'games', 'rimworld', 'Version.txt'))
    expect(defsPath).toBe(join(root, 'dist', 'games', 'rimworld', 'assets', 'Defs'))
    expect(sourcePath).toBe(join(root, 'dist', 'games', 'rimworld', 'assets', 'Source'))
    expect(indexDbPath).toBe(join(root, 'dist', 'games', 'rimworld', 'index.db'))
  })

  test('activeGameId should default to rimworld', () => {
    expect(activeGameId).toBe('rimworld')
  })

  test('rimworld path helpers use the same namespaced layout as other games', () => {
    expect(getGameDistPath('rimworld')).toBe(join(root, 'dist', 'games', 'rimworld'))
    expect(getGameAssetsPath('rimworld')).toBe(join(root, 'dist', 'games', 'rimworld', 'assets'))
    expect(getGameVersionPath('rimworld')).toBe(join(root, 'dist', 'games', 'rimworld', 'Version.txt'))
    expect(getGameDefsPath('rimworld')).toBe(join(root, 'dist', 'games', 'rimworld', 'assets', 'Defs'))
    expect(getGameSourcePath('rimworld')).toBe(join(root, 'dist', 'games', 'rimworld', 'assets', 'Source'))
    expect(getGameIndexDbPath('rimworld')).toBe(join(root, 'dist', 'games', 'rimworld', 'index.db'))
  })

  test('non-rimworld paths are namespaced under dist/games', () => {
    expect(getGameDistPath('factorio')).toBe(join(root, 'dist', 'games', 'factorio'))
    expect(getGameAssetsPath('factorio')).toBe(join(root, 'dist', 'games', 'factorio', 'assets'))
    expect(getGameVersionPath('factorio')).toBe(join(root, 'dist', 'games', 'factorio', 'Version.txt'))
    expect(getGameIndexDbPath('factorio')).toBe(join(root, 'dist', 'games', 'factorio', 'index.db'))
  })

  test('object model paths are namespaced by model id', () => {
    expect(getGameObjectsPath('ksp')).toBe(join(root, 'dist', 'games', 'ksp', 'assets', 'Objects'))
    expect(getGameObjectModelPath('ksp', 'ksp_config')).toBe(
      join(root, 'dist', 'games', 'ksp', 'assets', 'Objects', 'ksp_config'),
    )
  })
})
