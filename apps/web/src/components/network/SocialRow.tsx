import type { SocialLink } from './profileHelpers';

export function SocialRow({ socials }: { socials: SocialLink[] }) {
  if (socials.length === 0) {
    return <span className="text-[11px] italic text-gray-300 dark:text-zinc-600">No links</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      {socials.map((social) => (
        <a
          key={social.label}
          href={social.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className={`rounded-xl border border-gray-100 bg-gray-50/80 p-1.5 text-gray-400 shadow-sm transition-all hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600 hover:shadow dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-500 dark:hover:border-red-950/80 dark:hover:bg-zinc-800 ${social.hoverClass}`}
          aria-label={social.label}
        >
          <social.icon className="h-3.5 w-3.5" />
        </a>
      ))}
    </div>
  );
}
