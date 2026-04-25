import { describe, expect, test } from 'bun:test'
import {
  getActiveGameProfile,
  getGameProfile,
  getObjectModel,
  listGameProfiles,
  resolveGame,
} from '../../src/games'

describe('games', () => {
  test('lists configured profiles plus the active profile', () => {
    const profiles = listGameProfiles()
    expect(profiles.length).toBeGreaterThan(0)
    expect(profiles.some(profile => profile.id === 'rimworld')).toBe(true)
  })

  test('returns rimworld as the active default profile', () => {
    const profile = getActiveGameProfile()
    expect(profile.id).toBe('rimworld')
  })

  test('normalizes dynamic profile ids', () => {
    const profile = getGameProfile('KSP')
    expect(profile.id).toBe('ksp')
  })

  test('resolves default object model for rimworld', () => {
    const profile = getGameProfile('rimworld')!
    expect(getObjectModel(profile)?.id).toBe('def')
  })

  test('exposes the KSP ConfigNode object model for ksp', () => {
    const profile = getGameProfile('ksp')!
    expect(getObjectModel(profile, 'ksp_config')?.id).toBe('ksp_config')
  })

  test('rejects unknown explicit game requests', () => {
    const result = resolveGame('factorio')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.content[0].text).toContain("Unknown game 'factorio'")
    }
  })
})
