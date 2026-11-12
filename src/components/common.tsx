import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  )
}

interface RingProps {
  value: number
  max: number
  size?: number
  stroke?: number
  children?: ReactNode
  label?: string
}

export function Ring({ value, max, size = 72, stroke = 5, children, label }: RingProps) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label ?? `${value} / ${max}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-content">{children}</div>
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}

export function SectionHeading({ title, extra }: { title: string; extra?: ReactNode }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {extra}
    </div>
  )
}

export function EmptyState({
  icon = 'info',
  title,
  description,
  action,
}: {
  icon?: IconName
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="toggle-row">
      <span className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {description ? <span className="toggle-description">{description}</span> : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </label>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          type="button"
          key={String(option.value)}
          className={option.value === value ? 'segmented-item is-active' : 'segmented-item'}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
