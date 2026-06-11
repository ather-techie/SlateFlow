// OpenAPI spec for the group-flag-gated AI endpoints.
//
// All paths below require the master `ai` feature flag PLUS the per-group flag
// named in each description (`ai_ceremony_digests`, `ai_writing_assist`,
// `ai_planning_assist`, `ai_project_chat`) — when either flag is off the route
// returns 404. Every /api/ai/* route is rate-limited to 30 requests per minute
// per user (429 beyond that).

const rateLimited = {
  description: 'Rate limit exceeded (30 requests per minute per user)',
  content: { 'application/json': { example: { data: null, error: 'too many requests' } } },
}

const providerError = {
  description: 'AI provider error or unparseable AI response',
  content: { 'application/json': { example: { data: null, error: 'AI provider error' } } },
}

const featureOff404 = 'Returns 404 when the master `ai` flag or the group flag is disabled.'

export const aiPaths = {
  // ── Ceremony digests (group flag: ai_ceremony_digests) ────────────────────

  '/api/ai/sprints/{sprintId}/digest': {
    get: {
      summary: 'Get the latest saved sprint-health digest',
      description: `Returns the most recently generated sprint-health digest for the sprint without calling the AI provider. Both fields are null when no digest has been generated yet. Requires feature flags \`ai\` and \`ai_ceremony_digests\`. ${featureOff404}`,
      tags: ['AI'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'sprintId', in: 'path', required: true, description: 'ID of the sprint', schema: { type: 'integer', example: 12 } },
      ],
      responses: {
        200: {
          description: 'Latest digest, or nulls when none exists',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Envelope' },
              example: { data: { digest: '## Sprint Health\n\nThe sprint is 60% elapsed…', generated_at: '2026-06-10T09:30:00.000Z' }, error: null },
            },
          },
        },
        400: { description: 'Invalid sprint id', content: { 'application/json': { example: { data: null, error: 'invalid sprint id' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Sprint not found, or feature flag disabled', content: { 'application/json': { example: { data: null, error: 'sprint not found' } } } },
        429: rateLimited,
      },
    },
    post: {
      summary: 'Generate a sprint-health digest',
      description: `Collects sprint metrics server-side (point totals, per-lane cycle time, per-assignee capacity, cards stalled ≥ 3 days) and asks the AI provider for a markdown sprint-health digest. The digest is persisted in \`ai_digests\` so subsequent GETs return it. Requires feature flags \`ai\` and \`ai_ceremony_digests\`. ${featureOff404}`,
      tags: ['AI'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'sprintId', in: 'path', required: true, description: 'ID of the sprint', schema: { type: 'integer', example: 12 } },
      ],
      responses: {
        200: {
          description: 'Freshly generated digest',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Envelope' },
              example: { data: { digest: '## Sprint Health\n\n…', generated_at: '2026-06-11T08:00:00.000Z' }, error: null },
            },
          },
        },
        400: { description: 'Invalid sprint id', content: { 'application/json': { example: { data: null, error: 'invalid sprint id' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Sprint not found, or feature flag disabled', content: { 'application/json': { example: { data: null, error: 'sprint not found' } } } },
        409: { description: 'Default sprint — digests cannot be generated for it', content: { 'application/json': { example: { data: null, error: 'cannot generate a digest for the default sprint' } } } },
        429: rateLimited,
        500: providerError,
      },
    },
  },

  '/api/ai/projects/{projectId}/standup-digest': {
    get: {
      summary: 'Get the latest saved standup digest',
      description: `Returns the most recently generated standup digest for the project without calling the AI provider. Both fields are null when no digest has been generated yet. Requires feature flags \`ai\` and \`ai_ceremony_digests\`. ${featureOff404}`,
      tags: ['AI'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'projectId', in: 'path', required: true, description: 'ID of the project', schema: { type: 'integer', example: 1 } },
      ],
      responses: {
        200: {
          description: 'Latest digest, or nulls when none exists',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Envelope' },
              example: { data: { digest: '## Standup\n\nYesterday…', generated_at: '2026-06-11T08:00:00.000Z' }, error: null },
            },
          },
        },
        400: { description: 'Invalid project id', content: { 'application/json': { example: { data: null, error: 'invalid project id' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Project not found, or feature flag disabled', content: { 'application/json': { example: { data: null, error: 'project not found' } } } },
        429: rateLimited,
      },
    },
    post: {
      summary: 'Generate a standup digest',
      description: `Builds a markdown digest of the last N hours of card activity and comments, stalled cards, and over-capacity assignees in the active sprint, then persists it in \`ai_digests\`. Requires feature flags \`ai\` and \`ai_ceremony_digests\`. ${featureOff404}`,
      tags: ['AI'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'projectId', in: 'path', required: true, description: 'ID of the project', schema: { type: 'integer', example: 1 } },
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                hours: { type: 'integer', minimum: 1, maximum: 168, default: 24, description: 'Activity window in hours' },
                stale_days: { type: 'integer', minimum: 1, maximum: 30, default: 2, description: 'Idle threshold (days) for flagging stalled cards' },
              },
            },
            example: { hours: 24, stale_days: 2 },
          },
        },
      },
      responses: {
        200: {
          description: 'Freshly generated digest',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Envelope' },
              example: { data: { digest: '## Standup\n\n…', generated_at: '2026-06-11T08:00:00.000Z' }, error: null },
            },
          },
        },
        400: { description: 'Invalid project id', content: { 'application/json': { example: { data: null, error: 'invalid project id' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Project not found, or feature flag disabled', content: { 'application/json': { example: { data: null, error: 'project not found' } } } },
        422: { description: 'Body validation error', content: { 'application/json': { example: { data: null, error: 'hours: Number must be less than or equal to 168' } } } },
        429: rateLimited,
        500: providerError,
      },
    },
  },

  '/api/ai/retrospectives/{retrospectiveId}/synthesize': {
    post: {
      summary: 'Synthesize a retrospective into themes and actions',
      description: `Clusters the retrospective's items into themes, suggests action items, and reviews the previous sprint's action items for follow-through. Theme \`item_ids\` are validated server-side against the retro's real items. Requires feature flags \`ai\`, \`ai_ceremony_digests\`, AND \`retrospective\`. ${featureOff404}`,
      tags: ['AI'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'retrospectiveId', in: 'path', required: true, description: 'ID of the retrospective', schema: { type: 'integer', example: 4 } },
      ],
      responses: {
        200: {
          description: 'Synthesis result',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Envelope' },
              example: {
                data: {
                  themes: [{ title: 'CI reliability', category: 'to_improve', item_ids: [17, 21] }],
                  suggested_actions: [{ body: 'Add retry logic to the flaky integration suite' }],
                  previous_actions_review: [{ body: 'Speed up code review turnaround', status: 'partially', evidence: 'Two notes praise faster reviews, one still flags delays' }],
                },
                error: null,
              },
            },
          },
        },
        400: { description: 'Invalid retrospective id, or the retrospective has no items', content: { 'application/json': { example: { data: null, error: 'retrospective has no items to synthesize' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Retrospective not found, or feature flag disabled', content: { 'application/json': { example: { data: null, error: 'retrospective not found' } } } },
        429: rateLimited,
        500: providerError,
      },
    },
  },

  // ── Writing assist (group flag: ai_writing_assist) ────────────────────────

  '/api/ai/cards/{cardId}/generate-acceptance-criteria': {
    post: {
      summary: 'Generate Given/When/Then acceptance criteria for a card',
      description: `Generates acceptance criteria from the card's title and description. Requires epic-level read access on the card. Requires feature flags \`ai\` and \`ai_writing_assist\`. ${featureOff404}`,
      tags: ['AI'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'cardId', in: 'path', required: true, description: 'ID of the card', schema: { type: 'integer', example: 42 } },
      ],
      responses: {
        200: {
          description: 'Generated acceptance criteria',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Envelope' },
              example: {
                data: {
                  criteria: [
                    { given: 'a logged-in user on the board', when: 'they drag a card to the Done lane', then: "the card's status updates and the burndown reflects it" },
                  ],
                },
                error: null,
              },
            },
          },
        },
        400: { description: 'Invalid card id', content: { 'application/json': { example: { data: null, error: 'invalid card id' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { description: 'No epic read access on the card', content: { 'application/json': { example: { data: null, error: 'forbidden' } } } },
        404: { description: 'Card not found, or feature flag disabled', content: { 'application/json': { example: { data: null, error: 'card not found' } } } },
        429: rateLimited,
        500: providerError,
      },
    },
  },

  '/api/ai/cards/{cardId}/summarize-comments': {
    post: {
      summary: "Summarize a card's comment thread",
      description: `Summarizes the card's most recent 50 comments into a short summary plus extracted decisions and open questions. Requires at least 5 comments on the card and epic-level read access. Requires feature flags \`ai\` and \`ai_writing_assist\`. ${featureOff404}`,
      tags: ['AI'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'cardId', in: 'path', required: true, description: 'ID of the card', schema: { type: 'integer', example: 42 } },
      ],
      responses: {
        200: {
          description: 'Thread summary',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Envelope' },
              example: {
                data: {
                  summary: 'The thread converged on using optimistic UI updates…',
                  decisions: ['Use optimistic updates with rollback on SSE conflict'],
                  open_questions: ['Who owns the migration for the new index?'],
                },
                error: null,
              },
            },
          },
        },
        400: { description: 'Invalid card id, or the card has fewer than 5 comments', content: { 'application/json': { example: { data: null, error: 'thread too short to summarize' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { description: 'No epic read access on the card', content: { 'application/json': { example: { data: null, error: 'forbidden' } } } },
        404: { description: 'Card not found, or feature flag disabled', content: { 'application/json': { example: { data: null, error: 'card not found' } } } },
        429: rateLimited,
        500: providerError,
      },
    },
  },

  // ── Planning assist (group flag: ai_planning_assist) ──────────────────────

  '/api/ai/cards/{cardId}/suggest-assignee': {
    post: {
      summary: 'Suggest an assignee for a card',
      description: `Suggests up to 3 assignees ranked by skills, current sprint load vs. capacity, and vacations in the active sprint. Suggestions are validated server-side against real project members; the canonical display name is substituted. Requires epic-level read access on the card. Requires feature flags \`ai\` and \`ai_planning_assist\`. ${featureOff404}`,
      tags: ['AI'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'cardId', in: 'path', required: true, description: 'ID of the card', schema: { type: 'integer', example: 42 } },
      ],
      responses: {
        200: {
          description: 'Ranked assignee suggestions (max 3)',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Envelope' },
              example: {
                data: {
                  suggestions: [
                    { user_id: 5, assignee: 'Alice Johnson', confidence: 'high', reason: 'Auth/SQL skills match; 3 pts under capacity' },
                  ],
                },
                error: null,
              },
            },
          },
        },
        400: { description: 'Invalid card id, card has no resolvable project, or project has no members', content: { 'application/json': { example: { data: null, error: 'project has no members to suggest from' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { description: 'No epic read access on the card', content: { 'application/json': { example: { data: null, error: 'forbidden' } } } },
        404: { description: 'Card not found, or feature flag disabled', content: { 'application/json': { example: { data: null, error: 'card not found' } } } },
        429: rateLimited,
        500: providerError,
      },
    },
  },

  '/api/ai/cards/{cardId}/suggest-estimate': {
    post: {
      summary: 'Suggest a story-point estimate for a card',
      description: `Estimates the card against up to 30 recently completed, estimated stories from the same project, using the project's observed point scale (fallback: 1, 2, 3, 5, 8, 13). Comparables are validated server-side against real completed cards (max 3; title and points come from the DB). Requires epic-level read access on the card. Requires feature flags \`ai\` and \`ai_planning_assist\`. ${featureOff404}`,
      tags: ['AI'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'cardId', in: 'path', required: true, description: 'ID of the card', schema: { type: 'integer', example: 42 } },
      ],
      responses: {
        200: {
          description: 'Estimate suggestion with comparable completed stories',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Envelope' },
              example: {
                data: {
                  points: 5,
                  confidence: 'medium',
                  rationale: 'Similar scope to the two API-refactor stories, both 5 pts',
                  comparables: [{ card_id: 31, title: 'Refactor auth middleware', points: 5 }],
                },
                error: null,
              },
            },
          },
        },
        400: { description: 'Invalid card id, or card has no resolvable project', content: { 'application/json': { example: { data: null, error: 'card has no resolvable project' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { description: 'No epic read access on the card', content: { 'application/json': { example: { data: null, error: 'forbidden' } } } },
        404: { description: 'Card not found, or feature flag disabled', content: { 'application/json': { example: { data: null, error: 'card not found' } } } },
        429: rateLimited,
        500: providerError,
      },
    },
  },

  '/api/ai/projects/{projectId}/plan-sprint': {
    post: {
      summary: 'Propose a sprint plan from the backlog',
      description: `Proposes a sprint scope from the backlog (up to 50 cards) considering average velocity over the last 5 completed sprints, member capacity, vacations in the sprint window, and card dependencies. Proposed card ids are validated server-side against the real backlog (titles/points from the DB; duplicates dropped). The target sprint must belong to the project, be in \`planned\` status, and not be the default sprint. Requires feature flags \`ai\` and \`ai_planning_assist\`. ${featureOff404}`,
      tags: ['AI'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'projectId', in: 'path', required: true, description: 'ID of the project', schema: { type: 'integer', example: 1 } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                sprint_id: { type: 'integer', minimum: 1, description: 'Target sprint to plan (must be in planned status)' },
              },
              required: ['sprint_id'],
            },
            example: { sprint_id: 12 },
          },
        },
      },
      responses: {
        200: {
          description: 'Proposed sprint plan',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Envelope' },
              example: {
                data: {
                  recommended_points: 21,
                  rationale: 'Average velocity is 23 pts; two members are partially on vacation',
                  proposed: [{ card_id: 88, title: 'Bulk edit for labels', points: 5, reason: 'High priority, unblocks #91' }],
                  risks: ['#91 depends on #88 — sequence them early'],
                },
                error: null,
              },
            },
          },
        },
        400: { description: 'Invalid project id, or the backlog is empty', content: { 'application/json': { example: { data: null, error: 'backlog is empty — nothing to plan' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Project or sprint not found, or feature flag disabled', content: { 'application/json': { example: { data: null, error: 'sprint not found' } } } },
        409: { description: 'Sprint is the default sprint, or not in planned status', content: { 'application/json': { example: { data: null, error: 'sprint must be in planned status' } } } },
        422: { description: 'Body validation error', content: { 'application/json': { example: { data: null, error: 'sprint_id: Required' } } } },
        429: rateLimited,
        500: providerError,
      },
    },
  },

  '/api/ai/projects/{projectId}/groom-backlog': {
    post: {
      summary: 'Groom the project backlog',
      description: `Analyzes up to 60 backlog cards for likely duplicates, vague descriptions, and a suggested priority order. The \`stale\` list (cards idle ≥ 30 days) is computed deterministically server-side, not by the model. All card ids in the response are validated against the real backlog. Requires feature flags \`ai\` and \`ai_planning_assist\`. ${featureOff404}`,
      tags: ['AI'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'projectId', in: 'path', required: true, description: 'ID of the project', schema: { type: 'integer', example: 1 } },
      ],
      responses: {
        200: {
          description: 'Backlog grooming analysis',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Envelope' },
              example: {
                data: {
                  duplicates: [{ card_ids: [12, 47], reason: 'Both describe export-to-CSV for reports' }],
                  vague: [{ card_id: 53, issue: 'No acceptance criteria or scope', suggested_description: 'As a project admin, I want…' }],
                  priority_order: [88, 12, 53],
                  stale: [{ card_id: 9, title: 'Dark mode', last_activity_days: 92 }],
                  notes: 'Backlog is healthy overall; consider closing the stale items.',
                },
                error: null,
              },
            },
          },
        },
        400: { description: 'Invalid project id, or the backlog is empty', content: { 'application/json': { example: { data: null, error: 'backlog is empty — nothing to groom' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Project not found, or feature flag disabled', content: { 'application/json': { example: { data: null, error: 'project not found' } } } },
        429: rateLimited,
        500: providerError,
      },
    },
  },

  // ── Project chat (group flag: ai_project_chat) ────────────────────────────

  '/api/ai/projects/{projectId}/chat': {
    post: {
      summary: 'Chat with project context (streaming SSE)',
      description: `Streams an AI chat reply grounded in an RBAC-filtered project context bundle — the response only reflects epics and cards the requesting user can read. The server owns the system prompt; a client-supplied \`system\` role is rejected with 422. Only the most recent 12 messages are sent to the model.\n\n**The 200 response is \`text/event-stream\`, NOT the standard \`{ data, error }\` envelope.** SSE events: \`token\` with data \`{"text": "..."}\` per model token chunk (concatenate in order; JSON-encoded so newlines survive SSE framing), then \`done\` with \`{}\` on success, or \`error\` with \`{"message": "..."}\` on mid-stream provider failure. Pre-stream failures (4xx below) still use the normal JSON envelope. Requires feature flags \`ai\` and \`ai_project_chat\`. ${featureOff404}`,
      tags: ['AI'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'projectId', in: 'path', required: true, description: 'ID of the project', schema: { type: 'integer', example: 1 } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                messages: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 20,
                  description: 'Conversation history; the last message must have role "user"',
                  items: {
                    type: 'object',
                    properties: {
                      role: { type: 'string', enum: ['user', 'assistant'], description: 'A client-supplied "system" role is rejected with 422' },
                      content: { type: 'string', minLength: 1, maxLength: 4000 },
                    },
                    required: ['role', 'content'],
                  },
                },
              },
              required: ['messages'],
            },
            example: { messages: [{ role: 'user', content: 'What is at risk in the current sprint?' }] },
          },
        },
      },
      responses: {
        200: {
          description: 'Server-Sent Events stream (not the standard envelope). Events: `token` ({"text": "..."}), then `done` ({}), or `error` ({"message": "..."}) on provider failure.',
          content: {
            'text/event-stream': {
              schema: {
                type: 'string',
                description: 'SSE stream. Each event has an `event:` name (token | done | error) and a `data:` line containing a JSON payload.',
                example: 'event: token\ndata: {"text":"The sprint is "}\n\nevent: token\ndata: {"text":"at risk because…"}\n\nevent: done\ndata: {}\n\n',
              },
            },
          },
        },
        400: { description: 'Invalid project id or unparseable body', content: { 'application/json': { example: { data: null, error: 'invalid body' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { description: 'Project not found, or feature flag disabled', content: { 'application/json': { example: { data: null, error: 'project not found' } } } },
        422: { description: 'Validation error: empty/oversized messages, more than 20 items, disallowed role, or last message not from the user', content: { 'application/json': { example: { data: null, error: 'last message must be from the user' } } } },
        429: rateLimited,
      },
    },
  },
}

export const aiSchemas = {
  AIDigest: {
    type: 'object',
    description: 'Saved AI-generated digest (sprint health or standup)',
    properties: {
      digest: { type: 'string', nullable: true, description: 'Markdown digest content, or null when none has been generated' },
      generated_at: { type: 'string', format: 'date-time', nullable: true, description: 'When the digest was generated, or null when none exists' },
    },
  },
}
