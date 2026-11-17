export type AccountRole = "mentee" | "mentor" | "director";

export type AccessEntry = {
  displayName: string;
  email: string;
  role: AccountRole;
  active: boolean;
};

export const AUTOMATIC_MENTEE_DOMAINS = [
  "live.bemidjistate.edu",
  "go.minnstate.edu",
] as const;

export function normalizeAccountEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAutomaticMenteeEmail(email: string) {
  const normalized = normalizeAccountEmail(email);
  const parts = normalized.split("@");
  return parts.length === 2
    && normalized.length <= 254
    && parts[0].length > 0
    && !/\s/.test(parts[0])
    && AUTOMATIC_MENTEE_DOMAINS.some((domain) => parts[1] === domain);
}

// This controls the UI decision only. Firestore Security Rules independently
// enforce verified identity, the exact domains, and the non-privileged role.
export function resolveNewAccountRole(
  email: string,
  emailVerified: boolean,
  approval: Pick<AccessEntry, "active" | "role"> | null,
): AccountRole {
  if (!emailVerified) {
    throw new Error("Verify your email address before entering DC Central.");
  }
  if (approval) {
    if (!approval.active) {
      throw new Error("This Digital Corps account is currently paused. Contact a faculty director.");
    }
    if (!["mentee", "mentor", "director"].includes(approval.role)) {
      throw new Error("This account's approved role needs a faculty director's attention.");
    }
    return approval.role;
  }
  if (isAutomaticMenteeEmail(email)) return "mentee";
  throw new Error(
    "This email needs approval from a faculty director. Verified @live.bemidjistate.edu and @go.minnstate.edu addresses join automatically as mentees.",
  );
}

export function buildAccessRoster(
  approvals: readonly AccessEntry[],
  profiles: readonly AccessEntry[],
): AccessEntry[] {
  const byEmail = new Map(
    approvals.map((entry) => [normalizeAccountEmail(entry.email), entry]),
  );
  for (const profile of profiles) {
    const email = normalizeAccountEmail(profile.email);
    if (!byEmail.has(email)) byEmail.set(email, profile);
  }
  return [...byEmail.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Keep verification and cleanup in one tested sequence. In particular, a
// failed update/send must not leave a newly created unverified session open.
export async function completeEmailRegistration<T>(operations: {
  createUser: () => Promise<T>;
  updateName: (user: T) => Promise<void>;
  sendVerification: (user: T) => Promise<void>;
  signOut: (user: T) => Promise<void>;
}) {
  const user = await operations.createUser();
  try {
    await operations.updateName(user);
    await operations.sendVerification(user);
  } finally {
    await operations.signOut(user);
  }
}

// Firebase notifies token observers before sign-in/registration finishes, and
// reload() notifies them again. Let explicit auth operations finish before an
// observer activates a profile, without making SDK callbacks wait on observers.
export function createAuthOperationBarrier() {
  let settled = Promise.resolve();
  let version = 0;
  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      const previous = settled;
      let release!: () => void;
      settled = new Promise<void>((resolve) => { release = resolve; });
      version += 1;
      return (async () => {
        await previous;
        try {
          return await operation();
        } finally {
          release();
        }
      })();
    },
    async wait() {
      let pending: Promise<void>;
      do {
        pending = settled;
        await pending;
      } while (pending !== settled);
      return version;
    },
    isCurrent(observedVersion: number) {
      return observedVersion === version;
    },
  };
}
