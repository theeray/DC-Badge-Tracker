# Firebase production setup

The application uses Firebase Authentication, Cloud Firestore, and Firebase Hosting. It does not use campus SSO, Cloud Functions, or Cloud Storage.

## Account activation model

1. A director creates an `approvedUsers/{email}` record with the person's name, institutional email, role, and `active: true`.
2. The approved person creates their own password in the app.
3. Firebase sends an email-verification link.
4. After verification, the app creates `users/{uid}` from the approval record.

The application never stores passwords. Firebase Authentication handles password hashing, reset links, and verification emails.

## Collections

- `approvedUsers/{email}`: `displayName`, `email`, `role`, `active`, `updatedAt`
- `users/{uid}`: `displayName`, `email`, `role`, `active`, `createdAt`, `updatedAt`
- `progress/{menteeUid}`: `ownerId`, `statuses`, `updatedAt`
- `endorsements/{menteeUid_skillId_mentorUid}`: `menteeId`, `skillId`, `mentorId`, `mentorName`, `createdAt`
- `timeEntries/{entryId}`: `workerId`, `workerName`, `startedAt`, `endedAt`, `note`, `createdAt`, `updatedAt`
- `skillCredentials/{workerUid_skillId}`: `workerId`, `workerName`, `skillId`, `level`, `note`, `awardedBy`, `awardedByName`, `updatedAt`
- `skillAssignments/{workerUid_skillId}`: `assigneeId`, `assigneeName`, `skillId`, `note`, `status`, `assignedBy`, `assignedByName`, `assignedByRole`, `createdAt`, `updatedAt`
- `selfReportedSkills/{workerUid_skillId}`: `memberId`, `memberName`, `skillId`, `level`, `evidence`, `createdAt`, `updatedAt`

Roles are `mentee`, `mentor`, and `director`.

## Security guarantees

- A verified email and active profile are required for protected data.
- Mentees can create and update only their own progress document.
- Mentors can read mentee progress and create endorsements only for skills marked `ready` or `complete`.
- Mentors cannot change progress and can delete only their own endorsements.
- Student mentors and mentees can create, correct, and remove only their own time entries.
- Directors can review and correct all time entries.
- Mentors can read the team skills dashboard; directors can also assign or correct Gold and Silver statuses.
- Mentors and directors can assign skills or tutorials to active student workers. Mentors manage only assignments they created; assignees manage only assignment status; directors can correct any assignment.
- Student workers can create, edit, and remove only their own Silver and Gold self-reports. Self-reports remain visibly distinct from mentor endorsements and faculty verification.
- Directors manage approvals, profiles, progress, endorsements, time entries, and skill credentials.
- User roles cannot be self-promoted.

## Account continuity across hosting domains

GitHub stores source code and Firebase Hosting serves the built app, but Firebase Authentication remains in this same Firebase project. Existing members do not create another account after the hosting move. They choose **Sign in** and use their existing institutional email and password. A one-time sign-in is expected on the new web address because browser sessions do not transfer between domains; verified-email status, role, progress, and endorsements remain intact.

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

Account names and institutional email addresses are live operational data and must not be committed to this public repository.
