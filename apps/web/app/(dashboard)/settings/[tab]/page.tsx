import { redirect } from "next/navigation";

const VALID_TABS = [
  "profile",
  "account",
  "notifications",
  "appearance",
  "integrations",
];

/**
 * Resolves path-style settings links like /settings/profile (which would
 * otherwise 404) to the tabbed settings page via /settings?tab=<tab>.
 * Unknown tabs fall back to the default settings page.
 */
export default async function SettingsTabRedirect({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  redirect(VALID_TABS.includes(tab) ? `/settings?tab=${tab}` : "/settings");
}
