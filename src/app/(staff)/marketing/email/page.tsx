import { redirect } from "next/navigation";

// The section opens on its campaigns.
export default function EmailCampaignsPage() {
  redirect("/marketing/email/campaigns");
}
