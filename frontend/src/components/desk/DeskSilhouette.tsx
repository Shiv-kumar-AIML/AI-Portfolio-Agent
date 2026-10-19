/**
 * A soft, pulsing silhouette of the desk scene — shown while the 3D scene downloads (slow over a
 * tunnel or a weak connection) so the hero never looks empty. Same box and roughly the same
 * composition as DeskScene's camera view, so the swap is calm.
 */
export function DeskSilhouette({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <svg viewBox="0 0 400 300" className="h-full w-full animate-pulse text-foreground">
        {/* floor shadow */}
        <ellipse cx="205" cy="262" rx="150" ry="22" fill="currentColor" opacity="0.06" />

        <g fill="currentColor" opacity="0.1">
          {/* character behind the desk: hair + head, shoulders */}
          <path d="M228 70h62l6 10v18l-4 4h-66l-4-6V80z" />
          <rect x="232" y="96" width="56" height="50" rx="4" />
          <rect x="226" y="146" width="68" height="40" rx="6" />
          {/* chair back */}
          <rect x="222" y="150" width="76" height="16" rx="3" opacity="0.7" />
        </g>

        <g fill="currentColor" opacity="0.13">
          {/* desk top (in perspective) */}
          <path d="M92 182 L252 152 L332 182 L172 214 Z" />
          {/* desk legs */}
          <rect x="96" y="186" width="8" height="58" rx="2" />
          <rect x="166" y="214" width="9" height="56" rx="2" />
          <rect x="322" y="186" width="8" height="52" rx="2" />
          <rect x="244" y="160" width="7" height="44" rx="2" opacity="0.7" />
          {/* laptop lid */}
          <path d="M178 150 L230 138 L240 170 L188 182 Z" />
          {/* plant */}
          <rect x="128" y="160" width="16" height="14" rx="2" />
          <path d="M136 160c-8-8-10-16-4-22 4 6 6 12 4 22zm0 0c6-10 12-14 18-12-4 6-10 10-18 12z" />
        </g>
      </svg>
    </div>
  )
}
