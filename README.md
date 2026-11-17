# DC Central

A shared Digital Corps workspace for onboarding, learning, projects, hours, team skills, meetings, and administration.

## Production behavior

- Members create their own Firebase email/password account and verify their email. Verified `@live.bemidjistate.edu` and `@go.minnstate.edu` addresses can activate automatically as mentees; other addresses and privileged roles require faculty-director approval.
- Mentees update only their own progress.
- Mentors can view mentee progress and add or remove their own skill endorsements, but cannot change progress.
- Faculty directors approve accounts, assign roles, pause access, and administer records.
- Faculty directors use **Content editor** to publish tutorials, learning paths, practice-project briefs, onboarding links, and brand-download links without a source-code deployment.
- **Knowledge checks → Manage checks** lets directors create checks and private grading guides, publish new versions, and archive/restore checks without deleting student history.
- Content publications have immutable revision history, stable IDs, conflict detection, and reversible archiving.
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
npm run deploy:firebase:access
```

This command tests and builds the static app, publishes Firestore rules, then publishes the main `dc-central` Hosting site. It does not reset accounts or progress. Account approval records and private grading-guide files are operational data and are intentionally not committed to this public repository.

Production app: https://dc-central.web.app

Source repository: https://github.com/theeray/DC-Badge-Tracker

See [`firebase/README.md`](firebase/README.md) for the production activation and pilot-test checklist.

See [`docs/DIRECTOR_HANDOVER.md`](docs/DIRECTOR_HANDOVER.md) for the faculty-director content editor, recovery options, and separate GitHub/Firebase maintainer access.

### Firebase addresses

`dc-central.web.app` is the permanent app address. The earlier
`dc-badges.web.app` and `digital-corps-badge-tracker.web.app` addresses redirect
to DC Central.

```bash
npm run deploy:firebase:central
npm run deploy:firebase:short
npm run deploy:firebase
```

All three sites use the same Firebase Authentication and Firestore project, so
changing the primary address does not create new accounts or move user records.
