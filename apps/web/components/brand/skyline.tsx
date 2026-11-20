type SkylineProps = {
  variant?: 'hero' | 'footer';
  className?: string;
};

/**
 * Deterministic architectural skyline silhouette from the Odibrick brand system:
 * flat geometric buildings in deep green with muted sage windows.
 */
export function Skyline({ variant = 'hero', className = '' }: SkylineProps) {
  const isHero = variant === 'hero';
  const width = 1440;
  const height = isHero ? 190 : 120;
  const bodyFill = isHero ? '#1A4A3C' : '#133D31';
  const winFill = '#B9CFC5';
  const baseWinOpacity = isHero ? 0.35 : 0.55;

  let seed = isHero ? 7 : 13;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  let x = isHero ? 720 : 0;
  const buildings: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    roof?: string;
    windows: Array<{ x: number; y: number; opacity: number }>;
  }> = [];

  while (x < width) {
    const w = 50 + rand() * 70;
    const h = height * (0.35 + rand() * 0.6);
    const y = height - h;
    const roof =
      rand() > 0.7
        ? `M${x.toFixed(1)} ${y.toFixed(1)}l${(w / 2).toFixed(1)} -${(16 + rand() * 14).toFixed(1)}l${(w / 2).toFixed(1)} ${(16 + rand() * 14).toFixed(1)}z`
        : undefined;

    const windows: Array<{ x: number; y: number; opacity: number }> = [];
    for (let wy = y + 12; wy < height - 12; wy += 16) {
      for (let wx = x + 9; wx < x + w - 14; wx += 15) {
        if (rand() > 0.35) {
          windows.push({
            x: Number(wx.toFixed(1)),
            y: Number(wy.toFixed(1)),
            opacity: Number((baseWinOpacity * (0.5 + rand() * 0.6)).toFixed(2)),
          });
        }
      }
    }

    buildings.push({
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      w: Number(w.toFixed(1)),
      h: Number(h.toFixed(1)),
      roof,
      windows,
    });

    x += w + (rand() > 0.6 ? 6 : 0);
  }

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none leading-none ${className}`}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio={isHero ? 'xMaxYMax meet' : 'none'}
        className="h-auto w-full"
      >
        {buildings.map((b, idx) => (
          <g key={idx}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={bodyFill} />
            {b.roof ? <path d={b.roof} fill={bodyFill} /> : null}
            {b.windows.map((win, wIdx) => (
              <rect
                key={wIdx}
                x={win.x}
                y={win.y}
                width={6}
                height={7}
                fill={winFill}
                opacity={win.opacity}
              />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
