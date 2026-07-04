import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import type { Card } from '../../types'
import { api } from '../../api/index'
import { fmtRelative } from '../../utils/cardModal'

interface Props {
  card: Card
}

interface Attachment {
  id: number
  card_id: number
  filename: string
  original_name: string
  mime_type: string
  size: number
  uploaded_by: number | null
  uploader_name?: string
  url: string
  created_at: string
}

const MAX_FILE_SIZE = 10 * 1024 * 1024

export default function CardAttachmentsTab({ card }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)

  useEffect(() => {
    api.attachments.list(card.id).then(setAttachments).catch(() => {})
  }, [card.id])

  async function handleUploadAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget
    const files = input.files
    if (!files) return
    setUploadingFile(true)
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name} exceeds 10 MB limit`)
          continue
        }
        const attachment = await api.attachments.upload(card.id, file)
        setAttachments(as => [attachment, ...as])
      }
      toast.success('Files uploaded')
    } catch {
      toast.error('Failed to upload file')
    } finally {
      setUploadingFile(false)
      input.value = ''
    }
  }

  async function handleRemoveAttachment(attachmentId: number) {
    try {
      await api.attachments.remove(attachmentId)
      setAttachments(as => as.filter(a => a.id !== attachmentId))
      toast.success('Attachment removed')
    } catch {
      toast.error('Failed to remove attachment')
    }
  }

  return (
    <div className="space-y-4">
      {attachments.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No attachments yet.</p>
      ) : (
        <div className="space-y-2">
          {attachments.map(a => {
            const isImage = a.mime_type.startsWith('image/')
            return (
              <div key={a.id} className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg bg-slate-50 group hover:bg-slate-100 transition-colors">
                {isImage ? (
                  <img src={a.url} alt={a.original_name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded bg-slate-300 flex items-center justify-center flex-shrink-0 text-xs font-bold text-slate-600">
                    {a.original_name.split('.').pop()?.toUpperCase().slice(0, 3) || 'FILE'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <a href={a.url} download={a.original_name} className="text-sm font-medium text-indigo-600 hover:underline truncate block">
                    {a.original_name}
                  </a>
                  <div className="text-xs text-slate-500 mt-0.5 flex gap-2">
                    <span>{(a.size / 1024).toFixed(0)} KB</span>
                    {a.uploader_name && <span>by {a.uploader_name}</span>}
                    <span>{fmtRelative(a.created_at)}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveAttachment(a.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 text-lg leading-none"
                  title="Delete attachment"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors cursor-pointer bg-white">
        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span className="text-sm font-medium text-slate-600">
          {uploadingFile ? 'Uploading…' : 'Click or drag to upload files'}
        </span>
        <input
          type="file"
          multiple
          disabled={uploadingFile}
          onChange={handleUploadAttachment}
          className="hidden"
        />
      </label>
      <p className="text-xs text-slate-400">Max 10 MB per file. Images, PDFs, and common formats supported.</p>
    </div>
  )
}
