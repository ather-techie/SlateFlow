declare module 'hono' {
  interface ContextVariableMap {
    user: {
      id: number
      email: string
      display_name: string
      role: 'super_admin' | 'member'
      is_active: number
    }
  }
}
