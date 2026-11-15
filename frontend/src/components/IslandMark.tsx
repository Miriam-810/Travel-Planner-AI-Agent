/** The app's mark: a little floating island with a tree and a house. */
export function IslandMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <ellipse cx="32" cy="58" rx="14" ry="2.5" fill="#2e3a2d" opacity=".08" />
      {/* rock underside */}
      <path d="M10 34h44l-6 9-8 6-8 3-8-3-8-6z" fill="#c98f6a" />
      <path d="M32 52l-8-3-8-6-6-9h22z" fill="#b57b58" />
      {/* grass top */}
      <path d="M8 33c0-4 6-7 24-7s24 3 24 7-6 4-24 4-24 0-24-4z" fill="#9fbf7f" />
      <path d="M8 33c0 2.5 6 4 24 4s24-1.5 24-4c0 1.2-6 2.4-24 2.4S8 34.2 8 33z" fill="#86a96a" />
      {/* pond */}
      <ellipse cx="41" cy="32" rx="7" ry="2.2" fill="#8fb8c9" />
      {/* tree */}
      <rect x="17.2" y="22" width="1.8" height="8" rx=".9" fill="#7a5a43" />
      <path d="M18 8c4 4 6 8 6 11a6 6 0 0 1-12 0c0-3 2-7 6-11z" fill="#6e8b69" />
      {/* house */}
      <rect x="27" y="22" width="9" height="7" rx="1" fill="#faf8f3" />
      <path d="M25.5 23l6-6 6 6z" fill="#5f9e9a" />
      <rect x="30.4" y="25" width="2.2" height="4" rx=".6" fill="#e5b25d" />
    </svg>
  )
}
