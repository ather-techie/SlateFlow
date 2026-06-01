import type { Card } from '../../types'

interface Props {
  card: Card
}

// TODO: Extract file attachment upload and list (gated by card_attachments flag)
// Should handle: display attachment list with preview thumbnails, upload with drag-drop, delete
// Uses: api.attachments.list, api.attachments.upload, api.attachments.remove
export default function CardAttachmentsTab({ card }: Props) {
  return (
    <div className="text-sm text-slate-500 p-4 border border-slate-200 rounded-lg bg-slate-50">
      <p>📎 Attachments tab</p>
      <p className="text-xs mt-2">Card ID: {card.id}</p>
      <p className="text-xs text-slate-400 mt-4">
        TODO: Implement file list with image previews, upload area, and delete buttons<br />
        See CardModal.old.tsx lines ~1550-1640 for original implementation
      </p>
    </div>
  )
}
