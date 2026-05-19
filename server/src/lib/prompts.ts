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

export const PARSE_ITEM_USER_TEMPLATE = loadPrompt('parse-item.user.md')
