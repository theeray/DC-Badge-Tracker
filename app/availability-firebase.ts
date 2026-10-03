// @ts-nocheck

import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  copyPollData,
  isZone,
  makePoll,
  makeResponse,
  meetingSlots,
  mergeResponses,
} from "./availability-scheduling";
import { db } from "./firebase";

export function friendlyError(error) {
  const code = error?.code;
  if (code === "permission-denied") {
    return "This change could not be saved. The poll may have closed, or you may not have permission to change it.";
  }
  if (code === "unavailable" || code === "auth/network-request-failed") {
    return "We could not connect. Check your connection and try again.";
  }
  if (
    code === "resource-exhausted" ||
    code === "auth/too-many-requests" ||
    code === "auth/quota-exceeded"
  ) {
    return "The service has reached its free usage limit. Please try again later.";
  }
  return error?.message || "Something went wrong. Please try again.";
}

export async function createPoll(input, session) {
  const poll = makePoll(
    { ...input, organizerName: session.profile.displayName },
    session.profile.uid,
  );
  const reference = doc(collection(db, "availabilityPolls"));
  await setDoc(reference, { ...poll, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return reference.id;
}

export function watchPoll(id, onPoll, onResponses, onError) {
  let current = [];
  let copied = [];
  let currentReady = false;
  let copiedReady = false;
  let copyRequired;
  let stopCopied;
  const emit = () => {
    if (currentReady && copyRequired !== undefined && (!copyRequired || copiedReady)) {
      onResponses(mergeResponses(copied, current));
    }
  };
  const stopPoll = onSnapshot(
    doc(db, "availabilityPolls", id),
    (snapshot) => {
      if (!snapshot.exists()) {
        onPoll(null);
        return;
      }
      const poll = snapshot.data();
      if (
        typeof poll.title !== "string" ||
        typeof poll.organizerName !== "string" ||
        typeof poll.description !== "string" ||
        !isZone(poll.timezone) ||
        ![30, 60, 90, 120].includes(poll.duration) ||
        !Array.isArray(poll.slotIds) ||
        poll.slotIds.length < 1 ||
        poll.slotIds.length > 672 ||
        !poll.slotIds.every((slotId) => typeof slotId === "string" && /^[0-9]{13}$/.test(slotId)) ||
        !["open", "closed"].includes(poll.status) ||
        (poll.status === "closed" && !poll.slotIds.includes(poll.selectedStart))
      ) {
        onError(new Error("This poll contains invalid data and cannot be displayed."));
        return;
      }
      copyRequired = poll.schemaVersion === 2;
      onPoll({ id: snapshot.id, ...poll });
      emit();
      if (copyRequired && !stopCopied) {
        stopCopied = onSnapshot(
          collection(db, "availabilityPolls", id, "copiedResponses"),
          (responseSnapshot) => {
            copied = responseSnapshot.docs.map((item) => ({ uid: item.id, ...item.data(), copied: true }));
            copiedReady = true;
            emit();
          },
          onError,
        );
      }
    },
    onError,
  );
  const stopResponses = onSnapshot(
    collection(db, "availabilityPolls", id, "responses"),
    (snapshot) => {
      current = snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }));
      currentReady = true;
      emit();
    },
    onError,
  );
  return () => {
    stopPoll();
    stopResponses();
    stopCopied?.();
  };
}

export async function saveResponse(poll, session, values) {
  await setDoc(
    doc(db, "availabilityPolls", poll.id, "responses", session.profile.uid),
    {
      ...makeResponse(session.profile.displayName, values, poll),
      updatedAt: serverTimestamp(),
    },
  );
}

export async function chooseTime(poll, start) {
  if (!meetingSlots(poll, start).length) {
    throw new Error("Choose a time that fits the full meeting length.");
  }
  await updateDoc(doc(db, "availabilityPolls", poll.id), {
    status: "closed",
    selectedStart: start,
    updatedAt: serverTimestamp(),
  });
}

export async function reopenPoll(poll) {
  await updateDoc(doc(db, "availabilityPolls", poll.id), {
    status: "open",
    selectedStart: "",
    updatedAt: serverTimestamp(),
  });
}

export async function renamePoll(poll, title) {
  title = title.trim();
  if (!title || title.length > 100) {
    throw new Error("Enter a title up to 100 characters.");
  }
  await updateDoc(doc(db, "availabilityPolls", poll.id), {
    title,
    updatedAt: serverTimestamp(),
  });
}

export async function duplicatePoll(source, responses, title, dates, session) {
  if (session.profile.uid !== source.ownerUid) {
    throw new Error("Only the organizer can copy this poll.");
  }
  if (responses.length > 400) {
    throw new Error("Copying supports up to 400 participants.");
  }
  const copy = copyPollData(source, responses, title, dates, session.profile.uid);
  const reference = doc(collection(db, "availabilityPolls"));
  const batch = writeBatch(db);
  batch.set(reference, {
    ...copy.poll,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  for (const { uid, copied: _copied, ...response } of copy.responses) {
    batch.set(doc(reference, "copiedResponses", uid), {
      ...response,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return reference.id;
}
