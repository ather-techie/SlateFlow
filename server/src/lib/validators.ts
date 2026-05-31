import { z } from 'zod'

// Validate that a date string represents a valid calendar date
function isValidDate(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  // Check if the date components match (accounts for invalid dates like Feb 30)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

// Date format: YYYY-MM-DD with semantic validation (not just regex)
export const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid date format, must be YYYY-MM-DD')
  .refine(isValidDate, 'invalid date — day does not exist for the given month/year')

// Optional nullable date
export const optionalDateSchema = dateSchema.nullable().optional()
