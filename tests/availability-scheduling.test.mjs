import test from "node:test";
import assert from "node:assert/strict";
import {
  copyPollData,
  createSlots,
  groupGrid,
  makePoll,
  makeResponse,
  mergeResponses,
  rankTimes,
  slotTime,
} from "../app/availability-scheduling.ts";

const input = {
  title: "Team meeting",
  organizerName: "Eric",
  description: "",
  dates: ["2026-10-01"],
  startMinute: 540,
  endMinute: 660,
  duration: 60,
  timezone: "America/Chicago",
};

test("DC Meet keeps the same instant across time zones", () => {
  const slots = createSlots(input.dates, 540, 660, input.timezone);
  assert.equal(slots.length, 4);
  assert.equal(slotTime(slots[0], "America/Chicago").hour, 9);
  assert.equal(slotTime(slots[0], "America/New_York").hour, 10);
  assert.equal(slotTime(slots[0], "Asia/Tokyo").hour, 23);
});

test("rankings require continuous availability for the full meeting", () => {
  const poll = makePoll(input, "owner");
  const [a, b, c, d] = poll.slotIds;
  const responses = [
    { name: "A", available: [a, c], ifNeeded: [] },
    { name: "B", available: [b, c, d], ifNeeded: [] },
  ];
  const ranked = rankTimes(poll, responses);
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].start, b);
  assert.equal(ranked[0].total, 1);
  assert.equal(ranked.find((result) => result.start === a).total, 0);
});

test("if-needed counts only when the entire duration is covered", () => {
  const poll = makePoll(input, "owner");
  const [a, b, c] = poll.slotIds;
  const ranked = rankTimes(poll, [
    { name: "A", available: [a], ifNeeded: [b] },
    { name: "B", available: [a, b], ifNeeded: [] },
  ]);
  assert.equal(ranked[0].start, a);
  assert.equal(ranked[0].available, 1);
  assert.equal(ranked[0].needed, 1);
  assert.equal(ranked[0].total, 2);
  assert.equal(ranked.find((result) => result.start === b).total, 0);
  assert.ok(c);
});

test("DC Meet handles daylight-saving boundaries deliberately", () => {
  const spring = createSlots(["2026-03-08"], 60, 240, "America/Chicago");
  assert.equal(spring.length, 4);
  assert.ok(spring.every((id) => slotTime(id, "America/Chicago").hour !== 2));
  assert.throws(
    () => createSlots(["2026-03-08"], 120, 240, "America/Chicago"),
    /does not exist/,
  );

  const fall = createSlots(["2026-11-01"], 0, 240, "America/Chicago");
  const grid = groupGrid(fall, "America/Chicago");
  assert.equal(fall.length, 10);
  assert.equal(grid.rows.length, 10);
  assert.equal(grid.days[0].cells.size, 10);
  assert.equal(grid.showOffset, true);
});

test("responses validate names, slots, and empty availability", () => {
  const poll = makePoll(input, "owner");
  assert.deepEqual(makeResponse("  Eric  ", {}, poll), {
    name: "Eric",
    available: [],
    ifNeeded: [],
  });
  assert.throws(() => makeResponse("   ", {}, poll));
  assert.throws(() => makeResponse("Eric", { "not-a-slot": "available" }, poll));
  assert.throws(
    () => makeResponse("Eric", { [poll.slotIds[0]]: "bad" }, poll),
  );
});

test("copying preserves wall times and makes imported responses replaceable", () => {
  const original = makePoll(
    {
      ...input,
      title: "Original",
      description: "Context",
      dates: ["2026-10-30", "2026-10-31"],
    },
    "owner",
  );
  const response = {
    uid: "alice",
    name: "Alice",
    available: [original.slotIds[0]],
    ifNeeded: [original.slotIds[1]],
  };
  const copy = copyPollData(
    { ...original, status: "closed", selectedStart: original.slotIds[0] },
    [response],
    "New title",
    ["2026-11-06", "2026-11-07"],
    "owner",
  );

  assert.equal(copy.poll.title, "New title");
  assert.equal(copy.poll.status, "open");
  assert.equal(copy.poll.selectedStart, "");
  assert.equal(copy.responses[0].ifNeeded[0], copy.poll.slotIds[1]);
  assert.equal(copy.responses[0].copied, true);
  assert.deepEqual(
    mergeResponses(copy.responses, [
      { ...copy.responses[0], available: [], copied: false },
    ])[0].available,
    [],
  );
});

