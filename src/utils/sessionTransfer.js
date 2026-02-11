export const TEMPLATE_SCHEMA_VERSION = 1;

const DEFAULT_TEMPLATE_NAME = 'Template importé';

const normalizeSituation = (situation, index, usedIds) => {
  const fallbackId = index + 1;
  const parsedId = Number.parseInt(situation?.id, 10);
  const isValidParsedId = Number.isFinite(parsedId) && parsedId > 0;

  let id = isValidParsedId ? parsedId : fallbackId;
  while (usedIds.has(id)) {
    id += 1;
  }
  usedIds.add(id);

  const name =
    typeof situation?.name === 'string' && situation.name.trim()
      ? situation.name.trim()
      : `Situation ${fallbackId}`;
  const color =
    typeof situation?.color === 'string' && situation.color.trim() ? situation.color.trim() : '#6366f1';
  const state = situation?.state === 'PAUSE' ? 'PAUSE' : 'ACTIVE';

  return {
    id,
    name,
    color,
    state
  };
};

export const validateTemplateFile = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, message: 'Le fichier importé doit être un objet JSON.' };
  }

  if (payload.type !== 'template') {
    return {
      valid: false,
      message: 'Type de fichier invalide. Seuls les templates sont autorisés ici.'
    };
  }

  if (!Array.isArray(payload.situations) || payload.situations.length === 0) {
    return {
      valid: false,
      message: 'Le template doit contenir au moins une situation.'
    };
  }

  const hasInvalidSituation = payload.situations.some(
    (situation) => !situation || typeof situation !== 'object' || Array.isArray(situation)
  );

  if (hasInvalidSituation) {
    return {
      valid: false,
      message: 'Le template contient une situation invalide.'
    };
  }

  return { valid: true, message: '' };
};

export const buildUniqueCopyName = (baseName, existingNames) => {
  const normalizedExisting = new Set(
    (Array.isArray(existingNames) ? existingNames : [])
      .map((name) => (typeof name === 'string' ? name.trim() : ''))
      .filter(Boolean)
      .map((name) => name.toLocaleLowerCase('fr-FR'))
  );

  const raw = typeof baseName === 'string' ? baseName.trim() : '';
  const candidateBase = raw || DEFAULT_TEMPLATE_NAME;
  const baseWithoutCopy = candidateBase.replace(/\s*\(copie\s+\d+\)$/i, '').trim() || DEFAULT_TEMPLATE_NAME;

  const normalizedBase = baseWithoutCopy.toLocaleLowerCase('fr-FR');
  if (!normalizedExisting.has(normalizedBase)) {
    return baseWithoutCopy;
  }

  let copyIndex = 1;
  while (normalizedExisting.has(`${normalizedBase} (copie ${copyIndex})`)) {
    copyIndex += 1;
  }

  return `${baseWithoutCopy} (copie ${copyIndex})`;
};

export const normalizeImportedSession = (payload) => {
  const now = Date.now();
  const usedIds = new Set();
  const situations = payload.situations.map((situation, index) => normalizeSituation(situation, index, usedIds));

  return {
    id: `session-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name:
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : DEFAULT_TEMPLATE_NAME,
    situations,
    initialCount:
      typeof payload.initialCount === 'number' && payload.initialCount > 0
        ? payload.initialCount
        : situations.length,
    createdAt: now,
    updatedAt: now
  };
};

export const buildTemplateExportPayload = (session) => ({
  schemaVersion: TEMPLATE_SCHEMA_VERSION,
  type: 'template',
  name: session.name,
  initialCount: session.initialCount,
  situations: session.situations
});
