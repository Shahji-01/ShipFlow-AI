import MarketingShell from "../components/marketing/marketing-shell";
import Landing from "../components/marketing/landing";

/**
 * Public landing page at the site root.
 *
 * Kept as a top-level `app/page.tsx` (not inside a route group) so Vercel's
 * Next.js output tracer reliably finds its client-reference manifest. The
 * marketing chrome (navbar/footer) lives in `MarketingShell`.
 */
export default function HomePage() {
  return (
    <MarketingShell>
      <Landing />
    </MarketingShell>
  );
}
