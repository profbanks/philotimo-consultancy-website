# Running The Philotimo Consultancy Site Locally

This repository can run on localhost without Netlify.

## Start The Consultancy Website And Local Backend

From this folder, run:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\local-server.ps1
```

Then open:

```text
http://localhost:4180/
```

The public page does not show the administrator panel. To access the consultancy admin desk, open:

```text
http://localhost:4180/?admin=1#admin-portal
```

## Local Admin Access

The default local admin code is:

```text
PHILOTIMO-ADMIN
```

To use a different code for localhost, set this environment variable before starting the server:

```powershell
$env:ADMIN_ACCESS_CODE = "your-private-admin-code"
powershell.exe -ExecutionPolicy Bypass -File .\local-server.ps1
```

## Local Data Storage

Local portal records are saved here:

```text
data/local-portal-state.json
```

This local JSON backend is separate from Netlify. The Netlify deployment can remain online, but localhost does not depend on Netlify.

## Local Email Notifications

When an administrator approves a teacher, allocates a student, vets a jobseeker, matches a candidate to an employer request, or verifies a subscription payment, the backend creates corresponding email notices immediately.

Subscription proofs of payment are saved in the same local JSON file as data URLs. When the admin verifies a subscription, the backend issues a receipt number such as `PES-REC-2026-0001` and includes it in the subscriber email notice.

To send real emails from localhost, set SMTP details before starting the server:

```powershell
$env:SMTP_HOST = "smtp.example.com"
$env:SMTP_PORT = "587"
$env:SMTP_USERNAME = "your-smtp-username"
$env:SMTP_PASSWORD = "your-smtp-password"
$env:SMTP_FROM = "info@yourdomain.com"
$env:SMTP_FROM_NAME = "Philotimo Educational Consultancy Services"
powershell.exe -ExecutionPolicy Bypass -File .\local-server.ps1
```

If SMTP is not configured, each notice is saved in the local JSON file and the admin dashboard reports that email delivery is not configured yet.

## GitHub

The consultancy website repository is:

```text
https://github.com/profbanks/philotimo-consultancy-website
```
