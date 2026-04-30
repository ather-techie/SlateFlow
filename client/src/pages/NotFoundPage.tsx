import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 text-center px-6">
      <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mb-6">
        <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold text-slate-900 mb-2">404</h1>
      <p className="text-slate-500 mb-8 max-w-sm">
        This page doesn't exist or was moved.
      </p>
      <Link
        to="/dashboard"
        className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition"
      >
        Back to Dashboard
      </Link>
    </div>
  )
}
