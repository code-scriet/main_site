// "code.scriet" wordmark — italic Newsreader with the ember-coloured dot.
// Uses .pub-wm styles defined under [data-public] in apps/web/src/index.css.
// Renders inert HTML; works inside any [data-public] scope (Layout wraps the public site).

type WordmarkSize = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<WordmarkSize, number> = {
  sm: 20,
  md: 24,
  lg: 32,
};

export function Wordmark({ size = 'sm', className }: { size?: WordmarkSize; className?: string }) {
  return (
    <span className={`pub-wm ${className ?? ''}`.trim()} style={{ fontSize: `${SIZE_PX[size]}px` }}>
      <span>code</span>
      <span className="pub-wm-dot">.</span>
      <span>scriet</span>
    </span>
  );
}
