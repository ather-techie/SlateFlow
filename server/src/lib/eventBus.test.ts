import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { eventBus, emitBoardEvent } from './eventBus'

describe('eventBus', () => {
  it('is an instance of EventEmitter', () => {
    expect(eventBus).toBeInstanceOf(EventEmitter)
  })

  it('has maxListeners set to 200', () => {
    expect(eventBus.getMaxListeners()).toBe(200)
  })
})

describe('emitBoardEvent', () => {
  it('emits event on "board" channel', () => {
    const listener = expect.any(Function)
    let emittedEvent: any = null

    eventBus.on('board', (event) => {
      emittedEvent = event
    })

    const event = { type: 'card:created' as const, projectId: 1, data: {} }
    emitBoardEvent(event)

    expect(emittedEvent).toEqual(event)
    eventBus.removeAllListeners('board')
  })

  it('passes complete event object to listeners', () => {
    let receivedEvent: any = null

    eventBus.on('board', (event) => {
      receivedEvent = event
    })

    const cardEvent = {
      type: 'card:updated' as const,
      projectId: 42,
      data: { title: 'Updated Card' },
    }
    emitBoardEvent(cardEvent)

    expect(receivedEvent).toEqual(cardEvent)
    expect(receivedEvent.type).toBe('card:updated')
    expect(receivedEvent.projectId).toBe(42)
    expect(receivedEvent.data).toEqual({ title: 'Updated Card' })
    eventBus.removeAllListeners('board')
  })

  it('supports card:created events', () => {
    let event: any = null
    eventBus.on('board', (e) => {
      event = e
    })

    emitBoardEvent({ type: 'card:created', projectId: 1, data: {} })
    expect(event?.type).toBe('card:created')
    eventBus.removeAllListeners('board')
  })

  it('supports card:updated events', () => {
    let event: any = null
    eventBus.on('board', (e) => {
      event = e
    })

    emitBoardEvent({ type: 'card:updated', projectId: 2, data: {} })
    expect(event?.type).toBe('card:updated')
    eventBus.removeAllListeners('board')
  })

  it('supports card:moved events', () => {
    let event: any = null
    eventBus.on('board', (e) => {
      event = e
    })

    emitBoardEvent({ type: 'card:moved', projectId: 3, data: {} })
    expect(event?.type).toBe('card:moved')
    eventBus.removeAllListeners('board')
  })

  it('supports card:deleted events', () => {
    let event: any = null
    eventBus.on('board', (e) => {
      event = e
    })

    emitBoardEvent({ type: 'card:deleted', projectId: 4, data: {} })
    expect(event?.type).toBe('card:deleted')
    eventBus.removeAllListeners('board')
  })

  it('supports epic:updated events', () => {
    let event: any = null
    eventBus.on('board', (e) => {
      event = e
    })

    emitBoardEvent({ type: 'epic:updated', projectId: 5, data: {} })
    expect(event?.type).toBe('epic:updated')
    eventBus.removeAllListeners('board')
  })

  it('supports notification events with userId', () => {
    let event: any = null
    eventBus.on('board', (e) => {
      event = e
    })

    emitBoardEvent({ type: 'notification', userId: 10, data: {} })
    expect(event?.type).toBe('notification')
    expect(event?.userId).toBe(10)
    eventBus.removeAllListeners('board')
  })

  it('supports retro:item:created events', () => {
    let event: any = null
    eventBus.on('board', (e) => {
      event = e
    })

    emitBoardEvent({ type: 'retro:item:created', projectId: 6, data: {} })
    expect(event?.type).toBe('retro:item:created')
    eventBus.removeAllListeners('board')
  })

  it('supports retro:item:updated events', () => {
    let event: any = null
    eventBus.on('board', (e) => {
      event = e
    })

    emitBoardEvent({ type: 'retro:item:updated', projectId: 7, data: {} })
    expect(event?.type).toBe('retro:item:updated')
    eventBus.removeAllListeners('board')
  })

  it('supports retro:item:deleted events', () => {
    let event: any = null
    eventBus.on('board', (e) => {
      event = e
    })

    emitBoardEvent({ type: 'retro:item:deleted', projectId: 8, data: {} })
    expect(event?.type).toBe('retro:item:deleted')
    eventBus.removeAllListeners('board')
  })

  it('supports calendar:entry:created events with projectId', () => {
    let event: any = null
    eventBus.on('board', (e) => {
      event = e
    })

    emitBoardEvent({ type: 'calendar:entry:created', projectId: 9, data: {} })
    expect(event?.type).toBe('calendar:entry:created')
    expect(event?.projectId).toBe(9)
    eventBus.removeAllListeners('board')
  })

  it('supports calendar:entry:created events with null projectId', () => {
    let event: any = null
    eventBus.on('board', (e) => {
      event = e
    })

    emitBoardEvent({ type: 'calendar:entry:created', projectId: null, data: {} })
    expect(event?.type).toBe('calendar:entry:created')
    expect(event?.projectId).toBeNull()
    eventBus.removeAllListeners('board')
  })

  it('supports calendar:entry:updated events', () => {
    let event: any = null
    eventBus.on('board', (e) => {
      event = e
    })

    emitBoardEvent({ type: 'calendar:entry:updated', projectId: 10, data: {} })
    expect(event?.type).toBe('calendar:entry:updated')
    eventBus.removeAllListeners('board')
  })

  it('supports calendar:entry:deleted events', () => {
    let event: any = null
    eventBus.on('board', (e) => {
      event = e
    })

    emitBoardEvent({ type: 'calendar:entry:deleted', projectId: 11, data: {} })
    expect(event?.type).toBe('calendar:entry:deleted')
    eventBus.removeAllListeners('board')
  })

  it('multiple listeners receive the same event', () => {
    const events1: any[] = []
    const events2: any[] = []

    const listener1 = (e: any) => events1.push(e)
    const listener2 = (e: any) => events2.push(e)

    eventBus.on('board', listener1)
    eventBus.on('board', listener2)

    const testEvent = { type: 'card:created' as const, projectId: 1, data: {} }
    emitBoardEvent(testEvent)

    expect(events1).toHaveLength(1)
    expect(events2).toHaveLength(1)
    expect(events1[0]).toEqual(testEvent)
    expect(events2[0]).toEqual(testEvent)

    eventBus.removeListener('board', listener1)
    eventBus.removeListener('board', listener2)
  })

  it('passes complex data objects', () => {
    let receivedEvent: any = null

    eventBus.on('board', (event) => {
      receivedEvent = event
    })

    const complexData = {
      nested: {
        array: [1, 2, 3],
        object: { key: 'value' },
      },
    }

    emitBoardEvent({
      type: 'card:updated',
      projectId: 99,
      data: complexData,
    })

    expect(receivedEvent.data).toEqual(complexData)
    eventBus.removeAllListeners('board')
  })
})
