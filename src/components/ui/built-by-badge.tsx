/**
 * "Built by NOBS Agent": the small credit badge for the site footer. Colours come from the style sheet (.built-by-*), not
 * inline hex values. The mark image is left out on purpose: loading it from another site would tell that site about every
 * visitor and need the page security policy loosened; add a copy of the file under /public/brand to show it.
 */
export function BuiltByBadge() {
  return (
    <a
      href="https://www.nobs-agent.site"
      target="_blank"
      rel="noopener noreferrer"
      className="built-by-badge"
    >
      <span className="built-by-label">Built by</span>
      <span className="built-by-name">NOBS Agent</span>
    </a>
  )
}
