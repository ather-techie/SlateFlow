export type RetroCategory = 'went_well' | 'to_improve' | 'action'

export interface Retrospective {
  id: number
  sprint_id: number
  created_at: string
  updated_at: string
}

export interface RetroItem {
  id: number
  retrospective_id: number
  category: RetroCategory
  body: string
  position: number
  author_id: number | null
  created_at: string
  updated_at: string
}
