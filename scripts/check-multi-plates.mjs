import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function checkMultiPlates({ schedule, fixedPayload, db, calendarAction, request, owner, token, calendarFixture }) {
  const plates = Array.from({ length: 15 }, (_, index) => "TST" + String(index + 1).padStart(4, "0"));
  const template = calendarFixture.ff.split("\r\n")[1];
  calendarFixture.ff += "\r\n" + plates.map(plate => template.replace("ABC1234", plate)).join("\r\n");
  assert.equal((await calendarAction({ action: "refresh_source" })).status, 200);
  const payload = { ...fixedPayload, id: randomUUID(), licensePlate: "", licensePlates: ["abc-1234", "tst-0001"], quantity: 2 };
  for (const patch of [
    { licensePlates: [] }, { licensePlates: ["ABC1234"] }, { licensePlates: ["ABC1234", "TST0001", "TST0002"] },
    { licensePlates: ["ABC1234", ""] }, { licensePlates: ["ABC1234", "INVALID"] }, { licensePlates: ["ABC1234", "abc-1234"] },
    { licensePlate: "TST0002" },
  ]) assert.equal((await schedule({ ...payload, ...patch }, "alc")).status, 422);
  assert.equal(await db.prepare("SELECT id FROM scheduling_requests WHERE id=?").bind(payload.id).first(), null);
  const created = await schedule(payload, "alc"); assert.equal(created.status, 201);
  const two = (await created.json()).request;
  assert.equal(two.quantity, 2); assert.deepEqual(two.licensePlates, ["ABC1234", "TST0001"]); assert.equal(two.licensePlate, "ABC1234");
  assert.equal(two.calendarStatus, "matched"); assert.equal(two.calendarPlanned, 2); assert.equal(two.calendarRequested, 2); assert.equal(two.calendarVehicles.length, 2); assert.ok(two.calendarVehicles.every(check => check.calendarStatus === "matched" && check.calendarRequested === 1));
  const replay = await schedule({ ...payload, licensePlates: ["ABC1234", "TST0001"] }, "alc"); assert.equal(replay.status, 200); assert.equal((await replay.json()).replay, true);
  assert.equal((await schedule({ ...payload, licensePlates: ["ABC1234", "TST0002"] }, "alc")).status, 409);
  const manyPayload = { ...payload, id: randomUUID(), licensePlates: plates, quantity: 15 };
  const concurrent = await Promise.all([schedule(manyPayload, "alc"), schedule(manyPayload, "alc")]); assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 201]);
  const batch = (await concurrent.find(response => response.status === 201).json()).request;
  assert.equal(batch.status, "pending"); assert.equal(batch.quantity, 15); assert.deepEqual(batch.licensePlates, plates); assert.equal(batch.calendarVehicles.length, 15); assert.equal(batch.calendarStatus, "matched"); assert.equal(batch.calendarPlanned, 15);
  assert.ok(batch.calendarVehicles.every((check, index) => check.licensePlate === plates[index] && check.calendarStatus === "matched"));
  const stored = await db.prepare("SELECT license_plates,calendar_vehicles FROM scheduling_requests WHERE id=?").bind(batch.id).first(); assert.deepEqual(JSON.parse(stored.license_plates), plates); assert.equal(JSON.parse(stored.calendar_vehicles).vehicles.length, 15);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM scheduling_requests WHERE id=?").bind(batch.id).first()).n, 1);
  const path = `transportadora=alc&data=${fixedPayload.date}&ciclo=AM`;
  const carrierRows = (await (await request("/api/scheduling?" + path, { headers: { Authorization: "Bearer " + token("alc") } })).json()).requests;
  assert.deepEqual(carrierRows.find(row => row.id === batch.id).licensePlates, plates);
  const adminRows = (await (await request(`/api/gestao/scheduling?data=${fixedPayload.date}&ciclo=AM`, { headers: owner })).json()).requests;
  assert.deepEqual(adminRows.find(row => row.id === batch.id).calendarVehicles, batch.calendarVehicles);
  const mixedResponse = await schedule({ ...payload, id: randomUUID(), licensePlates: ["ABC1234", "DEF1A23"] }, "alc"); assert.equal(mixedResponse.status, 201); const mixed = (await mixedResponse.json()).request;
  assert.equal(mixed.calendarStatus, "carrier_mismatch"); assert.deepEqual(mixed.calendarVehicles.map(check => check.calendarStatus), ["matched", "carrier_mismatch"]);
  const checked = await calendarAction({ action: "check_order", id: batch.id }); assert.equal(checked.status, 200); const rechecked = (await checked.json()).request; assert.deepEqual(rechecked.licensePlates, plates); assert.equal(rechecked.calendarVehicles.length, 15); assert.equal(rechecked.calendarRevision, 2); assert.equal(rechecked.status, "pending");
  // Existing clients and historical rows continue to expose the original plate.
  const legacy = await schedule({ ...fixedPayload, id: randomUUID() }, "alc"); assert.equal(legacy.status, 201); const legacyOrder = (await legacy.json()).request;
  await db.prepare("UPDATE scheduling_requests SET license_plates='[]',calendar_vehicles='[]' WHERE id=?").bind(legacyOrder.id).run();
  const oldRows = (await (await request("/api/scheduling?" + path, { headers: { Authorization: "Bearer " + token("alc") } })).json()).requests; assert.deepEqual(oldRows.find(row => row.id === legacyOrder.id).licensePlates, ["ABC1234"]);
  const tooLarge = await request("/api/scheduling", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://dispo.test", Authorization: "Bearer " + token("alc") }, body: "x".repeat(200001) }); assert.equal(tooLarge.status, 413);
  assert.equal((await request("/qa-plates-sizes")).status, 404);
  console.log("PASS: lotes FF de 2 e 15 veículos; uma placa por veículo; normalização, placas únicas e quantidade exata; gravação atômica e reenvios; consulta individual SMG1; leituras nos dois painéis; reconsulta e histórico compatíveis.");
}
