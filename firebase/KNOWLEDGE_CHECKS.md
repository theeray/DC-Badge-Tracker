# Mentor-graded knowledge checks

This feature uses the existing Firebase Authentication, Firestore and Hosting
project. It adds no Cloud Functions, paid AI API, billing link or Blaze upgrade.
Existing accounts, passwords, progress, badges and endorsements are unchanged.
It works on Spark within that plan's usage limits; exceeding a free quota can
interrupt service. If the project is already on Blaze, its normal usage charges
still apply. This feature does not guarantee a zero bill on a billed project.

## One-time setup

1. Deploy the Firestore rules before the updated web app.
2. Sign in as a faculty director. Open **Knowledge checks → Set up checks**.
3. Upload `DC_Central_Private_Grading_Guides.json` supplied separately by the
   project owner. This installs all 30 banks and private grading guides.
4. Keep that file private. Do not put it in GitHub, `public/`, Hosting assets,
   email groups, or an ordinary download library. The `.gitignore` patterns are
   an extra safeguard, not access control.

Publishing is an atomic public-bank/private-guide pair per bank so Firestore's
rules access-call budget is respected. Interrupted imports can be retried:
identical installed versions are skipped and different existing versions are
never overwritten. Public questions alone do not enable the checks; the UI
shows **Setup pending** until the director publishes them.

## Taking a check

Open **Knowledge checks**, or use **Knowledge check** on one of the 44 linked
tutorial entries. Repeated lessons share one bank and attempt history. Each
bank has four short written questions. Do not enter passwords, student/employee
IDs, financial details, real payroll data or private client information.

Submitting creates a new immutable record. It is **Awaiting mentor review**,
not automatically passed. Learners can see their own answers and review history;
they cannot see the private answer guide. A retry creates another attempt.
No check automatically changes progress, Silver/Gold, endorsement, or machine
operating permission. Equipment checks still require supervised practical work.

## Mentor feedback

Mentors open **Review submissions** and choose an active mentee and attempt.
The private guide provides expected answers, explanations, topic feedback and
practice tasks. Mentors must choose Correct or Needs practice for every
question, then save their review. Suggested feedback and tasks can be edited.
Do not paste the private expected answer or explanation into student feedback.
Instead, assign a fresh demonstration or task and invite another attempt.

Mentors have private-guide access by role, as explicitly requested. Their own
taking/history screen does not fetch guides, but a mentor who has reviewed a
bank can know its answers. Their own attempts are therefore not guaranteed to
be blind. Directors grade mentor submissions; mentors cannot self-grade or
read other mentors' or faculty test attempts.

Corrections append a new review revision. Directors can withdraw an incorrect
review with a reason, then append a corrected review later. No prior submission
or review is erased or overwritten. The latest timestamped review controls the
displayed result; earlier revisions remain visible. Concurrent reviews are both
retained; a best-effort conflict warning asks reviewers to reread new feedback.

## Storage and access

- `knowledgeBanks/{bankId}_v{version}`: immutable question text, source and scope;
  verified active members may read; only directors may create versions.
- `knowledgeGuides/{bankId}_v{version}`: immutable keys, explanations and feedback
  templates; only verified active mentors/directors may read; directors create.
- `knowledgeAttempts/{ownerUid}/submissions/{attemptId}`: owner's authoritative
  role at submission, exact bank version/tutorial, four answers and server time.
  Owners read their own records; mentors review active mentees; directors review
  all. Client writes cannot prefill scores or change ownership.
- `.../reviews/{reviewId}`: append-only four verdicts, feedback, practice tasks,
  reviewer identity, server time, exact score and graded/withdrawn state. Mentees
  cannot write grades. Directors' test records stay private from student roles.

Answer keys are never in the frontend source or production bundle. Firestore
rules protect complete documents, so guides are separate from learner-readable
attempts and feedback. Reviewers are trusted not to disclose keys in free text.
Banks/guides cannot be edited in place: changing questions or rubrics requires
a new version, preserving the meaning of every old attempt.

## Verification and deployment

`npm test` covers catalog integrity, public/private separation, existing catalog,
DC Meet, TypeScript and production build. `npm run test:rules` additionally runs
the Firestore emulator role/validation tests; Firebase CLI 15 needs Java 21.
The rules suite also works with Firebase CLI 14.27 and Java 17 for local QA.

In an authenticated Cloud Shell:

```bash
cd ~/dc-badge-release-343e18e &&
git pull --ff-only &&
npm ci &&
npm test &&
npx --yes firebase-tools@15.28.2 deploy --only firestore --project digital-corps-badge-tracker &&
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=1 npx --yes firebase-tools@15.28.2 deploy --only hosting:central --config firebase.central-hosting.json --project digital-corps-badge-tracker
```

Pilot: director imports guides; mentee submits; mentor reads and grades; mentee
sees verdicts/tasks but cannot read keys; retry preserves the first attempt;
correction/withdrawal preserves review history; a faculty test is hidden from
mentor/mentee accounts. Review the prototype rules before broad rollout.
