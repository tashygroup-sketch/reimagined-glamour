// The store's social pages. Edit the links here if an account changes.
const LINKS = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/share/19WnfF6yuM/",
    icon: (
      <path d="M14 8.5h2.5V5H14c-2.2 0-4 1.8-4 4v2H7.5v3.5H10V21h3.5v-6.5H16l.5-3.5h-3V9.5c0-.6.4-1 1-1Z" />
    ),
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/glamour_with_jannat/",
    icon: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
      </>
    ),
  },
  {
    label: "Snapchat",
    href: "https://snapchat.com/t/fE6VM2Gd",
    icon: (
      <path d="M12 3c-3.1 0-5.2 2.3-5.2 5.3v2.3c-.6 0-1.3-.2-1.7.2-.4.5.3 1 1 1.3.4.2.6.5.4.9-.6 1.4-1.7 2.6-3.1 3.1-.4.2-.3.7.1.9.7.3 1.5.4 1.8.8.2.3 0 .9.5 1.1.6.2 1.3-.1 2.2.1 1.1.3 2 1.6 4 1.6s2.9-1.3 4-1.6c.9-.2 1.6.1 2.2-.1.5-.2.3-.8.5-1.1.3-.4 1.1-.5 1.8-.8.4-.2.5-.7.1-.9-1.4-.5-2.5-1.7-3.1-3.1-.2-.4 0-.7.4-.9.7-.3 1.4-.8 1-1.3-.4-.4-1.1-.2-1.7-.2V8.3C17.2 5.3 15.1 3 12 3Z" />
    ),
  },
];

export function SocialLinks({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      {LINKS.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {link.icon}
          </svg>
        </a>
      ))}
    </div>
  );
}
