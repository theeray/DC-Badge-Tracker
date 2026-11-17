import type { LearningArea, ProjectBrief, Skill } from "./data";

export type ContentKind = "tutorial" | "area" | "project" | "resource";
export type ContentSection = "onboarding" | "digital-corps" | "bsu-academics" | "bsu-athletics" | "tad";
export type TutorialContentData = Omit<Required<Skill>, "tier"> & { tier: "" | "Silver" | "Gold" };
export type AreaContentData = Omit<LearningArea, "skills">;
export type ProjectContentData = Required<ProjectBrief>;
export type ContentResource = {
  id: string;
  section: ContentSection;
  title: string;
  description: string;
  href: string;
  format: string;
  kind: string;
};
export type ContentDataMap = {
  tutorial: TutorialContentData;
  area: AreaContentData;
  project: ProjectContentData;
  resource: ContentResource;
};
export type ManagedContentEntry<K extends ContentKind = ContentKind> = K extends ContentKind ? {
  kind: K;
  key: string;
  data: ContentDataMap[K];
  archived: boolean;
  revision: number;
  createdBy: string;
  createdAt: Date | null;
  updatedBy: string;
  updatedAt: Date | null;
} : never;

export const contentKinds: readonly ContentKind[] = ["tutorial", "area", "project", "resource"];
export const contentSections: readonly ContentSection[] = ["onboarding", "digital-corps", "bsu-academics", "bsu-athletics", "tad"];
export const reservedAreaIds = [
  "admin", "brand-guides", "content-editor", "dc-meet", "knowledge-checks",
  "member-development", "new-hire-onboarding", "overview", "projects",
  "skills-dashboard", "time-clock",
] as const;

export function isContentKind(value: unknown): value is ContentKind {
  return typeof value === "string" && contentKinds.includes(value as ContentKind);
}

export function isContentKey(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function managedContentDocumentId(kind: ContentKind, key: string) {
  if (!isContentKind(kind) || !isContentKey(key)) throw new Error("Use a stable ID of up to 80 lowercase letters, numbers, and single hyphens.");
  return `${kind}--${key}`;
}

export function isSafeContentHref(value: unknown, allowBlank = false): value is string {
  if (typeof value !== "string" || value.length > 1000 || /[\\\s\u0000-\u001f\u007f]/.test(value)) return false;
  if (!value) return allowBlank;
  if (value !== value.trim()) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  if (!/^https:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isSafeProjectAsset(value: unknown): value is string {
  return isSafeContentHref(value) || (typeof value === "string" && value.length <= 1000
    && !value.includes("..") && /^[A-Za-z0-9_][A-Za-z0-9_. -]*$/.test(value));
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must contain its named fields.`);
  return value as Record<string, unknown>;
}

function knownFields(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`${label} contains an unsupported field.`);
}

function text(value: unknown, label: string, max: number, allowBlank = false): string {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const result = value.trim();
  if (result.length > max || (!allowBlank && !result)) throw new Error(`${label} must use ${allowBlank ? "0" : "1"}–${max} characters.`);
  return result;
}

function href(value: unknown, label: string, allowBlank = false) {
  // Reject control characters before trimming, including pasted tabs/newlines.
  if (typeof value !== "string" || /[\\\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} must be an HTTPS link or a root-relative path.`);
  const result = value.trim().replace(/^https:\/\//i, "https://");
  if (!isSafeContentHref(result, allowBlank)) throw new Error(`${label} must be an HTTPS link or a root-relative path (up to 1,000 characters).`);
  return result;
}

function textList(value: unknown, label: string, maxItems: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${label} supports up to ${maxItems} entries.`);
  return value.map((item, index) => {
    if (typeof item === "string" && item.includes("\u0000")) throw new Error(`${label}, entry ${index + 1}, contains an unsupported NUL character.`);
    return text(item, `${label}, entry ${index + 1}`, maxLength);
  });
}

export function managedDataDefaults<K extends ContentKind>(kind: K): ContentDataMap[K] {
  const defaults: ContentDataMap = {
    tutorial: { id: "", title: "", group: "", area: "", href: "", resourceLabel: "", resourceNote: "", additionalResources: [], internal: false, searchTerms: [], tier: "" },
    area: { id: "", name: "", shortName: "", eyebrow: "", description: "" },
    project: { id: "", title: "", discipline: "", kicker: "", summary: "", timeline: "", format: "", briefHref: "", assetHref: "", accent: "green", deliverables: [], workflow: [], constraints: [], evaluation: [], assets: [] },
    resource: { id: "", section: "onboarding", title: "", description: "", href: "", format: "", kind: "" },
  };
  return defaults[kind];
}

// Normalize bundled optional fields to the complete stored schema. Unknown
// fields are rejected rather than silently becoming editable database content.
export function canonicalizeManagedContentData<K extends ContentKind>(kind: K, key: string, input: unknown): ContentDataMap[K] {
  managedContentDocumentId(kind, key);
  if (kind === "area" && reservedAreaIds.some((reserved) => key === reserved)) {
    throw new Error("This learning path ID is reserved for site navigation. Choose a different stable ID.");
  }
  const value = record(input, "Content");
  if (value.id !== key) throw new Error("The content ID must match its stable record ID. Existing IDs cannot be changed.");
  let result: ContentDataMap[ContentKind];
  if (kind === "tutorial") {
    knownFields(value, ["id", "title", "group", "area", "href", "resourceLabel", "resourceNote", "additionalResources", "internal", "searchTerms", "tier"], "Tutorial");
    if (!isContentKey(value.area)) throw new Error("Choose a valid learning area.");
    const links = value.additionalResources ?? [];
    if (!Array.isArray(links) || links.length > 6) throw new Error("Additional resources support up to 6 links.");
    const additionalResources = links.map((inputLink) => {
      const link = record(inputLink, "Additional resource");
      knownFields(link, ["label", "href"], "Additional resource");
      return { label: text(link.label, "Resource label", 160), href: href(link.href, "Resource link") };
    });
    if (value.internal !== undefined && typeof value.internal !== "boolean") throw new Error("The internal-resource setting must be true or false.");
    const tier = value.tier ?? "";
    if (!["", "Silver", "Gold"].includes(tier as string)) throw new Error("Choose no suggested tier, Silver, or Gold.");
    result = {
      id: key, title: text(value.title, "Tutorial title", 160), group: text(value.group, "Skill category", 160), area: value.area,
      href: href(value.href ?? "", "Tutorial link", true), resourceLabel: text(value.resourceLabel ?? "", "Resource label", 160, true),
      resourceNote: text(value.resourceNote ?? "", "Resource note", 1600, true), additionalResources,
      internal: value.internal ?? false, searchTerms: textList(value.searchTerms ?? [], "Search terms", 12, 160), tier: tier as TutorialContentData["tier"],
    };
  } else if (kind === "area") {
    // A bundled LearningArea includes skills; those are separately managed by
    // stable tutorial IDs, never written inside an area's metadata document.
    knownFields(value, ["id", "name", "shortName", "eyebrow", "description", "skills"], "Learning area");
    result = { id: key, name: text(value.name, "Area name", 160), shortName: text(value.shortName, "Short name", 80), eyebrow: text(value.eyebrow, "Area label", 160, true), description: text(value.description, "Area description", 1600, true) };
  } else if (kind === "project") {
    knownFields(value, ["id", "title", "discipline", "kicker", "summary", "timeline", "format", "briefHref", "assetHref", "accent", "deliverables", "workflow", "constraints", "evaluation", "assets"], "Practice project");
    if (!["green", "mint", "orange", "silver"].includes(value.accent as string)) throw new Error("Choose a Digital Corps accent color.");
    const assets = textList(value.assets ?? [], "Project assets", 12, 1000)
      .map((asset) => /^https:\/\//i.test(asset) ? href(asset, "Project asset") : asset);
    if (assets.some((asset) => !isSafeProjectAsset(asset))) throw new Error("Project assets must be safe filenames, HTTPS links, or root-relative paths.");
    result = {
      id: key, title: text(value.title, "Project title", 160), discipline: text(value.discipline, "Project discipline", 160, true),
      kicker: text(value.kicker, "Project label", 160, true), summary: text(value.summary, "Project summary", 1600, true),
      timeline: text(value.timeline, "Project timeline", 160, true), format: text(value.format, "Project format", 160, true),
      briefHref: href(value.briefHref, "Project brief link"), assetHref: href(value.assetHref ?? "", "Project asset package", true),
      accent: value.accent as ProjectContentData["accent"], deliverables: textList(value.deliverables, "Deliverables", 12, 1000),
      workflow: textList(value.workflow, "Workflow", 12, 1000), constraints: textList(value.constraints, "Constraints", 12, 1000),
      evaluation: textList(value.evaluation ?? [], "Evaluation criteria", 12, 1000), assets,
    };
  } else if (kind === "resource") {
    knownFields(value, ["id", "section", "title", "description", "href", "format", "kind"], "Resource");
    if (!contentSections.includes(value.section as ContentSection)) throw new Error("Choose an existing resource collection.");
    result = { id: key, section: value.section as ContentSection, title: text(value.title, "Resource title", 160), description: text(value.description, "Resource description", 1600, true), href: href(value.href, "Resource link"), format: text(value.format, "Resource format", 160, true), kind: text(value.kind, "Resource type", 160, true) };
  } else {
    throw new Error("Choose a supported content type.");
  }
  return result as ContentDataMap[K];
}

export type ManagedCatalogBaselines = {
  learningAreas: readonly LearningArea[];
  projectBriefs: readonly ProjectBrief[];
  resources: readonly ContentResource[];
};
export type ManagedCatalog = {
  learningAreas: LearningArea[];
  allSkills: Skill[];
  allSkillsIncludingArchived: Skill[];
  projectBriefs: ProjectContentData[];
  resources: ContentResource[];
  allAreasIncludingArchived: AreaContentData[];
  allProjectsIncludingArchived: ProjectContentData[];
  allResourcesIncludingArchived: ContentResource[];
};

function skillForDisplay(data: TutorialContentData): Skill {
  const { tier, resourceLabel, ...skill } = data;
  // getSkillResources uses a nullish fallback for its default button label;
  // don't replace that existing label with the stored empty-string default.
  return { ...skill, ...(resourceLabel ? { resourceLabel } : {}), ...(tier ? { tier } : {}) };
}

export function mergeManagedCatalog(baseline: ManagedCatalogBaselines, entries: readonly ManagedContentEntry[]): ManagedCatalog {
  const areas = new Map(baseline.learningAreas.map((area) => [area.id, canonicalizeManagedContentData("area", area.id, area)]));
  const tutorials = new Map(baseline.learningAreas.flatMap((area) => area.skills.map((skill) => [skill.id, canonicalizeManagedContentData("tutorial", skill.id, skill)] as const)));
  const projects = new Map(baseline.projectBriefs.map((project) => [project.id, canonicalizeManagedContentData("project", project.id, project)]));
  const resources = new Map(baseline.resources.map((resource) => [resource.id, canonicalizeManagedContentData("resource", resource.id, resource)]));
  const archived = new Set<string>();
  for (const entry of entries) {
    const documentId = managedContentDocumentId(entry.kind, entry.key);
    if (entry.archived) archived.add(documentId);
    else archived.delete(documentId);
    if (entry.kind === "area") areas.set(entry.key, canonicalizeManagedContentData("area", entry.key, entry.data));
    if (entry.kind === "tutorial") tutorials.set(entry.key, canonicalizeManagedContentData("tutorial", entry.key, entry.data));
    if (entry.kind === "project") projects.set(entry.key, canonicalizeManagedContentData("project", entry.key, entry.data));
    if (entry.kind === "resource") resources.set(entry.key, canonicalizeManagedContentData("resource", entry.key, entry.data));
  }
  const available = (kind: ContentKind, key: string) => !archived.has(managedContentDocumentId(kind, key));
  const allSkillsIncludingArchived = [...tutorials.values()].map(skillForDisplay);
  const learningAreas = [...areas.values()].filter((area) => available("area", area.id)).map((area) => ({
    ...area,
    skills: allSkillsIncludingArchived.filter((skill) => skill.area === area.id && available("tutorial", skill.id)),
  }));
  return {
    learningAreas, allSkills: learningAreas.flatMap((area) => area.skills), allSkillsIncludingArchived,
    projectBriefs: [...projects.values()].filter((project) => available("project", project.id)),
    resources: [...resources.values()].filter((resource) => available("resource", resource.id)),
    allAreasIncludingArchived: [...areas.values()], allProjectsIncludingArchived: [...projects.values()], allResourcesIncludingArchived: [...resources.values()],
  };
}
