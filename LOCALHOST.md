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

## GitHub

The consultancy website repository is:

```text
https://github.com/profbanks/philotimo-consultancy-website
```
