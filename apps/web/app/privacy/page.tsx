import Link from "next/link";

export const metadata = { title: "Privacy Policy — ShipFlow AI" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <Link
        href="/"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to home
      </Link>
      <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-foreground">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated {new Date().getFullYear()}
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <p>
          ShipFlow AI stores the data you provide to operate the product:
          account details, workspaces, projects, feature requests, PRDs, tasks,
          repository connections, and review history. We use this data solely to
          deliver the platform&apos;s functionality.
        </p>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Data we process
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Account &amp; authentication data (via BetterAuth).</li>
            <li>
              GitHub OAuth tokens, encrypted at rest, used only for the
              repositories you connect.
            </li>
            <li>Feature, PRD, task, and review content you create.</li>
          </ul>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Third-party services
          </h2>
          <p>
            We use GitHub (repositories), an AI provider (analysis, PRD/task
            generation, code review), and a payment provider for billing. Data
            shared with these services is limited to what each feature requires.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Contact
          </h2>
          <p>
            For privacy questions or data deletion requests, contact your
            workspace administrator.
          </p>
        </section>
        <p className="text-xs text-muted-foreground/70">
          This is a demo application; this policy is provided as a template.
        </p>
      </div>
    </main>
  );
}
