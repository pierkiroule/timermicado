export const TEMPLATE_SCHEMA_VERSION = 1;

const DEFAULT_TEMPLATE_NAME = 'Template importé';

const normalizeSituation = (situation, index) => {
  const fallbackId = index + 1;
  const parsedId = Number.parseInt(situation?.id, 10);
  const id = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : fallbackId;
  const name =
    typeof situation?.name === 'string' && situation.name.trim()
      ? situation.name.trim()
      : `Situation ${fallbackId}`;
  const color =
    typeof situation?.color === 'string' && situation.color.trim() ? situation.color : '#6366f1';
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
  const situations = payload.situations.map((situation, index) => normalizeSituation(situation, index));

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

export const buildSessionReportPayload = (session) => {
  const situations = Array.isArray(session?.situations) ? session.situations : [];
  const initialCount =
    typeof session?.initialCount === 'number' && session.initialCount > 0
      ? session.initialCount
      : situations.length;
  const namedSituationsCount = situations.filter(
    (situation) => typeof situation?.name === 'string' && situation.name.trim().length > 0
  ).length;
  const activeSituationsCount = situations.filter((situation) => situation?.state === 'ACTIVE').length;
  const coverageRatio = initialCount > 0 ? Math.min(1, situations.length / initialCount) : 0;
  const namingRatio = situations.length > 0 ? namedSituationsCount / situations.length : 0;
  const activeRatio = situations.length > 0 ? activeSituationsCount / situations.length : 0;

  return {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    type: 'report',
    generatedAt: Date.now(),
    session: {
      id: session?.id ?? null,
      name: session?.name ?? 'Session sans nom',
      createdAt: Number.isFinite(session?.createdAt) ? session.createdAt : null,
      updatedAt: Number.isFinite(session?.updatedAt) ? session.updatedAt : null,
      initialCount,
      currentCount: situations.length
    },
    kpis: {
      coverageRatio,
      namingRatio,
      activeRatio,
      namedSituationsCount,
      activeSituationsCount
    }
  };
};

export const buildSessionReportText = (reportPayload) => {
  const report = reportPayload ?? {};
  const session = report.session ?? {};
  const kpis = report.kpis ?? {};

  const formatRatio = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
  const formatDate = (timestamp) =>
    Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('fr-FR') : 'inconnue';

  return [
    'Rapport de synthèse — Timer MICADO',
    `Généré le : ${formatDate(report.generatedAt)}`,
    '',
    'Session',
    `- Nom : ${session.name ?? 'Session sans nom'}`,
    `- ID : ${session.id ?? 'inconnu'}`,
    `- Créée le : ${formatDate(session.createdAt)}`,
    `- Mise à jour : ${formatDate(session.updatedAt)}`,
    `- Plan initial : ${session.initialCount ?? 0}`,
    `- Situations actuelles : ${session.currentCount ?? 0}`,
    '',
    'KPIs',
    `- Couverture de la liste : ${formatRatio(kpis.coverageRatio)}`,
    `- Intitulés renseignés : ${formatRatio(kpis.namingRatio)}`,
    `- Situations actives : ${formatRatio(kpis.activeRatio)}`,
    `- Nombre d\'intitulés renseignés : ${kpis.namedSituationsCount ?? 0}`,
    `- Nombre de situations actives : ${kpis.activeSituationsCount ?? 0}`
  ].join('\n');
};
