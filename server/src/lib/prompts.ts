import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const promptsDir = join(__dirname, '..', 'prompts')

function loadPrompt(filename: string): string {
  const path = join(promptsDir, filename)
  return readFileSync(path, 'utf-8')
}

export function interpolate(template: string, vars: Record<string, string | null | undefined>): string {
  return template
    .split('\n')
    .map((line) => {
      let result = line
      for (const [key, value] of Object.entries(vars)) {
        result = result.replace(`{{${key}}}`, value ?? '')
      }
      return result
    })
    .filter((line) => {
      const trimmed = line.trim()
      // Filter out empty lines or lines that are just a label with no value (e.g. "Description: ")
      return trimmed !== '' && !trimmed.match(/:\s*$/)
    })
    .join('\n')
}

export const CARD_SUMMARIZE_SYSTEM = loadPrompt('card-summarize.system.md')
export const CARD_SUMMARIZE_USER_TEMPLATE = loadPrompt('card-summarize.user.md')

export const GENERATE_TEST_CASES_SYSTEM = loadPrompt('generate-test-cases.system.md')
export const GENERATE_TEST_CASES_USER_TEMPLATE = loadPrompt('generate-test-cases.user.md')

export const GENERATE_STORIES_SYSTEM = loadPrompt('generate-stories.system.md')
export const GENERATE_STORIES_USER_TEMPLATE = loadPrompt('generate-stories.user.md')

export const PARSE_ITEM_USER_TEMPLATE = loadPrompt('parse-item.user.md')

export const SPRINT_DIGEST_SYSTEM = loadPrompt('sprint-digest.system.md')
export const SPRINT_DIGEST_USER_TEMPLATE = loadPrompt('sprint-digest.user.md')

export const RETRO_SYNTHESIZE_SYSTEM = loadPrompt('retro-synthesize.system.md')
export const RETRO_SYNTHESIZE_USER_TEMPLATE = loadPrompt('retro-synthesize.user.md')

export const GENERATE_ACCEPTANCE_CRITERIA_SYSTEM = loadPrompt('generate-acceptance-criteria.system.md')
export const GENERATE_ACCEPTANCE_CRITERIA_USER_TEMPLATE = loadPrompt('generate-acceptance-criteria.user.md')

export const STANDUP_DIGEST_SYSTEM = loadPrompt('standup-digest.system.md')
export const STANDUP_DIGEST_USER_TEMPLATE = loadPrompt('standup-digest.user.md')

export const SUGGEST_ASSIGNEE_SYSTEM = loadPrompt('suggest-assignee.system.md')
export const SUGGEST_ASSIGNEE_USER_TEMPLATE = loadPrompt('suggest-assignee.user.md')

export const PLAN_SPRINT_SYSTEM = loadPrompt('plan-sprint.system.md')
export const PLAN_SPRINT_USER_TEMPLATE = loadPrompt('plan-sprint.user.md')

export const SUGGEST_ESTIMATE_SYSTEM_TEMPLATE = loadPrompt('suggest-estimate.system.md')
export const SUGGEST_ESTIMATE_USER_TEMPLATE = loadPrompt('suggest-estimate.user.md')

export const GROOM_BACKLOG_SYSTEM = loadPrompt('groom-backlog.system.md')
export const GROOM_BACKLOG_USER_TEMPLATE = loadPrompt('groom-backlog.user.md')

export const SUMMARIZE_COMMENTS_SYSTEM = loadPrompt('summarize-comments.system.md')
export const SUMMARIZE_COMMENTS_USER_TEMPLATE = loadPrompt('summarize-comments.user.md')

export const PROJECT_CHAT_SYSTEM_TEMPLATE = loadPrompt('project-chat.system.md')
