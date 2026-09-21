// Axes & Fix. Geometry is fixed by brand/BRAND.md §4: never redraw, round or restyle it.
export function LogoSymbol({ size = 22, title }: { size?: number; title?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path className="logo-axes" d="M2 2H5V11H14V14H2Z" />
      <rect className="logo-fix" x="8" y="5" width="3" height="3" />
    </svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="wordmark">
      <LogoSymbol size={size} />
      <span className="wordmark-text">Lodestar</span>
    </span>
  );
}
