import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SharedEventSource } from './useServerSentEvents'

describe('SharedEventSource', () => {
  beforeEach(() => {
    // Mock EventSource to avoid real network calls
    vi.stubGlobal(
      'EventSource',
      vi.fn(() => ({
        addEventListener: vi.fn(),
        close: vi.fn(),
        onerror: null,
      }))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('getInstance returns a SharedEventSource instance', () => {
    const instance = SharedEventSource.getInstance()
    expect(instance).toBeInstanceOf(SharedEventSource)
  })

  it('subscribe returns an unsubscribe function', () => {
    const instance = SharedEventSource.getInstance()
    const listener = vi.fn()
    const unsubscribe = instance.subscribe('card:created', listener)

    expect(typeof unsubscribe).toBe('function')
  })

  it('supports multiple subscriptions to different event types', () => {
    const instance = SharedEventSource.getInstance()
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    const unsub1 = instance.subscribe('card:created', listener1)
    const unsub2 = instance.subscribe('card:updated', listener2)

    expect(typeof unsub1).toBe('function')
    expect(typeof unsub2).toBe('function')
  })

  it('unsubscribe function can be called without error', () => {
    const instance = SharedEventSource.getInstance()
    const listener = vi.fn()
    const unsubscribe = instance.subscribe('test:event', listener)

    expect(() => unsubscribe()).not.toThrow()
  })

})
