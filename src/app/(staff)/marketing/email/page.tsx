import { redirect } from "next/navigation";

// Templates are the first part of Email campaigns to be built; the section opens on them.
export default function EmailCampaignsPage() {
  redirect("/marketing/email/templates");
}
