export interface AuthUser {
  id: number
  email: string
  display_name: string
  role: 'super_admin' | 'global_reader'
  email_notifications?: boolean
  country?: string | null
  state?: string | null
  city?: string | null
  home_country?: string | null
  home_state?: string | null
  home_city?: string | null
  timezone?: string | null
  job_title?: string | null
  department?: string | null
  phone?: string | null
  gender?: string | null
  reporting_manager_id?: number | null
  reporting_manager?: { id: number; display_name: string } | null
  project_access: ProjectAccessEntry[]
}

export interface User {
  id: number
  email: string
  display_name: string
  role: 'super_admin' | 'global_reader'
  is_active: number
  created_at: string
  skills?: string[]
  country?: string | null
  state?: string | null
  city?: string | null
  home_country?: string | null
  home_state?: string | null
  home_city?: string | null
  timezone?: string | null
  job_title?: string | null
  department?: string | null
  phone?: string | null
  gender?: string | null
  reporting_manager_id?: number | null
  reporting_manager?: { id: number; display_name: string } | null
}

export interface ProjectAccessEntry {
  id: number
  user_id: number
  project_id: number
  role: 'project_admin' | 'contributor' | 'reader'
  granted_by: number | null
  created_at: string
  display_name?: string
  email?: string
  skills?: string[]
  capacity?: number | null
}

export interface Notification {
  id: number
  user_id: number
  type: 'mention' | 'board_update' | 'assignment'
  entity_type: string
  entity_id: number
  message: string
  is_read: number
  created_at: string
}
