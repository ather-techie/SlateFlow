import { useFeatureFlagStore, type FeatureFlag } from '../store/featureFlagStore'

interface Props {
  flag: FeatureFlag
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function FeatureGate({ flag, children, fallback = null }: Props) {
  const { isEnabled, loading } = useFeatureFlagStore()
  if (loading) return null
  return isEnabled(flag) ? <>{children}</> : <>{fallback}</>
}
