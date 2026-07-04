import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CardAttachmentsTab from './CardAttachmentsTab'
import { api } from '../../api/index'
import type { Card } from '../../types'

vi.mock('../../api/index', () => ({
  api: {
    attachments: {
      list: vi.fn(),
      upload: vi.fn(),
      remove: vi.fn(),
    },
  },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const mockedApi = vi.mocked(api, true)

const mockCard: Card = {
  id: 1,
  column_id: null,
  swim_lane_id: 1,
  sprint_id: 1,
  feature_id: null,
  title: 'Test Card',
  description: '',
  priority: 'p1',
  story_points: 5,
  assignee: null,
  assignee_id: null,
  position: 0,
  due_date: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockAttachment = {
  id: 1, card_id: 1, filename: 'uuid-test.pdf', original_name: 'test.pdf', mime_type: 'application/pdf',
  size: 2048, uploaded_by: 1, uploader_name: 'Admin', url: '/uploads/uuid-test.pdf', created_at: '2024-01-01T00:00:00Z',
}

describe('CardAttachmentsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when there are no attachments', async () => {
    mockedApi.attachments.list.mockResolvedValue([])
    render(<CardAttachmentsTab card={mockCard} />)
    expect(await screen.findByText('No attachments yet.')).toBeInTheDocument()
  })

  it('renders an attachment with its metadata', async () => {
    mockedApi.attachments.list.mockResolvedValue([mockAttachment])
    render(<CardAttachmentsTab card={mockCard} />)
    expect(await screen.findByText('test.pdf')).toBeInTheDocument()
    expect(screen.getByText('2 KB')).toBeInTheDocument()
    expect(screen.getByText('by Admin')).toBeInTheDocument()
  })

  it('uploads a file', async () => {
    mockedApi.attachments.list.mockResolvedValue([])
    mockedApi.attachments.upload.mockResolvedValue(mockAttachment)
    const user = userEvent.setup()
    render(<CardAttachmentsTab card={mockCard} />)
    await screen.findByText('No attachments yet.')
    const file = new File(['contents'], 'test.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)
    await waitFor(() => {
      expect(mockedApi.attachments.upload).toHaveBeenCalledWith(1, file)
    })
    expect(await screen.findByText('test.pdf')).toBeInTheDocument()
  })

  it('rejects a file over the 10MB limit without calling the API', async () => {
    mockedApi.attachments.list.mockResolvedValue([])
    const user = userEvent.setup()
    render(<CardAttachmentsTab card={mockCard} />)
    await screen.findByText('No attachments yet.')
    const bigFile = new File([new Uint8Array(11 * 1024 * 1024)], 'huge.zip', { type: 'application/zip' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, bigFile)
    expect(mockedApi.attachments.upload).not.toHaveBeenCalled()
  })

  it('removes an attachment', async () => {
    mockedApi.attachments.list.mockResolvedValue([mockAttachment])
    mockedApi.attachments.remove.mockResolvedValue({ deleted: true })
    const user = userEvent.setup()
    render(<CardAttachmentsTab card={mockCard} />)
    await screen.findByText('test.pdf')
    await user.click(screen.getByTitle('Delete attachment'))
    await waitFor(() => {
      expect(mockedApi.attachments.remove).toHaveBeenCalledWith(1)
    })
    expect(screen.queryByText('test.pdf')).not.toBeInTheDocument()
  })
})
