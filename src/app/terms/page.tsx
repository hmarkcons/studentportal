import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service — HMARK Consultants",
  description: "The terms that govern use of the HMARK Consultants website and Student Portal.",
};

const CONTACT_EMAIL = "info@hmarkconsultants.com";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="28 October 2026">
      <h2>1. Agreement</h2>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of the website hmarkconsultants.com, the HMARK Student
        Portal, and related services (together, the &quot;Services&quot;) provided by HMARK Consultants (&quot;HMARK&quot;,
        &quot;we&quot;, &quot;us&quot;). By using the Services, you agree to these Terms. If you do not agree, do not use
        the Services.
      </p>

      <h2>2. The Services</h2>
      <p>
        HMARK provides education consultancy to help students pursue higher education abroad, together with an online
        portal used by our staff, students and authorised partners to manage enquiries, applications and related
        communications.
      </p>

      <h2>3. Eligibility and accounts</h2>
      <p>
        You must be at least 16 years old to use the Services. Portal access is limited to authorised users — staff,
        registered students and approved partners. You are responsible for keeping your login credentials confidential
        and for activity under your account. Notify us immediately of any unauthorised use.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Services unlawfully or fraudulently;</li>
        <li>attempt to access data or accounts that are not yours;</li>
        <li>disrupt, probe or circumvent the security of the Services;</li>
        <li>upload malicious code; or</li>
        <li>misuse the Services in any way that could harm HMARK, its users or third parties.</li>
      </ul>

      <h2>5. Your content and information</h2>
      <p>
        You are responsible for the accuracy of information and documents you submit. You grant us the right to use that
        information to provide the Services — for example, to prepare and submit applications on your behalf. Our
        handling of personal data is described in our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        The Services, including their content, branding and software, are owned by HMARK or its licensors and are
        protected by law. You may not copy, modify, distribute or create derivative works except as expressly permitted.
      </p>

      <h2>7. Third-party services</h2>
      <p>
        The Services integrate with and link to third-party platforms, including social media and infrastructure
        providers. We are not responsible for third-party services, and your use of them is subject to their own terms.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        The Services are provided &quot;as is&quot; and &quot;as available&quot;. We do not guarantee any particular
        outcome, including admission to any institution. To the fullest extent permitted by law, we disclaim all
        warranties not expressly stated.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, HMARK will not be liable for any indirect, incidental, special or
        consequential damages, or for loss of data, profits or goodwill, arising from your use of the Services.
      </p>

      <h2>10. Termination</h2>
      <p>
        We may suspend or terminate access to the Services at any time for breach of these Terms or to protect the
        Services or users. You may stop using the Services at any time.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These Terms are governed by the laws applicable where HMARK Consultants is established, without prejudice to any
        mandatory consumer protections available to you in your place of residence.
      </p>

      <h2>12. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Services after changes take effect constitutes
        acceptance of the updated Terms.
      </p>

      <h2>13. Contact</h2>
      <p>
        HMARK Consultants · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> ·{" "}
        <a href="https://hmarkconsultants.com">hmarkconsultants.com</a>
      </p>
    </LegalPage>
  );
}
