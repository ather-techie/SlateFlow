export interface VelocityEntry {
  sprint_id: number
  sprint_name: string
  status: string
  start_date: string
  end_date: string
  total_points: number
  completed_points: number
  total_stories: number
  completed_stories: number
}

export interface CycleTimeEntry {
  lane_id: number
  lane_name: string
  avg_days: number | null
  sample_size: number
}

export interface CapacityEntry {
  assignee: string
  story_count: number
  story_points: number
  capacity: number | null
  skills?: string[]
}

export interface AiUsageEntry {
  date: string
  input_tokens: number
  output_tokens: number
}
