// Reusable OpenAPI component schemas and response definitions.

export const sharedSchemas = {
  Envelope: {
    type: 'object',
    description: 'Standard response wrapper used by all SlateFlow endpoints',
    properties: {
      data: { description: 'Response payload — shape varies by endpoint' },
      error: { type: 'string', nullable: true, description: 'Human-readable error message, or null on success' },
    },
  },
}

export const sharedResponses = {
  Unauthorized: {
    description: 'Authentication required',
    content: {
      'application/json': {
        example: { data: null, error: 'authentication required' },
      },
    },
  },
  Forbidden: {
    description: 'Access denied',
    content: {
      'application/json': {
        example: { data: null, error: 'forbidden' },
      },
    },
  },
  NotFound: {
    description: 'Resource not found',
    content: {
      'application/json': {
        example: { data: null, error: 'not found' },
      },
    },
  },
  BadRequest: {
    description: 'Invalid request',
    content: {
      'application/json': {
        example: { data: null, error: 'invalid request' },
      },
    },
  },
  ValidationError: {
    description: 'Validation error',
    content: {
      'application/json': {
        example: { data: null, error: 'field: validation message' },
      },
    },
  },
}
