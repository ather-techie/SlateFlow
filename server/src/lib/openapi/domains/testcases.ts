// OpenAPI spec for test case management endpoints.

export const testcasesPaths = {
  '/api/projects/{projectId}/test-suites': {
    get: {
      summary: 'List test suites for a project',
      description: 'Returns all test suites belonging to the given project, ordered by creation time. Test suites are optional grouping containers; test cases that do not belong to any suite have `suite_id = null`.',
      tags: ['Test Suites'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'projectId', in: 'path', required: true, description: 'ID of the project', schema: { type: 'integer', example: 1 } },
      ],
      responses: {
        200: {
          description: 'Array of test suites wrapped in the standard envelope',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Envelope' },
              example: {
                data: [
                  { id: 1, project_id: 1, name: 'Auth flows', description: 'Login, logout, and token refresh scenarios', created_at: '2025-01-15T09:00:00Z' },
                  { id: 2, project_id: 1, name: 'Checkout', description: null, created_at: '2025-01-16T10:30:00Z' },
                ],
                error: null,
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Project not found', content: { 'application/json': { example: { data: null, error: 'project not found' } } } },
      },
    },
    post: {
      summary: 'Create a test suite',
      description: 'Creates a new test suite under the given project. The suite can immediately be referenced by new test cases via `suite_id`.',
      tags: ['Test Suites'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'projectId', in: 'path', required: true, description: 'ID of the project', schema: { type: 'integer', example: 1 } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { '$ref': '#/components/schemas/SuiteCreate' },
            example: { name: 'Auth flows', description: 'Login, logout, and token refresh scenarios' },
          },
        },
      },
      responses: {
        201: {
          description: 'Newly created test suite',
          content: {
            'application/json': {
              example: { data: { id: 1, project_id: 1, name: 'Auth flows', description: 'Login, logout, and token refresh scenarios', created_at: '2025-01-15T09:00:00Z' }, error: null },
            },
          },
        },
        400: { description: 'Invalid JSON body', content: { 'application/json': { example: { data: null, error: 'invalid JSON' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Project not found', content: { 'application/json': { example: { data: null, error: 'project not found' } } } },
        422: { description: 'Validation error — `name` is required', content: { 'application/json': { example: { data: null, error: 'name: name is required' } } } },
      },
    },
  },

  '/api/test-suites/{id}': {
    patch: {
      summary: 'Update a test suite',
      description: 'Partially updates a test suite\'s `name` and/or `description`. Provide only the fields you want to change.',
      tags: ['Test Suites'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'ID of the test suite', schema: { type: 'integer', example: 1 } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { '$ref': '#/components/schemas/SuiteUpdate' },
            example: { name: 'Auth & session flows', description: 'Extended to include session expiry tests' },
          },
        },
      },
      responses: {
        200: {
          description: 'Updated test suite',
          content: {
            'application/json': {
              example: { data: { id: 1, project_id: 1, name: 'Auth & session flows', description: 'Extended to include session expiry tests', created_at: '2025-01-15T09:00:00Z' }, error: null },
            },
          },
        },
        400: { description: 'No fields provided or invalid JSON', content: { 'application/json': { example: { data: null, error: 'no fields to update' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Test suite not found', content: { 'application/json': { example: { data: null, error: 'test suite not found' } } } },
      },
    },
    delete: {
      summary: 'Delete a test suite',
      description: 'Deletes the suite and sets `suite_id = null` on all its test cases. The test cases themselves are **not** deleted.',
      tags: ['Test Suites'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'ID of the test suite', schema: { type: 'integer', example: 1 } },
      ],
      responses: {
        200: { description: 'Deleted successfully', content: { 'application/json': { example: { data: { id: 1 }, error: null } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Test suite not found', content: { 'application/json': { example: { data: null, error: 'test suite not found' } } } },
      },
    },
  },

  '/api/cards/{cardId}/test-cases': {
    get: {
      summary: 'List test cases for a card',
      description: 'Returns all test cases linked to the card, each with its most recent run attached as `latest_run`. Also returns a `summary` object with counts by status so callers can render a progress indicator without iterating the full list.',
      tags: ['Test Cases'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'cardId', in: 'path', required: true, description: 'ID of the card', schema: { type: 'integer', example: 42 } },
      ],
      responses: {
        200: {
          description: 'Test cases with summary',
          content: {
            'application/json': {
              example: {
                data: {
                  cases: [
                    {
                      id: 1, card_id: 42, project_id: 1, suite_id: null,
                      title: 'User can log in with valid credentials',
                      description: null, status: 'passed', priority: 'critical',
                      test_type: 'manual', steps: [
                        { step: 'Open /login', expected: 'Login form is visible' },
                        { step: 'Enter valid email and password', expected: 'Fields accept input' },
                        { step: 'Click "Sign in"', expected: 'Redirect to dashboard' },
                      ],
                      preconditions: 'Test account exists', expected_result: 'User lands on dashboard',
                      assigned_to: 'qa@example.com', position: 0,
                      created_at: '2025-01-15T09:00:00Z', updated_at: '2025-01-16T14:00:00Z',
                      latest_run: { id: 5, status: 'passed', notes: null, run_by: 'qa@example.com', run_at: '2025-01-16T14:00:00Z' },
                    },
                  ],
                  summary: { total: 4, passed: 1, failed: 1, untested: 2, blocked: 0, skipped: 0 },
                },
                error: null,
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Card not found', content: { 'application/json': { example: { data: null, error: 'card not found' } } } },
      },
    },
    post: {
      summary: 'Create a test case linked to a card',
      description: 'Creates a new test case attached to the given card. The test case is appended after existing ones (highest position). `steps` is an ordered array of `{ step, expected }` objects stored as JSON. `priority` defaults to `"medium"`, `test_type` defaults to `"manual"`, and `status` starts as `"untested"`.',
      tags: ['Test Cases'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'cardId', in: 'path', required: true, description: 'ID of the card', schema: { type: 'integer', example: 42 } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { '$ref': '#/components/schemas/TestCaseCreate' },
            example: {
              title: 'User can log in with valid credentials',
              description: 'Covers the happy-path login flow via the web UI',
              suite_id: 1,
              priority: 'critical',
              test_type: 'manual',
              steps: [
                { step: 'Open /login', expected: 'Login form is visible' },
                { step: 'Enter valid email and password', expected: 'Fields accept input' },
                { step: 'Click "Sign in"', expected: 'Redirect to dashboard' },
              ],
              preconditions: 'A test account exists with role "user"',
              expected_result: 'User is authenticated and lands on /dashboard',
              assigned_to: 'qa@example.com',
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Newly created test case',
          content: {
            'application/json': {
              example: {
                data: {
                  id: 7, card_id: 42, project_id: 1, suite_id: 1,
                  title: 'User can log in with valid credentials', description: 'Covers the happy-path login flow via the web UI',
                  status: 'untested', priority: 'critical', test_type: 'manual',
                  steps: [
                    { step: 'Open /login', expected: 'Login form is visible' },
                    { step: 'Enter valid email and password', expected: 'Fields accept input' },
                    { step: 'Click "Sign in"', expected: 'Redirect to dashboard' },
                  ],
                  preconditions: 'A test account exists with role "user"',
                  expected_result: 'User is authenticated and lands on /dashboard',
                  assigned_to: 'qa@example.com', position: 2,
                  created_at: '2025-01-17T08:00:00Z', updated_at: '2025-01-17T08:00:00Z',
                },
                error: null,
              },
            },
          },
        },
        400: { description: 'Invalid JSON or cannot determine project for card', content: { 'application/json': { example: { data: null, error: 'invalid JSON' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Card or suite not found', content: { 'application/json': { example: { data: null, error: 'card not found' } } } },
        422: { description: 'Validation error', content: { 'application/json': { example: { data: null, error: 'title: title is required' } } } },
      },
    },
  },

  '/api/cards/{cardId}/test-cases/reorder': {
    post: {
      summary: 'Reorder test cases for a card',
      description: 'Accepts a complete ordered list of test case IDs belonging to the card and persists their new `position` values. All IDs must belong to the specified card — any foreign ID returns a 400.',
      tags: ['Test Cases'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'cardId', in: 'path', required: true, description: 'ID of the card', schema: { type: 'integer', example: 42 } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object', required: ['ordered_ids'],
              properties: { ordered_ids: { type: 'array', items: { type: 'integer' }, minItems: 1 } },
            },
            example: { ordered_ids: [3, 1, 2] },
          },
        },
      },
      responses: {
        200: {
          description: 'Test cases in new order',
          content: { 'application/json': { example: { data: [{ id: 3, position: 0 }, { id: 1, position: 1 }, { id: 2, position: 2 }], error: null } } },
        },
        400: { description: 'One or more IDs do not belong to this card, or invalid JSON', content: { 'application/json': { example: { data: null, error: 'one or more test case ids do not belong to this card' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Card not found', content: { 'application/json': { example: { data: null, error: 'card not found' } } } },
        422: { description: 'Validation error', content: { 'application/json': { example: { data: null, error: 'ordered_ids: Required' } } } },
      },
    },
  },

  '/api/cards/{cardId}/test-cases/bulk-status': {
    patch: {
      summary: 'Bulk-update status on multiple test cases',
      description: 'Sets all specified test cases to the same `status` in a single transaction. Useful for marking an entire suite as "skipped" before a regression run, or resetting a batch to "untested". All `ids` must belong to the given card.',
      tags: ['Test Cases'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'cardId', in: 'path', required: true, description: 'ID of the card', schema: { type: 'integer', example: 42 } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object', required: ['ids', 'status'],
              properties: {
                ids: { type: 'array', items: { type: 'integer' }, minItems: 1, example: [1, 2, 3] },
                status: { '$ref': '#/components/schemas/TestStatus' },
              },
            },
            example: { ids: [1, 2, 3], status: 'skipped' },
          },
        },
      },
      responses: {
        200: {
          description: 'All test cases for the card after update',
          content: { 'application/json': { example: { data: [{ id: 1, status: 'skipped' }, { id: 2, status: 'skipped' }, { id: 3, status: 'skipped' }], error: null } } },
        },
        400: { description: 'One or more IDs do not belong to this card', content: { 'application/json': { example: { data: null, error: 'one or more test case ids do not belong to this card' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Card not found', content: { 'application/json': { example: { data: null, error: 'card not found' } } } },
        422: { description: 'Validation error — invalid status value', content: { 'application/json': { example: { data: null, error: 'status: Invalid enum value' } } } },
      },
    },
  },

  '/api/test-cases/{id}': {
    get: {
      summary: 'Get a test case with full run history',
      description: 'Returns the test case record plus a `runs` array containing all execution records, sorted newest-first. Use this endpoint to render a detailed test case view with audit trail.',
      tags: ['Test Cases'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'ID of the test case', schema: { type: 'integer', example: 7 } },
      ],
      responses: {
        200: {
          description: 'Test case with runs',
          content: {
            'application/json': {
              example: {
                data: {
                  id: 7, card_id: 42, project_id: 1, suite_id: 1,
                  title: 'User can log in with valid credentials', description: null,
                  status: 'passed', priority: 'critical', test_type: 'manual',
                  steps: [{ step: 'Open /login', expected: 'Login form is visible' }],
                  preconditions: null, expected_result: null, assigned_to: 'qa@example.com',
                  position: 0, created_at: '2025-01-17T08:00:00Z', updated_at: '2025-01-18T10:00:00Z',
                  runs: [
                    { id: 5, test_case_id: 7, card_id: 42, status: 'passed', notes: null, run_by: 'qa@example.com', run_at: '2025-01-18T10:00:00Z' },
                    { id: 3, test_case_id: 7, card_id: 42, status: 'failed', notes: 'Page timed out', run_by: 'qa@example.com', run_at: '2025-01-17T15:30:00Z' },
                  ],
                },
                error: null,
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Test case not found', content: { 'application/json': { example: { data: null, error: 'test case not found' } } } },
      },
    },
    patch: {
      summary: 'Update a test case',
      description: 'Partially updates a test case. All fields are optional — only provided fields are written. To clear `steps`, send `null`; to clear `suite_id`, send `null`. `status` can be set directly here, but prefer recording a test run via `POST /test-cases/{id}/runs` so the change is audited.',
      tags: ['Test Cases'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'ID of the test case', schema: { type: 'integer', example: 7 } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { '$ref': '#/components/schemas/TestCaseUpdate' },
            example: {
              title: 'User can log in with valid credentials (updated)',
              priority: 'high',
              assigned_to: 'new-qa@example.com',
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Updated test case',
          content: {
            'application/json': {
              example: {
                data: {
                  id: 7, title: 'User can log in with valid credentials (updated)',
                  priority: 'high', assigned_to: 'new-qa@example.com',
                  status: 'passed', updated_at: '2025-01-19T09:00:00Z',
                },
                error: null,
              },
            },
          },
        },
        400: { description: 'No fields provided or invalid JSON', content: { 'application/json': { example: { data: null, error: 'no fields to update' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Test case not found', content: { 'application/json': { example: { data: null, error: 'test case not found' } } } },
        422: { description: 'Validation error', content: { 'application/json': { example: { data: null, error: 'priority: Invalid enum value' } } } },
      },
    },
    delete: {
      summary: 'Delete a test case and all its runs',
      description: 'Permanently removes the test case and all associated `test_runs` records. This action cannot be undone.',
      tags: ['Test Cases'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'ID of the test case', schema: { type: 'integer', example: 7 } },
      ],
      responses: {
        200: { description: 'Deleted successfully', content: { 'application/json': { example: { data: { id: 7 }, error: null } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Test case not found', content: { 'application/json': { example: { data: null, error: 'test case not found' } } } },
      },
    },
  },

  '/api/test-cases/{id}/runs': {
    post: {
      summary: 'Record a test run',
      description: 'Records a new execution of the test case and simultaneously updates the test case\'s `status` to match. Also writes a `test_run` entry to the card\'s `activity_log` so the run appears in the dashboard activity feed. Use `run_by` to identify the tester (free-form string — email, name, or CI bot label).',
      tags: ['Test Runs'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'ID of the test case', schema: { type: 'integer', example: 7 } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { '$ref': '#/components/schemas/TestRunCreate' },
            example: { status: 'failed', notes: 'Login button unresponsive on Firefox 122', run_by: 'qa@example.com' },
          },
        },
      },
      responses: {
        201: {
          description: 'Newly created test run record',
          content: {
            'application/json': {
              example: {
                data: { id: 9, test_case_id: 7, card_id: 42, status: 'failed', notes: 'Login button unresponsive on Firefox 122', run_by: 'qa@example.com', run_at: '2025-01-20T11:00:00Z' },
                error: null,
              },
            },
          },
        },
        400: { description: 'Invalid JSON', content: { 'application/json': { example: { data: null, error: 'invalid JSON' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Test case not found', content: { 'application/json': { example: { data: null, error: 'test case not found' } } } },
        422: { description: 'Validation error — `status` is required and must be a valid run status', content: { 'application/json': { example: { data: null, error: 'status: Required' } } } },
      },
    },
    get: {
      summary: 'List all runs for a test case',
      description: 'Returns every recorded execution of the test case, sorted newest-first. Useful for rendering an audit trail or a sparkline of historical pass/fail results.',
      tags: ['Test Runs'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'ID of the test case', schema: { type: 'integer', example: 7 } },
      ],
      responses: {
        200: {
          description: 'List of test runs, newest first',
          content: {
            'application/json': {
              example: {
                data: [
                  { id: 9, test_case_id: 7, card_id: 42, status: 'failed', notes: 'Unresponsive on Firefox 122', run_by: 'qa@example.com', run_at: '2025-01-20T11:00:00Z' },
                  { id: 5, test_case_id: 7, card_id: 42, status: 'passed', notes: null, run_by: 'qa@example.com', run_at: '2025-01-18T10:00:00Z' },
                ],
                error: null,
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Test case not found', content: { 'application/json': { example: { data: null, error: 'test case not found' } } } },
      },
    },
  },

  '/api/projects/{projectId}/test-cases': {
    get: {
      summary: 'List all test cases for a project',
      description: 'Returns test cases across all cards in the project, with each case\'s `card_title` and `latest_run` populated. Supports filtering by `suite_id`, `status`, `priority`, and `test_type`. Use this endpoint to build a project-level test matrix or export a test report.',
      tags: ['Project Test Overview'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'projectId', in: 'path', required: true, description: 'ID of the project', schema: { type: 'integer', example: 1 } },
        { name: 'suite_id', in: 'query', required: false, description: 'Filter to a specific test suite', schema: { type: 'integer', example: 1 } },
        { name: 'status', in: 'query', required: false, description: 'Filter by test case status', schema: { '$ref': '#/components/schemas/TestStatus' } },
        { name: 'priority', in: 'query', required: false, description: 'Filter by priority level', schema: { '$ref': '#/components/schemas/TestPriority' } },
        { name: 'test_type', in: 'query', required: false, description: 'Filter by test type (`manual` or `automated`)', schema: { '$ref': '#/components/schemas/TestType' } },
      ],
      responses: {
        200: {
          description: 'Filtered list of test cases with card_title and latest_run',
          content: {
            'application/json': {
              example: {
                data: [
                  {
                    id: 7, card_id: 42, project_id: 1, suite_id: 1,
                    title: 'User can log in with valid credentials',
                    card_title: 'Implement login page',
                    status: 'passed', priority: 'critical', test_type: 'manual',
                    steps: null, preconditions: null, expected_result: null,
                    assigned_to: 'qa@example.com', position: 0,
                    created_at: '2025-01-17T08:00:00Z', updated_at: '2025-01-18T10:00:00Z',
                    latest_run: { id: 5, status: 'passed', notes: null, run_by: 'qa@example.com', run_at: '2025-01-18T10:00:00Z' },
                  },
                ],
                error: null,
              },
            },
          },
        },
        400: { description: 'Invalid project ID', content: { 'application/json': { example: { data: null, error: 'invalid id' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Project not found', content: { 'application/json': { example: { data: null, error: 'project not found' } } } },
      },
    },
  },
}

export const testcasesSchemas = {
  TestStatus: {
    type: 'string',
    enum: ['untested', 'passed', 'failed', 'blocked', 'skipped'],
    description: 'Lifecycle status of a test case',
  },
  TestPriority: {
    type: 'string',
    enum: ['critical', 'high', 'medium', 'low'],
    description: 'Importance level used to prioritise execution order',
  },
  TestType: {
    type: 'string',
    enum: ['manual', 'automated'],
    description: 'Whether the test is executed manually or by an automated runner',
  },
  RunStatus: {
    type: 'string',
    enum: ['passed', 'failed', 'blocked', 'skipped'],
    description: 'Result of a single test execution (subset of TestStatus — excludes "untested")',
  },
  Step: {
    type: 'object', required: ['step', 'expected'],
    description: 'A single action/expectation pair within a test case',
    properties: {
      step: { type: 'string', description: 'The action a tester or script performs', example: 'Click the "Submit" button' },
      expected: { type: 'string', description: 'The expected outcome after the action', example: 'Form is submitted and success banner appears' },
    },
  },
  SuiteCreate: {
    type: 'object', required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200, example: 'Auth flows' },
      description: { type: 'string', nullable: true, example: 'Login, logout, and token refresh scenarios' },
    },
  },
  SuiteUpdate: {
    type: 'object',
    description: 'All fields optional — only supplied fields are updated',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: 'string', nullable: true },
    },
  },
  TestCaseCreate: {
    type: 'object', required: ['title'],
    properties: {
      title: { type: 'string', minLength: 1, example: 'User can reset password via email link' },
      description: { type: 'string', nullable: true, example: 'Covers the forgot-password happy path' },
      suite_id: { type: 'integer', nullable: true, description: 'ID of an existing suite in this project', example: 2 },
      priority: { '$ref': '#/components/schemas/TestPriority', default: 'medium' },
      test_type: { '$ref': '#/components/schemas/TestType', default: 'manual' },
      steps: { type: 'array', items: { '$ref': '#/components/schemas/Step' }, nullable: true },
      preconditions: { type: 'string', nullable: true, example: 'User account exists with verified email' },
      expected_result: { type: 'string', nullable: true, example: 'Password is changed and user can log in with new password' },
      assigned_to: { type: 'string', nullable: true, example: 'qa@example.com' },
    },
  },
  TestCaseUpdate: {
    type: 'object',
    description: 'All fields optional. Send `null` for `suite_id` or `steps` to clear them.',
    properties: {
      title: { type: 'string', minLength: 1 },
      description: { type: 'string', nullable: true },
      suite_id: { type: 'integer', nullable: true },
      status: { '$ref': '#/components/schemas/TestStatus' },
      priority: { '$ref': '#/components/schemas/TestPriority' },
      test_type: { '$ref': '#/components/schemas/TestType' },
      steps: { type: 'array', items: { '$ref': '#/components/schemas/Step' }, nullable: true },
      preconditions: { type: 'string', nullable: true },
      expected_result: { type: 'string', nullable: true },
      assigned_to: { type: 'string', nullable: true },
    },
  },
  TestRunCreate: {
    type: 'object', required: ['status'],
    description: 'Records one execution of a test case. Also updates the parent test case\'s status and writes to activity_log.',
    properties: {
      status: { '$ref': '#/components/schemas/RunStatus' },
      notes: { type: 'string', nullable: true, example: 'Failed on Firefox 122 — works on Chrome 121' },
      run_by: { type: 'string', nullable: true, example: 'qa@example.com', description: 'Free-form identifier for the tester or CI bot' },
    },
  },
}
