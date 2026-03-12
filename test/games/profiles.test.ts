import { describe, expect, test } from 'bun:test'
import {
  getActiveGameAdapter,
  getGameAdapter,
  listGameAdapters,
  requireActiveGameCommand,
  supportsGameCommand,
} from '../../src/profiles'

describe('profiles', () => {
  test('lists built-in adapters', () => {
    const adapters = listGameAdapters()
    expect(adapters.length).toBeGreaterThan(1)
    expect(adapters.some(adapter => adapter.profile.id === 'rimworld')).toBe(true)
    expect(adapters.some(adapter => adapter.profile.id === 'generic-source')).toBe(true)
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

  test('source-only adapter skips object commands and keeps symbol commands', () => {
    const adapter = getGameAdapter('generic-source')!
    expect(supportsGameCommand(adapter, 'importObjects')).toBe(false)
    expect(supportsGameCommand(adapter, 'indexObjects')).toBe(false)
    expect(supportsGameCommand(adapter, 'importSymbols')).toBe(true)
    expect(supportsGameCommand(adapter, 'indexSymbols')).toBe(true)
  })
})
