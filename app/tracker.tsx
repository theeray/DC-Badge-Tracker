"use client";

import { useEffect, useMemo, useState } from "react";
import {
  allSkills,
  learningAreas,
  projectBriefs,
  statusLabels,
  statusOrder,
  type ProjectBrief,
  type Skill,
  type SkillStatus,
} from "./data";
import { accountRoleDetails, facultyDirectors, type AccountRole } from "./accounts";

type Role = AccountRole;
type View = "overview" | "projects" | string;
type BrandGuideId = "digital-corps" | "bsu-academics" | "bsu-athletics" | "tad";
const STORAGE_KEY = "digital-corps-badge-tracker-preview-v2";

const defaultStatuses = Object.fromEntries(
  allSkills.map((item) => [item.id, "not-started"]),
) as Record<string, SkillStatus>;

const defaultEndorsements = Object.fromEntries(
  allSkills.map((item) => [item.id, 0]),
) as Record<string, number>;

const rolePresentation: Record<Role, { initials: string; name: string; title: string }> = {
  student: { initials: "ST", name: "Student workspace", title: "Mentee account not signed in" },
  mentor: { initials: "MN", name: "Mentor workspace", title: "Mentor account not signed in" },
  director: { initials: "FD", name: "Faculty Director workspace", title: "Accounts planned: Eric Carlson · Mitch Blessing" },
};

const iconForArea: Record<string, string> = {
  onboarding: "01",
  "content-creation": "02",
  "social-marketing": "03",
  leadership: "04",
};

const brandGuides = [
  { id: "digital-corps", name: "Digital Corps", label: "Available", enabled: true },
  { id: "bsu-academics", name: "BSU Academics", label: "Available", enabled: true },
  { id: "bsu-athletics", name: "BSU Athletics", label: "Identity assets", enabled: true },
  { id: "tad", name: "TAD · Technology, Art & Design", label: "Available", enabled: true },
] as const;

const digitalCorpsAssets = [
  {
    title: "Digital Corps Branding Guide",
    description: "The complete reference for logo use, colors, typography, pattern, and applications.",
    format: "PDF · 432 KB",
    kind: "Guide",
    href: "./downloads/digital-corps/digital-corps-brand-guide.pdf",
  },
  {
    title: "Digital Corps Logo Package",
    description: "Primary, secondary, horizontal, symbol, white, Lab Corps, and Studio Corps artwork.",
    format: "ZIP · 8.8 MB",
    kind: "Logos",
    href: "./downloads/digital-corps/digital-corps-logos.zip",
  },
  {
    title: "Geometric Pattern",
    description: "Editable Illustrator source for the official repeating Digital Corps pattern.",
    format: "AI · 328 KB",
    kind: "Pattern",
    href: "./downloads/digital-corps/digital-corps-geometric-pattern.ai",
  },
  {
    title: "Abrade ExtraBold",
    description: "The approved display typeface file for branded headlines and high-impact copy.",
    format: "ZIP · 56 KB",
    kind: "Type",
    href: "./downloads/digital-corps/digital-corps-typeface.zip",
  },
  {
    title: "Lower Thirds",
    description: "Left- and right-aligned After Effects packages with linked Illustrator artwork.",
    format: "ZIP · 2.3 MB",
    kind: "Motion",
    href: "./downloads/digital-corps/digital-corps-lower-thirds.zip",
  },
  {
    title: "Logo Reveal",
    description: "After Effects source, linked logo artwork, and a rendered MP4 reference.",
    format: "ZIP · 1.4 MB",
    kind: "Motion",
    href: "./downloads/digital-corps/digital-corps-logo-reveal.zip",
  },
] as const;

const bsuAcademicAssets = [
  {
    title: "2020 BSU Brand Guide",
    description: "The 44-page academic identity guide, optimized for reliable in-app viewing and download.",
    format: "PDF · 8.9 MB",
    kind: "Guide",
    href: "./downloads/bsu-academics/bsu-brand-guide-2020.pdf",
  },
  {
    title: "Academic Logo Suite",
    description: "The full academic logo set in AI, EPS, PDF, PNG, and JPG formats, plus the 2020 color palette reference.",
    format: "ZIP · 23.9 MB",
    kind: "Logos",
    href: "./downloads/bsu-academics/bsu-academic-logos.zip",
  },
  {
    title: "Academic Typefaces",
    description: "The supplied Whitney family plus Adobe Garamond and Minion Pro document fonts.",
    format: "ZIP · 777 KB",
    kind: "Type",
    href: "./downloads/bsu-academics/bsu-academic-typefaces.zip",
  },
  {
    title: "Patterns & Pine Assets",
    description: "Bark, ice, rock, pines, crop texture, and solo-tree source assets from the academic system.",
    format: "ZIP · 3.8 MB",
    kind: "Pattern",
    href: "./downloads/bsu-academics/bsu-academic-patterns.zip",
  },
  {
    title: "Icon Source Samples",
    description: "Editable examples for building icons in the approved geometric academic style.",
    format: "ZIP · 3.3 MB",
    kind: "Icons",
    href: "./downloads/bsu-academics/bsu-icon-source-samples.zip",
  },
] as const;

const athleticsAssets = [
  { src: "./brand/bsu-athletics/football.jpg", label: "Historic football photograph" },
  { src: "./brand/bsu-athletics/img-1970s-womens-field-hockey2.jpg", label: "1970s women’s field hockey photograph" },
  { src: "./brand/bsu-athletics/istock-498506367.jpg", label: "Volleyball athlete photograph" },
] as const;

const bsuAthleticsDownloadAssets = [
  {
    title: "Athletics Logo Package",
    description: "Beaver icon, BSU Beaver lockups, baseball monogram, and the supplied athletics identity reference PDF.",
    format: "ZIP · 1.4 MB",
    kind: "Logos",
    href: "./downloads/bsu-athletics/bsu-athletics-logo-package.zip",
  },
  {
    title: "Bucky Mascot Vectors",
    description: "Green, Pantone, outline, grayscale, three-color, and five-color Bucky Illustrator artwork.",
    format: "ZIP · 21.0 MB",
    kind: "Mascot",
    href: "./downloads/bsu-athletics/bsu-bucky-mascot-vectors.zip",
  },
  {
    title: "Reserved Sports Imagery",
    description: "Football, women’s field hockey, and volleyball photographs kept out of the academic toolkit.",
    format: "ZIP · 10.9 MB",
    kind: "Photos",
    href: "./downloads/bsu-athletics/bsu-athletics-reserved-imagery.zip",
  },
] as const;

const tadAssets = [
  {
    title: "TAD Branding Guidelines",
    description: "The official 2024 single-page guide for logos, Futura PT typography, colors, and accessibility.",
    format: "PDF · 496 KB",
    kind: "Guide",
    href: "./downloads/tad/tad-brand-guidelines-2024.pdf",
  },
  {
    title: "TAD Logo Package",
    description: "Color, black-and-white, icon, horizontal, transparent, and editable vector logo versions.",
    format: "ZIP · 1.7 MB",
    kind: "Logos",
    href: "./downloads/tad/tad-logo-package.zip",
  },
  {
    title: "Alphabet & Linktree Logos",
    description: "Four-page Illustrator source containing the TAD alphabet system and Linktree logo artwork.",
    format: "AI · 1.3 MB",
    kind: "Vector",
    href: "./downloads/tad/tad-alphabet-linktree-logos.ai",
  },
  {
    title: "Bridgeman Practice Image",
    description: "Compressed download containing the layered Bridgeman Hall PSD for TAD design exercises and composites.",
    format: "ZIP · 21.9 MB",
    kind: "Photo",
    href: "./downloads/tad/bridgeman-practice-image.zip",
  },
] as const;

function ExternalArrow() {
  return <span aria-hidden="true">↗</span>;
}

function CheckMark() {
  return <span aria-hidden="true">✓</span>;
}

type DownloadAsset = {
  title: string;
  description: string;
  format: string;
  kind: string;
  href: string;
};

function AssetLibrary({ title, description, assets }: { title: string; description: string; assets: readonly DownloadAsset[] }) {
  return (
    <section className="asset-library">
      <div className="section-title"><div><span className="eyebrow">Practice project toolkit</span><h2>{title}</h2><p>{description}</p></div><span className="asset-total">{assets.length} downloads</span></div>
      <div className="asset-download-grid">
        {assets.map((asset, index) => (
          <article key={asset.href}>
            <div className="asset-kind"><span>{String(index + 1).padStart(2, "0")}</span><b>{asset.kind}</b></div>
            <h3>{asset.title}</h3>
            <p>{asset.description}</p>
            <footer><span>{asset.format}</span><a href={asset.href} download aria-label={`Download ${asset.title}`}>Download <b>↓</b></a></footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function SkillResource({ item }: { item: Skill }) {
  if (item.href) {
    return (
      <a className="resource-link" href={item.href} target="_blank" rel="noreferrer">
        Open tutorial <ExternalArrow />
      </a>
    );
  }

  if (item.internal) {
    return <span className="resource-note">Internal Teams resource</span>;
  }

  return <span className="resource-note">Practice activity</span>;
}

function ProgressRing({ percent }: { percent: number }) {
  return (
    <div className="progress-ring" style={{ "--progress": `${percent * 3.6}deg` } as React.CSSProperties}>
      <div>
        <strong>{percent}%</strong>
        <span>complete</span>
      </div>
    </div>
  );
}

function EndorsementStack({ count }: { count: number }) {
  if (!count) return <span className="no-endorsements">No endorsements yet</span>;
  return (
    <div className="endorsement-stack" aria-label={`${count} mentor endorsement${count === 1 ? "" : "s"}`}>
      <span aria-hidden="true">✓</span>
      {count > 1 ? <span aria-hidden="true">✓</span> : null}
      {count > 2 ? <span>+{count - 2}</span> : null}
      <b>{count} endorsed</b>
    </div>
  );
}

function AccountAccessModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <article className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span className="eyebrow">Account foundation</span><h2 id="account-modal-title">Real people, clearly defined roles.</h2></div>
          <button className="close-button" onClick={onClose} aria-label="Close account information">×</button>
        </header>
        <p className="account-intro">This version saves progress only in this browser. The next connection will add secure sign-in, shared progress, review assignments, kudos, and comments.</p>
        <div className="account-role-grid">
          {(Object.entries(accountRoleDetails) as [Role, (typeof accountRoleDetails)[Role]][]).map(([id, detail], index) => (
            <section key={id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{detail.label}</h3>
              <p>{detail.summary}</p>
            </section>
          ))}
        </div>
        <section className="director-roster">
          <div><span className="eyebrow">Faculty director access</span><h3>Full program oversight</h3><p>Directors will be able to view student and mentor activity, give kudos, leave comments, and manage account roles.</p></div>
          <ul>{facultyDirectors.map((director) => <li key={director.id}><span>{director.displayName.split(" ").map((part) => part[0]).join("")}</span><div><strong>{director.displayName}</strong><small>{director.title}</small></div></li>)}</ul>
        </section>
        <footer><span>Authentication and shared data are not active yet.</span><button className="primary-button" onClick={onClose}>Continue with local preview</button></footer>
      </article>
    </div>
  );
}

function ProjectModal({ project, onClose }: { project: ProjectBrief; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <article
        className="project-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={`project-modal-header accent-${project.accent}`}>
          <div>
            <span className="eyebrow">{project.discipline}</span>
            <h2 id="project-modal-title">{project.title}</h2>
            <p>{project.kicker}</p>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close project brief">×</button>
        </header>

        <div className="project-modal-body">
          <p className="project-lead">{project.summary}</p>

          <div className="project-facts">
            <div><span>Timeline</span><strong>{project.timeline}</strong></div>
            <div><span>Format</span><strong>{project.format}</strong></div>
          </div>

          <section>
            <div className="section-heading"><span>01</span><h3>Deliverables</h3></div>
            <ul className="brief-list">{project.deliverables.map((item) => <li key={item}><CheckMark /> {item}</li>)}</ul>
          </section>

          <section>
            <div className="section-heading"><span>02</span><h3>Suggested workflow</h3></div>
            <ol className="workflow-list">{project.workflow.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></li>)}</ol>
          </section>

          <section>
            <div className="section-heading"><span>03</span><h3>Constraints</h3></div>
            <ul className="constraint-list">{project.constraints.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>

          {project.evaluation ? (
            <section>
              <div className="section-heading"><span>04</span><h3>Evaluation criteria</h3></div>
              <div className="tag-cloud">{project.evaluation.map((item) => <span key={item}>{item}</span>)}</div>
            </section>
          ) : null}

          {project.assets ? (
            <section>
              <div className="section-heading"><span>04</span><h3>Photo pack</h3></div>
              <p className="section-copy">Nine client-supplied orchestra photographs are ready to use in the flyer and social post.</p>
              <div className="asset-grid">
                {project.assets.slice(0, 6).map((asset) => (
                  <img key={asset} src={`./project-assets/orchestra/${asset}`} alt="Orchestra reference photograph" />
                ))}
              </div>
            </section>
          ) : null}

          <footer className="modal-footer">
            <a className="primary-button" href={project.briefHref} download>Download original brief <span>↓</span></a>
            {project.assetHref ? <a className="secondary-button" href={project.assetHref} download>Download photo pack <span>↓</span></a> : null}
          </footer>
        </div>
      </article>
    </div>
  );
}

export default function Tracker() {
  const [role, setRole] = useState<Role>("student");
  const [view, setView] = useState<View>("overview");
  const [statuses, setStatuses] = useState<Record<string, SkillStatus>>(defaultStatuses);
  const [endorsements, setEndorsements] = useState<Record<string, number>>(defaultEndorsements);
  const [sessionEndorsed, setSessionEndorsed] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("All skills");
  const [query, setQuery] = useState("");
  const [project, setProject] = useState<ProjectBrief | null>(null);
  const [selectedBrandGuide, setSelectedBrandGuide] = useState<BrandGuideId>("digital-corps");
  const [announcement, setAnnouncement] = useState("");
  const [syncState, setSyncState] = useState<"loading" | "saved" | "session">("loading");
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const data = JSON.parse(stored) as {
            statuses?: Record<string, SkillStatus>;
            endorsements?: Record<string, number>;
            endorsed?: string[];
          };
          if (data.statuses) setStatuses((value) => ({ ...value, ...data.statuses }));
          if (data.endorsements) setEndorsements((value) => ({ ...value, ...data.endorsements }));
          if (data.endorsed) setSessionEndorsed(data.endorsed);
        }
        setSyncState("saved");
      } catch {
        setSyncState("session");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const completeCount = allSkills.filter((item) => statuses[item.id] === "complete").length;
  const readyCount = allSkills.filter((item) => statuses[item.id] === "ready").length;
  const endorsementCount = Object.values(endorsements).reduce((sum, value) => sum + value, 0);
  const percent = Math.round((completeCount / allSkills.length) * 100);
  const activeArea = learningAreas.find((area) => area.id === view);
  const activeGroups = activeArea ? ["All skills", ...new Set(activeArea.skills.map((item) => item.group))] : [];
  const brandHero = selectedBrandGuide === "digital-corps"
    ? {
        eyebrow: "Digital Corps standards",
        title: "Digital Corps",
        copy: "Use the official identity system for practice projects across print, social, motion, and environmental work.",
        logo: "./brand/digital-corps-white.png",
        alt: "Digital Corps",
      }
    : selectedBrandGuide === "bsu-academics"
      ? {
          eyebrow: "Bemidji State University",
          title: "Academic Brand",
          copy: "Build university communications with the official academic logo, Evergreen and Snow palette, Whitney and Adobe Garamond type system, and Northwoods visual language.",
          logo: "./brand/bsu-academics/bemidji-state-logo-white.png",
          alt: "Bemidji State University",
        }
      : selectedBrandGuide === "bsu-athletics"
        ? {
            eyebrow: "BSU Athletics collection",
            title: "Athletics Assets",
            copy: "Official Beaver and Bucky identity files live here, while sports imagery remains separated from the BSU academic brand toolkit.",
            logo: "./brand/bsu-athletics/bsu-beaver-logo.png",
            alt: "BSU Beaver athletics logo",
          }
        : {
            eyebrow: "Technology, Art & Design",
            title: "TAD Brand",
            copy: "Use the 2024 TAD system for School of Technology, Art & Design projects, with the supplied logo suite, Futura PT typography, pillar colors, and accessible black text.",
            logo: "./brand/tad/tad-school-white.png",
            alt: "School of Technology, Art and Design",
          };

  const visibleSkills = useMemo(() => {
    if (!activeArea) return [];
    const normalized = query.trim().toLowerCase();
    return activeArea.skills.filter((item) => {
      const matchesGroup = selectedGroup === "All skills" || item.group === selectedGroup;
      const matchesQuery = !normalized || `${item.title} ${item.group}`.toLowerCase().includes(normalized);
      return matchesGroup && matchesQuery;
    });
  }, [activeArea, query, selectedGroup]);

  const setActiveView = (next: View) => {
    setView(next);
    setSelectedGroup("All skills");
    setQuery("");
  };

  const persistSnapshot = (
    nextStatuses: Record<string, SkillStatus>,
    nextEndorsements: Record<string, number>,
    nextEndorsed: string[],
  ) => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ statuses: nextStatuses, endorsements: nextEndorsements, endorsed: nextEndorsed }),
      );
      setSyncState("saved");
    } catch {
      setSyncState("session");
    }
  };

  const advanceStatus = (item: Skill) => {
    if (role !== "student") return;
    const current = statuses[item.id];
    const next = statusOrder[(statusOrder.indexOf(current) + 1) % statusOrder.length];
    const nextStatuses = { ...statuses, [item.id]: next };
    setStatuses(nextStatuses);
    setAnnouncement(`${item.title} marked ${statusLabels[next]}.`);
    persistSnapshot(nextStatuses, endorsements, sessionEndorsed);
  };

  const endorse = (item: Skill) => {
    if (
      role === "student" ||
      sessionEndorsed.includes(item.id) ||
      !["ready", "complete"].includes(statuses[item.id])
    ) return;
    const nextEndorsements = { ...endorsements, [item.id]: (endorsements[item.id] ?? 0) + 1 };
    const nextEndorsed = [...sessionEndorsed, item.id];
    setEndorsements(nextEndorsements);
    setSessionEndorsed(nextEndorsed);
    setAnnouncement(`You endorsed ${item.title}.`);
    persistSnapshot(statuses, nextEndorsements, nextEndorsed);
  };

  const switchRole = (next: Role) => {
    setRole(next);
    setAnnouncement(`Previewing the ${accountRoleDetails[next].label.toLowerCase()} workspace.`);
  };

  const activeRole = rolePresentation[role];
  const reviewRole = role === "mentor" || role === "director";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <img src="./brand/digital-corps-white.png" alt="Digital Corps" />
          <div><strong>Badge Tracker</strong><span>Learn · Practice · Endorse</span></div>
        </div>

        <nav aria-label="Primary navigation">
          <p className="nav-label">Workspace</p>
          <button className={view === "overview" ? "active" : ""} onClick={() => setActiveView("overview")}>
            <span className="nav-index">⌂</span><span>Overview</span>
          </button>
          <button className={view === "projects" ? "active" : ""} onClick={() => setActiveView("projects")}>
            <span className="nav-index">◆</span><span>Practice projects</span><em>{projectBriefs.length}</em>
          </button>
          <button className={view === "brand-guides" ? "active" : ""} onClick={() => setActiveView("brand-guides")}>
            <span className="nav-index">◈</span><span>Brand guides</span><em>{brandGuides.length}</em>
          </button>

          <p className="nav-label">Learning paths</p>
          {learningAreas.map((area) => (
            <button key={area.id} className={view === area.id ? "active" : ""} onClick={() => setActiveView(area.id)}>
              <span className="nav-index">{iconForArea[area.id]}</span><span>{area.shortName}</span>
              <em>{area.skills.length}</em>
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="spark">✦</span>
          <div><strong>{role === "director" ? "Director focus" : "Mentor tip"}</strong><p>{role === "director" ? "Use kudos for recognition and comments for useful next steps." : "Endorse the demonstrated skill, not just tutorial completion."}</p></div>
        </div>

        <p className="sidebar-foot">Digital Corps · Bemidji State University</p>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setActiveView("overview")} aria-label="Digital Corps home">
            <img src="./brand/digital-corps-symbol.png" alt="" />
          </button>
          <div className="role-switch" aria-label="Workspace role">
            <span>Workspace</span>
            <button className={role === "student" ? "active" : ""} onClick={() => switchRole("student")}>Student</button>
            <button className={role === "mentor" ? "active" : ""} onClick={() => switchRole("mentor")}>Mentor</button>
            <button className={role === "director" ? "active" : ""} onClick={() => switchRole("director")}>Director</button>
          </div>
          <span className={`save-state save-${syncState}`}>{syncState === "loading" ? "Loading…" : syncState === "saved" ? "Local preview" : "Session preview"}</span>
          <div className="topbar-actions">
            <button className="account-access-button" onClick={() => setAccountOpen(true)}>Account access</button>
            <div className="user-chip"><span>{activeRole.initials}</span><div><strong>{activeRole.name}</strong><small>{activeRole.title}</small></div></div>
          </div>
        </header>

        <div className="content-wrap">
          {view === "overview" ? (
            <>
              <section className="hero-card">
                <div className="hero-copy">
                  <span className="eyebrow">{role === "student" ? "Your learning dashboard" : role === "mentor" ? "Mentor endorsement desk" : "Faculty Director workspace"}</span>
                  <h1>{role === "student" ? "Make progress visible." : role === "mentor" ? "Recognize skills in action." : "Guide the whole program."}</h1>
                  <p>{role === "student" ? "Work through tutorials, apply the skills in real projects, and request mentor review when you are ready." : role === "mentor" ? "Review mentee progress and endorse the skills you have personally seen demonstrated." : "Support students and mentors with program-wide review, kudos, comments, and clear next steps."}</p>
                  <div className="hero-actions">
                    <button className="primary-button" onClick={() => setActiveView(role === "student" ? "content-creation" : "onboarding")}>
                      {role === "student" ? "Start learning" : readyCount ? `Review ${readyCount} ready skills` : "View learning paths"} <span>→</span>
                    </button>
                    <button className="secondary-button" onClick={() => setActiveView("projects")}>Browse projects</button>
                  </div>
                </div>
                <ProgressRing percent={percent} />
                <div className="hero-pattern" aria-hidden="true" />
              </section>

              <section className="stat-grid" aria-label="Progress summary">
                <article><span className="stat-icon green">✓</span><div><strong>{completeCount}</strong><span>Skills completed</span></div><small>of {allSkills.length}</small></article>
                <article><span className="stat-icon orange">◎</span><div><strong>{readyCount}</strong><span>Ready for review</span></div><small>mentor queue</small></article>
                <article><span className="stat-icon mint">✦</span><div><strong>{endorsementCount}</strong><span>Skill endorsements</span></div><small>from mentors</small></article>
              </section>

              {reviewRole ? (
                <section className="dashboard-section">
                  <div className="section-title"><div><span className="eyebrow">Review queue</span><h2>{role === "director" ? "Program feedback and recognition" : "Ready for your endorsement"}</h2></div>{readyCount ? <button onClick={() => setActiveView("content-creation")}>View all →</button> : null}</div>
                  {readyCount ? (
                    <div className="review-list">
                      {allSkills.filter((item) => statuses[item.id] === "ready").slice(0, 5).map((item) => (
                        <article key={item.id}>
                          <div className="student-avatar">LP</div>
                          <div className="review-copy"><strong>{item.title}</strong><span>Local learner preview · {item.group}</span></div>
                          <span className="ready-pill">Ready for review</span>
                          <button className={sessionEndorsed.includes(item.id) ? "endorsed" : "endorse-button"} onClick={() => endorse(item)}>
                            {sessionEndorsed.includes(item.id) ? "Endorsed ✓" : role === "director" ? "Give kudos" : "Endorse skill"}
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="account-empty-state">
                      <span>◎</span><div><strong>No mentees are connected yet</strong><p>Secure accounts will populate this queue with real review requests. Faculty Directors will also be able to give kudos and leave comments.</p></div><button onClick={() => setAccountOpen(true)}>See account roles →</button>
                    </div>
                  )}
                </section>
              ) : (
                <section className="dashboard-section">
                  <div className="section-title"><div><span className="eyebrow">Learning paths</span><h2>Pick up where you left off</h2></div></div>
                  <div className="path-grid">
                    {learningAreas.map((area) => {
                      const areaComplete = area.skills.filter((item) => statuses[item.id] === "complete").length;
                      const areaPercent = Math.round((areaComplete / area.skills.length) * 100);
                      return (
                        <button key={area.id} className="path-card" onClick={() => setActiveView(area.id)}>
                          <span className="path-number">{iconForArea[area.id]}</span>
                          <span className="eyebrow">{area.eyebrow}</span>
                          <strong>{area.name}</strong>
                          <p>{area.description}</p>
                          <span className="path-progress"><i style={{ width: `${areaPercent}%` }} /></span>
                          <small>{areaComplete} of {area.skills.length} complete <b>{areaPercent}%</b></small>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="dashboard-section">
                <div className="section-title"><div><span className="eyebrow">Applied learning</span><h2>Practice with a real brief</h2></div><button onClick={() => setActiveView("projects")}>All projects →</button></div>
                <div className="featured-projects">
                  {projectBriefs.slice(0, 3).map((item) => (
                    <button key={item.id} className={`mini-project accent-${item.accent}`} onClick={() => setProject(item)}>
                      <span>{item.discipline}</span><strong>{item.title}</strong><p>{item.kicker}</p><em>Open brief →</em>
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : null}

          {activeArea ? (
            <>
              <section className="track-heading">
                <div><span className="eyebrow">{activeArea.eyebrow}</span><h1>{activeArea.name}</h1><p>{activeArea.description}</p></div>
                <div className="track-count"><strong>{activeArea.skills.filter((item) => statuses[item.id] === "complete").length}</strong><span>of {activeArea.skills.length}<br />complete</span></div>
              </section>

              <div className="track-toolbar">
                <div className="group-tabs" role="tablist" aria-label="Skill groups">
                  {activeGroups.map((group) => <button key={group} role="tab" aria-selected={selectedGroup === group} className={selectedGroup === group ? "active" : ""} onClick={() => setSelectedGroup(group)}>{group}</button>)}
                </div>
                <label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills" aria-label="Search skills" /></label>
              </div>

              <section className="skills-list">
                {visibleSkills.map((item) => {
                  const itemStatus = statuses[item.id];
                  const isEndorsed = sessionEndorsed.includes(item.id);
                  const canEndorse = itemStatus === "ready" || itemStatus === "complete";
                  return (
                    <article className={`skill-row status-${itemStatus}`} key={item.id}>
                      <div className="status-marker"><span>{itemStatus === "complete" ? "✓" : itemStatus === "ready" ? "◎" : itemStatus === "learning" ? "◐" : ""}</span></div>
                      <div className="skill-copy">
                        <div className="skill-meta"><span>{item.group}</span>{item.tier ? <em className={`tier tier-${item.tier.toLowerCase()}`}>{item.tier}</em> : null}</div>
                        <h3>{item.title}</h3>
                        <SkillResource item={item} />
                      </div>
                      <EndorsementStack count={endorsements[item.id] ?? 0} />
                      <div className="skill-action">
                        {role === "student" ? (
                          <button className={`status-button status-${itemStatus}`} onClick={() => advanceStatus(item)} title="Click to move to the next status">
                            {statusLabels[itemStatus]} <span>⌄</span>
                          </button>
                        ) : (
                          <button className={isEndorsed ? "endorsed" : canEndorse ? "endorse-button" : "awaiting-button"} onClick={() => endorse(item)} disabled={isEndorsed || !canEndorse}>
                            {isEndorsed ? "Endorsed ✓" : canEndorse ? role === "director" ? "Give kudos" : "Endorse skill" : "Awaiting review"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
                {!visibleSkills.length ? <div className="empty-state"><strong>No matching skills</strong><p>Try another search or skill group.</p></div> : null}
              </section>
            </>
          ) : null}

          {view === "projects" ? (
            <>
              <section className="track-heading projects-heading">
                <div><span className="eyebrow">Applied learning</span><h1>Practice projects</h1><p>Use authentic briefs to move from following a tutorial to demonstrating a skill.</p><button className="brand-library-link" onClick={() => setActiveView("brand-guides")}>Open brand assets <span>→</span></button></div>
                <div className="project-count"><strong>{projectBriefs.length}</strong><span>complete<br />project briefs</span></div>
              </section>
              <section className="project-grid">
                {projectBriefs.map((item, index) => (
                  <article key={item.id} className={`project-card accent-${item.accent}`}>
                    <div className="project-art"><span>0{index + 1}</span><div className="project-art-pattern" /></div>
                    <div className="project-card-body">
                      <span className="eyebrow">{item.discipline}</span>
                      <h2>{item.title}</h2>
                      <p>{item.summary}</p>
                      <div className="project-card-facts"><span>{item.timeline}</span><span>{item.format}</span></div>
                      <button onClick={() => setProject(item)}>View project brief <span>→</span></button>
                    </div>
                  </article>
                ))}
              </section>
            </>
          ) : null}

          {view === "brand-guides" ? (
            <>
              <section className={`brand-guide-hero guide-${selectedBrandGuide}`}>
                <div>
                  <span className="eyebrow">{brandHero.eyebrow}</span>
                  <h1>{brandHero.title}</h1>
                  <p>{brandHero.copy}</p>
                </div>
                {brandHero.logo ? (
                  <img src={brandHero.logo} alt={brandHero.alt} />
                ) : (
                  <div className="athletics-reserve-mark"><span>Reserved</span><strong>3</strong><small>athletics files</small></div>
                )}
              </section>

              <section className="guide-selector" aria-label="Brand guide collections">
                {brandGuides.map((guide, index) => (
                  <button
                    type="button"
                    className={`${guide.enabled ? "available" : "coming-soon"} ${selectedBrandGuide === guide.id ? "selected" : ""}`}
                    key={guide.id}
                    disabled={!guide.enabled}
                    aria-pressed={selectedBrandGuide === guide.id}
                    onClick={() => guide.enabled && setSelectedBrandGuide(guide.id as BrandGuideId)}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><strong>{guide.name}</strong><small>{guide.label}</small></div>
                    {selectedBrandGuide === guide.id ? <b>Viewing</b> : guide.enabled ? <b>Open →</b> : <b aria-label={`${guide.name} ${guide.label}`}>＋</b>}
                  </button>
                ))}
              </section>

              {selectedBrandGuide === "digital-corps" ? (
                <>
                  <section className="brand-foundations">
                    <div className="brand-foundations-heading">
                      <div><span className="eyebrow">Digital Corps</span><h2>Core brand foundations</h2><p>Keep the system recognizable, accessible, and consistent across print, social, motion, and environmental work.</p></div>
                      <a className="primary-button" href="./downloads/digital-corps/digital-corps-brand-guide.pdf" download>Download complete guide <span>↓</span></a>
                    </div>

                    <div className="foundation-grid">
                      <article className="logo-foundation">
                        <span className="foundation-number">01</span>
                        <div className="foundation-logo"><img src="./brand/digital-corps-symbol.png" alt="Digital Corps symbol" /></div>
                        <h3>Logo system</h3>
                        <p>Choose the primary, secondary, horizontal, or symbol version that fits the format. Preserve clear space and the original proportions.</p>
                        <ul><li>Never stretch, skew, or redraw the mark</li><li>Use an approved color variation</li><li>Keep small text out of favicon-scale uses</li></ul>
                      </article>

                      <article className="color-foundation">
                        <span className="foundation-number">02</span>
                        <h3>Color palette</h3>
                        <p>Lead with Digital Corps green and use the supporting colors deliberately.</p>
                        <div className="color-list">
                          <span style={{ "--swatch": "#054f45" } as React.CSSProperties}><i />DC Green <b>#054F45</b></span>
                          <span style={{ "--swatch": "#052420" } as React.CSSProperties}><i />Dark Green <b>#052420</b></span>
                          <span style={{ "--swatch": "#82a7a3" } as React.CSSProperties}><i />50% Green <b>#82A7A3</b></span>
                          <span style={{ "--swatch": "#bdbebf" } as React.CSSProperties}><i />Silver <b>#BDBEBF</b></span>
                          <span style={{ "--swatch": "#e7992b" } as React.CSSProperties}><i />Butterscotch <b>#E7992B</b></span>
                        </div>
                      </article>

                      <article className="type-foundation">
                        <span className="foundation-number">03</span>
                        <h3>Typography</h3>
                        <p className="type-sample">Abrade<br />ExtraBold</p>
                        <p>Use Abrade ExtraBold for bold display moments. Adobe Subline supports secondary and body copy in the full system.</p>
                      </article>

                      <article className="pattern-foundation">
                        <span className="foundation-number">04</span>
                        <div className="pattern-sample" />
                        <h3>Geometric pattern</h3>
                        <p>Use the supplied pattern as a supporting field, crop, or transition. Keep important copy readable and do not reconstruct the motif.</p>
                      </article>
                    </div>
                  </section>

                  <AssetLibrary title="Download Digital Corps assets" description="Use these original files rather than recreating brand elements." assets={digitalCorpsAssets} />
                </>
              ) : null}

              {selectedBrandGuide === "bsu-academics" ? (
                <>
                  <section className="brand-foundations bsu-foundations">
                    <div className="brand-foundations-heading">
                      <div><span className="eyebrow">BSU Academics</span><h2>Academic brand foundations</h2><p>This collection follows the 2020 Bemidji State University academic guide. Athletics files are intentionally excluded and reserved in their own section.</p></div>
                      <a className="primary-button" href="./downloads/bsu-academics/bsu-brand-guide-2020.pdf" target="_blank" rel="noreferrer">Open complete guide <ExternalArrow /></a>
                    </div>

                    <div className="foundation-grid">
                      <article className="logo-foundation bsu-logo-foundation">
                        <span className="foundation-number">01</span>
                        <div className="foundation-logo"><img src="./brand/bsu-academics/bemidji-state-logo.png" alt="Bemidji State University academic logo" /></div>
                        <h3>Academic logo</h3>
                        <p>The four approved uses are two-color, one-color, reversed, and textural reversed. Keep the mark legible and at least 1.5 inches wide in print.</p>
                        <ul><li>Never crop or use the visual mark alone</li><li>Never stretch, skew, recolor, or add effects</li><li>Reverse only over Evergreen</li></ul>
                      </article>

                      <article className="color-foundation">
                        <span className="foundation-number">02</span>
                        <h3>Evergreen & Snow</h3>
                        <p>Green and white are the primary school colors. Secondary nature colors may support them, but never replace or overpower them.</p>
                        <div className="color-list bsu-color-list">
                          <span style={{ "--swatch": "#004d43" } as React.CSSProperties}><i />Evergreen <b>#004D43</b></span>
                          <span style={{ "--swatch": "#ffffff" } as React.CSSProperties}><i />Snow <b>#FFFFFF</b></span>
                        </div>
                        <div className="secondary-palette" aria-label="BSU secondary palette">
                          <span>Water · PMS 660</span><span>Sky · PMS 7896</span><span>Fire · PMS 7578</span><span>Ice · PMS 428</span><span>Earth · PMS 7502</span><span>Night · PMS 5395</span>
                        </div>
                      </article>

                      <article className="type-foundation bsu-type-foundation">
                        <span className="foundation-number">03</span>
                        <h3>Typography</h3>
                        <p className="bsu-whitney-sample">Whitney</p>
                        <p className="bsu-garamond-sample">Adobe Garamond</p>
                        <p>Whitney is the primary family for editorial and signage needs. Adobe Garamond is the secondary family for refined supporting copy.</p>
                      </article>

                      <article className="pattern-foundation bsu-pattern-foundation">
                        <span className="foundation-number">04</span>
                        <div className="pattern-sample bsu-pattern-sample" />
                        <h3>Northwoods patterns</h3>
                        <p>Use bark, ice, rock, and pine textures as supporting fields. The pine pattern stays green or textured against a lighter sky; never reverse its values.</p>
                      </article>
                    </div>
                  </section>

                  <AssetLibrary title="Download BSU academic assets" description="Curated academic identity files, kept separate from the reserved athletics imagery." assets={bsuAcademicAssets} />
                </>
              ) : null}

              {selectedBrandGuide === "bsu-athletics" ? (
                <>
                  <section className="athletics-reserved-section">
                    <div className="athletics-reserved-heading">
                      <div><span className="eyebrow">BSU Athletics</span><h2>Athletics identity & reserved imagery</h2><p>The Beaver and Bucky files are now organized as athletics-only assets. The three sports photographs remain excluded from every BSU academic download.</p></div>
                      <a className="primary-button" href="./downloads/bsu-athletics/bsu-athletics-logo-package.zip" download>Download athletics logos <span>↓</span></a>
                    </div>
                    <div className="athletics-identity-summary">
                      <img src="./brand/bsu-athletics/bsu-beaver-icon.png" alt="BSU Beaver icon" />
                      <div><strong>Official identity files received</strong><p>Beaver icon and BSU lockups, baseball monogram, one-color and reversed options, plus eight editable Bucky mascot variations.</p></div>
                    </div>
                    <div className="athletics-preview-grid">
                      {athleticsAssets.map((asset, index) => (
                        <figure key={asset.src}><img src={asset.src} alt={asset.label} /><figcaption><span>{String(index + 1).padStart(2, "0")}</span>{asset.label}</figcaption></figure>
                      ))}
                    </div>
                    <div className="athletics-hold-note"><strong>Guide pending</strong><p>The official athletics identity assets are available, but a complete athletics brand guide has not yet been supplied. Keep these files isolated from the academic logo system until that guide is added.</p></div>
                  </section>
                  <AssetLibrary title="Download BSU Athletics assets" description="Athletics-only logo, mascot, and sports-photo packages—kept separate from BSU Academics." assets={bsuAthleticsDownloadAssets} />
                </>
              ) : null}

              {selectedBrandGuide === "tad" ? (
                <>
                  <section className="brand-foundations tad-foundations">
                    <div className="brand-foundations-heading">
                      <div><span className="eyebrow">Technology, Art & Design</span><h2>TAD brand foundations</h2><p>The 2024 system connects the school’s technology, art, design, and project disciplines through modular letterforms and a bright pillar palette.</p></div>
                      <a className="primary-button" href="./downloads/tad/tad-brand-guidelines-2024.pdf" target="_blank" rel="noreferrer">Open complete guide <ExternalArrow /></a>
                    </div>

                    <div className="foundation-grid">
                      <article className="logo-foundation tad-logo-foundation">
                        <span className="foundation-number">01</span>
                        <div className="foundation-logo"><img src="./brand/tad/tad-horizontal-logo.png" alt="TAD School of Technology, Art and Design logo" /></div>
                        <h3>Modular logo system</h3>
                        <p>Use the black or white primary logo, the TAD icon alone, or the approved color secondary logo supplied in the package.</p>
                        <ul><li>Keep all three letter modules proportional</li><li>Choose the version that maintains contrast</li><li>Use the supplied vector rather than rebuilding it</li></ul>
                      </article>

                      <article className="color-foundation tad-color-foundation">
                        <span className="foundation-number">02</span>
                        <h3>Pillars of TAD</h3>
                        <p>Each pillar has a dedicated color. Use black text over these colors for WebAIM accessibility compliance; use white rarely.</p>
                        <div className="tad-palette-grid">
                          <span style={{ "--swatch": "#36b8b2" } as React.CSSProperties}><i />Design Teal<b>#36B8B2</b></span>
                          <span style={{ "--swatch": "#f15f52" } as React.CSSProperties}><i />Arts Red<b>#F15F52</b></span>
                          <span style={{ "--swatch": "#d9d94d" } as React.CSSProperties}><i />Project Yellow<b>#D9D94D</b></span>
                          <span style={{ "--swatch": "#57cf69" } as React.CSSProperties}><i />Engineering Green<b>#57CF69</b></span>
                          <span style={{ "--swatch": "#8761bf" } as React.CSSProperties}><i />Communication Purple<b>#8761BF</b></span>
                          <span style={{ "--swatch": "#f2a04e" } as React.CSSProperties}><i />Creativity Orange<b>#F2A04E</b></span>
                          <span style={{ "--swatch": "#6b86db" } as React.CSSProperties}><i />Computer Science Blue<b>#6B86DB</b></span>
                          <span style={{ "--swatch": "#f5f6f7" } as React.CSSProperties}><i />Gray<b>#F5F6F7</b></span>
                        </div>
                      </article>

                      <article className="type-foundation tad-type-foundation">
                        <span className="foundation-number">03</span>
                        <h3>Typography</h3>
                        <p className="tad-type-sample">Futura PT</p>
                        <div className="tad-type-weights"><span>Extra Bold</span><span>Bold</span><span>Light</span><span>Light Oblique</span></div>
                        <p>Use the Futura PT family consistently across TAD communications, matching weight and contrast to hierarchy.</p>
                      </article>

                      <article className="tad-practice-foundation">
                        <span className="foundation-number">04</span>
                        <div className="tad-practice-image"><img src="./brand/tad/bridgeman-preview.jpg" alt="Bridgeman Hall practice photograph" /></div>
                        <h3>Practice image</h3>
                        <p>The supplied layered Bridgeman Hall PSD is available for composites, color studies, and branded TAD project exercises.</p>
                      </article>
                    </div>
                  </section>

                  <AssetLibrary title="Download TAD assets" description="Official guide, logo artwork, modular alphabet sources, and the layered Bridgeman practice file." assets={tadAssets} />
                </>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="mobile-nav" aria-label="Mobile navigation">
          <button className={view === "overview" ? "active" : ""} onClick={() => setActiveView("overview")}><span>⌂</span>Home</button>
          <button className={learningAreas.some((area) => area.id === view) ? "active" : ""} onClick={() => setActiveView("content-creation")}><span>◫</span>Skills</button>
          <button className={view === "projects" ? "active" : ""} onClick={() => setActiveView("projects")}><span>◆</span>Projects</button>
          <button className={view === "brand-guides" ? "active" : ""} onClick={() => setActiveView("brand-guides")}><span>◈</span>Brand</button>
        </div>
      </main>

      <p className="sr-only" aria-live="polite">{announcement}</p>
      {project ? <ProjectModal project={project} onClose={() => setProject(null)} /> : null}
      {accountOpen ? <AccountAccessModal onClose={() => setAccountOpen(false)} /> : null}
    </div>
  );
}
