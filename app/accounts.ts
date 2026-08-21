export type AccountRole = "student" | "mentor" | "director";

export type AccountProfile = {
  id: string;
  displayName: string;
  role: AccountRole;
  title: string;
  active: boolean;
};

export type FeedbackKind = "kudos" | "comment";

export type SkillFeedback = {
  id: string;
  authorId: string;
  recipientId: string;
  skillId?: string;
  kind: FeedbackKind;
  message?: string;
  createdAt: string;
};

export const facultyDirectors: readonly AccountProfile[] = [
  {
    id: "eric-carlson",
    displayName: "Eric Carlson",
    role: "director",
    title: "Faculty Director",
    active: true,
  },
  {
    id: "mitch-blessing",
    displayName: "Mitch Blessing",
    role: "director",
    title: "Faculty Director",
    active: true,
  },
];

export const accountRoleDetails: Record<AccountRole, { label: string; summary: string }> = {
  student: {
    label: "Student mentee",
    summary: "Track progress, request reviews, and receive mentor feedback.",
  },
  mentor: {
    label: "Student mentor",
    summary: "Review demonstrated skills and support assigned mentees.",
  },
  director: {
    label: "Faculty director",
    summary: "Manage roles, view program progress, and give kudos and comments.",
  },
};
