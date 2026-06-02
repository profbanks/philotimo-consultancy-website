# Philotimo Consultancy Backend Setup

The website backend runs on Netlify Functions and stores portal records in Netlify Blobs.

## Administrator Access

The administrator panel is not displayed on the public homepage. Open it directly with:

`/?admin=1#admin-portal`

Set these environment variables in Netlify:

- `ADMIN_ACCESS_CODE`: the private code used to unlock the admin desk
- `ADMIN_SESSION_SECRET`: a long random phrase used to sign admin sessions

In Netlify, open the project and go to:

`Project configuration -> Environment variables`

After saving the variables, redeploy the site from Netlify.

## Temporary Fallback

If `ADMIN_ACCESS_CODE` is not set, the backend accepts the old temporary code:

`PHILOTIMO-ADMIN`

Change this in Netlify before using the portal for real student, teacher, jobseeker, or employer records.

## Backend Endpoints

- `POST /api/contacts`
- `POST /api/teachers`
- `POST /api/students`
- `POST /api/jobseekers`
- `POST /api/employer-requests`
- `POST /api/admin/login`
- `GET /api/admin/state`
- `POST /api/admin/action`

## Email Notifications

Admin actions create email notices immediately. To send real emails from the Netlify deployment, configure:

- `RESEND_API_KEY`: API key for the email sending service
- `MAIL_FROM`: verified sender, for example `Philotimo Educational Consultancy Services <info@yourdomain.com>`

If `RESEND_API_KEY` is not set, the backend saves the notice in the portal record and reports that email delivery is not configured yet.
