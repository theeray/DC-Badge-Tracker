"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  canonicalizeManagedContentData,
  isSafeContentHref,
  managedDataDefaults,
  type ContentKind,
  type ContentDataMap,
  type ManagedContentEntry,
} from "./content-catalog";
import { useContentCatalog } from "./content-context";
import { saveManagedContent, watchManagedContentHistory } from "./content-firebase";
import { defaultContentResources } from "./content-defaults";
import { allSkills as originalSkills, learningAreas as originalAreas, projectBriefs as originalProjects } from "./data";
import { readableFirebaseError, type AuthSession, type UserProfile } from "./firebase";
import "./content-editor.css";

type ContentData = ContentDataMap[ContentKind];
type EditorRecord = { kind: ContentKind; key: string; data: ContentData; archived: boolean; revision: number };
type EditorDraft = EditorRecord & { isNew: boolean };
const kindNames: Record<ContentKind, string> = {
  tutorial: "Tutorials", area: "Learning paths", project: "Practice projects", resource: "Resource links",
};
const singularNames: Record<ContentKind, string> = {
  tutorial: "tutorial", area: "learning path", project: "practice project", resource: "resource link",
};
const sectionNames = {
  onboarding: "Onboarding", "digital-corps": "Digital Corps brand guide",
  "bsu-academics": "BSU Academics brand guide", "bsu-athletics": "BSU Athletics brand guide", tad: "TAD brand guide",
};

function titleOf(data: ContentData) { return "name" in data ? data.name : data.title; }
function slug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-$/, "");
}
function serialize(draft: EditorDraft | null) { return draft ? JSON.stringify(draft) : ""; }
function dateLabel(value: unknown) {
  if (value instanceof Date) return value.toLocaleString();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toLocaleString();
  }
  return "Timestamp pending";
}
function TextField({ label, value, onChange, maxLength, required = false, multiline = false, hint, disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; maxLength: number;
  required?: boolean; multiline?: boolean; hint?: string; disabled?: boolean;
}) {
  return <label className={`ce-field ${multiline ? "ce-wide" : ""}`}>
    <span>{label}{required ? <b aria-label="required"> *</b> : null}</span>
    {multiline
      ? <textarea rows={4} value={value} maxLength={maxLength} required={required} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      : <input type="text" value={value} maxLength={maxLength} required={required} disabled={disabled} onChange={(event) => onChange(event.target.value)} />}
    {hint ? <small>{hint}</small> : null}
  </label>;
}

function ContentPreview({ record }: { record: Pick<EditorRecord, "kind" | "data" | "archived"> }) {
  return <div className="ce-preview">
    <h4>{titleOf(record.data) || "Untitled"}</h4>
    <p>{record.archived ? "Archived — hidden from active content lists" : "Visible in active content lists"}</p>
    <dl>{Object.entries(record.data).filter(([key]) => key !== "id").map(([key, value]) => <div key={key}>
      <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
      <dd>{Array.isArray(value)
        ? value.length ? <ul>{value.map((item, index) => <li key={index}>{typeof item === "object" && item !== null && "label" in item
          ? <><strong>{String(item.label)}</strong> — {String(item.href)}</> : String(item)}</li>)}</ul> : "None"
        : typeof value === "boolean" ? value ? "Yes" : "No"
          : typeof value === "string" && isSafeContentHref(value) ? <a href={value} target="_blank" rel="noopener noreferrer">{value}</a>
            : String(value || "None")}</dd>
    </div>)}</dl>
  </div>;
}

export default function ContentEditor({ session }: { session: AuthSession }) {
  if (!session.profile.active || session.profile.role !== "director" || !session.user.emailVerified) {
    return <section className="content-editor"><h1>Content editor</h1><p>Only an active faculty director can publish content changes.</p></section>;
  }
  return <DirectorContentEditor profile={session.profile} />;
}

function DirectorContentEditor({ profile }: { profile: UserProfile }) {
  const catalog = useContentCatalog();
  const [kind, setKind] = useState<ContentKind>("tutorial");
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [initialDraft, setInitialDraft] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [listText, setListText] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ManagedContentEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [revisionPreview, setRevisionPreview] = useState<EditorRecord | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const dirty = Boolean(draft && serialize(draft) !== initialDraft);

  const originalRecords = useMemo(() => {
    const result: EditorRecord[] = [];
    const add = <K extends ContentKind>(entryKind: K, items: { id: string }[]) => {
      for (const item of items) result.push({ kind: entryKind, key: item.id,
        data: canonicalizeManagedContentData(entryKind, item.id, item), archived: false, revision: 0 });
    };
    add("tutorial", originalSkills); add("area", originalAreas); add("project", originalProjects); add("resource", defaultContentResources);
    return result;
  }, []);
  const originalRecord = draft ? originalRecords.find((item) => item.kind === draft.kind && item.key === draft.key) : undefined;

  const records = useMemo(() => {
    const merged = new Map<string, EditorRecord>();
    const add = <K extends ContentKind>(entryKind: K, items: { id: string }[]) => {
      for (const item of items) merged.set(`${entryKind}--${item.id}`, {
        kind: entryKind, key: item.id, data: canonicalizeManagedContentData(entryKind, item.id, item), archived: false, revision: 0,
      });
    };
    add("tutorial", catalog.allSkillsIncludingArchived);
    add("area", catalog.allAreasIncludingArchived);
    add("project", catalog.allProjectsIncludingArchived);
    add("resource", catalog.allResourcesIncludingArchived);
    for (const entry of catalog.entries) merged.set(`${entry.kind}--${entry.key}`, entry);
    return [...merged.values()].sort((a, b) => titleOf(a.data).localeCompare(titleOf(b.data)) || a.key.localeCompare(b.key));
  }, [catalog.allSkillsIncludingArchived, catalog.allAreasIncludingArchived, catalog.allProjectsIncludingArchived, catalog.allResourcesIncludingArchived, catalog.entries]);
  const visible = records.filter((item) => item.kind === kind && (includeArchived || !item.archived)
    && `${titleOf(item.data)} ${item.key} ${"group" in item.data ? item.data.group : ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const warnNavigation = (event: Event) => {
      if (!window.confirm("Discard these unpublished content changes and leave the editor? Your last published version will stay unchanged.")) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("dc-central-before-navigate", warnNavigation);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("dc-central-before-navigate", warnNavigation);
    };
  }, [dirty]);

  const draftKind = draft?.kind;
  const draftKey = draft?.isNew ? "" : draft?.key;
  useEffect(() => {
    setHistory([]); setHistoryError(""); setRevisionPreview(null);
    if (!draftKind || !draftKey) { setHistoryLoading(false); return; }
    setHistoryLoading(true);
    return watchManagedContentHistory(profile, draftKind, draftKey, (items) => {
      setHistory(items); setHistoryLoading(false);
    }, (problem) => { setHistoryError(problem); setHistoryLoading(false); });
  }, [profile.uid, draftKind, draftKey]);

  function mayLeaveDraft() {
    return !dirty || window.confirm("Discard these unpublished changes? Your last published version will stay unchanged.");
  }
  function loadDraft(next: EditorDraft | null) {
    setDraft(next); setInitialDraft(serialize(next)); setKeyEdited(!next?.isNew);
    setListText({}); setError(""); setMessage(""); setShowPreview(false); setRevisionPreview(null);
  }
  function openRecord(record: EditorRecord) { if (!busy && mayLeaveDraft()) loadDraft({ ...record, isNew: false }); }
  function changeKind(nextKind: ContentKind) {
    if (busy || !mayLeaveDraft()) return;
    setKind(nextKind); setQuery(""); loadDraft(null);
  }
  function addNew() {
    if (busy || !mayLeaveDraft()) return;
    const data = managedDataDefaults(kind);
    if (kind === "tutorial" && "area" in data) data.area = catalog.learningAreas[0]?.id ?? "";
    loadDraft({ kind, key: "", data, archived: false, revision: 0, isNew: true });
  }
  function patch(patchData: Partial<ContentData>) {
    setDraft((current) => current ? { ...current, data: { ...current.data, ...patchData } as ContentData } : current);
  }
  function setTitle(value: string) {
    setDraft((current) => {
      if (!current) return current;
      const key = current.isNew && !keyEdited ? slug(value) : current.key;
      return { ...current, key, data: { ...current.data, id: key, [current.kind === "area" ? "name" : "title"]: value } as ContentData };
    });
  }
  function setKey(value: string) {
    setKeyEdited(true);
    setDraft((current) => current ? { ...current, key: value, data: { ...current.data, id: value } } : current);
  }
  function listField(name: string, label: string, values: string[], maxItems = 12, maxItemLength = 1000) {
    return <TextField key={name} label={label} value={listText[name] ?? values.join("\n")} multiline maxLength={maxItems * (maxItemLength + 1)}
      hint={`One item per line; up to ${maxItems} items, ${maxItemLength.toLocaleString()} characters each.`}
      onChange={(value) => { setListText((current) => ({ ...current, [name]: value })); patch({ [name]: value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) }); }} />;
  }
  async function publish(event?: FormEvent, restore?: EditorRecord) {
    event?.preventDefault();
    if (!draft || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const next = restore ? { ...draft, data: restore.data, archived: restore.archived } : draft;
      const key = next.key.trim();
      if (next.isNew && records.some((item) => item.kind === next.kind && item.key === key)) throw new Error("That stable ID already exists, including archived content. Choose that item to edit or restore it instead.");
      const data = canonicalizeManagedContentData(next.kind, key, next.data);
      if (next.kind === "tutorial" && !next.archived && "area" in data && !catalog.learningAreas.some((area) => area.id === data.area)) {
        throw new Error("Choose an active learning path for this tutorial. Create or restore the path first if needed.");
      }
      const revision = await saveManagedContent(profile, { kind: next.kind, key, data, archived: next.archived }, draft.revision);
      const saved = { ...next, key, data, revision, isNew: false };
      loadDraft(saved);
      setMessage(`${restore ? "Restored" : "Published"} version ${revision}. ${saved.archived ? "This item is archived; existing progress and submission records are kept." : "Signed-in members will receive the updated content without a site redeployment."}`);
    } catch (problem) { setError(readableFirebaseError(problem)); }
    finally { setBusy(false); }
  }
  function exportBackup() {
    const backup = { schemaVersion: 1, exportedAt: new Date().toISOString(), content: records };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `dc-central-content-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Content backup downloaded. It contains editable catalog content, not accounts, progress, or private knowledge-check answer keys.");
  }
  function renderFields() {
    if (!draft) return null;
    if (draft.kind === "tutorial") {
      const data = draft.data as ContentDataMap["tutorial"];
      return <>
        <TextField label="Tutorial title" value={data.title} onChange={setTitle} maxLength={160} required />
        <label className="ce-field"><span>Learning path *</span><select value={data.area} required onChange={(event) => patch({ area: event.target.value })}>
          <option value="">Choose a learning path</option>
          {data.area && !catalog.learningAreas.some((area) => area.id === data.area) ? <option value={data.area} disabled>{catalog.allAreasIncludingArchived.find((area) => area.id === data.area)?.name ?? data.area} (archived path)</option> : null}
          {catalog.learningAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
        </select></label>
        <TextField label="Skill category" value={data.group} onChange={(group) => patch({ group })} maxLength={160} required hint="For example: Photography, Motion Graphics, or Fabrication. Reuse a category or enter a new one." />
        <label className="ce-field"><span>Suggested badge tier</span><select value={data.tier} onChange={(event) => patch({ tier: event.target.value as "" | "Silver" | "Gold" })}><option value="">No suggested tier</option><option>Silver</option><option>Gold</option></select><small>A label for the lesson, not a badge awarded to anyone.</small></label>
        <TextField label="Main tutorial link" value={data.href} onChange={(href) => patch({ href })} maxLength={1000} hint="Use an https:// link or a file path already hosted here, such as /resources/guide.pdf. Leave blank only if the tutorial has no main link." />
        <TextField label="Main link button label" value={data.resourceLabel} onChange={(resourceLabel) => patch({ resourceLabel })} maxLength={160} />
        <TextField label="Tutorial notes and instructions" value={data.resourceNote} onChange={(resourceNote) => patch({ resourceNote })} maxLength={1600} multiline />
        <label className="ce-check ce-wide"><input type="checkbox" checked={data.internal} onChange={(event) => patch({ internal: event.target.checked })} /><span>Internal Teams resource</span></label>
        <fieldset className="ce-link-list ce-wide"><legend>Additional tutorial links</legend><p>Up to six related documents, demonstrations, or tutorials. Every link needs a label.</p>
          {data.additionalResources.map((resource, index) => <div className="ce-extra-link" key={index}>
            <TextField label={`Link ${index + 1} label`} value={resource.label} maxLength={160} required onChange={(label) => patch({ additionalResources: data.additionalResources.map((item, i) => i === index ? { ...item, label } : item) })} />
            <TextField label={`Link ${index + 1} address`} value={resource.href} maxLength={1000} required onChange={(href) => patch({ additionalResources: data.additionalResources.map((item, i) => i === index ? { ...item, href } : item) })} />
            <button type="button" className="ce-link-button" onClick={() => patch({ additionalResources: data.additionalResources.filter((_, i) => i !== index) })}>Remove link {index + 1}</button>
          </div>)}
          <button type="button" className="ce-secondary" disabled={data.additionalResources.length >= 6} onClick={() => patch({ additionalResources: [...data.additionalResources, { label: "", href: "" }] })}>+ Add related link</button>
        </fieldset>
        {listField("searchTerms", "Search keywords", data.searchTerms, 12, 160)}
      </>;
    }
    if (draft.kind === "area") {
      const data = draft.data as ContentDataMap["area"];
      return <>
        <TextField label="Learning path name" value={data.name} onChange={setTitle} maxLength={160} required />
        <TextField label="Short navigation name" value={data.shortName} onChange={(shortName) => patch({ shortName })} maxLength={80} required />
        <TextField label="Eyebrow heading" value={data.eyebrow} onChange={(eyebrow) => patch({ eyebrow })} maxLength={160} />
        <TextField label="Description" value={data.description} onChange={(description) => patch({ description })} maxLength={1600} multiline />
        <p className="ce-notice ce-wide">Tutorials are assigned to paths individually. Archiving a path hides that path and its tutorials from active learning lists, but does not delete their saved records.</p>
      </>;
    }
    if (draft.kind === "project") {
      const data = draft.data as ContentDataMap["project"];
      return <>
        <TextField label="Project title" value={data.title} onChange={setTitle} maxLength={160} required />
        <TextField label="Discipline" value={data.discipline} onChange={(discipline) => patch({ discipline })} maxLength={160} />
        <TextField label="Short project heading" value={data.kicker} onChange={(kicker) => patch({ kicker })} maxLength={160} />
        <TextField label="Summary" value={data.summary} onChange={(summary) => patch({ summary })} maxLength={1600} multiline />
        <TextField label="Timeline" value={data.timeline} onChange={(timeline) => patch({ timeline })} maxLength={160} />
        <TextField label="Format" value={data.format} onChange={(format) => patch({ format })} maxLength={160} />
        <TextField label="Project brief link" value={data.briefHref} onChange={(briefHref) => patch({ briefHref })} maxLength={1000} required />
        <TextField label="Optional asset package link" value={data.assetHref} onChange={(assetHref) => patch({ assetHref })} maxLength={1000} />
        <label className="ce-field"><span>Brand accent</span><select value={data.accent} onChange={(event) => patch({ accent: event.target.value as ContentDataMap["project"]["accent"] })}>{["green", "mint", "orange", "silver"].map((accent) => <option key={accent} value={accent}>{accent}</option>)}</select></label>
        {listField("deliverables", "Deliverables", data.deliverables)}{listField("workflow", "Workflow steps", data.workflow)}
        {listField("constraints", "Project requirements", data.constraints)}{listField("evaluation", "Evaluation criteria", data.evaluation)}
        {listField("assets", "Photo gallery filenames or links", data.assets)}
      </>;
    }
    const data = draft.data as ContentDataMap["resource"];
    return <>
      <TextField label="Resource title" value={data.title} onChange={setTitle} maxLength={160} required />
      <label className="ce-field"><span>Where it appears *</span><select value={data.section} onChange={(event) => patch({ section: event.target.value as ContentDataMap["resource"]["section"] })}>{Object.entries(sectionNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      <TextField label="Description" value={data.description} onChange={(description) => patch({ description })} maxLength={1600} multiline />
      <TextField label="Resource link" value={data.href} onChange={(href) => patch({ href })} maxLength={1000} required hint="Paste an https:// link or the path to a file already hosted on this site. This editor does not upload or replace the file itself." />
      <TextField label="File format or link detail" value={data.format} onChange={(format) => patch({ format })} maxLength={160} hint="For example: PDF, ZIP · 12 MB, or Online guide." />
      <TextField label="Resource type" value={data.kind} onChange={(resourceKind) => patch({ kind: resourceKind })} maxLength={160} hint="For example: Guide, Logo, Template, or Tutorial." />
    </>;
  }

  return <section className="content-editor" aria-labelledby="ce-title">
    <header className="ce-heading"><div><span className="ce-eyebrow">Faculty director tools</span><h1 id="ce-title">Content editor</h1><p>Keep learning materials current without editing code or redeploying the site. Publish deliberately, archive instead of deleting, and restore earlier versions when needed.</p></div><button type="button" className="ce-secondary" onClick={exportBackup} disabled={catalog.loading}>Export content backup</button></header>
    <p className="ce-notice">Changes apply to shared content, never to students’ saved progress, endorsements, or answers. Knowledge checks and private grading guides have their own editor in Knowledge checks. Files must already be hosted before you link to them.</p>
    {catalog.error ? <p className="ce-error" role="alert">The live content catalog could not load: {catalog.error}. Publishing is disabled until it reconnects.</p> : null}
    {catalog.loading ? <p role="status">Loading editable content…</p> : null}
    {message ? <p className="ce-success" role="status">{message}</p> : null}
    {error ? <p className="ce-error" role="alert">{error}</p> : null}
    <div className="ce-layout">
      <aside className="ce-browser" aria-label="Choose content to edit">
        <label className="ce-field"><span>Content type</span><select value={kind} onChange={(event) => changeKind(event.target.value as ContentKind)} disabled={busy}>{Object.entries(kindNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label className="ce-field"><span>Find content</span><input type="search" value={query} placeholder={`Search ${kindNames[kind].toLowerCase()}`} onChange={(event) => setQuery(event.target.value)} /></label>
        <label className="ce-check"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /><span>Include archived items</span></label>
        <button type="button" className="ce-primary" onClick={addNew} disabled={busy || catalog.loading || Boolean(catalog.error)}>+ Add {singularNames[kind]}</button>
        <p className="ce-count">{visible.length} {kindNames[kind].toLowerCase()}</p>
        <ul className="ce-records">{visible.map((record) => <li key={`${record.kind}--${record.key}`}><button type="button" className={draft?.kind === record.kind && draft.key === record.key ? "selected" : ""} aria-pressed={draft?.kind === record.kind && draft.key === record.key} disabled={busy} onClick={() => openRecord(record)}><strong>{titleOf(record.data)}</strong><small>{record.archived ? "Archived" : record.revision ? `Published v${record.revision}` : "Original catalog"} · {record.key}</small></button></li>)}</ul>
        {!visible.length && !catalog.loading ? <p>No content matches this view.</p> : null}
      </aside>
      <div className="ce-workspace">
        {!draft ? <div className="ce-empty"><h2>Choose an item to edit</h2><p>Select existing content or add a new item. Nothing changes for members until you select Publish changes.</p></div> : <>
          <div className="ce-editor-heading"><div><span className="ce-eyebrow">{draft.isNew ? "New item" : draft.revision ? `Editing published version ${draft.revision}` : "Editing original catalog"}</span><h2>{titleOf(draft.data) || `New ${singularNames[draft.kind]}`}</h2></div><span className={`ce-draft-label ${dirty ? "unsaved" : ""}`}>{dirty ? "Unpublished changes" : "No unpublished changes"}</span></div>
          <form onSubmit={(event) => void publish(event)}>
            <fieldset disabled={busy || catalog.loading || Boolean(catalog.error)} className="ce-form-fields">
              <TextField label="Stable ID" value={draft.key} maxLength={80} required onChange={setKey} disabled={!draft.isNew} hint={draft.isNew ? "Use lowercase letters, numbers, and hyphens. This becomes permanent after publication." : "This ID stays fixed so existing progress, assignments, and knowledge-check history keep their connections."} />
              {renderFields()}
              <label className="ce-check ce-wide ce-archive"><input type="checkbox" checked={draft.archived} onChange={(event) => setDraft((current) => current ? { ...current, archived: event.target.checked } : current)} /><span><strong>Archive this item</strong><small>Hide it from active lists. Uncheck and publish to restore it. Saved learner records are not deleted.</small></span></label>
            </fieldset>
            <div className="ce-actions"><button className="ce-primary" type="submit" disabled={busy || catalog.loading || Boolean(catalog.error) || (!dirty && !draft.isNew)}>{busy ? "Publishing…" : "Publish changes"}</button><button className="ce-secondary" type="button" disabled={busy} onClick={() => setShowPreview((show) => !show)} aria-expanded={showPreview}>{showPreview ? "Hide preview" : "Preview content"}</button><button className="ce-link-button" type="button" disabled={busy} onClick={() => { if (mayLeaveDraft()) loadDraft(null); }}>Cancel editing</button></div>
          </form>
          {showPreview ? <ContentPreview record={draft} /> : null}
          {!draft.isNew ? <section className="ce-history" aria-labelledby="ce-history-heading"><h3 id="ce-history-heading">Version history</h3><p>Restoring an earlier version publishes another version; it does not erase any history.</p>
            {originalRecord ? <button type="button" className="ce-secondary" disabled={busy} onClick={() => setRevisionPreview(originalRecord)}>Preview original catalog version</button> : null}
            {historyError ? <p className="ce-error" role="alert">{historyError}</p> : historyLoading ? <p role="status">Loading saved versions…</p> : !history.length ? <p>No saved revisions yet. The first publication will begin this item’s version history.</p> : <ul>{[...history].sort((a, b) => b.revision - a.revision).map((item) => <li key={item.revision}><div><strong>Version {item.revision}</strong><span>{dateLabel(item.updatedAt)}{item.archived ? " · Archived" : ""}</span></div><button type="button" className="ce-secondary" disabled={busy} onClick={() => setRevisionPreview(item)}>Preview version {item.revision}</button></li>)}</ul>}
            {revisionPreview ? <div className="ce-revision-preview"><h4>{revisionPreview.revision ? `Saved version ${revisionPreview.revision}` : "Original catalog version"}</h4><ContentPreview record={revisionPreview} /><div className="ce-actions"><button type="button" className="ce-primary" disabled={busy || catalog.loading || Boolean(catalog.error)} onClick={() => { if (mayLeaveDraft()) void publish(undefined, revisionPreview); }}>Publish this version again</button><button type="button" className="ce-secondary" onClick={() => setRevisionPreview(null)}>Close version preview</button></div></div> : null}
          </section> : null}
        </>}
      </div>
    </div>
  </section>;
}
