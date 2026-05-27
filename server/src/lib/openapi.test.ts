import { describe, it, expect } from 'vitest'
import { testCaseOpenApi } from './openapi'

describe('testCaseOpenApi', () => {
  describe('structure', () => {
    it('has openapi version 3.0.3', () => {
      expect(testCaseOpenApi.openapi).toBe('3.0.3')
    })

    it('has info object with title and version', () => {
      expect(testCaseOpenApi.info).toBeDefined()
      expect(testCaseOpenApi.info.title).toBeDefined()
      expect(testCaseOpenApi.info.version).toBeDefined()
    })

    it('has paths object', () => {
      expect(testCaseOpenApi.paths).toBeDefined()
      expect(typeof testCaseOpenApi.paths).toBe('object')
    })

    it('has tags array', () => {
      expect(testCaseOpenApi.tags).toBeDefined()
      expect(Array.isArray(testCaseOpenApi.tags)).toBe(true)
      expect(testCaseOpenApi.tags.length).toBeGreaterThan(0)
    })
  })

  describe('info section', () => {
    it('title mentions SlateFlow and Test Case Management', () => {
      expect(testCaseOpenApi.info.title).toContain('SlateFlow')
      expect(testCaseOpenApi.info.title).toContain('Test Case')
    })

    it('version is a semantic version string', () => {
      expect(testCaseOpenApi.info.version).toMatch(/^\d+\.\d+\.\d+$/)
    })
  })

  describe('tags section', () => {
    it('includes Test Cases tag', () => {
      const testCasesTag = testCaseOpenApi.tags.find((t) => t.name === 'Test Cases')
      expect(testCasesTag).toBeDefined()
      expect(testCasesTag?.description).toBeDefined()
    })

    it('includes Test Suites tag', () => {
      const suitesTag = testCaseOpenApi.tags.find((t) => t.name === 'Test Suites')
      expect(suitesTag).toBeDefined()
    })

    it('includes Test Runs tag', () => {
      const runsTag = testCaseOpenApi.tags.find((t) => t.name === 'Test Runs')
      expect(runsTag).toBeDefined()
    })

    it('includes Project Test Overview tag', () => {
      const overviewTag = testCaseOpenApi.tags.find((t) => t.name === 'Project Test Overview')
      expect(overviewTag).toBeDefined()
    })
  })

  describe('paths section', () => {
    it('contains at least one path', () => {
      expect(Object.keys(testCaseOpenApi.paths).length).toBeGreaterThan(0)
    })

    it('paths are valid OpenAPI path patterns', () => {
      const paths = Object.keys(testCaseOpenApi.paths)
      paths.forEach((path) => {
        expect(path).toMatch(/^\/api\//)
      })
    })

    it('includes test-suites endpoints', () => {
      const paths = Object.keys(testCaseOpenApi.paths)
      const suitePaths = paths.filter((p) => p.includes('test-suites'))
      expect(suitePaths.length).toBeGreaterThan(0)
    })

    it('includes test-cases endpoints', () => {
      const paths = Object.keys(testCaseOpenApi.paths)
      const casePaths = paths.filter((p) => p.includes('test-cases'))
      expect(casePaths.length).toBeGreaterThan(0)
    })

    it('includes /api/projects/{projectId}/test-suites path', () => {
      expect(testCaseOpenApi.paths['/api/projects/{projectId}/test-suites']).toBeDefined()
    })

    it('each path has at least one HTTP method', () => {
      Object.entries(testCaseOpenApi.paths).forEach(([pathKey, pathItem]) => {
        const httpMethods = Object.keys(pathItem).filter((key) =>
          ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(key)
        )
        expect(httpMethods.length).toBeGreaterThan(0)
      })
    })
  })

  describe('components section', () => {
    it('has components with schemas', () => {
      expect(testCaseOpenApi.components).toBeDefined()
      expect(testCaseOpenApi.components.schemas).toBeDefined()
    })

    it('includes Envelope schema', () => {
      expect(testCaseOpenApi.components.schemas.Envelope).toBeDefined()
    })

    it('includes TestStatus schema', () => {
      expect(testCaseOpenApi.components.schemas.TestStatus).toBeDefined()
    })

    it('includes TestCaseCreate schema', () => {
      expect(testCaseOpenApi.components.schemas.TestCaseCreate).toBeDefined()
    })

    it('includes TestRunCreate schema', () => {
      expect(testCaseOpenApi.components.schemas.TestRunCreate).toBeDefined()
    })

    it('all schemas are objects', () => {
      Object.entries(testCaseOpenApi.components.schemas).forEach(([schemaName, schema]) => {
        expect(typeof schema).toBe('object')
      })
    })
  })

  describe('path operations', () => {
    it('operations have summary and description', () => {
      Object.entries(testCaseOpenApi.paths).forEach(([pathKey, pathItem]) => {
        Object.entries(pathItem).forEach(([method, operation]) => {
          if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
            expect((operation as any).summary).toBeDefined()
            expect((operation as any).description).toBeDefined()
          }
        })
      })
    })

    it('operations have tags', () => {
      Object.entries(testCaseOpenApi.paths).forEach(([pathKey, pathItem]) => {
        Object.entries(pathItem).forEach(([method, operation]) => {
          if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
            expect((operation as any).tags).toBeDefined()
            expect(Array.isArray((operation as any).tags)).toBe(true)
          }
        })
      })
    })

    it('operations have responses defined', () => {
      Object.entries(testCaseOpenApi.paths).forEach(([pathKey, pathItem]) => {
        Object.entries(pathItem).forEach(([method, operation]) => {
          if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
            expect((operation as any).responses).toBeDefined()
            expect(typeof (operation as any).responses).toBe('object')
          }
        })
      })
    })
  })

  describe('endpoint coverage', () => {
    it('has GET endpoint for test suites', () => {
      const suitesPath = testCaseOpenApi.paths['/api/projects/{projectId}/test-suites']
      expect(suitesPath.get).toBeDefined()
    })

    it('has POST endpoint for test suites', () => {
      const suitesPath = testCaseOpenApi.paths['/api/projects/{projectId}/test-suites']
      expect(suitesPath.post).toBeDefined()
    })

    it('test case endpoints include CRUD operations', () => {
      const paths = Object.keys(testCaseOpenApi.paths)
      const cardTestCasesPath = paths.find((p) => p.includes('/cards/{cardId}/test-cases'))
      const testCasePath = testCaseOpenApi.paths[cardTestCasesPath!]

      // Expect various operations on test cases
      expect(testCasePath).toBeDefined()
      const hasMethods = testCasePath.get || testCasePath.post || testCasePath.patch || testCasePath.delete
      expect(hasMethods).toBeDefined()
    })
  })
})
