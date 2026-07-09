import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground font-sans">
      <div className="w-16 h-16 border-2 border-border mb-6 flex items-center justify-center font-mono text-xl">
        404
      </div>
      <h2 className="font-display text-3xl font-medium tracking-tight mb-2">Page Not Found</h2>
      <p className="text-foreground/60 font-mono text-[13px] mb-8">
        The system could not locate the requested resource.
      </p>
      <Link 
        href="/"
        className="px-6 py-2.5 bg-foreground text-background font-medium text-[13px] hover:bg-foreground/90 transition-colors"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}
