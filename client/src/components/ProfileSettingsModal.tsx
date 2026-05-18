import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { api } from '../api'
import { useFeatureFlagStore } from '../store/featureFlagStore'
import { useAuthStore } from '../store/authStore'

interface ProfileSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onSettingsChanged: () => void
}

export function ProfileSettingsModal({ isOpen, onClose, onSettingsChanged }: ProfileSettingsModalProps) {
  const { user } = useAuthStore()
  const emailNotificationsEnabled = useFeatureFlagStore(s => s.isEnabled('email_notifications'))
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && user) {
      setEmailNotifications(user.email_notifications ?? true)
    }
  }, [isOpen, user])

  async function handleToggle() {
    if (!user) return
    setLoading(true)
    try {
      await api.auth.updateProfile({ email_notifications: !emailNotifications })
      setEmailNotifications(!emailNotifications)
      onSettingsChanged()
      toast.success('Email preferences updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update settings')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {emailNotificationsEnabled && (
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={emailNotifications}
                onChange={handleToggle}
                disabled={loading}
                className="w-4 h-4"
              />
              <span className="text-sm text-slate-700">
                Email notifications for mentions, assignments, and due dates
              </span>
            </label>
          </div>
        )}

        <div className="mt-6 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
