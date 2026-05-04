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

export function emitBoardEvent(event: BoardEvent): void {
  eventBus.emit('board', event)
}
