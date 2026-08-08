# Security Policy

## Reporting vulnerabilities

Report suspected vulnerabilities privately to the repository owners through an
approved internal security channel. Do not disclose exploitable details in a
public issue. No contact address is declared here until an authorized response
channel is established.

## Repository controls

- Never commit passwords, tokens, private keys, credentials, private certificates, connection strings, or production data.
- Store credentials in an approved secret manager, rotate them after suspected exposure, and grant only the minimum required privilege.
- Keep sensitive and regulated data out of source control; use sanitized or synthetic test data.
- Review dependency vulnerability reports and remediate findings according to their severity and exploitability.
- Require security review for authentication, authorization, cryptography, credential handling, network exposure, data-protection, and infrastructure changes.
- Do not bypass required review, CI, secret scanning, or branch protection controls.

If a secret is committed, stop distribution where possible, revoke and rotate it
immediately, preserve evidence, and follow the approved incident-response process.
Removing it from the latest revision alone is not sufficient.
