import assert from "node:assert/strict";
import { CARRIERS, CYCLE, CYCLES, availableCycles, isSunday, selectCycleForDate, dateSchema, operationSchema, operationDate, operationClosesAt, operationWindow, submissionSchema, makeCsv } from "../lib/model.ts";
assert.equal(CARRIERS.length, 14);
assert.equal(new Set(CARRIERS.map(c => c.slug)).size, 14);
const valid = { carrier: "ado", date: "2026-10-26", cycle: CYCLE, utilitarios: 3, vans: 2, vucs: 1, outros: 0, contact: "Operação ADO", notes: "", revision: null, noVehicles: false };
assert.equal(submissionSchema.safeParse(valid).success, true);
for (const patch of [{ utilitarios: -1 }, { vans: 1.5 }, { vucs: 10000 }, { outros: "2" }, { carrier: "invalid/slug" }, { contact: " " }, { date: "2026-02-30" }, { cycle: "INVALID" }, { revision: 0 }, { noVehicles: true }]) assert.equal(submissionSchema.safeParse({ ...valid, ...patch }).success, false);
const zero = { ...valid, utilitarios: 0, vans: 0, vucs: 0 };
assert.equal(submissionSchema.safeParse(zero).success, false);
assert.equal(submissionSchema.safeParse({ ...zero, noVehicles: true }).success, true);
assert.equal(dateSchema.safeParse("2028-02-29").success, true);
assert.equal(dateSchema.safeParse("2026-02-29").success, false);
assert.deepEqual(CYCLES, ["CPM(CHP)", "AM", "PM", "SD", "SDE"]);
const sundayCycles = ["AM", "SD", "SDE"];
// Known Sunday anchor; include year boundaries and leap-year dates.
for (let week = 0; week < 110; week++) {
  const sunday = new Date(Date.UTC(2026, 9, 25) + week * 7 * 86400000).toISOString().slice(0, 10);
  assert.equal(isSunday(sunday), true);
  assert.deepEqual(availableCycles(sunday), sundayCycles);
  for (const cycle of CYCLES) {
    assert.equal(submissionSchema.safeParse({ ...valid, date: sunday, cycle }).success, sundayCycles.includes(cycle));
    assert.equal(operationSchema.safeParse({ date: sunday, cycle }).success, sundayCycles.includes(cycle));
  }
}
for (const date of ["2026-10-24", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2028-02-29"]) {
  assert.deepEqual(availableCycles(date), CYCLES);
  for (const cycle of CYCLES) assert.equal(submissionSchema.safeParse({ ...valid, date, cycle }).success, true);
}
assert.equal(selectCycleForDate("2026-10-25", "CPM(CHP)"), "AM");
assert.equal(selectCycleForDate("2026-10-25", "PM"), "AM");
assert.equal(selectCycleForDate("2026-10-25", "SDE"), "SDE");
assert.equal(selectCycleForDate("2026-10-26", "PM"), "PM");
assert.equal(selectCycleForDate("2026-10-26", null), CYCLE);
const csv = makeCsv([{ ...valid, contact: "=HYPERLINK(\"bad\")", id: "test", revision: 1, createdAt: "2026-10-24T16:00:00Z", updatedAt: "2026-10-24T16:00:00Z" }], valid.date);
assert.ok(csv.includes("'=HYPERLINK"));
assert.equal(csv.split("\r\n").length, 15);
const record = { ...valid, id: "test", revision: 1, createdAt: "2026-10-24T16:00:00Z", updatedAt: "2026-10-24T16:00:00Z" };
const amCsv = makeCsv([record, { ...record, cycle: "AM", utilitarios: 47 }], valid.date, "AM");
assert.ok(amCsv.includes('"AM";"ADO";"Confirmada";"47"'));
assert.ok(!amCsv.includes('"CPM(CHP)"'));
const pendingCsv = makeCsv([record], valid.date, "PM");
assert.ok(pendingCsv.includes('"PM";"ADO";"Pendente"'));
assert.equal(operationDate(new Date("2026-10-27T02:59:59.999Z")), "2026-10-26");
assert.equal(operationDate(new Date("2026-10-27T03:00:00.000Z")), "2026-10-27");
assert.equal(operationClosesAt("2026-10-26"), "2026-10-27T03:00:00.000Z");
assert.equal(operationWindow("2026-10-26", new Date("2026-10-27T02:59:59.999Z")).editable, true);
assert.equal(operationWindow("2026-10-26", new Date("2026-10-27T03:00:00.000Z")).editable, false);
assert.equal(operationWindow("2026-10-26", new Date("2026-10-27T03:00:00.001Z")).editable, false);
assert.equal(operationWindow("2026-10-27", new Date("2026-10-27T03:00:00.000Z")).editable, true);
assert.equal(operationWindow("2026-10-28", new Date("2026-10-27T03:00:00.000Z")).editable, true);
assert.equal(operationClosesAt("2026-12-31"), "2027-01-01T03:00:00.000Z");
assert.equal(operationWindow("2026-12-31", new Date("2027-01-01T02:59:59.999Z")).editable, true);
assert.equal(operationWindow("2026-12-31", new Date("2027-01-01T03:00:00.000Z")).editable, false);
assert.equal(operationClosesAt("2028-02-29"), "2028-03-01T03:00:00.000Z");
const registeredCarrier = { slug: "nova-transportadora", name: "Nova Transportadora", initials: "NT" };
const registeredCsv = makeCsv([{ ...record, carrier: registeredCarrier.slug }], valid.date, CYCLE, [...CARRIERS, registeredCarrier]);
assert.ok(registeredCsv.includes('"Nova Transportadora";"Confirmada"'));
assert.equal(registeredCsv.split("\r\n").length,16);
console.log("PASS: calendário, ciclos e CSV; prazo às 23:59:59.999 e bloqueio exato à meia-noite de Brasília; virada de ano e ano bissexto.");
