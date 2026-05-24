// OpenAPI spec for card attachment endpoints.

export const attachmentsPaths = {
  '/api/cards/{cardId}/attachments': {
    get: {
      summary: 'List attachments for a card',
      description: 'Returns all attachments linked to the given card. Includes file metadata, uploader info, and direct download URLs.',
      tags: ['Attachments'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'cardId', in: 'path', required: true, description: 'ID of the card', schema: { type: 'integer', example: 42 } },
      ],
      responses: {
        200: {
          description: 'Array of attachments',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Envelope' },
              example: {
                data: [
                  {
                    id: 1,
                    card_id: 42,
                    filename: '12345abc-screenshot.png',
                    original_name: 'screenshot.png',
                    mime_type: 'image/png',
                    size: 524288,
                    uploaded_by: 5,
                    uploader_name: 'Alice Johnson',
                    url: '/uploads/12345abc-screenshot.png',
                    created_at: '2025-01-15T09:00:00Z',
                  },
                ],
                error: null,
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { description: 'Forbidden — insufficient project access', content: { 'application/json': { example: { data: null, error: 'forbidden' } } } },
        404: { description: 'Card not found', content: { 'application/json': { example: { data: null, error: 'card not found' } } } },
      },
    },
    post: {
      summary: 'Upload a file attachment to a card',
      description: 'Uploads a file as a multipart/form-data request. The file is stored on disk and indexed in the database. Max 10 MB per file; images, PDFs, and common office formats are supported.',
      tags: ['Attachments'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'cardId', in: 'path', required: true, description: 'ID of the card', schema: { type: 'integer', example: 42 } },
      ],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary', description: 'File to upload (max 10 MB)' },
              },
              required: ['file'],
            },
          },
        },
      },
      responses: {
        201: {
          description: 'File uploaded successfully',
          content: {
            'application/json': {
              example: {
                data: {
                  id: 1,
                  card_id: 42,
                  filename: '12345abc-screenshot.png',
                  original_name: 'screenshot.png',
                  mime_type: 'image/png',
                  size: 524288,
                  uploaded_by: 5,
                  uploader_name: 'Alice Johnson',
                  url: '/uploads/12345abc-screenshot.png',
                  created_at: '2025-01-15T09:00:00Z',
                },
                error: null,
              },
            },
          },
        },
        400: { description: 'Invalid form data or missing file field', content: { 'application/json': { example: { data: null, error: 'file field is required' } } } },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { description: 'Forbidden — insufficient write permission', content: { 'application/json': { example: { data: null, error: 'forbidden' } } } },
        404: { description: 'Card not found', content: { 'application/json': { example: { data: null, error: 'card not found' } } } },
        413: { description: 'File too large (max 10 MB)', content: { 'application/json': { example: { data: null, error: 'file size exceeds 10 MB limit' } } } },
        415: { description: 'File type not allowed', content: { 'application/json': { example: { data: null, error: 'file type image/xyz is not allowed' } } } },
      },
    },
  },

  '/api/attachments/{attachmentId}': {
    delete: {
      summary: 'Delete an attachment',
      description: 'Deletes an attachment and removes it from disk. Allowed for the uploader, project admin, or super admin.',
      tags: ['Attachments'],
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'attachmentId', in: 'path', required: true, description: 'ID of the attachment', schema: { type: 'integer', example: 1 } },
      ],
      responses: {
        200: {
          description: 'Attachment deleted successfully',
          content: {
            'application/json': {
              example: { data: { deleted: true }, error: null },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { description: 'Forbidden — not the uploader or project admin', content: { 'application/json': { example: { data: null, error: 'forbidden' } } } },
        404: { description: 'Attachment not found', content: { 'application/json': { example: { data: null, error: 'attachment not found' } } } },
      },
    },
  },
}

export const attachmentsSchemas = {
  Attachment: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      card_id: { type: 'integer', example: 42 },
      filename: { type: 'string', example: '12345abc-screenshot.png', description: 'UUID-prefixed filename on disk' },
      original_name: { type: 'string', example: 'screenshot.png', description: 'Original filename as uploaded' },
      mime_type: { type: 'string', example: 'image/png' },
      size: { type: 'integer', example: 524288, description: 'File size in bytes' },
      uploaded_by: { type: 'integer', nullable: true, example: 5, description: 'User ID of uploader' },
      uploader_name: { type: 'string', nullable: true, example: 'Alice Johnson', description: 'Display name of uploader' },
      url: { type: 'string', example: '/uploads/12345abc-screenshot.png', description: 'Direct download URL' },
      created_at: { type: 'string', format: 'date-time', example: '2025-01-15T09:00:00Z' },
    },
    required: ['id', 'card_id', 'filename', 'original_name', 'mime_type', 'size', 'created_at'],
  },
}
