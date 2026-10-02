"use client";

import { useEffect, useMemo, useState } from "react";
import {
  readableFirebaseError,
  saveMemberProfile,
  watchMemberProfile,
  type AuthSession,
  type MemberProfile,
} from "./firebase";

type ProfileDraft = Omit<MemberProfile, "memberId" | "displayName" | "email">;

const emptyProfile: ProfileDraft = {
  phone: "",
  major: "",
  graduationYear: "",
  school: "",
  hasUniform: false,
  shirtSize: "",
  preferredWeeklyHours: "",
  officeHours: "",
  workInterests: [],
  specialties: [],
  socialMediaAreas: [],
  excitement: "",
  campaignIdeas: "",
  summerInterest: "unsure",
  websiteBlurb: "",
  professionalLink: "",
  favoriteProject: "",
  funFacts: "",
};

const agenda = [
  {
    time: "0–5",
    title: "Warm welcome",
    detail: "Meet the team, see the workspace, and hear what Digital Corps does for campus clients.",
  },
  {
    time: "5–12",
    title: "New-hire introductions",
    detail: "Share your name, program, one skill you bring, and one kind of project you hope to try.",
  },
  {
    time: "12–20",
    title: "Uniforms and workplace basics",
    detail: "Choose a shirt, confirm the fit, review office expectations, and identify where supplies and shared equipment live.",
  },
  {
    time: "20–30",
    title: "Sign in to Teams",
    detail: "Open Microsoft Teams, confirm access to the Digital Corps team and Planner, set notifications, and find current job information.",
  },
  {
    time: "30–43",
    title: "Activate the Badge Tracker",
    detail: "Create a password with your approved email, verify the message in your inbox or junk folder, sign in, and complete your member profile below.",
  },
  {
    time: "43–53",
    title: "Try the learning workflow",
    detail: "Find DC Onboarding, open one tutorial, mark progress, and see how self-reports, mentor endorsements, Silver, and Gold work.",
  },
  {
    time: "53–58",
    title: "Follow a real job",
    detail: "Review the project flowchart, job request form, file organization guide, and client meeting checklist.",
  },
  {
    time: "58–60",
    title: "Questions and first next step",
    detail: "Confirm who to ask for help and choose the first tutorial, assignment, or practice project to complete.",
  },
] as const;

const resources = [
  {
    label: "Digital Corps Badge Tracker",
    detail: "Accounts, tutorials, progress, hours, assignments, and endorsements",
    href: "/",
  },
  {
    label: "Digital Corps job request form",
    detail: "Official form used by campus clients to request work",
    href: "https://www.bemidjistate.edu/offices/digital-corps/digital-corps-job-request-form/",
  },
  {
    label: "Digital Corps website",
    detail: "Services, office information, and public overview",
    href: "https://www.bemidjistate.edu/offices/digital-corps/",
  },
  {
    label: "Microsoft Teams",
    detail: "Open the Digital Corps team and Planner",
    href: "https://teams.microsoft.com/",
  },
  {
    label: "Project flowchart",
    detail: "How a Digital Corps job moves from request to delivery",
    href: "/resources/onboarding/digital-corps-flow-chart.pdf",
  },
  {
    label: "File organization guide",
    detail: "Shared project-folder and file-naming practices",
    href: "/resources/onboarding/file-organization-guide.pdf",
  },
  {
    label: "Setting up a project",
    detail: "Start a job with the expected folder and production structure",
    href: "/resources/onboarding/setting-up-a-project-guide.pdf",
  },
  {
    label: "Client meeting checklist",
    detail: "Before, during, and after a client meeting",
    href: "/resources/onboarding/client-meeting-checklist.docx",
  },
  {
    label: "Digital Corps feedback form",
    detail: "Share feedback about the program or a project",
    href: "https://forms.office.com/Pages/ResponsePage.aspx?id=xscRULQKq0ae9PrnSpIaf9TFJ9abpYdIiFBiYwCBywtUMlJTUUJLRTgwM0RUUElYUlhKTVRJRDkwSC4u",
  },
  {
    label: "Student and faculty spotlight form",
    detail: "Submit a campus spotlight idea",
    href: "https://forms.office.com/Pages/ResponsePage.aspx?id=xscRULQKq0ae9PrnSpIaf4SaSyf2EjhJvVeK5SXL8tBUNUNaQVJTS0JDV1JCTE5LNjJTUFJOQ0hVTy4u",
  },
] as const;

function parseList(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, values) => values.indexOf(item) === index)
    .slice(0, 30);
}

export default function OnboardingHub({
  session,
  onRequireSignIn,
}: {
  session: AuthSession | null;
  onRequireSignIn: () => void;
}) {
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfile);
  const [workInterestsText, setWorkInterestsText] = useState("");
  const [specialtiesText, setSpecialtiesText] = useState("");
  const [socialMediaAreasText, setSocialMediaAreasText] = useState("");
  const [loaded, setLoaded] = useState(!session);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) {
      setLoaded(true);
      return;
    }
    return watchMemberProfile(
      session.profile.uid,
      (profile) => {
        if (profile) {
          const { memberId: _memberId, displayName: _displayName, email: _email, ...editable } = profile;
          setDraft(editable);
          setWorkInterestsText(editable.workInterests.join(", "));
          setSpecialtiesText(editable.specialties.join(", "));
          setSocialMediaAreasText(editable.socialMediaAreas.join(", "));
        }
        setLoaded(true);
      },
      (error) => {
        setMessage(error);
        setLoaded(true);
      },
    );
  }, [session]);

  const completedEssentials = useMemo(
    () =>
      [
        draft.major,
        draft.graduationYear,
        draft.school,
        draft.shirtSize,
        draft.preferredWeeklyHours,
        workInterestsText.trim(),
        specialtiesText.trim(),
      ].filter(Boolean).length,
    [draft, specialtiesText, workInterestsText],
  );

  const update = <Key extends keyof ProfileDraft>(
    key: Key,
    value: ProfileDraft[Key],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const normalized = {
        ...draft,
        workInterests: parseList(workInterestsText),
        specialties: parseList(specialtiesText),
        socialMediaAreas: parseList(socialMediaAreasText),
      };
      await saveMemberProfile(session.profile, normalized);
      setDraft(normalized);
      setMessage("Your member profile is saved to Firebase.");
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="tool-hero onboarding-hero">
        <div>
          <span className="eyebrow">New hire start here</span>
          <h1>Digital Corps onboarding</h1>
          <p>
            A focused one-hour welcome that gets every new hire connected,
            equipped, introduced, and ready to use the team’s real workflow.
          </p>
        </div>
        <div className="onboarding-duration" aria-label="Agenda duration">
          <strong>60</strong>
          <span>minutes</span>
          <small>8 short steps</small>
        </div>
      </section>

      <section className="onboarding-agenda" aria-labelledby="onboarding-agenda-heading">
        <div className="section-title">
          <div>
            <span className="eyebrow">Training plan</span>
            <h2 id="onboarding-agenda-heading">One-hour agenda</h2>
          </div>
        </div>
        <ol>
          {agenda.map((item, index) => (
            <li key={item.time}>
              <span className="agenda-number">{String(index + 1).padStart(2, "0")}</span>
              <time>{item.time} min</time>
              <div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="member-profile-section" id="member-profile">
        <div className="member-profile-heading">
          <div>
            <span className="eyebrow">Beginning-of-year information</span>
            <h2>Build your member profile</h2>
            <p>
              These fields replace the shared spreadsheet. Managers and mentors
              can filter the directory by skills and interests, then export only
              the matching email list.
            </p>
          </div>
          {session ? (
            <div className="profile-progress">
              <strong>{completedEssentials}/7</strong>
              <span>essential fields complete</span>
            </div>
          ) : null}
        </div>

        {!session ? (
          <div className="profile-sign-in-callout">
            <div>
              <strong>Sign in to complete your profile</strong>
              <p>Approved members create their own password, verify their email, and then enter their information here.</p>
            </div>
            <button type="button" className="primary-button" onClick={onRequireSignIn}>Sign in or create password</button>
          </div>
        ) : loaded ? (
          <form className="member-profile-form" onSubmit={(event) => void save(event)}>
            <fieldset>
              <legend>Contact and program</legend>
              <label><span>Name</span><input value={session.profile.displayName} disabled /></label>
              <label><span>Account email</span><input type="email" value={session.profile.email} disabled /></label>
              <label><span>Phone (optional)</span><input type="tel" value={draft.phone} maxLength={40} onChange={(event) => update("phone", event.target.value)} /></label>
              <label><span>Major or program</span><input value={draft.major} maxLength={160} onChange={(event) => update("major", event.target.value)} required /></label>
              <label><span>Graduation year</span><input value={draft.graduationYear} maxLength={40} inputMode="numeric" onChange={(event) => update("graduationYear", event.target.value)} required /></label>
              <label><span>Academic school or area</span><input value={draft.school} maxLength={120} placeholder="Example: Technology, Art & Design" onChange={(event) => update("school", event.target.value)} required /></label>
            </fieldset>

            <fieldset>
              <legend>Uniform and availability</legend>
              <label><span>Shirt size</span><select value={draft.shirtSize} onChange={(event) => update("shirtSize", event.target.value)} required><option value="">Choose a size</option>{["XS", "S", "M", "L", "XL", "2XL", "3XL", "Other"].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
              <label className="profile-checkbox"><input type="checkbox" checked={draft.hasUniform} onChange={(event) => update("hasUniform", event.target.checked)} /><span>I received my Digital Corps shirt/uniform</span></label>
              <label><span>Preferred hours each week</span><input value={draft.preferredWeeklyHours} maxLength={80} placeholder="Example: 5–10 hours" onChange={(event) => update("preferredWeeklyHours", event.target.value)} required /></label>
              <label className="profile-wide"><span>Regular office hours and location</span><textarea value={draft.officeHours} maxLength={500} placeholder="Example: Mon/Wed 12–2 in BN 219" onChange={(event) => update("officeHours", event.target.value)} /></label>
              <label><span>Interested in summer work?</span><select value={draft.summerInterest} onChange={(event) => update("summerInterest", event.target.value as ProfileDraft["summerInterest"])}><option value="unsure">Not sure yet</option><option value="yes">Yes</option><option value="maybe">Maybe</option><option value="no">No</option></select></label>
            </fieldset>

            <fieldset>
              <legend>Skills and interests</legend>
              <label className="profile-wide"><span>Work interests (comma separated)</span><textarea value={workInterestsText} maxLength={700} placeholder="Graphic design, photography, motion graphics, social media…" onChange={(event) => setWorkInterestsText(event.target.value)} required /></label>
              <label className="profile-wide"><span>Current specialties (comma separated)</span><textarea value={specialtiesText} maxLength={700} placeholder="Illustration, client communication, Premiere Pro…" onChange={(event) => setSpecialtiesText(event.target.value)} required /></label>
              <label className="profile-wide"><span>Social media schools or departments of interest</span><textarea value={socialMediaAreasText} maxLength={700} placeholder="Music, Sustainability, Business…" onChange={(event) => setSocialMediaAreasText(event.target.value)} /></label>
              <label className="profile-wide"><span>What are you most excited to do?</span><textarea value={draft.excitement} maxLength={1000} onChange={(event) => update("excitement", event.target.value)} /></label>
              <label className="profile-wide"><span>Campaign ideas</span><textarea value={draft.campaignIdeas} maxLength={1000} onChange={(event) => update("campaignIdeas", event.target.value)} /></label>
            </fieldset>

            <fieldset>
              <legend>Website and team introduction</legend>
              <label className="profile-wide"><span>Short website blurb</span><textarea value={draft.websiteBlurb} maxLength={1200} placeholder="A short professional introduction for the DC website" onChange={(event) => update("websiteBlurb", event.target.value)} /></label>
              <label className="profile-wide"><span>Portfolio or LinkedIn link</span><input type="url" value={draft.professionalLink} maxLength={500} placeholder="https://" onChange={(event) => update("professionalLink", event.target.value)} /></label>
              <label className="profile-wide"><span>Favorite Digital Corps project so far</span><textarea value={draft.favoriteProject} maxLength={1000} onChange={(event) => update("favoriteProject", event.target.value)} /></label>
              <label className="profile-wide"><span>Fun facts</span><textarea value={draft.funFacts} maxLength={1000} onChange={(event) => update("funFacts", event.target.value)} /></label>
            </fieldset>

            <div className="profile-form-actions">
              <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save member profile"}</button>
              {message ? <p role="status">{message}</p> : <p>Your profile is private to you, mentors, and faculty directors.</p>}
            </div>
          </form>
        ) : (
          <div className="profile-loading">Loading your member profile…</div>
        )}
      </section>

      <section className="onboarding-resources" aria-labelledby="onboarding-links-heading">
        <div className="section-title">
          <div>
            <span className="eyebrow">Keep these handy</span>
            <h2 id="onboarding-links-heading">Onboarding links and guides</h2>
            <p>Official links plus the most useful files from the Digital Corps resource bundle.</p>
          </div>
        </div>
        <div className="onboarding-resource-grid">
          {resources.map((resource) => (
            <a key={resource.href} href={resource.href} target={resource.href === "/" ? undefined : "_blank"} rel={resource.href === "/" ? undefined : "noreferrer"}>
              <span>Open ↗</span>
              <strong>{resource.label}</strong>
              <p>{resource.detail}</p>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
