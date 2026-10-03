# Firebase production setup

The application uses Firebase Authentication, Cloud Firestore, and Firebase Hosting. It does not use campus SSO, Cloud Functions, or Cloud Storage.

## Account activation model

1. A director creates an `approvedUsers/{email}` record with the person's name, approved email, role, and `active: true`. The app also supports a multiline roster paste for onboarding groups.
2. The approved person creates their own password in the app.
3. Firebase sends an email-verification link.
4. After verification, the app creates `users/{uid}` from the approval record.

The application never stores passwords. Firebase Authentication handles password hashing, reset links, and verification emails.

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

Account names and email addresses are live operational data and must not be committed to this public repository.
