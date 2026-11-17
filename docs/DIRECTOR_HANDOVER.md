# DC Central faculty-director handover

Live app: https://dc-central.web.app/

Source: https://github.com/theeray/DC-Badge-Tracker

Firebase project: `digital-corps-badge-tracker` (existing `(default)` Standard database).

## Everyday content maintenance inside the app

Sign in with an existing **active Faculty director** account. The app account is separate from GitHub and Google/Firebase accounts. Do not share passwords or create replacement student accounts during the handover.

- **Content editor → Tutorials:** add or edit a tutorial's title, learning path, category, main URL, additional links, notes, search terms, and optional badge goal.
- **Content editor → Learning paths:** add or edit learning-path names, short labels, and descriptions. Tutorial categories are edited on individual tutorials.
- **Content editor → Practice projects:** edit the brief and asset-package links, description, timeline, format, deliverables, workflow, constraints, evaluation criteria, and image references.
- **Content editor → Resource links:** maintain onboarding links and the Digital Corps, BSU Academics, BSU Athletics, and TAD download collections. Keep athletic assets in Athletics.
- **Knowledge checks → Manage checks:** create a four-question check, link it to tutorials, and enter its private answer key, explanations, feedback, and practice tasks. Editing publishes a new version; it never rewrites students' old answers or the questions used in an earlier attempt.
- **Accounts & records:** continue managing member approvals, roles, paused access, and the existing reversible record-administration tools.

**Publish changes** saves content in Firestore. Once this editor release and its rules are deployed, routine published content changes update signed-in members' views without another GitHub commit or Hosting deployment. Public, signed-out resource browsing continues using the bundled baseline; managed content and private editor history require an active verified account.

### Correcting mistakes

- Archive content to remove it from current lists; restore it to bring it back. Archiving a learning path hides its tutorials until the path is restored.
- Stable content IDs are intentionally not renameable. Progress, assignments, badges, and historical submissions refer to them.
- Use **Revision history** to preview an earlier content revision and republish it as a new revision. The original bundled content is also available as a restore source.
- Knowledge-check versions and submitted answers remain immutable. Loading an older check into the editor publishes another version rather than changing history. Archived checks cannot receive new attempts, but saved submissions remain available.
- If another director publishes first, reopen the latest record before publishing your draft. Stale drafts are not silently overwritten.
- Content-editor JSON exports contain content only, not student records or private knowledge-check answer keys. They are reference backups, not a complete Firebase backup or an automatic restore/import feature.

New files must first have a hosted HTTPS address (or already exist in this repository's static assets). This release edits file links; it does not introduce uploads, Firebase Storage, paid services, or browser-based code execution.

## Site code, design, and deployment access

The content editor cannot grant GitHub or Google Cloud permissions. The owner must invite the incoming maintainer separately, using that person's own accounts:

1. **GitHub:** in the repository's **Settings → Collaborators → Add people**, invite the intended GitHub username. A collaborator on this personal repository can read and write source code. Keep the original owner; do not transfer the repository just for a temporary handover.
2. **Firebase / Google Cloud:** confirm the maintainer's Google-account email before granting access to this project. **Firebase Develop Admin** (`roles/firebase.developAdmin`) covers Firebase development products, including Hosting, Firestore, Authentication, and Security Rules. It is powerful access to project data and configuration; grant only to the intended maintainer. Do not grant project Owner or Billing Administrator merely to edit tutorials.
3. **Private grading guides:** if the original private guide-import file is still needed for setup or disaster recovery, share it directly through an approved institutional channel. Never commit it to this public repository or place it among public downloads.
4. **Continuity:** have the incoming director sign in with their own app account, confirm the new editor is available, test one content edit and restore, and verify a normal student account still cannot edit content or read private answer keys.

Official access guidance:

- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository
- https://firebase.google.com/docs/projects/iam/roles-predefined-category

## Deploy this release once

In an authenticated Cloud Shell with the existing checkout:

```bash
cd ~/dc-badge-release-343e18e &&
git pull --ff-only &&
npm ci &&
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=1 npm run deploy:firebase:access
```

That script tests and builds the app, publishes Firestore rules, then deploys only the main `dc-central` Hosting site. It does not delete accounts, reset progress, alter the Firebase billing plan, or replace the older Hosting sites' redirects. Check that both rule and Hosting deployments succeed before using the editor. Deployment credentials belong in the maintainer's authenticated CLI session, never in the web app.

For development checks, run `npm test` and `npm run test:rules` (the latter requires Java and runs against isolated local Firestore test projects). Do not use production data for development tests. Inspect Security Rules carefully and pilot the access model before a wider rollout.

An optional local demo is available for development only. Create an ignored `.env.local` containing `VITE_USE_FIREBASE_EMULATORS=true` and `VITE_EMULATOR_AUTO_SIGNIN=director`, then run `npm run dev`. The development wrapper starts local Authentication/Firestore emulators, seeds clearly synthetic `.invalid` accounts, and starts Vite. Use `mentee` instead of `director` to check learner permissions. These switches and fixture sign-in are compiled out of production builds; do not enter real passwords into a local demo. The demo requires Java and the Firebase CLI and never uses the production project's data.

At the end of the temporary handover, review app director, GitHub collaborator, and Firebase IAM access separately. Revoking one does not revoke the others.
