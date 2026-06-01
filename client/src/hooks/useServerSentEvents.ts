import { useEffect, useRef } from 'react'

type EventListener = (data: any) => void

export class SharedEventSource {
  private static instance: SharedEventSource | null = null
  private es: EventSource | null = null
  private listeners: Map<string, Set<EventListener>> = new Map()

  private constructor() {
    this.connect()
  }

  static getInstance(): SharedEventSource {
    if (!SharedEventSource.instance) {
      SharedEventSource.instance = new SharedEventSource()
    }
    return SharedEventSource.instance
  }

  private connect() {
    this.es = new EventSource('/api/events', { withCredentials: true })
    this.es.onerror = () => {
      this.es?.close()
      this.es = null
      setTimeout(() => this.connect(), 5000)
    }
  }

  subscribe(eventType: string, listener: EventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
      this.setupListener(eventType)
    }

    this.listeners.get(eventType)!.add(listener)

    return () => {
      this.listeners.get(eventType)?.delete(listener)
      if (this.listeners.get(eventType)?.size === 0) {
        this.listeners.delete(eventType)
        if (this.listeners.size === 0) {
          this.close()
          SharedEventSource.instance = null
        }
      }
    }
  }

  private setupListener(eventType: string) {
    if (!this.es) return
    this.es.addEventListener(eventType, (e: MessageEvent) => {
      const data = JSON.parse(e.data)
      this.listeners.get(eventType)?.forEach(listener => listener(data))
    })
  }

  private close() {
    this.es?.close()
    this.es = null
  }
}

export function useServerSentEvents(eventType: string, listener: EventListener) {
  const listenerRef = useRef(listener)

  useEffect(() => {
    listenerRef.current = listener
  }, [listener])

  useEffect(() => {
    const sse = SharedEventSource.getInstance()
    const unsubscribe = sse.subscribe(eventType, (data) => {
      listenerRef.current(data)
    })
    return unsubscribe
  }, [eventType])
}
