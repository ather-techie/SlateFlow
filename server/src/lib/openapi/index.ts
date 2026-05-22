// Root OpenAPI specification document.
// Assembles paths and schemas from all domain modules.

import { sharedSchemas, sharedResponses } from './shared.js'
import { testcasesPaths, testcasesSchemas } from './domains/testcases.js'

// Placeholder imports for remaining domains (to be filled in)
// import { authPaths } from './domains/auth.js'
// import { configPaths } from './domains/config.js'
// import { projectsPaths } from './domains/projects.js'
// ... etc

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'SlateFlow API',
    version: '1.0.0',
    description: 'REST API for SlateFlow — self-hostable agile project management with Kanban, sprints, roadmap, and AI-powered features',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Development' },
    { url: '/', description: 'Production (same-origin)' },
  ],
  tags: [
    { name: 'Auth', description: 'Authentication and user profile management' },
    { name: 'Config', description: 'Configuration and feature flags' },
    { name: 'Projects', description: 'Project management' },
    { name: 'Lanes', description: 'Swim lane management' },
    { name: 'Cards', description: 'Story/card CRUD and moves' },
    { name: 'Sprints', description: 'Sprint lifecycle and planning' },
    { name: 'Epics', description: 'Epic management' },
    { name: 'Features', description: 'Feature management' },
    { name: 'Comments', description: 'Card comments' },
    { name: 'Labels', description: 'Label management and assignment' },
    { name: 'Activity', description: 'Activity log and audit trail' },
    { name: 'Dashboard', description: 'Dashboard stats and overview' },
    { name: 'Test Cases', description: 'CRUD operations on individual test cases attached to cards' },
    { name: 'Test Suites', description: 'Grouping containers for test cases within a project' },
    { name: 'Test Runs', description: 'Execution records for test cases; each run updates the case status' },
    { name: 'Project Test Overview', description: 'Cross-card test case listing and filtering at the project level' },
    { name: 'Dependencies', description: 'Card dependency graph' },
    { name: 'Roadmap', description: 'Project roadmap view' },
    { name: 'Reports', description: 'Velocity, cycle time, capacity, and CSV export' },
    { name: 'Users', description: 'User management (super_admin only)' },
    { name: 'Project Access', description: 'Project-level role management' },
    { name: 'Epic Access', description: 'Epic-level role management' },
    { name: 'Notifications', description: 'In-app notifications and mentions' },
    { name: 'Admin', description: 'Feature flag overrides and holiday management (super_admin)' },
    { name: 'AI', description: 'AI-powered features: summarization, story/test case generation, natural language parsing' },
    { name: 'Retrospectives', description: 'Sprint retrospectives (requires FEATURE_RETROSPECTIVE)' },
    { name: 'Calendar', description: 'Calendar events, vacations, and holidays (requires FEATURE_CALENDAR)' },
    { name: 'Card Links', description: 'GitHub/GitLab PR/MR links (requires FEATURE_GITHUB_INTEGRATION or FEATURE_GITLAB_INTEGRATION)' },
    { name: 'Webhooks', description: 'GitHub and GitLab webhook receivers' },
  ],
  security: [{ cookieAuth: [] }],
  paths: {
    ...testcasesPaths,
    // Remaining domain paths will be merged here
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'sf_token',
        description: 'JWT token in httpOnly cookie; 7-day expiration; set automatically on successful login',
      },
    },
    responses: {
      ...sharedResponses,
    },
    schemas: {
      ...sharedSchemas,
      ...testcasesSchemas,
    },
  },
} as const
