interface Props {
  title: string
  color: string
  onClick?: () => void
  startsToday?: boolean
  endsToday?: boolean
  truncate?: boolean
  small?: boolean
}

export default function EntryBar({ title, color, onClick, startsToday, endsToday, truncate = true, small = false }: Props) {
  const radius = [
    startsToday ? 'rounded-l-md' : 'rounded-l-none',
    endsToday ? 'rounded-r-md' : 'rounded-r-none',
  ].join(' ')

  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        'w-full text-white text-left px-1.5 leading-tight transition-opacity hover:opacity-90 focus:outline-none focus:ring-1 focus:ring-white',
        small ? 'text-[10px] py-0.5' : 'text-[11px] py-0.5',
        truncate ? 'truncate' : '',
        radius,
      ].join(' ')}
      style={{ backgroundColor: color }}
    >
      {startsToday ? title : <span className="opacity-0">{title}</span>}
    </button>
  )
}
