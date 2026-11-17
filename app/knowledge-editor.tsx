"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useContentCatalog } from "./content-context";
import { readableFirebaseError, type UserProfile } from "./firebase";
import {
  bankKey, questionIds, visibleKnowledgeCatalog,
  type KnowledgeBank, type KnowledgeCatalogEntry, type QuestionId,
} from "./knowledge-catalog";
import {
  fetchKnowledgeGuide, publishKnowledgeCheck, setKnowledgeCheckArchived,
  type KnowledgeGuide, type KnowledgeGuideQuestion,
} from "./knowledge-firebase";

const blankQuestionGuide = (): KnowledgeGuideQuestion => ({ expectedAnswer: "", explanation: "", studentFeedback: "", practiceTask: "" });
const newBank = (): KnowledgeBank => ({
  id: "", version: 1, title: "", sourceUrl: "", scope: "", skillIds: [],
  questions: questionIds.map((id) => ({ id, prompt: "", topic: "" })),
});
const newGuide = (): KnowledgeGuide => ({ bankId: "", version: 1, questions: {
  q1: blankQuestionGuide(), q2: blankQuestionGuide(), q3: blankQuestionGuide(), q4: blankQuestionGuide(),
} });

export default function KnowledgeEditor({ profile, published, catalogEntries, loading, error }: {
  profile: UserProfile;
  published: KnowledgeBank[];
  catalogEntries: KnowledgeCatalogEntry[];
  loading: boolean;
  error: string;
}) {
  const { allSkillsIncludingArchived } = useContentCatalog();
  const allBanks = useMemo(() => visibleKnowledgeCatalog(published, catalogEntries, true), [published, catalogEntries]);
  const [selectedId, setSelectedId] = useState("");
  const [bank, setBank] = useState(newBank);
  const [guide, setGuide] = useState(newGuide);
  const [loadedLatestVersion, setLoadedLatestVersion] = useState(0);
  const [loadedCatalogRevision, setLoadedCatalogRevision] = useState(0);
  const [sourceVersion, setSourceVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [guideLoading, setGuideLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const loadSequence = useRef(0);
  const metadata = catalogEntries.find((entry) => entry.bankId === selectedId);
  const savedVersions = published.filter((item) => item.id === selectedId).sort((a, b) => b.version - a.version);
  const availableSkills = useMemo(() => [...allSkillsIncludingArchived].sort((a, b) => a.title.localeCompare(b.title)), [allSkillsIncludingArchived]);

  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const confirmNavigation = (event: Event) => {
      if (!window.confirm("Discard the unpublished changes in this knowledge check?")) event.preventDefault();
    };
    window.addEventListener("beforeunload", preventLoss);
    window.addEventListener("dc-central-before-navigate", confirmNavigation);
    return () => {
      window.removeEventListener("beforeunload", preventLoss);
      window.removeEventListener("dc-central-before-navigate", confirmNavigation);
    };
  }, [dirty]);
  useEffect(() => () => { loadSequence.current += 1; }, []);

  if (!profile.active || profile.role !== "director") return null;

  function mayDiscard() {
    return !dirty || window.confirm("Discard the unpublished changes in this knowledge check?");
  }

  async function chooseBank(id: string, version?: number) {
    if (!mayDiscard()) return;
    const sequence = ++loadSequence.current;
    setMessage(""); setFailure(""); setDirty(false); setSelectedId(id);
    if (!id) {
      setBank(newBank()); setGuide(newGuide()); setLoadedLatestVersion(0);
      setLoadedCatalogRevision(0); setSourceVersion(0); setGuideLoading(false);
      return;
    }
    const latest = allBanks.find((item) => item.id === id);
    const source = version ? published.find((item) => item.id === id && item.version === version) : latest;
    if (!latest || !source) { setFailure("That saved version is no longer available. Reload the check list."); return; }
    const latestSaved = published.filter((item) => item.id === id).reduce((max, item) => Math.max(max, item.version), 0);
    const nextVersion = latestSaved + 1;
    setBank({ ...structuredClone(source), version: nextVersion });
    setGuide({ ...newGuide(), bankId: id, version: nextVersion });
    setLoadedLatestVersion(latestSaved);
    setLoadedCatalogRevision(catalogEntries.find((entry) => entry.bankId === id)?.revision ?? 0);
    setSourceVersion(source.version);
    if (!published.some((item) => bankKey(item) === bankKey(source))) {
      setGuideLoading(false);
      setMessage("This is a bundled question preview. Enter the private grading guide below to publish its first saved version.");
      return;
    }
    setGuideLoading(true);
    try {
      const saved = await fetchKnowledgeGuide(bankKey(source));
      if (loadSequence.current !== sequence) return;
      setGuide({ ...saved, version: nextVersion });
      if (version && version < latestSaved) {
        setDirty(true);
        setMessage(`Version ${version} is loaded as a starting point. Publishing creates version ${nextVersion}; no saved version is overwritten.`);
      }
    } catch (caught) {
      if (loadSequence.current === sequence) setFailure(readableFirebaseError(caught));
    } finally {
      if (loadSequence.current === sequence) setGuideLoading(false);
    }
  }

  function updateBank<K extends keyof KnowledgeBank>(key: K, value: KnowledgeBank[K]) {
    setBank((current) => ({ ...current, [key]: value })); setDirty(true); setMessage("");
  }
  function updatePrompt(id: QuestionId, key: "prompt" | "topic", value: string) {
    setBank((current) => ({ ...current, questions: current.questions.map((question) => question.id === id ? { ...question, [key]: value } : question) }));
    setDirty(true); setMessage("");
  }
  function updateGuide(id: QuestionId, key: keyof KnowledgeGuideQuestion, value: string) {
    setGuide((current) => ({ ...current, questions: { ...current.questions, [id]: { ...current.questions[id], [key]: value } } }));
    setDirty(true); setMessage("");
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (busy || guideLoading || loading || error) return;
    setBusy(true); setMessage(""); setFailure("");
    const version = loadedLatestVersion + 1;
    const normalizedBank = {
      ...bank, id: bank.id.trim(), title: bank.title.trim(), version,
      sourceUrl: bank.sourceUrl.trim(), scope: bank.scope.trim(),
      questions: bank.questions.map((question) => ({ ...question, prompt: question.prompt.trim(), topic: question.topic.trim() })),
    };
    const normalizedGuide: KnowledgeGuide = { ...guide, bankId: normalizedBank.id, version };
    try {
      await publishKnowledgeCheck(profile, normalizedBank, normalizedGuide, loadedLatestVersion, loadedCatalogRevision);
      setSelectedId(normalizedBank.id); setLoadedLatestVersion(version);
      setLoadedCatalogRevision((current) => current + 1); setSourceVersion(version);
      setBank({ ...normalizedBank, version: version + 1 }); setGuide({ ...normalizedGuide, version: version + 1 });
      setDirty(false); setMessage(`Published version ${version}. The questions and private grading guide are saved together. All earlier versions, answers, and reviews are retained.`);
    } catch (caught) { setFailure(readableFirebaseError(caught)); }
    finally { setBusy(false); }
  }

  async function archive() {
    if (busy || loading || error || !selectedId) return;
    if (dirty) { setFailure("Publish or discard the unpublished changes before archiving or restoring this check."); return; }
    setBusy(true); setMessage(""); setFailure("");
    try {
      await setKnowledgeCheckArchived(profile, selectedId, !metadata?.archived, metadata?.revision ?? 0);
      setLoadedCatalogRevision((metadata?.revision ?? 0) + 1); setDirty(false);
      setMessage(metadata?.archived ? "Check restored to the active catalog. Its history is unchanged." : "Check archived from new submissions. Past answers, versions, and reviews remain available; you can restore it here.");
    } catch (caught) { setFailure(readableFirebaseError(caught)); }
    finally { setBusy(false); }
  }

  return <section className="kc-panel kc-authoring" aria-labelledby="kc-authoring-heading">
    <span className="kc-kicker">Faculty director content tools</span>
    <h3 id="kc-authoring-heading">Manage knowledge checks</h3>
    <p>Create a check, revise its four questions and private grading guide, or archive it. Every publication is a new version; student answers and past reviews are never rewritten.</p>
    <p className="kc-note">Private answer keys are visible only to faculty directors here and to authorized mentors in review tools. Use feedback and practice tasks to guide students without giving away the answer.</p>
    {error ? <p className="kc-error" role="alert">{error}</p> : null}
    <div className="kc-editor-selection">
      <label className="kc-field"><strong>Edit a check</strong><select value={selectedId} disabled={busy || loading} onChange={(event) => void chooseBank(event.target.value)}><option value="">Create a new knowledge check</option>{allBanks.map((item) => <option value={item.id} key={item.id}>{item.title}{catalogEntries.find((entry) => entry.bankId === item.id)?.archived ? " · archived" : ""}</option>)}</select></label>
      {selectedId ? <button type="button" className="kc-secondary" disabled={busy || loading || guideLoading} onClick={() => void archive()}>{metadata?.archived ? "Restore check" : "Archive check"}</button> : null}
    </div>
    {savedVersions.length ? <details className="kc-editor-versions"><summary>Saved versions and restoration ({savedVersions.length})</summary><p>Load an earlier version to copy its questions and private guide into a new publication. Existing attempts continue to show the exact version they answered.</p><div className="kc-editor-version-list">{savedVersions.map((item) => <button key={bankKey(item)} type="button" className="kc-secondary" disabled={busy || guideLoading} onClick={() => void chooseBank(item.id, item.version)}>Load version {item.version}{sourceVersion === item.version ? " · loaded" : ""}</button>)}</div></details> : null}
    {guideLoading ? <p role="status">Loading the private grading guide…</p> : null}
    <form onSubmit={(event) => void publish(event)}>
      <fieldset disabled={busy || guideLoading || loading || !!error} className="kc-editor-fields">
        <legend>{selectedId ? `Next publication: version ${loadedLatestVersion + 1}` : "New knowledge check"}</legend>
        <label className="kc-field"><strong>Check ID</strong><input value={bank.id} required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" readOnly={!!selectedId} placeholder="kc-your-topic" onChange={(event) => updateBank("id", event.target.value.toLowerCase())} /><span>Lowercase letters and numbers, with single hyphens between words. This permanent ID protects saved history.</span></label>
        <label className="kc-field"><strong>Title</strong><input value={bank.title} required maxLength={160} onChange={(event) => updateBank("title", event.target.value)} /></label>
        <label className="kc-field"><strong>Lesson source URL</strong><input type="url" value={bank.sourceUrl} required maxLength={1000} placeholder="https://…" onChange={(event) => updateBank("sourceUrl", event.target.value)} /></label>
        <label className="kc-field"><strong>What this check covers</strong><textarea value={bank.scope} required maxLength={1600} rows={3} onChange={(event) => updateBank("scope", event.target.value)} /></label>
        <fieldset className="kc-editor-tutorials"><legend>Linked tutorials · choose 1–10</legend><div>{availableSkills.map((skill) => <label key={skill.id}><input type="checkbox" checked={bank.skillIds.includes(skill.id)} disabled={!bank.skillIds.includes(skill.id) && bank.skillIds.length >= 10} onChange={(event) => updateBank("skillIds", event.target.checked ? [...bank.skillIds, skill.id] : bank.skillIds.filter((id) => id !== skill.id))} /><span>{skill.title}</span></label>)}</div><p>{bank.skillIds.length} of 10 selected</p>{bank.skillIds.filter((id) => !availableSkills.some((skill) => skill.id === id)).map((id) => <p key={id}>Linked historical tutorial: {id} <button type="button" className="kc-text-button" onClick={() => updateBank("skillIds", bank.skillIds.filter((skillId) => skillId !== id))}>Remove this link</button></p>)}</fieldset>
        {questionIds.map((id, index) => <fieldset className="kc-review-question" key={id}><legend>Question {index + 1}</legend>
          <label className="kc-field"><strong>Topic</strong><input required maxLength={100} value={bank.questions[index].topic} onChange={(event) => updatePrompt(id, "topic", event.target.value)} /></label>
          <label className="kc-field"><strong>Question shown to students</strong><textarea required maxLength={1000} rows={3} value={bank.questions[index].prompt} onChange={(event) => updatePrompt(id, "prompt", event.target.value)} /></label>
          <div className="kc-private-key"><h4>Private mentor grading guide</h4>
            <label className="kc-field"><strong>Expected answer</strong><textarea required maxLength={3000} rows={4} value={guide.questions[id].expectedAnswer} onChange={(event) => updateGuide(id, "expectedAnswer", event.target.value)} /></label>
            <label className="kc-field"><strong>Why the answer is correct</strong><textarea required maxLength={2000} rows={3} value={guide.questions[id].explanation} onChange={(event) => updateGuide(id, "explanation", event.target.value)} /></label>
            <label className="kc-field"><strong>Suggested feedback without revealing the answer</strong><textarea required maxLength={1000} rows={3} value={guide.questions[id].studentFeedback} onChange={(event) => updateGuide(id, "studentFeedback", event.target.value)} /></label>
            <label className="kc-field"><strong>Suggested practice task</strong><textarea required maxLength={1500} rows={3} value={guide.questions[id].practiceTask} onChange={(event) => updateGuide(id, "practiceTask", event.target.value)} /></label>
          </div>
        </fieldset>)}
        <div className="kc-editor-actions"><button type="submit" className="kc-primary" disabled={!dirty || bank.skillIds.length === 0 || loadedLatestVersion >= 1000}>{busy ? "Publishing…" : `Publish version ${loadedLatestVersion + 1}`}</button><button type="button" className="kc-secondary" onClick={() => void chooseBank(selectedId)}>Discard unpublished changes</button>{dirty ? <span>Unpublished changes</span> : null}</div>
      </fieldset>
    </form>
    {failure ? <p className="kc-error" role="alert">{failure}</p> : null}
    {message ? <p className="kc-message" role="status">{message}</p> : null}
  </section>;
}
