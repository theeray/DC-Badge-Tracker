# Firebase production setup

The application uses Firebase Authentication, Cloud Firestore, and Firebase Hosting. It does not use campus SSO, Cloud Functions, or Cloud Storage.

## Account activation model

1. A person creates their own password in the app. This is a separate DC Central password, not campus SSO.
2. Firebase sends an email-verification link. After opening it, the person returns to **Sign in**.
3. A verified address on exactly `live.bemidjistate.edu` or `go.minnstate.edu` can activate automatically as a **mentee**, without a manual approval record. Subdomains and lookalike domains do not qualify.
4. Other addresses still need an active `approvedUsers/{email}` record created by a director. Existing manually approved external addresses remain supported. Active manual approvals supply their assigned role; only directors can assign mentor/director roles.
5. An existing activated account keeps its role and records. Existing inactive profiles and paused approval records do not gain an automatic replacement account.

Approving an email writes an access record only. It does **not** send an invitation, create a password, or send a verification message. Registration has no pending-approval or email-delivery log. If someone already created a password but did not receive verification, they should **Sign in** with that password to attempt a resend, not register a second time. A delivery failure is not proof of missing approval.

The auth observer does not activate or sign out an unverified account while registration updates the name and sends verification. Registration signs that temporary session out in `finally`, including when an update/send fails. This avoids the previous observer/registration race and leaves the account available for sign-in/resend.

The director roster includes activated profiles that have no manual approval record. Pausing or changing one of these accounts atomically updates the user profile and creates its manual override, so domain eligibility cannot silently undo the director's decision.

The application never stores passwords. Firebase Authentication handles password hashing, reset links, and verification emails.

## Deploying account-access changes

From an authenticated Firebase CLI session, run `FIREBASE_HOSTING_UPLOAD_CONCURRENCY=1 npm run deploy:firebase:access`. This runs the application tests and build, publishes the Firestore rules, then publishes only the main `dc-central` Hosting site. It does not reset accounts or records, change billing, or replace the older sites' redirects. Review the rules and pilot the two allowed domains before a broader rollout.

## Collections

- `approvedUsers/{email}`: `displayName`, `email`, `role`, `active`, `updatedAt`
- `users/{uid}`: `displayName`, `email`, `role`, `active`, `createdAt`, `updatedAt`
- `memberProfiles/{uid}`: private beginning-of-year contact, program, availability, uniform, interest, specialty, and website fields entered by the member
- `progress/{menteeUid}`: `ownerId`, `statuses`, `updatedAt`
- `endorsements/{menteeUid_skillId_mentorUid}`: `menteeId`, `skillId`, `mentorId`, `mentorName`, `createdAt`
- `timeEntries/{entryId}`: `workerId`, `workerName`, `startedAt`, `endedAt`, `note`, `createdAt`, `updatedAt`
- `skillCredentials/{workerUid_skillId}`: `workerId`, `workerName`, `skillId`, `level`, `note`, `awardedBy`, `awardedByName`, `updatedAt`
- `skillAssignments/{workerUid_skillId}`: `assigneeId`, `assigneeName`, `skillId`, `note`, `status`, `assignedBy`, `assignedByName`, `assignedByRole`, `createdAt`, `updatedAt`
- `selfReportedSkills/{workerUid_skillId}`: `memberId`, `memberName`, `skillId`, `level`, `evidence`, `createdAt`, `updatedAt`
- `availabilityPolls/{pollId}`: DC Meet title, organizer, time zone, duration, candidate half-hour slots, and open/closed selection state
- `availabilityPolls/{pollId}/responses/{uid}`: each member's Available and If needed slots, tied to their verified DC Central profile
- `availabilityPolls/{pollId}/copiedResponses/{uid}`: immutable starting availability copied by an organizer into a new poll until each member confirms or replaces it

Roles are `mentee`, `mentor`, and `director`.

## Security guarantees

- A verified email and active profile are required for protected data.
- Members can read and update only their own member profile. Mentors and directors can read the directory; mentors cannot edit another member's profile.
- Directory CSV and email-group tools are shown only to mentors and directors.
- Student mentors and mentees can create and update only their own progress document. Directors may also maintain a private test-progress record.
- Mentors can read mentee progress and create endorsements only for skills marked `ready` or `complete`.
- Mentors cannot change progress and can delete only their own endorsements.
- Student mentors and mentees can create, correct, and remove only their own time entries.
- Directors can review and correct all time entries.
- Mentors can read the team skills dashboard; directors can also assign or correct Gold and Silver statuses.
- Mentors and directors can assign skills or tutorials to active student workers. Mentors manage only assignments they created; assignees manage only assignment status; directors can correct any assignment.
- Student workers can create, edit, and remove only their own Silver and Gold self-reports. Directors may create private test claims; mentor and mentee accounts cannot read faculty test progress or claims. Self-reports remain visibly distinct from mentor endorsements and faculty verification.
- Directors manage approvals, profiles, progress, endorsements, time entries, and skill credentials.
- User roles cannot be self-promoted.
- Domain-based activation requires a verified Firebase Auth email and creates only the caller's own mentee profile. The same domain/role restrictions are enforced in Firestore Security Rules, not only in the interface.
- Active members can read shared DC Meet polls and save only their own named availability. Only the poll organizer can rename, close, reopen, or copy a poll; copied responses cannot be edited in place.

## Account continuity across hosting domains

GitHub stores source code and Firebase Hosting serves the built app, but Firebase Authentication remains in this same Firebase project. Existing members do not create another account after the hosting move. They choose **Sign in** and use their existing approved email and password. A one-time sign-in is expected on the new web address because browser sessions do not transfer between domains; verified-email status, role, progress, and endorsements remain intact.

Deploy `firestore.rules` and `firestore.indexes.json` before inviting pilot users.

## Pilot checklist

1. Activate one approved mentor and one approved mentee.
2. Have both create their own passwords and verify their email.
3. Confirm the mentee can change their own progress from two devices.
4. Confirm the mentor can view that progress but cannot change it.
5. Mark a skill `ready`, add an endorsement, and confirm it appears for the mentee.
6. Confirm the mentor cannot endorse a skill still marked `not-started` or `in-progress`.
7. Confirm a director can pause an account and administer records.
8. Assign one tutorial as a mentor, update its status as the assignee, and confirm another mentor cannot edit the assignment.
9. Self-report one Silver or Gold badge and confirm Team Skills labels it as self-reported until endorsement or faculty verification is present.
10. Invite the remaining approved users only after the checks pass.
11. Have one student save a member profile; confirm another student cannot read it while a mentor can filter it and export the matching CSV.
12. Add faculty test progress and a faculty test badge; confirm neither record is readable from mentor or mentee accounts.
13. Create a DC Meet poll, respond from a second member account, verify the ranked overlap, choose a time as the organizer, and confirm responses reopen only after the organizer reopens the poll.
14. Test automatic activation with each of the two exact domains. Confirm unverified, lookalike-domain, and paused accounts cannot activate; confirm existing manual mentor/director roles remain unchanged.

Account names and email addresses are live operational data and must not be committed to this public repository.
