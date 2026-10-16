import { PRIVACY_POLICY_URL } from "../lib/urls";

export default function PrivacyPolicyLink({ id }) {
  return (
    <p style={{ marginTop: 16, fontSize: 13 }}>
      <a id={id} href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--vh2o-accent)" }}>
        Privacy Policy
      </a>
    </p>
  );
}
