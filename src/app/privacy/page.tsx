import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — HMARK Consultants",
  description: "How HMARK Consultants collects, uses, shares and protects personal information.",
};

const CONTACT_EMAIL = "info@hmarkconsultants.com";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="28 October 2026">
      <h2>1. Who we are</h2>
      <p>
        HMARK Consultants (&quot;HMARK&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is an education
        consultancy that helps students pursue higher education abroad. This Privacy Policy explains how we collect,
        use, share and protect personal information through our website (hmarkconsultants.com), our student, staff and
        partner portal, and our social media activities. For any privacy question or request, contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>2. Scope</h2>
      <p>
        This policy applies to visitors to our website; prospective and enrolled students who enquire or register with
        us; our staff and authorised partners who use the HMARK Student Portal; and people who interact with our
        official social media accounts.
      </p>

      <h2>3. Information we collect</h2>
      <h3>Information you give us</h3>
      <ul>
        <li>Contact and identity details, such as name, email, phone, country and date of birth.</li>
        <li>Education background, programme interests, documents and application information you provide for study-abroad services.</li>
        <li>Account credentials for the portal, and communications you send us.</li>
      </ul>
      <h3>Information we collect automatically</h3>
      <ul>
        <li>Usage and device data, such as pages viewed, IP address and browser type, and cookies (see Section 11).</li>
      </ul>
      <h3>Information from third parties</h3>
      <ul>
        <li>
          When we connect our <strong>own</strong> official social media accounts (see Section 5), we receive account
          information and content-performance metrics from those platforms.
        </li>
      </ul>

      <h2>4. How we use your information</h2>
      <p>
        We use personal information to respond to enquiries and provide study-abroad consultancy; manage student
        applications and our relationship with you; operate and secure the portal; communicate with you, including by
        email; publish and measure marketing content on our own channels; comply with legal obligations; and improve our
        services. Where applicable, our legal bases include your consent, performance of a contract, our legitimate
        interests, and legal compliance.
      </p>

      <h2>5. Social media integrations</h2>
      <p>
        We operate official HMARK accounts on platforms including <strong>Facebook, Instagram, Threads, LinkedIn, TikTok
        and Snapchat</strong>. Authorised HMARK staff connect these company-owned accounts to our portal to compose,
        schedule, publish and measure our own marketing content.
      </p>
      <ul>
        <li>Access tokens for these accounts are stored encrypted and are used only to post to, and read performance data from, our own accounts.</li>
        <li>We do not access the private data of our followers or other users through these integrations.</li>
        <li>
          Our use of information received from the Meta, TikTok, LinkedIn and Snapchat APIs adheres to each platform&apos;s
          developer and platform terms, including applicable limited-use requirements.
        </li>
      </ul>

      <h2>6. How we share information</h2>
      <p>We do not sell personal information. We share it only with:</p>
      <ul>
        <li>
          <strong>Service providers</strong> who operate our systems under contract — including Supabase (database and
          storage), Vercel (hosting) and our email delivery provider — and the social media platforms listed above when
          we publish our own content.
        </li>
        <li>
          <strong>Professional advisers, partners and institutions</strong> where necessary to deliver the services you
          requested, such as universities you apply to, with appropriate safeguards.
        </li>
        <li><strong>Authorities</strong>, where required by law or to protect our rights, users or the public.</li>
      </ul>

      <h2>7. Data retention</h2>
      <p>
        We keep personal information only as long as needed for the purposes above or as required by law, after which it
        is deleted or anonymised.
      </p>

      <h2>8. Data security</h2>
      <p>
        We use technical and organisational measures — including encryption of credentials, access controls and
        row-level security — to protect personal information. No system is perfectly secure, but we work to protect your
        data and respond to incidents appropriately.
      </p>

      <h2>9. International transfers</h2>
      <p>
        We and our service providers may process data in countries other than your own. Where we transfer personal data
        internationally, we use appropriate safeguards consistent with applicable law.
      </p>

      <h2>10. Your rights</h2>
      <p>
        Subject to applicable law, you may request access to, correction of, or deletion of your personal information,
        object to or restrict certain processing, or withdraw consent. To exercise these rights, contact{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. You may also have the right to complain to your local
        data protection authority.
      </p>

      <h2>11. Cookies</h2>
      <p>
        Our website uses cookies and similar technologies for functionality and analytics. You can control cookies
        through your browser settings; disabling some may affect site functionality.
      </p>

      <h2>12. Children</h2>
      <p>
        Our services are intended for users aged 16 and above. We do not knowingly collect personal information from
        children below that age.
      </p>

      <h2>13. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. We will post the updated version here and revise the &quot;Last
        updated&quot; date.
      </p>

      <h2>14. Contact us</h2>
      <p>
        HMARK Consultants · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> ·{" "}
        <a href="https://hmarkconsultants.com">hmarkconsultants.com</a>
      </p>
    </LegalPage>
  );
}
