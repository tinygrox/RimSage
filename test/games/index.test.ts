import { describe, expect, test } from 'bun:test'
import {
  ensureActiveGame,
  getActiveGameProfile,
  getGameProfile,
  getObjectModel,
  listGameProfiles,
} from '../../src/games'

describe('games', () => {
  test('lists built-in profiles', () => {
    const profiles = listGameProfiles()
    expect(profiles.length).toBeGreaterThan(1)
    expect(profiles.some(profile => profile.id === 'rimworld')).toBe(true)
    expect(profiles.some(profile => profile.id === 'generic-source')).toBe(true)
  })

  test('returns rimworld as the active default profile', () => {
    const profile = getActiveGameProfile()
    expect(profile.id).toBe('rimworld')
    expect(profile.symbolLanguages).toContain('csharp')
  })

  test('finds generic-source profile by id', () => {
    const profile = getGameProfile('GENERIC-SOURCE')
    expect(profile?.id).toBe('generic-source')
    expect(profile?.symbolLanguages).toEqual(
      expect.arrayContaining(['csharp', 'java', 'c', 'cpp']),
    )
  })

  test('resolves default object model for rimworld', () => {
    const profile = getGameProfile('rimworld')!
    expect(getObjectModel(profile)?.id).toBe('def')
  })

  test('returns no object model for source-only profile', () => {
    const profile = getGameProfile('generic-source')!
    expect(getObjectModel(profile)).toBeUndefined()
  })

  test('rejects mismatched game requests', () => {
    const result = ensureActiveGame('factorio')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.content[0].text).toContain("Requested game 'factorio' is not active")
    }
  })
})
