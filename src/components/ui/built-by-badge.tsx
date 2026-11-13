/**
 * "Built by NOBS Agent": the small credit badge for the site footer. Colours come from the style sheet (.built-by-*), not
 * inline hex values. The mark is a plain picture file kept on this site (public/brand/nobs-mark.svg), so nothing is loaded
 * from another site and the page security policy stays as it is.
 */
export function BuiltByBadge() {
  return (
    <a
      href="https://www.nobs-agent.site"
      target="_blank"
      rel="noopener noreferrer"
      className="built-by-badge"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/nobs-mark.svg" alt="" width={16} height={16} className="built-by-mark" />
      <span className="built-by-label">Built by</span>
      <span className="built-by-name">NOBS Agent</span>
    </a>
  )
}
