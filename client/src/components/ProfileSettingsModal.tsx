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

  // Work location
  const [country, setCountry] = useState('')
  const [state, setState] = useState('')
  const [city, setCity] = useState('')

  // Home location
  const [homeCountry, setHomeCountry] = useState('')
  const [homeState, setHomeState] = useState('')
  const [homeCity, setHomeCity] = useState('')

  // Work & personal
  const [jobTitle, setJobTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [timezone, setTimezone] = useState('')
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState('')
  const [reportingManagerId, setReportingManagerId] = useState<number | null>(null)
  const [reportingManagerSearch, setReportingManagerSearch] = useState('')
  const [reportingManagerCandidates, setReportingManagerCandidates] = useState<Array<{ id: number; display_name: string }>>([])
  const [showManagerDropdown, setShowManagerDropdown] = useState(false)

  const [reportingManagerName, setReportingManagerName] = useState('')

  useEffect(() => {
    if (isOpen && user) {
      setEmailNotifications(user.email_notifications ?? true)
      setCountry(user.country ?? '')
      setState(user.state ?? '')
      setCity(user.city ?? '')
      setHomeCountry(user.home_country ?? '')
      setHomeState(user.home_state ?? '')
      setHomeCity(user.home_city ?? '')
      setJobTitle(user.job_title ?? '')
      setDepartment(user.department ?? '')
      setTimezone(user.timezone ?? '')
      setPhone(user.phone ?? '')
      setGender(user.gender ?? '')
      setReportingManagerId(user.reporting_manager_id ?? null)
      setReportingManagerName(user.reporting_manager?.display_name ?? '')
    }
  }, [isOpen, user])

  async function searchManagers(q: string) {
    if (!q.trim()) {
      setReportingManagerCandidates([])
      return
    }
    try {
      const results = await api.users.search(q)
      setReportingManagerCandidates(results.filter(u => u.id !== user?.id).slice(0, 10))
    } catch {
      setReportingManagerCandidates([])
    }
  }

  async function handleToggleEmail() {
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

  async function saveWorkLocation() {
    if (!user) return
    setLoading(true)
    try {
      await api.auth.updateMe({
        country: country || null,
        state: state || null,
        city: city || null,
      })
      onSettingsChanged()
      toast.success('Work location saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save work location')
    } finally {
      setLoading(false)
    }
  }

  async function saveHomeLocation() {
    if (!user) return
    setLoading(true)
    try {
      await api.auth.updateMe({
        home_country: homeCountry || null,
        home_state: homeState || null,
        home_city: homeCity || null,
      })
      onSettingsChanged()
      toast.success('Home location saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save home location')
    } finally {
      setLoading(false)
    }
  }

  async function saveWorkProfile() {
    if (!user) return
    setLoading(true)
    try {
      await api.auth.updateMe({
        timezone: timezone || null,
        job_title: jobTitle || null,
        department: department || null,
        phone: phone || null,
        gender: gender || null,
        reporting_manager_id: reportingManagerId,
      })
      onSettingsChanged()
      toast.success('Profile saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save profile')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const inputCls = 'w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const buttonCls = 'px-3 py-2 text-xs font-medium rounded-lg'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {/* Email Notifications */}
          {emailNotificationsEnabled && (
            <div className="pb-4 border-b border-slate-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={handleToggleEmail}
                  disabled={loading}
                  className="w-4 h-4"
                />
                <span className="text-sm text-slate-700">
                  Email notifications for mentions, assignments, and due dates
                </span>
              </label>
            </div>
          )}

          {/* Work Location */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Work Location</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Country</label>
                <input type="text" value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g. United States" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">State / Province</label>
                <input type="text" value={state} onChange={e => setState(e.target.value)} placeholder="e.g. California" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">City</label>
                <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. San Francisco" className={inputCls} />
              </div>
              <button
                onClick={saveWorkLocation}
                disabled={loading}
                className={`${buttonCls} w-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50`}
              >
                Save Work Location
              </button>
            </div>
          </div>

          {/* Home Location */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Home Location</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Country</label>
                <input type="text" value={homeCountry} onChange={e => setHomeCountry(e.target.value)} placeholder="e.g. United States" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">State / Province</label>
                <input type="text" value={homeState} onChange={e => setHomeState(e.target.value)} placeholder="e.g. California" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">City</label>
                <input type="text" value={homeCity} onChange={e => setHomeCity(e.target.value)} placeholder="e.g. San Francisco" className={inputCls} />
              </div>
              <button
                onClick={saveHomeLocation}
                disabled={loading}
                className={`${buttonCls} w-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50`}
              >
                Save Home Location
              </button>
            </div>
          </div>

          {/* Work & Personal */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Work & Personal</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Job Title</label>
                <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Senior Engineer" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
                <input type="text" value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Engineering" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Timezone</label>
                <input type="text" value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="e.g. America/Los_Angeles" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. +1-555-0100" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
                <input type="text" value={gender} onChange={e => setGender(e.target.value)} placeholder="e.g. Female, Male, Other" className={inputCls} />
              </div>
              <div className="relative">
                <label className="block text-xs font-medium text-slate-700 mb-1">Reporting Manager</label>
                <input
                  type="text"
                  value={reportingManagerSearch}
                  onChange={e => {
                    setReportingManagerSearch(e.target.value)
                    searchManagers(e.target.value)
                    setShowManagerDropdown(true)
                  }}
                  onFocus={() => setShowManagerDropdown(true)}
                  placeholder="Search by name..."
                  className={inputCls}
                />
                {reportingManagerId && (
                  <div className="mt-1 text-xs text-slate-600">
                    Selected: <span className="font-medium">{reportingManagerName}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setReportingManagerId(null)
                        setReportingManagerName('')
                        setReportingManagerSearch('')
                      }}
                      className="ml-2 text-indigo-600 hover:text-indigo-700"
                    >
                      Clear
                    </button>
                  </div>
                )}
                {showManagerDropdown && reportingManagerCandidates.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-10">
                    {reportingManagerCandidates.map(mgr => (
                      <button
                        key={mgr.id}
                        type="button"
                        onClick={() => {
                          setReportingManagerId(mgr.id)
                          setReportingManagerName(mgr.display_name)
                          setReportingManagerSearch('')
                          setShowManagerDropdown(false)
                          setReportingManagerCandidates([])
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 border-b border-slate-100 last:border-0"
                      >
                        {mgr.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={saveWorkProfile}
                disabled={loading}
                className={`${buttonCls} w-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50`}
              >
                Save Profile
              </button>
            </div>
          </div>
        </div>

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
