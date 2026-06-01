// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotFoundPage from './NotFoundPage'

describe('NotFoundPage', () => {
  const renderPage = () => {
    return render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    )
  }

  it('renders 404 heading', () => {
    renderPage()
    expect(screen.getByText('404')).toBeInTheDocument()
  })

  it('renders error message text', () => {
    renderPage()
    expect(screen.getByText(/doesn't exist or was moved/)).toBeInTheDocument()
  })

  it('renders a link to dashboard', () => {
    renderPage()
    const link = screen.getByRole('link', { name: /back to dashboard/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/dashboard')
  })

  it('renders without throwing', () => {
    expect(() => renderPage()).not.toThrow()
  })
})
