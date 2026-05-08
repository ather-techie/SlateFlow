import { EventEmitter } from 'node:events'

export const eventBus = new EventEmitter()
eventBus.setMaxListeners(200)

export type BoardEvent =
  | { type: 'card:created'; projectId: number; data: unknown }
  | { type: 'card:updated'; projectId: number; data: unknown }
  | { type: 'card:moved';   projectId: number; data: unknown }
  | { type: 'card:deleted'; projectId: number; data: unknown }
  | { type: 'epic:updated'; projectId: number; data: unknown }
  | { type: 'notification'; userId: number;    data: unknown }
  | { type: 'retro:item:created'; projectId: number; data: unknown }
  | { type: 'retro:item:updated'; projectId: number; data: unknown }
  | { type: 'retro:item:deleted'; projectId: number; data: unknown }
  | { type: 'calendar:entry:created'; projectId: number | null; data: unknown }
  | { type: 'calendar:entry:updated'; projectId: number | null; data: unknown }
  | { type: 'calendar:entry:deleted'; projectId: number | null; data: unknown }

export function emitBoardEvent(event: BoardEvent): void {
  eventBus.emit('board', event)
}
