# Digital Corps Badge Tracker

A responsive learning and mentor-endorsement workspace for Digital Corps at Bemidji State University.

Created and directed by **Eric Carlson**, with AI-assisted development and implementation.

## Live site

[Open the Digital Corps Badge Tracker](https://theeray.github.io/DC-Badge-Tracker/)

## What it includes

- Student mentee, student mentor, and Faculty Director workspaces
- Invite-only Firebase email/password sign-in with no public registration route
- Progress tracking saved locally in the browser
- Skill pathways and tutorial links
- Practice project briefs and supplied asset downloads
- Digital Corps, BSU, BSU Athletics, and TAD brand resources
- Responsive desktop, tablet, and mobile layouts

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Create a production build with:

```bash
npm run build:pages
```

The repository publishes automatically through GitHub Actions after changes reach `main`.

## Firebase account setup

The app remains hosted on GitHub Pages. Firebase provides authentication and the protected account-role database; it does not host the website.

1. Create a Firebase project and a Web app.
2. Enable Authentication → Email/Password.
3. Upgrade Authentication to Identity Platform, then disable end-user account creation and deletion under **Settings → User actions**. This is what makes the service genuinely invite-only; hiding a sign-up button alone is not a security control.
4. Create a Cloud Firestore database, then deploy `firestore.rules` and `firestore.indexes.json`.
5. Add the six Web app config values from `.env.example` as GitHub Actions repository variables with the same names minus the `VITE_` prefix.
6. Add `theeray.github.io` to Firebase Authentication’s authorized domains.

The GitHub Pages workflow injects those public Firebase Web app values at build time. They identify the Firebase project; all authorization is enforced by Authentication and Firestore Security Rules.

### Provision the private invite roster

The real roster belongs in `firebase/private-invites.json`, which is deliberately ignored by Git. Copy `firebase/private-invites.example.json` as a template. Never commit the real file or a Firebase service-account key.

With Application Default Credentials configured locally, run:

```bash
FIREBASE_PROJECT_ID="your-project-id" npm run provision:accounts
```

The script creates or updates Firebase Authentication users and their protected Firestore profiles. It does not expose emails in the public bundle. New users select **Set or reset password** on the site to receive Firebase’s password-setup email.

## Data note

Authentication and roles are Firebase-ready. Skill progress and preview endorsements still remain in the current browser until the shared progress phase is connected. Clearing browser storage resets that local progress.
