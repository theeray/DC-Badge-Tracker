import { collection, doc, onSnapshot, runTransaction, serverTimestamp, type Unsubscribe } from "firebase/firestore";
import { auth, db, readableFirebaseError, type UserProfile } from "./firebase";
import {
  canonicalizeManagedContentData, isContentKind, managedContentDocumentId,
  type ContentKind, type ManagedContentEntry,
} from "./content-catalog";

export type ManagedContentDraft = { kind: ContentKind; key: string; data: unknown; archived: boolean };

function activeVerifiedMember(profile: UserProfile) {
  return profile.active && auth.currentUser?.uid === profile.uid && auth.currentUser.emailVerified;
}

function requireDirector(profile: UserProfile) {
  if (!activeVerifiedMember(profile) || profile.role !== "director") throw new Error("Only an active, verified faculty director can manage site content.");
}

function date(value: unknown): Date | null {
  if (value === null) return null; // A local pending server timestamp.
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const result = value.toDate();
    if (result instanceof Date && Number.isFinite(result.getTime())) return result;
  }
  throw new Error("A content revision has invalid timestamp metadata.");
}

function entryFromDocument(value: unknown, documentId: string): ManagedContentEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A managed content record is invalid.");
  const record = value as Record<string, unknown>;
  const expectedKeys = ["kind", "key", "data", "archived", "revision", "createdBy", "createdAt", "updatedBy", "updatedAt"];
  if (Object.keys(record).length !== expectedKeys.length || Object.keys(record).some((key) => !expectedKeys.includes(key))
    || !isContentKind(record.kind) || typeof record.key !== "string"
    || managedContentDocumentId(record.kind, record.key) !== documentId
    || typeof record.archived !== "boolean" || !Number.isInteger(record.revision) || Number(record.revision) < 1 || Number(record.revision) > 100000
    || typeof record.createdBy !== "string" || !record.createdBy || record.createdBy.length > 128
    || typeof record.updatedBy !== "string" || !record.updatedBy || record.updatedBy.length > 128) {
    throw new Error("A managed content record has invalid identity or revision metadata.");
  }
  const data = canonicalizeManagedContentData(record.kind, record.key, record.data);
  if (!record.data || typeof record.data !== "object" || Array.isArray(record.data)
    || Object.keys(record.data).length !== Object.keys(data).length
    || Object.keys(data).some((key) => !Object.hasOwn(record.data as object, key))) {
    throw new Error("A stored content record is missing required data fields.");
  }
  return {
    kind: record.kind, key: record.key, data,
    archived: record.archived, revision: record.revision as number, createdBy: record.createdBy,
    createdAt: date(record.createdAt), updatedBy: record.updatedBy, updatedAt: date(record.updatedAt),
  } as ManagedContentEntry;
}

export function readableContentError(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "permission-denied") {
    return "This content could not be accessed. Confirm your director access and that the latest Firestore rules are deployed.";
  }
  return readableFirebaseError(error);
}

export function watchManagedContent(profile: UserProfile, onChange: (entries: ManagedContentEntry[]) => void, onError: (message: string) => void): Unsubscribe {
  if (!activeVerifiedMember(profile)) {
    onChange([]);
    return () => undefined;
  }
  return onSnapshot(collection(db, "managedContent"), (snapshot) => {
    try { onChange(snapshot.docs.map((item) => entryFromDocument(item.data(), item.id))); }
    catch (error) { onError(readableContentError(error)); }
  }, (error) => onError(readableContentError(error)));
}

export function watchManagedContentHistory(profile: UserProfile, kind: ContentKind, key: string, onChange: (entries: ManagedContentEntry[]) => void, onError: (message: string) => void): Unsubscribe {
  try { requireDirector(profile); }
  catch (error) { onError(readableContentError(error)); return () => undefined; }
  const documentId = managedContentDocumentId(kind, key);
  return onSnapshot(collection(db, "managedContent", documentId, "revisions"), (snapshot) => {
    try {
      const revisions = snapshot.docs.map((item) => {
        const entry = entryFromDocument(item.data(), documentId);
        if (String(entry.revision) !== item.id) throw new Error("A content history revision has an invalid ID.");
        return entry;
      });
      onChange(revisions.sort((a, b) => b.revision - a.revision));
    } catch (error) { onError(readableContentError(error)); }
  }, (error) => onError(readableContentError(error)));
}

export async function saveManagedContent(profile: UserProfile, draft: ManagedContentDraft, expectedRevision = 0): Promise<number> {
  requireDirector(profile);
  const documentId = managedContentDocumentId(draft.kind, draft.key);
  const data = canonicalizeManagedContentData(draft.kind, draft.key, draft.data);
  if (typeof draft.archived !== "boolean") throw new Error("Choose whether the content is active or archived.");
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || expectedRevision > 100000) throw new Error("The expected content revision is invalid. Reopen the editor.");
  const reference = doc(db, "managedContent", documentId);
  return runTransaction(db, async (transaction) => {
    const current = await transaction.get(reference);
    const previous = current.exists() ? entryFromDocument(current.data(), documentId) : null;
    if ((previous?.revision ?? 0) !== expectedRevision) throw new Error("Another director changed this content. Your changes were not saved. Reopen the latest version and try again.");
    const revision = expectedRevision + 1;
    if (revision > 100000) throw new Error("This content has reached its revision limit. Contact the site administrator.");
    const timestamp = serverTimestamp();
    const saved = {
      kind: draft.kind, key: draft.key, data, archived: draft.archived, revision,
      createdBy: previous?.createdBy ?? profile.uid,
      createdAt: current.exists() ? current.data().createdAt : timestamp,
      updatedBy: profile.uid, updatedAt: timestamp,
    };
    // The immutable history snapshot is exactly the new current record. Both
    // are committed atomically; restoring a revision is another ordinary save.
    transaction.set(doc(db, "managedContent", documentId, "revisions", String(revision)), saved);
    transaction.set(reference, saved);
    return revision;
  });
}
