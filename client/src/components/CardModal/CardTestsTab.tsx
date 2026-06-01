import type { Card } from '../../types'

interface Props {
  card: Card
  projectId: number
}

// TODO: Extract test case management, test runs, AI generation from old CardModal
// Should handle: test case CRUD with complex steps editor, run recording, status bulk updates
// Complex sub-components: AddTestCaseForm, RecordRunForm, TestCaseRow with expandable history
// Uses: api.getTestCases, api.getTestSuites, api.createTestCase, api.updateTestCase, etc.
export default function CardTestsTab({ card, projectId }: Props) {
  return (
    <div className="text-sm text-slate-500 p-4 border border-slate-200 rounded-lg bg-slate-50">
      <p>🧪 Tests tab (extracted from old CardModal)</p>
      <p className="text-xs mt-2">Card ID: {card.id} | Project: {projectId}</p>
      <p className="text-xs text-slate-400 mt-4">
        TODO: Implement test case table with expand/collapse, forms, AI generation<br />
        See CardModal.old.tsx lines ~97-500 for sub-components and logic<br />
        Most complex tab - extract StatusIcon, TPriBadge, TypeBadge, AddTestCaseForm, RecordRunForm, TestCaseRow
      </p>
    </div>
  )
}
