import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTemplateExportPayload,
  buildUniqueCopyName,
  normalizeImportedSession,
  validateTemplateFile
} from '../sessionTransfer.js';

test('validateTemplateFile rejects non object payload', () => {
  assert.equal(validateTemplateFile(null).valid, false);
});

test('validateTemplateFile rejects non template payloads', () => {
  assert.equal(validateTemplateFile({ type: 'report', situations: [] }).valid, false);
});

test('validateTemplateFile accepts valid template payload', () => {
  const result = validateTemplateFile({
    type: 'template',
    name: 'Staff',
    situations: [{ id: 1, name: 'A', color: '#000', state: 'ACTIVE' }]
  });
  assert.deepEqual(result, { valid: true, message: '' });
});

test('buildUniqueCopyName returns base name when free', () => {
  assert.equal(buildUniqueCopyName('Staff', ['Autre']), 'Staff');
});

test('buildUniqueCopyName creates copy 1 when base exists', () => {
  assert.equal(buildUniqueCopyName('Staff', ['Staff']), 'Staff (copie 1)');
});

test('buildUniqueCopyName increments copy index', () => {
  assert.equal(
    buildUniqueCopyName('Staff', ['Staff', 'Staff (copie 1)', 'Staff (copie 2)']),
    'Staff (copie 3)'
  );
});

test('buildUniqueCopyName normalizes imported copy name', () => {
  assert.equal(buildUniqueCopyName('Staff (copie 1)', ['Staff', 'Staff (copie 1)']), 'Staff (copie 2)');
});

test('normalizeImportedSession generates local id and normalizes situations', () => {
  const normalized = normalizeImportedSession({
    name: ' Template A ',
    type: 'template',
    situations: [{ name: ' ', color: '', state: 'invalid' }]
  });

  assert.equal(normalized.id.startsWith('session-'), true);
  assert.equal(normalized.name, 'Template A');
  assert.equal(normalized.situations[0].name, 'Situation 1');
  assert.equal(normalized.situations[0].state, 'ACTIVE');
  assert.equal(normalized.initialCount, 1);
});



test('normalizeImportedSession ensures unique positive situation ids', () => {
  const normalized = normalizeImportedSession({
    name: 'Template IDs',
    type: 'template',
    situations: [
      { id: 2, name: 'A', color: '#111', state: 'ACTIVE' },
      { id: 2, name: 'B', color: '#222', state: 'ACTIVE' },
      { id: -1, name: 'C', color: '#333', state: 'ACTIVE' }
    ]
  });

  assert.deepEqual(
    normalized.situations.map((situation) => situation.id),
    [2, 3, 4]
  );
});

test('normalizeImportedSession trims situation color values', () => {
  const normalized = normalizeImportedSession({
    name: 'Template Couleurs',
    type: 'template',
    situations: [{ id: 1, name: 'A', color: '  #abcdef  ', state: 'ACTIVE' }]
  });

  assert.equal(normalized.situations[0].color, '#abcdef');
});

test('buildTemplateExportPayload builds template payload', () => {
  const session = {
    id: 'session-1',
    name: 'Réunion staff',
    initialCount: 3,
    situations: [{ id: 1, name: 'A', color: '#000', state: 'ACTIVE' }],
    createdAt: 1,
    updatedAt: 2
  };

  const payload = buildTemplateExportPayload(session);
  assert.equal(payload.type, 'template');
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.name, 'Réunion staff');
});
