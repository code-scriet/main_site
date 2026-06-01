// Brand icons that lucide-react doesn't ship.
//
// All three match the design bundle's outline aesthetic: 24×24 viewBox,
// 1.5px round-cap/round-join stroke, currentColor stroke, no fill. They sit
// alongside lucide's `Github`/`Linkedin`/`Instagram` (already same style)
// without any visual seam.
//
// Source paths are lifted verbatim from
// tmp/design_bundle/code-scriet-frintend/project/lib/icons.jsx so the rendered
// glyphs are pixel-identical to the Claude Design mockups.

type IconProps = {
  size?: number;
  strokeWidth?: number;
  className?: string;
};

function svgProps(size: number, strokeWidth: number, className?: string) {
  return {
    xmlns: 'http://www.w3.org/2000/svg',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
    className,
  };
}

export function DiscordIcon({ size = 16, strokeWidth = 1.5, className }: IconProps) {
  return (
    <svg {...svgProps(size, strokeWidth, className)}>
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.07.07 0 0 0-.075.036c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0c-.165-.395-.405-.875-.617-1.25a.077.077 0 0 0-.075-.036A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.083.083 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.042-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127c-.598.349-1.22.645-1.873.891a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.056c.5-5.177-.838-9.673-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.42 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.42-2.157 2.42zm7.975 0c-1.183 0-2.157-1.086-2.157-2.42 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.42-2.157 2.42z" />
    </svg>
  );
}

// "X" for settings.twitterUrl. We render the bird path the design bundle uses
// — outline-only, 1.5px stroke — so the icon row stays visually uniform with
// the lucide outline icons next to it. The new X-mark glyph is a heavy filled
// shape that would break the line-art consistency.
export function XIcon({ size = 16, strokeWidth = 1.5, className }: IconProps) {
  return (
    <svg {...svgProps(size, strokeWidth, className)}>
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
    </svg>
  );
}

export function WhatsAppIcon({ size = 16, strokeWidth = 1.5, className }: IconProps) {
  return (
    <svg {...svgProps(size, strokeWidth, className)}>
      {/* Phone bubble outline */}
      <path d="M20.5 3.5A11.78 11.78 0 0 0 12 .25C5.5.25.2 5.5.2 12a11.8 11.8 0 0 0 1.6 5.9L0 23.75l5.95-1.55a11.8 11.8 0 0 0 5.9 1.55c6.5 0 11.8-5.25 11.8-11.75 0-3.15-1.25-6.1-3.15-8.5z" />
      {/* Handset glyph */}
      <path d="M17.4 14.4c-.3-.15-1.8-.9-2.05-1-.3-.1-.5-.15-.7.15-.2.3-.75 1-.95 1.2-.15.2-.35.2-.65.05-.3-.15-1.25-.45-2.4-1.45-.9-.8-1.5-1.75-1.65-2.05-.2-.3 0-.45.1-.6.15-.15.3-.35.45-.5.15-.2.2-.3.3-.5.1-.2.05-.4 0-.55-.05-.15-.65-1.6-.9-2.2-.25-.55-.5-.5-.7-.5h-.55c-.2 0-.55.1-.8.4-.3.3-1 1-1 2.45 0 1.45 1.05 2.85 1.2 3.05.15.2 2.1 3.2 5.1 4.5.7.3 1.25.5 1.7.6.7.2 1.35.2 1.85.1.55-.1 1.8-.75 2-1.45.25-.7.25-1.3.2-1.45-.05-.15-.25-.2-.55-.35z" />
    </svg>
  );
}
