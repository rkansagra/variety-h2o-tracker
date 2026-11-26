import { PRIVACY_POLICY_URL } from "../lib/urls";

export default function PrivacyPolicyLink({ id }) {
  return (
    <p style={{ marginTop: 16, fontSize: 14 }}>
      <a id={id} href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--vh2o-text-muted)", fontWeight: 600 }}>
        Privacy Policy
      </a>
    </p>
  );
}
