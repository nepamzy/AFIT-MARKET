import { cn } from './cn'

export type Step = {
  label: string
  detail?: string
  state: 'done' | 'current' | 'upcoming'
  /** Where tapping the step goes (for example the place on the page where the customer scans). */
  href?: string
}
export function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-4" aria-label="Progress">
      {steps.map((s, i) => (
        <li
          key={i}
          className="flex gap-3"
          aria-current={s.state === 'current' ? 'step' : undefined}
        >
          <span
            aria-hidden="true"
            className={cn(
              'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 text-xs font-bold',
              s.state === 'done' && 'border-success-700 bg-success-700 text-white',
              s.state === 'current' && 'border-brand-700 bg-brand-50 text-brand-800',
              s.state === 'upcoming' && 'border-line-strong bg-card text-muted',
            )}
          >
            {s.state === 'done' ? '✓' : i + 1}
          </span>
          <div>
            <p className={cn('font-semibold', s.state === 'upcoming' && 'text-muted')}>
              {s.href ? (
                <a href={s.href} className="text-brand-800 underline underline-offset-2">
                  {s.label}
                </a>
              ) : (
                s.label
              )}
              <span className="sr-only">
                {' '}
                ({s.state === 'done' ? 'done' : s.state === 'current' ? 'current step' : 'not yet'})
              </span>
            </p>
            {s.detail && <p className="text-sm text-muted">{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
