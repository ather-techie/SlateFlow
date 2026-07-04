export interface Comment {
  id: number
  card_id: number
  author: string
  author_id: number | null
  body: string
  created_at: string
}

export interface Label {
  id: number
  project_id: number
  name: string
  color: string
}

export interface ActivityLog {
  id: number
  card_id: number
  action: string
  meta: string
  created_at: string
}

export interface ActivityItem {
  id: number
  card_id: number
  card_title: string
  project_id: number
  project_name: string
  action: string
  meta: string
  created_at: string
}

export interface CardLink {
  id: number
  card_id: number
  provider: 'github' | 'gitlab'
  type: 'pr' | 'mr' | 'commit' | 'issue'
  repo_url: string
  number: number | null
  sha: string | null
  title: string
  url: string
  state: 'open' | 'closed' | 'merged'
  merged_at: string | null
  created_by: number | null
  created_at: string
}
