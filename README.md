# Digital Corps Badge Tracker

A role-based learning tracker for Digital Corps mentees, mentors, and faculty directors.

## Production behavior

- Approved users create their own Firebase email/password account with the email approved by a faculty director.
- Email verification is required before an approved role is activated.
- Mentees update only their own progress.
- Mentors can view mentee progress and add or remove their own skill endorsements, but cannot change progress.
- Faculty directors approve accounts, assign roles, pause access, and administer records.
- New hires complete the beginning-of-year member profile inside the app instead of editing a shared spreadsheet.
- Mentors and directors can filter the private directory by role, interests, and verified or self-reported skills, copy matching emails, and export a CSV.
- The New hire start view contains a 60-minute agenda and the official Digital Corps onboarding resources.
- DC Meet lets any signed-in member create a scheduling poll, share it with the team, mark Available or If needed times, and see the best full-duration overlap across time zones.
- The public curriculum and brand resources remain available in guest mode.

## Local development

```bash
npm install
npm run dev
```

Verify the Firebase production build with:

```bash
npm run build
npm test
```

## Firebase deployment

This repository targets the Firebase project `digital-corps-badge-tracker`.

```bash
npm run deploy:firebase
```

The deploy command builds the static app, then publishes Firebase Hosting, Firestore rules, and Firestore indexes. Account approval records are operational data and are intentionally not committed to this public repository.

Production app: https://dc-badges.web.app

Source repository: https://github.com/theeray/DC-Badge-Tracker

See [`firebase/README.md`](firebase/README.md) for the production activation and pilot-test checklist.

### Short Firebase address

The repository includes a separate Hosting configuration for the requested
`dc-badges.web.app` address. Creating the Hosting site is a one-time project-owner
operation because Firebase Hosting site IDs are globally unique:

```bash
npx --yes firebase-tools@15.28.2 hosting:sites:create dc-badges --project digital-corps-badge-tracker
npm run deploy:firebase:short
```

The short site uses the same Firebase Authentication and Firestore data as the
existing production address. The normal `npm run deploy:firebase` command remains
unchanged, so an unavailable short site ID cannot block ordinary production deploys.
