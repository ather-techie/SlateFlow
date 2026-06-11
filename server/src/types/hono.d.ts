// The import makes this file a module, so `declare module` AUGMENTS hono's
// types instead of replacing them (an ambient declaration would hide every
// real export — `Module '"hono"' has no exported member 'Hono'`).
import 'hono'

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
