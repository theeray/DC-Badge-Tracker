"use client";

import { useEffect, useMemo, useState } from "react";
import { allSkills, learningAreas } from "./data";
import {
  watchAllEndorsements,
  watchAllMemberProfiles,
  watchAllProgress,
  watchAllUsers,
  watchSelfReportedSkills,
  watchSkillCredentials,
  type AuthSession,
  type Endorsement,
  type MemberProfile,
  type ProgressRecord,
  type SelfReportedSkill,
  type SkillCredential,
  type UserProfile,
} from "./firebase";

type SkillSource = "any" | "verified" | "self";
type RoleFilter = "all" | "mentee" | "mentor";

type DirectoryRow = {
  user: UserProfile;
  profile: MemberProfile | null;
  verifiedSkillIds: string[];
  selfReportedSkillIds: string[];
};

const skillById = new Map(allSkills.map((skill) => [skill.id, skill]));

function quoteCsv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(quoteCsv).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function skillNames(ids: string[]) {
  return ids
    .map((id) => skillById.get(id)?.title ?? id)
    .sort((a, b) => a.localeCompare(b));
}

export default function MemberDirectory({ session }: { session: AuthSession }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [profiles, setProfiles] = useState<MemberProfile[]>([]);
  const [progress, setProgress] = useState<Record<string, ProgressRecord>>({});
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
  const [credentials, setCredentials] = useState<SkillCredential[]>([]);
  const [selfReports, setSelfReports] = useState<SelfReportedSkill[]>([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [interestFilter, setInterestFilter] = useState("all");
  const [skillFilter, setSkillFilter] = useState("all");
  const [skillSource, setSkillSource] = useState<SkillSource>("any");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const reportError = (error: string) => setMessage(error);
    const stopUsers = watchAllUsers(setUsers, reportError);
    const stopProfiles = watchAllMemberProfiles(setProfiles, reportError);
    const stopProgress = watchAllProgress(setProgress, reportError);
    const stopEndorsements = watchAllEndorsements(setEndorsements, reportError);
    const stopCredentials = watchSkillCredentials(setCredentials, reportError);
    const stopReports = watchSelfReportedSkills(session.profile, setSelfReports, reportError);
    return () => {
      stopUsers();
      stopProfiles();
      stopProgress();
      stopEndorsements();
      stopCredentials();
      stopReports();
    };
  }, [session.profile]);

  const rows = useMemo(() => {
    const profileById = new Map(profiles.map((profile) => [profile.memberId, profile]));
    const verifiedByMember = new Map<string, Set<string>>();
    const selfByMember = new Map<string, Set<string>>();

    for (const credential of credentials) {
      const skills = verifiedByMember.get(credential.workerId) ?? new Set<string>();
      skills.add(credential.skillId);
      verifiedByMember.set(credential.workerId, skills);
    }
    for (const endorsement of endorsements) {
      const status = progress[endorsement.menteeId]?.statuses[endorsement.skillId];
      if (status !== "ready" && status !== "complete") continue;
      const skills = verifiedByMember.get(endorsement.menteeId) ?? new Set<string>();
      skills.add(endorsement.skillId);
      verifiedByMember.set(endorsement.menteeId, skills);
    }
    for (const report of selfReports) {
      const skills = selfByMember.get(report.memberId) ?? new Set<string>();
      skills.add(report.skillId);
      selfByMember.set(report.memberId, skills);
    }

    return users
      .filter((user) => user.active && user.role !== "director")
      .map<DirectoryRow>((user) => ({
        user,
        profile: profileById.get(user.uid) ?? null,
        verifiedSkillIds: [...(verifiedByMember.get(user.uid) ?? [])],
        selfReportedSkillIds: [...(selfByMember.get(user.uid) ?? [])],
      }));
  }, [credentials, endorsements, profiles, progress, selfReports, users]);

  const interestOptions = useMemo(
    () =>
      [...new Set(
        profiles.flatMap((profile) => [
          ...profile.workInterests,
          ...profile.specialties,
          ...profile.socialMediaAreas,
        ]),
      )].sort((a, b) => a.localeCompare(b)),
    [profiles],
  );

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      const profile = row.profile;
      const interests = profile
        ? [...profile.workInterests, ...profile.specialties, ...profile.socialMediaAreas]
        : [];
      const verifiedNames = skillNames(row.verifiedSkillIds);
      const selfNames = skillNames(row.selfReportedSkillIds);
      const matchesQuery =
        !normalized ||
        [
          row.user.displayName,
          row.user.email,
          profile?.major,
          profile?.school,
          profile?.excitement,
          ...interests,
          ...verifiedNames,
          ...selfNames,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const matchesRole = roleFilter === "all" || row.user.role === roleFilter;
      const matchesInterest =
        interestFilter === "all" ||
        interests.some((interest) => interest.toLowerCase() === interestFilter.toLowerCase());
      const matchesSkill =
        skillFilter === "all" ||
        (skillSource !== "self" && row.verifiedSkillIds.includes(skillFilter)) ||
        (skillSource !== "verified" && row.selfReportedSkillIds.includes(skillFilter));
      return matchesQuery && matchesRole && matchesInterest && matchesSkill;
    });
  }, [interestFilter, query, roleFilter, rows, skillFilter, skillSource]);

  const exportRows = () => {
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`dc-member-directory-${today}.csv`, [
      [
        "Name",
        "Email",
        "Role",
        "Major or program",
        "Graduation year",
        "Academic school or area",
        "Preferred weekly hours",
        "Work interests",
        "Specialties",
        "Social media areas",
        "Verified skills",
        "Self-reported skills",
      ],
      ...visibleRows.map((row) => [
        row.user.displayName,
        row.user.email,
        row.user.role === "mentor" ? "Student mentor" : "Student mentee",
        row.profile?.major ?? "",
        row.profile?.graduationYear ?? "",
        row.profile?.school ?? "",
        row.profile?.preferredWeeklyHours ?? "",
        row.profile?.workInterests.join("; ") ?? "",
        row.profile?.specialties.join("; ") ?? "",
        row.profile?.socialMediaAreas.join("; ") ?? "",
        skillNames(row.verifiedSkillIds).join("; "),
        skillNames(row.selfReportedSkillIds).join("; "),
      ]),
    ]);
    setMessage(`Downloaded ${visibleRows.length} matching member${visibleRows.length === 1 ? "" : "s"}.`);
  };

  const copyEmails = async () => {
    const emails = visibleRows.map((row) => row.user.email).filter(Boolean).join("; ");
    if (!emails) {
      setMessage("No matching email addresses to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(emails);
      setMessage(`Copied ${visibleRows.length} email address${visibleRows.length === 1 ? "" : "es"}.`);
    } catch {
      setMessage("Your browser blocked clipboard access. Download the CSV instead.");
    }
  };

  const completeProfiles = rows.filter((row) => row.profile).length;

  return (
    <section className="dashboard-section member-directory-section">
      <div className="section-title member-directory-title">
        <div>
          <span className="eyebrow">Private staff directory</span>
          <h2>Find people by skill or interest</h2>
          <p>Filter the active team, copy the matching email group, or download a CSV for planning and outreach.</p>
        </div>
        <span className="directory-completion"><strong>{completeProfiles}</strong> of {rows.length} profiles complete</span>
      </div>

      <div className="directory-filter-grid">
        <label className="search-field directory-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search person, program, skill, or interest" aria-label="Search member directory" /></label>
        <label><span>Role</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}><option value="all">All student workers</option><option value="mentor">Student mentors</option><option value="mentee">Student mentees</option></select></label>
        <label><span>Interest</span><select value={interestFilter} onChange={(event) => setInterestFilter(event.target.value)}><option value="all">All interests</option>{interestOptions.map((interest) => <option key={interest} value={interest}>{interest}</option>)}</select></label>
        <label><span>Skill</span><select value={skillFilter} onChange={(event) => setSkillFilter(event.target.value)}><option value="all">All skills</option>{learningAreas.map((area) => <optgroup label={area.name} key={area.id}>{area.skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.title}</option>)}</optgroup>)}</select></label>
        <label><span>Skill evidence</span><select value={skillSource} onChange={(event) => setSkillSource(event.target.value as SkillSource)} disabled={skillFilter === "all"}><option value="any">Verified or self-reported</option><option value="verified">Verified only</option><option value="self">Self-reported only</option></select></label>
      </div>

      <div className="directory-actions">
        <strong>{visibleRows.length} matching member{visibleRows.length === 1 ? "" : "s"}</strong>
        <div>
          <button type="button" onClick={() => void copyEmails()} disabled={!visibleRows.length}>Copy emails</button>
          <button type="button" className="primary-button" onClick={exportRows} disabled={!visibleRows.length}>Download filtered CSV</button>
        </div>
      </div>

      {message ? <p className="time-message" role="status">{message}</p> : null}

      <div className="member-directory-grid">
        {visibleRows.map((row) => {
          const profile = row.profile;
          const verified = skillNames(row.verifiedSkillIds);
          const selfReported = skillNames(row.selfReportedSkillIds).filter((skill) => !verified.includes(skill));
          const interests = profile
            ? [...new Set([...profile.workInterests, ...profile.specialties, ...profile.socialMediaAreas])]
            : [];
          return (
            <article key={row.user.uid}>
              <header>
                <div>
                  <strong>{row.user.displayName}</strong>
                  <a href={`mailto:${row.user.email}`}>{row.user.email}</a>
                </div>
                <span>{row.user.role === "mentor" ? "Mentor" : "Mentee"}</span>
              </header>
              {profile ? (
                <>
                  <p className="directory-program">{profile.major || "Program not entered"}{profile.graduationYear ? ` · ${profile.graduationYear}` : ""}</p>
                  <dl>
                    <div><dt>Availability</dt><dd>{profile.preferredWeeklyHours || "Not entered"}</dd></div>
                    <div><dt>Office hours</dt><dd>{profile.officeHours || "Not entered"}</dd></div>
                  </dl>
                  <div className="directory-tags" aria-label="Interests and specialties">
                    {interests.slice(0, 6).map((interest) => <span key={interest}>{interest}</span>)}
                    {interests.length > 6 ? <span>+{interests.length - 6}</span> : null}
                  </div>
                </>
              ) : (
                <p className="profile-missing">Member profile not completed yet</p>
              )}
              <div className="directory-skills">
                <div><strong>Verified</strong><p>{verified.slice(0, 4).join(", ") || "No verified skills yet"}</p></div>
                <div><strong>Self-reported</strong><p>{selfReported.slice(0, 4).join(", ") || "No additional claims"}</p></div>
              </div>
            </article>
          );
        })}
      </div>
      {!visibleRows.length ? <div className="empty-state"><strong>No members match these filters</strong><p>Clear one or more filters and try again.</p></div> : null}
    </section>
  );
}
