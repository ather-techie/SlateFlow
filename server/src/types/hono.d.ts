declare module 'hono' {
  interface ContextVariableMap {
    user: {
      id: number
      email: string
      display_name: string
      role: 'super_admin' | 'global_reader'
      is_active: number
    }
  }
}
