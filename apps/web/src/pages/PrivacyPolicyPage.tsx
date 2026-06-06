import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';

export default function PrivacyPolicyPage() {
  return (
    <Layout>
      <SEO
        title="Privacy Policy — codescriet Coding Club"
        description="Privacy policy for codescriet.dev — how we collect, use, and protect your data."
        url="/privacy-policy"
      />
      <section className="py-14 sm:py-20 bg-amber-50 min-h-screen">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 mb-8">Privacy Policy</h1>
          <div className="prose prose-amber max-w-none text-gray-700 space-y-6">
            <p className="text-sm text-gray-500">Last updated: March 12, 2026</p>

            <h2 className="text-xl font-semibold text-amber-900 mt-8">1. Introduction</h2>
            <p>
              Welcome to codescriet.dev ("we", "our", "us"). We are the official coding club of SCRIET,
              CCS University, Meerut. This Privacy Policy explains how we collect, use, and protect your
              information when you visit our website or use our services.
            </p>

            <h2 className="text-xl font-semibold text-amber-900 mt-8">2. Information We Collect</h2>
            <p>We may collect the following types of information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Account Information:</strong> Name, email address, and profile picture when you
                register or sign in via Google or GitHub OAuth.
              </li>
              <li>
                <strong>Profile Information:</strong> Bio, skills, social links, and other details you
                voluntarily add to your profile.
              </li>
              <li>
                <strong>Event Registrations:</strong> Information you provide when registering for events,
                including custom form responses.
              </li>
              <li>
                <strong>Usage Data:</strong> Pages visited, features used, and interactions with the platform.
              </li>
            </ul>

            <h2 className="text-xl font-semibold text-amber-900 mt-8">3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, maintain, and improve our services</li>
              <li>Process event registrations and send event reminders</li>
              <li>Generate certificates for event participation</li>
              <li>Facilitate the alumni and professional network</li>
              <li>Send announcements and updates related to club activities</li>
              <li>Respond to your inquiries and requests</li>
            </ul>

            <h2 className="text-xl font-semibold text-amber-900 mt-8">4. Data Sharing</h2>
            <p>
              We do not sell your personal information. We may share limited data with:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Third-party services:</strong> Google and GitHub for authentication; Cloudinary
                for image hosting; Brevo for transactional emails.
              </li>
              <li>
                <strong>University administration:</strong> Aggregated, anonymized participation data
                when required for club reporting.
              </li>
            </ul>

            <h2 className="text-xl font-semibold text-amber-900 mt-8">5. Data Security</h2>
            <p>
              We use industry-standard practices to protect your data, including encrypted connections
              (HTTPS), secure authentication tokens, and access controls. However, no method of
              electronic transmission is 100% secure.
            </p>

            <h2 className="text-xl font-semibold text-amber-900 mt-8">6. Cookies</h2>
            <p>
              We use cookies to maintain your login session (<code>scriet_session</code>) and store
              authentication tokens. These are essential for the platform to function. We do not use
              third-party tracking cookies.
            </p>

            <h2 className="text-xl font-semibold text-amber-900 mt-8">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Withdraw consent for data processing at any time</li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:contact@codescriet.dev" className="text-amber-600 hover:underline">
                contact@codescriet.dev
              </a>.
            </p>

            <h2 className="text-xl font-semibold text-amber-900 mt-8">8. Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. Changes will be posted on this page with an
              updated "Last updated" date.
            </p>

            <h2 className="text-xl font-semibold text-amber-900 mt-8">9. Contact</h2>
            <p>
              If you have questions about this Privacy Policy, contact us at{' '}
              <a href="mailto:contact@codescriet.dev" className="text-amber-600 hover:underline">
                contact@codescriet.dev
              </a>.
            </p>
          </div>
        </div>
      </section>
    </Layout>
  );
}
