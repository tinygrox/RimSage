import { describe, expect, test } from 'bun:test'
import {
  getActiveGameAdapter,
  getGameAdapter,
  listGameAdapters,
  requireActiveGameCommand,
  supportsGameCommand,
} from '../../src/profiles'

describe('profiles', () => {
  test('lists configured adapters plus the active adapter', () => {
    const adapters = listGameAdapters()
    expect(adapters.length).toBeGreaterThan(0)
    expect(adapters.some(adapter => adapter.profile.id === 'rimworld')).toBe(true)
  })

  test('returns rimworld adapter by id', () => {
    expect(getGameAdapter('rimworld')?.profile.id).toBe('rimworld')
  })

  test('returns active adapter', () => {
    expect(getActiveGameAdapter().profile.id).toBe('rimworld')
  })

  test('exposes active object indexing command', () => {
    expect(typeof requireActiveGameCommand('indexObjects')).toBe('function')
  })

  test('source-oriented adapters skip object commands and keep symbol import', () => {
    const adapter = getGameAdapter('sts2')!
    expect(supportsGameCommand(adapter, 'importObjects')).toBe(false)
    expect(supportsGameCommand(adapter, 'indexObjects')).toBe(false)
    expect(supportsGameCommand(adapter, 'importSymbols')).toBe(true)
  })
})
