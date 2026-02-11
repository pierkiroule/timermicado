import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildTemplateExportPayload,
  buildUniqueCopyName,
  normalizeImportedSession,
  validateTemplateFile
} from './utils/sessionTransfer';

const LEGACY_STORAGE_KEY = 'micado_timer_ultra_robust_v2';
const APP_STORAGE_KEY = 'micado_timer_sessions_v1';
const UI_MODE_STORAGE_KEY = 'micado_timer_ui_mode_v1';

const COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#ef4444',
  '#84cc16',
  '#f97316',
  '#a855f7',
  '#14b8a6',
  '#f43f5e',
  '#22c55e',
  '#eab308',
  '#3b82f6'
];

const pad2 = (n) => String(n).padStart(2, '0');

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const parseTimeToToday = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

const formatMMSS = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = pad2(Math.floor(s / 60));
  const ss = pad2(s % 60);
  return `${mm}:${ss}`;
};

const formatDateTime = (timestamp) => {
  if (!Number.isFinite(timestamp)) return 'date inconnue';
  return new Date(timestamp).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const buildInitialSituations = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Situation ${i + 1}`,
    color: COLORS[i % COLORS.length],
    state: 'ACTIVE'
  }));

const normalizeState = (data) => {
  const situations = Array.isArray(data.situations) ? data.situations : [];
  const initialCount =
    typeof data.initialCount === 'number' && data.initialCount > 0
      ? data.initialCount
      : situations.length || 1;
  const startAt = Number.isFinite(data.startAt) ? data.startAt : null;
  const endAt = Number.isFinite(data.endAt) ? data.endAt : null;
  const isConfigured =
    Boolean(data.isConfigured) &&
    situations.length > 0 &&
    startAt !== null &&
    endAt !== null &&
    endAt > startAt;
  const isPaused = Boolean(data.isPaused) && isConfigured;
  const pausedAt = isPaused && Number.isFinite(data.pausedAt) ? data.pausedAt : null;

  return {
    ...data,
    isConfigured,
    situations,
    startAt: isConfigured ? startAt : null,
    endAt: isConfigured ? endAt : null,
    initialCount,
    isPaused,
    pausedAt
  };
};

const emptyTimerState = {
  isConfigured: false,
  situations: [],
  startAt: null,
  endAt: null,
  initialCount: null,
  isPaused: false,
  pausedAt: null
};

const EVENT_COLORS = {
  SESSION_START: '#38bdf8',
  PAUSE_START: '#f59e0b',
  PAUSE_END: '#22c55e',
  SITUATION_ADDED: '#8b5cf6',
  SITUATION_REMOVED: '#ef4444',
  END_TIME_CHANGED: '#f97316',
  SESSION_FINISHED: '#ec4899'
};

const EVENT_LABELS = {
  SESSION_START: 'Démarrage de la réunion',
  PAUSE_START: 'Début de pause',
  PAUSE_END: 'Reprise de la réunion',
  SITUATION_ADDED: 'Situation ajoutée',
  SITUATION_REMOVED: 'Situation supprimée',
  END_TIME_CHANGED: 'Heure de fin modifiée',
  SESSION_FINISHED: 'Fin de réunion'
};

const createSessionFromTimerState = (timerState, name = 'Session importée') => {
  const now = Date.now();
  return {
    id: `session-${now}`,
    name,
    situations: timerState.situations,
    initialCount: timerState.initialCount ?? timerState.situations.length,
    createdAt: now,
    updatedAt: now
  };
};

const normalizeSession = (session, index) => {
  const situations = Array.isArray(session?.situations) ? session.situations : [];
  const now = Date.now();
  return {
    id: typeof session?.id === 'string' ? session.id : `session-${now}-${index}`,
    name: typeof session?.name === 'string' && session.name.trim() ? session.name.trim() : `Session ${index + 1}`,
    situations,
    initialCount:
      typeof session?.initialCount === 'number' && session.initialCount > 0
        ? session.initialCount
        : situations.length || 1,
    createdAt: Number.isFinite(session?.createdAt) ? session.createdAt : now,
    updatedAt: Number.isFinite(session?.updatedAt) ? session.updatedAt : now
  };
};

const loadAppState = () => {
  try {
    const raw = window.localStorage.getItem(APP_STORAGE_KEY);
    if (!raw) {
      const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!legacyRaw) {
        return {
          timerState: emptyTimerState,
          sessions: [],
          activeSessionId: null
        };
      }

      const legacyParsed = JSON.parse(legacyRaw);
      const timerState = normalizeState(legacyParsed);
      const sessions = timerState.isConfigured
        ? [createSessionFromTimerState(timerState)]
        : [];
      return {
        timerState,
        sessions,
        activeSessionId: sessions[0]?.id ?? null
      };
    }

    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      return {
        timerState: emptyTimerState,
        sessions: [],
        activeSessionId: null
      };
    }

    const timerState = normalizeState(data.timerState ?? emptyTimerState);
    const sessions = Array.isArray(data.sessions)
      ? data.sessions.map((session, index) => normalizeSession(session, index))
      : [];
    const activeSessionId =
      typeof data.activeSessionId === 'string' && sessions.some((session) => session.id === data.activeSessionId)
        ? data.activeSessionId
        : sessions[0]?.id ?? null;

    return {
      timerState,
      sessions,
      activeSessionId
    };
  } catch (error) {
    console.warn('Impossible de charger la session.', error);
    return {
      timerState: emptyTimerState,
      sessions: [],
      activeSessionId: null
    };
  }
};

const loadUiMode = () => {
  try {
    const raw = window.localStorage.getItem(UI_MODE_STORAGE_KEY);
    return raw === 'advanced' ? 'advanced' : 'simple';
  } catch (error) {
    console.warn('Impossible de charger le mode d’interface.', error);
    return 'simple';
  }
};

const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians)
  };
};

const describeArc = (centerX, centerY, radius, startAngle, endAngle) => {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M',
    start.x,
    start.y,
    'A',
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
    'L',
    centerX,
    centerY,
    'Z'
  ].join(' ');
};

const describeSliceLabelPosition = (centerX, centerY, radius, startAngle, endAngle) => {
  const middleAngle = startAngle + (endAngle - startAngle) / 2;
  return polarToCartesian(centerX, centerY, radius, middleAngle);
};

const CompressionPie = ({
  situations,
  startAt,
  endAt,
  wallNow,
  initialAvgMs
}) => {
  const remainingGlobalMs = Math.max(0, endAt - wallNow);
  const remainingCount = situations.length;
  const avgNowMs = remainingCount > 0 ? remainingGlobalMs / remainingCount : 0;
  const tempoScore =
    initialAvgMs && remainingCount > 0 ? (avgNowMs - initialAvgMs) / initialAvgMs : 0;
  const compression = remainingCount === 0 ? 0 : clamp(-tempoScore, 0, 1);
  const pressureEmoji =
    compression < 0.34 ? '🙂' : compression < 0.67 ? '😐' : '😣';
  const hatchedAngle = compression * 360;
  const remainingAngle = 360 - hatchedAngle;
  const anglePerSituation = remainingCount > 0 ? remainingAngle / remainingCount : 0;

  const slices = [];
  let cursor = -90 + hatchedAngle;

  situations.forEach((sit, index) => {
    const startAngle = cursor + index * anglePerSituation;
    const endAngle = startAngle + anglePerSituation;
    const labelPos = describeSliceLabelPosition(120, 120, 83, startAngle, endAngle);
    slices.push({
      id: sit.id,
      path: describeArc(120, 120, 100, startAngle, endAngle),
      color: sit.state === 'PAUSE' ? '#94a3b8' : sit.color,
      state: sit.state,
      labelX: labelPos.x,
      labelY: labelPos.y
    });
  });

  const hatchedPath =
    hatchedAngle > 0 ? describeArc(120, 120, 100, -90, -90 + hatchedAngle) : null;
  const bubbleCount = 6 + Math.round(compression * 10);
  const bubbleScale = 1 + compression * 0.6;
  const bubbleDuration = 3.4 - compression * 1.2;
  const haloCount = 10 + Math.round(compression * 10);
  const haloScale = 1 + compression * 0.45;
  const haloDuration = 6.4 - compression * 2.2;
  const bubbles = Array.from({ length: bubbleCount }, (_, i) => {
    const angle = (i / bubbleCount) * Math.PI * 2;
    const radius = 8 + (i % 6) * 4;
    return {
      id: `bubble-${i}`,
      cx: 120 + Math.cos(angle) * radius,
      cy: 120 + Math.sin(angle) * radius,
      r: 1.4 + (i % 5) * 0.5
    };
  });
  const haloBubbles = Array.from({ length: haloCount }, (_, i) => {
    const angle = (i / haloCount) * Math.PI * 2;
    const radius = 108 + (i % 4) * 2;
    const drift = ((i % 6) - 2.5) * 1.6;
    return {
      id: `halo-${i}`,
      cx: 120 + Math.cos(angle) * radius,
      cy: 120 + Math.sin(angle) * radius,
      r: 2 + (i % 6) * 0.5 + compression * 1.1,
      drift,
      delay: (i % 12) * 0.4
    };
  });

  return (
    <div
      className="compression-pie"
      style={{
        '--bubble-scale': bubbleScale,
        '--bubble-duration': `${bubbleDuration}s`,
        '--halo-scale': haloScale,
        '--halo-duration': `${haloDuration}s`
      }}
    >
      <svg width="240" height="240" viewBox="0 0 240 240" role="img" aria-label="Pression du temps">
        <defs>
          <radialGradient id="bubble-gradient" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.3" />
          </radialGradient>
          <radialGradient id="halo-gradient" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#7dd3fc" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.2" />
          </radialGradient>
          <pattern
            id="compression-bubbles"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <rect width="24" height="24" fill="#f8fafc" />
            <g className="pattern-bubbles">
              <circle cx="6" cy="18" r="2.4" />
              <circle cx="16" cy="8" r="1.8" />
              <circle cx="20" cy="18" r="1.4" />
              <circle cx="10" cy="12" r="1.2" />
            </g>
          </pattern>
        </defs>
        <circle cx="120" cy="120" r="108" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
        <g className="pie-halo" aria-hidden="true">
          {haloBubbles.map((bubble, index) => (
            <circle
              key={bubble.id}
              className={`pie-halo-bubble halo-${(index % 12) + 1}`}
              cx={bubble.cx}
              cy={bubble.cy}
              r={bubble.r}
              style={{ '--halo-delay': `${bubble.delay}s`, '--halo-drift': `${bubble.drift}px` }}
            />
          ))}
        </g>
        {hatchedPath && <path d={hatchedPath} fill="url(#compression-bubbles)" />}
        {slices.map((slice) => (
          <path key={slice.id} d={slice.path} fill={slice.color} opacity={slice.state === 'PAUSE' ? 0.55 : 1} />
        ))}
        {slices.map((slice) => (
          <text
            key={`slice-label-${slice.id}`}
            x={slice.labelX}
            y={slice.labelY}
            textAnchor="middle"
            dominantBaseline="central"
            className="pie-slice-id"
          >
            {slice.id}
          </text>
        ))}
        <circle cx="120" cy="120" r="64" fill="#fff" stroke="#e2e8f0" strokeWidth="2" />
        <g className="pie-bubbles" aria-hidden="true">
          {bubbles.map((bubble, index) => (
            <circle
              key={bubble.id}
              className={`pie-bubble bubble-${(index % 5) + 1}`}
              cx={bubble.cx}
              cy={bubble.cy}
              r={bubble.r}
            />
          ))}
        </g>
        <text x="120" y="110" textAnchor="middle" className="pie-emoji">
          {pressureEmoji}
        </text>
        <text x="120" y="138" textAnchor="middle" className="pie-value">
          {(compression * 100).toFixed(0)}%
        </text>
        {remainingCount === 0 && (
          <text x="120" y="164" textAnchor="middle" className="pie-sub">
            Aucune situation
          </text>
        )}
      </svg>
      <div className="pie-meta">
        <span className="badge gray">Temps global restant : {formatMMSS(remainingGlobalMs)}</span>
        <span className="badge gray">Temps moyen restant : {formatMMSS(avgNowMs)}</span>
        <span className="badge gray">Situations restantes : {remainingCount}</span>
      </div>
    </div>
  );
};

export default function App() {
  const initialData = useMemo(() => loadAppState(), []);
  const initialUiMode = useMemo(() => loadUiMode(), []);
  const [timerState, setTimerState] = useState(initialData.timerState);
  const [uiMode, setUiMode] = useState(initialUiMode);
  const [sessions, setSessions] = useState(initialData.sessions);
  const [activeSessionId, setActiveSessionId] = useState(initialData.activeSessionId);
  const [sessionName, setSessionName] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState(initialData.activeSessionId ?? '');
  const [sessionNotice, setSessionNotice] = useState('');
  const [isSessionsPanelOpen, setIsSessionsPanelOpen] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [sessionEvents, setSessionEvents] = useState([]);
  const [finishConfirmArmed, setFinishConfirmArmed] = useState(false);
  const [wallNow, setWallNow] = useState(() => Date.now());
  const [showReset, setShowReset] = useState(false);
  const [configValues, setConfigValues] = useState({
    nb: 5,
    end: ''
  });
  const tickRef = useRef(null);
  const initialAvgRef = useRef(null);
  const importInputRef = useRef(null);
  const statsCloseButtonRef = useRef(null);
  const endLoggedRef = useRef(false);
  const finishConfirmTimeoutRef = useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        APP_STORAGE_KEY,
        JSON.stringify({
          timerState,
          sessions,
          activeSessionId
        })
      );
      window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(timerState));
    } catch (error) {
      console.warn('Impossible de sauvegarder la session.', error);
    }
  }, [timerState, sessions, activeSessionId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(UI_MODE_STORAGE_KEY, uiMode);
    } catch (error) {
      console.warn('Impossible de sauvegarder le mode d’interface.', error);
    }
  }, [uiMode]);

  useEffect(() => {
    tickRef.current = window.setInterval(() => {
      setWallNow(Date.now());
    }, 250);

    return () => window.clearInterval(tickRef.current);
  }, []);

  const upsertSessionFromTimer = ({ name, sourceTimerState = timerState, forcedId = null, notice = '' }) => {
    const cleanName = name.trim();
    if (!cleanName || !sourceTimerState.situations.length) return null;

    const now = Date.now();
    const nextId = forcedId ?? `session-${now}`;
    const nextSession = {
      id: nextId,
      name: cleanName,
      situations: sourceTimerState.situations,
      initialCount: sourceTimerState.situations.length,
      createdAt: now,
      updatedAt: now
    };

    setSessions((prev) => {
      const idx = prev.findIndex((session) => session.id === nextId);
      if (idx >= 0) {
        const existing = prev[idx];
        const updated = {
          ...existing,
          ...nextSession,
          createdAt: existing.createdAt ?? now
        };
        return [updated, ...prev.filter((session) => session.id !== nextId)];
      }
      return [nextSession, ...prev];
    });

    setActiveSessionId(nextId);
    setSelectedSessionId(nextId);
    if (notice) setSessionNotice(notice);
    return nextId;
  };

  const handleLaunch = () => {
    const n = clamp(parseInt(configValues.nb || '5', 10) || 5, 1, 25);
    if (!configValues.end) return;

    initialAvgRef.current = null;
    const now = Date.now();
    let endAt = parseTimeToToday(configValues.end);
    if (endAt <= now) endAt += 24 * 60 * 60 * 1000;

    const nextTimerState = {
      isConfigured: true,
      situations: buildInitialSituations(n),
      startAt: now,
      endAt,
      initialCount: n,
      isPaused: false,
      pausedAt: null
    };

    setTimerState(nextTimerState);
    setFinishConfirmArmed(false);
    setSessionEvents([
      {
        id: `evt-${now}`,
        type: 'SESSION_START',
        at: now,
        description: 'Réunion démarrée.'
      }
    ]);
    endLoggedRef.current = false;
    setSessionNotice('Nouvelle session lancée. Sauvegardez-la si vous voulez la réutiliser plus tard.');
  };

  const handleSaveSession = () => {
    if (!sessionName.trim()) return;
    upsertSessionFromTimer({
      name: sessionName,
      notice: 'Sauvegarde créée avec succès.'
    });
    setSessionName('');
  };

  const handleUpdateSelectedSession = () => {
    const target = sessions.find((session) => session.id === selectedSessionId);
    if (!target) return;
    upsertSessionFromTimer({
      name: target.name,
      forcedId: target.id,
      notice: `Sauvegarde « ${target.name} » mise à jour avec la liste actuelle.`
    });
  };

  const handleLoadSession = (sessionId = selectedSessionId) => {
    if (!sessionId || !configValues.end) return;
    const target = sessions.find((session) => session.id === sessionId);
    if (!target || !target.situations.length) return;

    initialAvgRef.current = null;
    const now = Date.now();
    let endAt = parseTimeToToday(configValues.end);
    if (endAt <= now) endAt += 24 * 60 * 60 * 1000;

    setTimerState({
      isConfigured: true,
      situations: target.situations,
      startAt: now,
      endAt,
      initialCount: target.situations.length,
      isPaused: false,
      pausedAt: null
    });
    setActiveSessionId(target.id);
    setSelectedSessionId(target.id);
    setFinishConfirmArmed(false);
    setSessionEvents([
      {
        id: `evt-${now}`,
        type: 'SESSION_START',
        at: now,
        description: `Réunion reprise depuis « ${target.name} ».`
      }
    ]);
    endLoggedRef.current = false;
    setSessionNotice(`Session « ${target.name} » reprise avec une nouvelle heure de fin.`);
  };

  const handleDeleteSelectedSession = (sessionId = selectedSessionId) => {
    if (!sessionId) return;
    const target = sessions.find((session) => session.id === sessionId);
    setSessions((prev) => prev.filter((session) => session.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
    }
    if (selectedSessionId === sessionId) {
      setSelectedSessionId('');
    }
    if (target) {
      setSessionNotice(`Sauvegarde « ${target.name} » supprimée.`);
    }
  };

  const downloadJsonFile = (filename, payload) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };


  const handleExportTemplate = () => {
    if (!selectedSession) return;
    const payload = buildTemplateExportPayload(selectedSession);
    const slug = selectedSession.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    downloadJsonFile(`${slug || 'template-session'}.template.json`, payload);
    setSessionNotice(`Template « ${selectedSession.name} » exporté.`);
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportTemplate = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const raw = await file.text();
      const payload = JSON.parse(raw);
      const validation = validateTemplateFile(payload);

      if (!validation.valid) {
        setSessionNotice(validation.message);
        return;
      }

      const imported = normalizeImportedSession(payload);
      const importedName = buildUniqueCopyName(imported.name, sessions.map((session) => session.name));
      const importedSession = {
        ...imported,
        name: importedName
      };

      setSessions((prev) => [importedSession, ...prev]);
      setSelectedSessionId(importedSession.id);
      setSessionNotice(`Template importé avec succès : « ${importedName} ».`);
    } catch (error) {
      console.warn('Impossible d’importer le template.', error);
      setSessionNotice('Import impossible : fichier JSON invalide.');
    } finally {
      event.target.value = '';
    }
  };

  const handleReset = () => {
    setTimerState(emptyTimerState);
    setSessionEvents([]);
    setFinishConfirmArmed(false);
    initialAvgRef.current = null;
    endLoggedRef.current = false;
    setShowReset(false);
  };

  const addSituation = () => {
    const now = Date.now();
    const newId = Math.max(0, ...timerState.situations.map((s) => s.id)) + 1;
    const newName = `Situation ${newId}`;
    setTimerState((prev) => {
      return {
        ...prev,
        situations: [
          ...prev.situations,
          { id: newId, name: newName, color: COLORS[(newId - 1) % COLORS.length], state: 'ACTIVE' }
        ]
      };
    });
    setSessionEvents((prev) => [
      ...prev,
      {
        id: `evt-${now}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'SITUATION_ADDED',
        at: now,
        description: `Situation ajoutée : ${newName}`
      }
    ]);
  };

  const removeSituation = (id) => {
    const now = Date.now();
    const target = timerState.situations.find((s) => s.id === id);
    setTimerState((prev) => ({
      ...prev,
      situations: prev.situations.filter((s) => s.id !== id)
    }));
    setSessionEvents((prev) => [
      ...prev,
      {
        id: `evt-${now}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'SITUATION_REMOVED',
        at: now,
        description: `Situation supprimée${target?.name ? ` : ${target.name}` : '.'}`
      }
    ]);
  };

  const updateSituationName = (id, value) => {
    setTimerState((prev) => ({
      ...prev,
      situations: prev.situations.map((s) => (s.id === id ? { ...s, name: value } : s))
    }));
  };

  useEffect(() => {
    const baselineCount = timerState.initialCount ?? timerState.situations.length;
    if (!initialAvgRef.current && timerState.startAt && timerState.endAt && baselineCount > 0) {
      const totalInitialMs = timerState.endAt - timerState.startAt;
      initialAvgRef.current = totalInitialMs / baselineCount;
    }
  }, [timerState.startAt, timerState.endAt, timerState.situations.length, timerState.initialCount]);

  const remainingGlobalMs = timerState.isConfigured ? Math.max(0, timerState.endAt - wallNow) : 0;
  const currentPauseMs = timerState.isPaused && timerState.pausedAt ? Math.max(0, wallNow - timerState.pausedAt) : 0;
  const isFinished = timerState.isConfigured && remainingGlobalMs === 0;
  const sortedSessions = [...sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const selectedSession = sortedSessions.find((session) => session.id === selectedSessionId) ?? null;
  const canResumeSession = Boolean(selectedSession && configValues.end);
  const isAdvancedMode = uiMode === 'advanced';
  useEffect(() => {
    if (!isStatsModalOpen) return;

    statsCloseButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsStatsModalOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isStatsModalOpen]);

  useEffect(() => {
    if (!timerState.isConfigured || !isFinished || endLoggedRef.current) return;
    const now = Date.now();
    setSessionEvents((prev) => [
      ...prev,
      {
        id: `evt-${now}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'SESSION_FINISHED',
        at: now,
        description: 'Réunion terminée.'
      }
    ]);
    endLoggedRef.current = true;
  }, [timerState.isConfigured, isFinished]);


  const eventLegendEntries = useMemo(
    () => [
      { type: 'SESSION_START', label: EVENT_LABELS.SESSION_START },
      { type: 'PAUSE_START', label: EVENT_LABELS.PAUSE_START },
      { type: 'PAUSE_END', label: EVENT_LABELS.PAUSE_END },
      { type: 'SITUATION_ADDED', label: EVENT_LABELS.SITUATION_ADDED },
      { type: 'SITUATION_REMOVED', label: EVENT_LABELS.SITUATION_REMOVED },
      { type: 'END_TIME_CHANGED', label: EVENT_LABELS.END_TIME_CHANGED },
      { type: 'SESSION_FINISHED', label: EVENT_LABELS.SESSION_FINISHED }
    ],
    []
  );

  const orderedEvents = useMemo(
    () => [...sessionEvents].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)),
    [sessionEvents]
  );

  const timelineEvents = useMemo(
    () =>
      orderedEvents.map((event, index) => ({
        ...event,
        color: EVENT_COLORS[event.type] ?? '#38bdf8',
        label: EVENT_LABELS[event.type] ?? event.type,
        offsetLabel:
          timerState.startAt && Number.isFinite(event.at)
            ? `+${Math.max(0, Math.round((event.at - timerState.startAt) / 60000))} min`
            : '',
        order: index + 1
      })),
    [orderedEvents, timerState.startAt]
  );

  useEffect(
    () => () => {
      if (finishConfirmTimeoutRef.current) {
        window.clearTimeout(finishConfirmTimeoutRef.current);
      }
    },
    []
  );

  const meetingStats = useMemo(() => {
    const startAt = timerState.startAt;
    if (!startAt) {
      return {
        actualEndAt: null,
        plannedEndAt: null,
        totalDurationMs: 0,
        situationDurations: [],
        pauseCount: 0,
        totalPauseMs: 0,
        eventCount: orderedEvents.length
      };
    }

    const plannedEndAt = timerState.endAt;
    const finishedEvent = [...orderedEvents].reverse().find((event) => event.type === 'SESSION_FINISHED') ?? null;
    const actualEndAt = isFinished ? (finishedEvent?.at ?? wallNow) : wallNow;
    const totalDurationMs = Math.max(0, actualEndAt - startAt);

    const removedAtMap = new Map();
    const addedNames = new Set();
    let pauseCount = 0;
    let totalPauseMs = 0;
    let pauseStartAt = null;

    orderedEvents.forEach((event) => {
      if (event.type === 'PAUSE_START') {
        pauseCount += 1;
        pauseStartAt = event.at;
      }
      if (event.type === 'PAUSE_END' && pauseStartAt) {
        totalPauseMs += Math.max(0, event.at - pauseStartAt);
        pauseStartAt = null;
      }
      if (event.type === 'SITUATION_ADDED' && typeof event.description === 'string') {
        const parts = event.description.split(':');
        const name = (parts[1] || '').trim();
        if (name) addedNames.add(name);
      }
      if (event.type === 'SITUATION_REMOVED' && typeof event.description === 'string') {
        const parts = event.description.split(':');
        const name = (parts[1] || '').trim();
        if (name) removedAtMap.set(name, event.at);
      }
    });

    const knownNames = new Set(timerState.situations.map((situation) => situation.name));
    addedNames.forEach((name) => knownNames.add(name));

    if (pauseStartAt) {
      totalPauseMs += Math.max(0, actualEndAt - pauseStartAt);
    }

    const situationDurations = [...knownNames]
      .filter(Boolean)
      .map((name, index) => {
        const removedAt = removedAtMap.get(name);
        const endAt = removedAt ?? actualEndAt;
        return {
          id: index + 1,
          name,
          durationMs: Math.max(0, endAt - startAt)
        };
      })
      .sort((a, b) => b.durationMs - a.durationMs);

    return {
      actualEndAt,
      plannedEndAt,
      totalDurationMs,
      situationDurations,
      pauseCount,
      totalPauseMs,
      eventCount: orderedEvents.length
    };
  }, [timerState.startAt, timerState.endAt, timerState.situations, orderedEvents, isFinished, wallNow]);


  const analyticsRows = useMemo(
    () => [
      `Heure de début : ${formatDateTime(timerState.startAt)}`,
      `Heure de fin fixée : ${formatDateTime(meetingStats.plannedEndAt)}`,
      `Heure réelle (jusqu'ici) : ${formatDateTime(meetingStats.actualEndAt)}`,
      `Durée écoulée : ${formatMMSS(meetingStats.totalDurationMs)}`,
      `Temps restant : ${formatMMSS(remainingGlobalMs)}`,
      `Situations actives : ${timerState.situations.length}`,
      `Événements capturés : ${meetingStats.eventCount}`,
      `Nombre de pauses : ${meetingStats.pauseCount}`,
      `Durée totale des pauses : ${formatMMSS(meetingStats.totalPauseMs)}`,
      `Réunion terminée : ${isFinished ? 'Oui' : 'Non'}`
    ],
    [
      timerState.startAt,
      meetingStats.plannedEndAt,
      meetingStats.actualEndAt,
      meetingStats.totalDurationMs,
      meetingStats.eventCount,
      meetingStats.pauseCount,
      meetingStats.totalPauseMs,
      remainingGlobalMs,
      timerState.situations.length,
      isFinished
    ]
  );

  const toggleGlobalPause = () => {
    if (!timerState.isConfigured || isFinished) return;

    const now = Date.now();
    const nextType = timerState.isPaused ? 'PAUSE_END' : 'PAUSE_START';
    setTimerState((prev) => ({
      ...prev,
      isPaused: !prev.isPaused,
      pausedAt: prev.isPaused ? null : now
    }));
    setSessionEvents((prev) => [
      ...prev,
      {
        id: `evt-${now}-${Math.random().toString(36).slice(2, 6)}`,
        type: nextType,
        at: now,
        description: nextType === 'PAUSE_START' ? 'Pause lancée.' : 'Réunion reprise.'
      }
    ]);
  };

  const handleFinishMeeting = () => {
    if (!timerState.isConfigured || isFinished) return;
    if (!finishConfirmArmed) {
      setFinishConfirmArmed(true);
      setSessionNotice('Confirmez en recliquant : mettre fin à la réunion maintenant.');
      if (finishConfirmTimeoutRef.current) {
        window.clearTimeout(finishConfirmTimeoutRef.current);
      }
      finishConfirmTimeoutRef.current = window.setTimeout(() => {
        setFinishConfirmArmed(false);
      }, 5000);
      return;
    }

    setFinishConfirmArmed(false);
    if (finishConfirmTimeoutRef.current) {
      window.clearTimeout(finishConfirmTimeoutRef.current);
      finishConfirmTimeoutRef.current = null;
    }
    endLoggedRef.current = false;
    setTimerState((prev) => ({
      ...prev,
      endAt: Date.now(),
      isPaused: false,
      pausedAt: null
    }));
    setSessionNotice('Réunion marquée comme terminée. Le rapport final est maintenant disponible.');
  };

  const handleAdjustEndTime = () => {
    if (!timerState.isConfigured || !configValues.end) return;

    const now = Date.now();
    let nextEndAt = parseTimeToToday(configValues.end);
    if (nextEndAt <= now) nextEndAt += 24 * 60 * 60 * 1000;

    setTimerState((prev) => ({
      ...prev,
      endAt: nextEndAt
    }));
    const eventAt = Date.now();
    setSessionEvents((prev) => [
      ...prev,
      {
        id: `evt-${eventAt}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'END_TIME_CHANGED',
        at: eventAt,
        description: `Heure de fin modifiée à ${configValues.end}.`
      }
    ]);
    endLoggedRef.current = false;
    setSessionNotice(`Heure de fin mise à jour à ${configValues.end}.`);
  };

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="title-block">
          <div className="logo">
            <svg viewBox="0 0 260 60" role="img" aria-label="MicadoTimer">
              <title>MicadoTimer</title>
              <defs>
                <linearGradient id="logo-glow" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="50%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
              </defs>
              <g fill="none" stroke="url(#logo-glow)" strokeWidth="2.5">
                <path d="M20 30c0-11 9-20 20-20s20 9 20 20-9 20-20 20-20-9-20-20Z" />
                <path d="M20 30c10 8 30 8 40 0" />
              </g>
              <circle cx="40" cy="20" r="4" fill="#e0f2fe" />
              <circle cx="55" cy="30" r="3" fill="#7dd3fc" />
              <circle cx="44" cy="42" r="2.5" fill="#f0abfc" />
              <text x="78" y="38" fill="#f8fafc" fontSize="24" fontWeight="700" fontFamily="inherit">
                Micado•°Timer
              </text>
            </svg>
          </div>
          <div className="sub">
            1) CADRER Fixons l’heure de fin et le nombre de tâches.
            <br />
            2) COOPÉRER Le camembert se met à jour en temps réel.
            <br />
            3) PRIORISER Avec le temps restant, priorisez et recentrez ensemble sur l&apos;urgence de l&apos;essentiel.
          </div>
        </div>
        <div className="col topbar-controls" style={{ gap: '10px', alignItems: 'stretch', width: '100%' }}>
          {timerState.isConfigured && (
            <div className="mode-switch" role="group" aria-label="Mode d'interface">
              <button
                type="button"
                className={`mode-chip ${uiMode === 'simple' ? 'active' : ''}`}
                onClick={() => setUiMode('simple')}
                aria-pressed={uiMode === 'simple'}
              >
                ⚡ Simplifié
              </button>
              <button
                type="button"
                className={`mode-chip ${uiMode === 'advanced' ? 'active' : ''}`}
                onClick={() => setUiMode('advanced')}
                aria-pressed={uiMode === 'advanced'}
              >
                🛠 Avancé
              </button>
            </div>
          )}

          <div className="row" style={{ gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {timerState.isConfigured && (
              <>
                <button type="button" className="btn-primary" style={{ width: 'auto' }} onClick={toggleGlobalPause} disabled={isFinished}>
                  {timerState.isPaused ? '▶️ Reprendre' : '⏸ Pause'}
                </button>
                {isAdvancedMode && (
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ width: 'auto' }}
                    onClick={handleFinishMeeting}
                    disabled={isFinished}
                  >
                    {finishConfirmArmed
                      ? '⚠️ Confirmer maintenant : mettre fin à la réunion'
                      : "✅ Mettre fin à la réunion (avant l'heure de fin fixée)"}
                  </button>
                )}
                {timerState.isPaused && (
                  <span className="pause-live" aria-live="polite">
                    Durée de pause en temps réel : {formatMMSS(currentPauseMs)}
                  </span>
                )}
              </>
            )}
            <button type="button" className="btn-danger" onClick={() => setShowReset(true)}>
              🆕 Créer une nouvelle réunion
            </button>
          </div>
        </div>
      </div>



      {!timerState.isConfigured ? (
        <div id="configView" className="card">
          <div className="col" style={{ gap: '12px' }}>
            <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>
              <div className="col">
                <label>Nombre de situations</label>
                <input
                  id="inpNb"
                  type="number"
                  min="1"
                  max="25"
                  value={configValues.nb}
                  onChange={(event) =>
                    setConfigValues((prev) => ({ ...prev, nb: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="col">
                <label>Heure fin</label>
                <input
                  id="inpEnd"
                  type="time"
                  value={configValues.end}
                  onChange={(event) => setConfigValues((prev) => ({ ...prev, end: event.target.value }))}
                />
              </div>
            </div>

            <button type="button" className="btn-primary" onClick={handleLaunch}>
              🚀 Lancer
            </button>

            <div className="sub">Le temps global est fixe. Les situations se partagent le temps restant.</div>
          </div>
        </div>
      ) : (
        <div id="runView" className="grid">
          <div className="card">
            <div className="row-between">
              <div className="pill">
                <span id="runState" className={`badge ${isFinished ? 'red' : 'gray'}`}>
                  {isFinished ? 'TERMINÉ' : timerState.isPaused ? 'EN PAUSE · TEMPS EN COURS' : 'EN COURS'}
                </span>
              </div>
            </div>

            <div className="hr"></div>

            <div className="col" style={{ gap: '12px' }}>
              <div className="sub">
                Le camembert représente la compression temporelle instantanée et la répartition actuelle.
                <br />
                Le bouton pause met l&apos;équipe en pause, pas l&apos;horloge.
              </div>
              {isAdvancedMode && (
                <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
                  <input
                    id="runEndEdit"
                    type="time"
                    value={configValues.end}
                    onChange={(event) => setConfigValues((prev) => ({ ...prev, end: event.target.value }))}
                    aria-label="Modifier l'heure de fin"
                    style={{ maxWidth: '180px' }}
                  />
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={handleAdjustEndTime}
                    disabled={!configValues.end || isFinished}
                  >
                    Modifier l'heure de fin fixée précédemment
                  </button>
                </div>
              )}
              <CompressionPie
                situations={timerState.situations}
                startAt={timerState.startAt}
                endAt={timerState.endAt}
                wallNow={wallNow}
                initialAvgMs={initialAvgRef.current}
              />
              {isAdvancedMode && (
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setIsStatsModalOpen(true)}
                  aria-haspopup="dialog"
                  aria-controls="liveStatsModal"
                  aria-expanded={isStatsModalOpen}
                >
                  📊 Stats live
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <div className="row-between" style={{ marginBottom: '10px' }}>
              <div className="row" style={{ gap: '10px' }}>
                <span className="badge gray">📋 Liste</span>
                <span className="badge gray">
                  Situations : <span id="nbLabel">{timerState.situations.length}</span>
                </span>
              </div>
              <button type="button" className="btn-outline" onClick={addSituation}>+ Ajouter</button>
            </div>

            <div id="list" className="list">
              {timerState.situations.map((sit) => (
                <div
                  key={sit.id}
                  className="item"
                  style={{
                    background: `${sit.color}10`,
                    borderColor: sit.state === 'ACTIVE' ? sit.color : 'transparent'
                  }}
                >
                  <div className="col" style={{ gap: '10px' }}>
                    <div className="row" style={{ gap: '10px', justifyContent: 'space-between' }}>
                      <div className="row" style={{ gap: '10px' }}>
                        <div className="dot" style={{ background: sit.color }}></div>
                        <input
                          data-name={sit.id}
                          type="text"
                          value={sit.name}
                          onChange={(event) => updateSituationName(sit.id, event.target.value)}
                        />
                      </div>
                      <span className="badge gray">ACTIVE</span>
                    </div>
                    <div className="row" style={{ gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-outline danger"
                        onClick={() => removeSituation(sit.id)}
                      >
                        ✕ Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}


      {isAdvancedMode && (
        <div className="card sessions-panel">
        <button
          type="button"
          className={`sessions-accordion-toggle ${isSessionsPanelOpen ? 'open' : ''}`}
          onClick={() => setIsSessionsPanelOpen((prev) => !prev)}
          aria-expanded={isSessionsPanelOpen}
          aria-controls="sessionsAccordionPanel"
        >
          <div className="row" style={{ gap: '10px' }}>
            <span className="badge blue">💾 Bibliothèque de sessions</span>
            <span className="badge gray">{sortedSessions.length} sauvegarde{sortedSessions.length > 1 ? 's' : ''}</span>
          </div>
          <span className="sessions-chevron">{isSessionsPanelOpen ? '▾' : '▸'}</span>
        </button>

        <div className="sub" style={{ marginBottom: '8px' }}>
          {isSessionsPanelOpen
            ? 'Fermez ce panneau si vous voulez rester concentré sur le timer.'
            : 'Ouvrir pour sauvegarder, mettre à jour ou reprendre une session existante.'}
        </div>

        {isSessionsPanelOpen && (
          <div id="sessionsAccordionPanel">
            <div className="session-principle">
              Une sauvegarde contient votre <strong>liste de situations</strong> (noms, états, couleurs).
              Le <strong>timer</strong> est recréé au moment de la reprise avec une nouvelle heure de fin.
            </div>

            <div className="grid sessions-layout">
              <div className="card session-subcard">
                <div className="col" style={{ gap: '10px' }}>
                  <label>Créer une nouvelle sauvegarde</label>
                  <input
                    type="text"
                    placeholder="Ex: Réunion pilotage"
                    value={sessionName}
                    onChange={(event) => setSessionName(event.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveSession}
                    disabled={!sessionName.trim() || !timerState.situations.length}
                  >
                    Sauvegarder la liste actuelle
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={handleUpdateSelectedSession}
                    disabled={!selectedSession || !timerState.situations.length}
                  >
                    Mettre à jour la sauvegarde sélectionnée
                  </button>
                  <div className="sub">Astuce : utilisez “Mettre à jour” quand vous avez retouché les intitulés de la liste.</div>
                </div>
              </div>

              <div className="card session-subcard">
                <div className="col" style={{ gap: '10px' }}>
                  <label>Reprendre une sauvegarde</label>
                  <div className="session-list">
                    {sortedSessions.length === 0 ? (
                      <div className="session-empty">Aucune sauvegarde pour le moment.</div>
                    ) : (
                      sortedSessions.map((session) => {
                        const isSelected = selectedSessionId === session.id;
                        const isActive = activeSessionId === session.id;
                        return (
                          <button
                            key={session.id}
                            type="button"
                            className={`session-row ${isSelected ? 'selected' : ''}`}
                            onClick={() => setSelectedSessionId(session.id)}
                          >
                            <div className="session-row-main">
                              <strong>{session.name}</strong>
                              <span>{session.situations.length} situations · MAJ {formatDateTime(session.updatedAt)}</span>
                            </div>
                            {isActive && <span className="badge gray">Active</span>}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="session-action-block">
                    <button type="button" className="btn-outline" onClick={handleExportTemplate} disabled={!selectedSession}>
                      Partager la liste (template)
                    </button>
                    <button type="button" className="btn-outline" onClick={handleImportClick}>
                      Importer un template
                    </button>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept="application/json,.json"
                      onChange={handleImportTemplate}
                      style={{ display: 'none' }}
                    />
                    <button type="button" className="btn-outline" onClick={() => handleLoadSession()} disabled={!canResumeSession}>
                      Reprendre (heure de fin ci-dessus)
                    </button>
                    <button type="button" className="btn-outline danger" onClick={() => handleDeleteSelectedSession()} disabled={!selectedSession}>
                      Supprimer la sauvegarde sélectionnée
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="sub">
              {selectedSession
                ? `Sélection : ${selectedSession.name}. Pour reprendre, renseignez d’abord le champ Heure fin.`
                : 'Sélectionnez une sauvegarde dans la liste de droite.'}
            </div>
            {sessionNotice && <div className="session-notice">{sessionNotice}</div>}
          </div>
        )}
      </div>
      )}

      <div id="modal" className={`modal ${showReset ? 'show' : ''}`}>
        <div className="box">
          <div style={{ fontWeight: 1000, fontSize: '18px', marginBottom: '6px' }}>Confirmer</div>
          <div className="muted" style={{ marginBottom: '14px' }}>
            Créer une nouvelle réunion ? La réunion en cours sera fermée, les sauvegardes resteront disponibles.
          </div>
          <div className="row" style={{ gap: '10px' }}>
            <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setShowReset(false)}>
              Annuler
            </button>
            <button type="button" className="btn-danger" style={{ flex: 1 }} onClick={handleReset}>
              Créer
            </button>
          </div>
        </div>
      </div>

      {isAdvancedMode && (
        <div
          id="liveStatsModal"
          className={`modal ${isStatsModalOpen ? 'show' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="liveStatsModalTitle"
        >
        <div className="box live-stats-box">
          <div className="row-between" style={{ marginBottom: '12px' }}>
            <div>
              <div id="liveStatsModalTitle" style={{ fontWeight: 1000, fontSize: '18px' }}>Déroulé réunion en cours</div>
              <div className="muted" style={{ marginTop: '4px' }}>
                Chronologie verticale et synthèse de réunion.
              </div>
            </div>
            <button
              ref={statsCloseButtonRef}
              type="button"
              className="btn-outline"
              onClick={() => setIsStatsModalOpen(false)}
              aria-label="Fermer les statistiques live"
            >
              Fermer
            </button>
          </div>

          <div className="live-stats-section" aria-label="Chronologie verticale de la réunion">
            <h3>Déroulé vertical</h3>
            <div className="timeline-note">Lecture du haut vers le bas, comme un bâtonnet de mikado.</div>
            <div className="mikado-timeline" role="list" aria-label="Chronologie des événements">
              {timelineEvents.length === 0 ? (
                <div className="sub">Aucun événement enregistré pour le moment.</div>
              ) : (
                timelineEvents.map((event) => (
                  <div key={event.id} className="mikado-row" role="listitem">
                    <div className="mikado-left" aria-hidden="true">
                      <span className="mikado-node" style={{ backgroundColor: event.color }}></span>
                    </div>
                    <div className="mikado-content">
                      <div className="mikado-title" style={{ color: event.color }}>
                        {event.order}. {event.label}
                      </div>
                      <div className="sub" style={{ marginTop: '2px' }}>
                        {formatDateTime(event.at)} {event.offsetLabel ? `· ${event.offsetLabel}` : ''}
                      </div>
                      <div className="mikado-description">{event.description}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="event-legend" aria-label="Légende des événements">
              {eventLegendEntries.map((entry) => (
                <span key={entry.type} className="event-legend-item">
                  <span className="event-dot" style={{ backgroundColor: EVENT_COLORS[entry.type] }}></span>
                  {entry.label}
                </span>
              ))}
            </div>

            <h3>Indicateurs de réunion</h3>
            <table className="indicators-table" aria-label="Indicateurs pertinents de la réunion">
              <tbody>
                {analyticsRows.map((row) => (
                  <tr key={row}>
                    <td>{row}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
