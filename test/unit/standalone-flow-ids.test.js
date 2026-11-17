'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { FlowCardManagerService } = require('../../.homeybuild/lib/aurora3/services/flow-card-manager-service');
const { SnapshotTriggerService } = require('../../.homeybuild/lib/aurora3/services/snapshot-trigger-service');

const APP_DIR = path.join(__dirname, '../..');
const triggers = new Set(fs.readdirSync(path.join(APP_DIR, '.homeycompose/flow/triggers'))
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(fs.readFileSync(path.join(APP_DIR, '.homeycompose/flow/triggers', file), 'utf8')).id));

test('standalone threshold registrations refer to defined trigger cards', async () => {
  const registered = [];
  const service = new FlowCardManagerService({
    device: {
      homey: {
        flow: {
          getDeviceTriggerCard(id) {
            registered.push(id);
            return { registerRunListener: () => ({}) };
          },
        },
      },
    },
  });
  await service.registerModbusTriggerRunListeners();
  assert.ok(registered.length > 10);
  for (const cardId of registered) assert.ok(triggers.has(cardId), cardId);
});

test('standalone snapshot changes emit the existing unsuffixed Flow IDs', () => {
  const service = new SnapshotTriggerService();
  const fired = [];
  const snapshot = (value) => ({
    control: { mode: 2 },
    status: { activeFaults: [] },
    sensors: {
      ambientT4: { value },
      retourTE1: { value },
      aanvoerTA: { value },
      outerCoilT3: { value },
      dhwTankTemp: { value },
      suctionTH: { value },
      dischargeTP: { value },
      eevStep: { value },
      eviStep: { value },
    },
  });
  service.detect(snapshot(10), (id) => fired.push(id));
  service.detect(snapshot(40), (id) => fired.push(id));
  assert.ok(fired.includes('ambient_temperature_changed'));
  assert.ok(fired.includes('inlet_temperature_changed'));
  assert.ok(fired.includes('outlet_temperature_changed'));
  for (const id of fired) assert.ok(triggers.has(id), id);
});
