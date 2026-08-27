# Digital Corps Badge Tracker

A role-based learning tracker for Digital Corps mentees, mentors, and faculty directors.

## Production behavior

- Approved users create their own Firebase email/password account with their institutional email.
- Email verification is required before an approved role is activated.
- Mentees update only their own progress.
- Mentors can view mentee progress and add or remove their own skill endorsements, but cannot change progress.
- Faculty directors approve accounts, assign roles, pause access, and administer records.
- The public curriculum and brand resources remain available in guest mode.

## Local development

```bash
npm install
npm run dev
```

The Sites build can be checked with:

```bash
npm run build
npm test
```

The standalone Firebase Hosting build can be checked with:

```bash
npm run typecheck:firebase
npm run build:firebase
```

## Firebase deployment

This repository targets the Firebase project `digital-corps-badge-tracker`.

```bash
npm run deploy:firebase
```

The deploy command builds the static app, then publishes Firebase Hosting, Firestore rules, and Firestore indexes. Account approval records are operational data and are intentionally not committed to this public repository.

See [`firebase/README.md`](firebase/README.md) for the production activation and pilot-test checklist.
