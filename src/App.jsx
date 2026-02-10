import { useEffect, useMemo, useRef, useState } from 'react';

const LEGACY_STORAGE_KEY = 'micado_timer_ultra_robust_v2';
const APP_STORAGE_KEY = 'micado_timer_sessions_v1';

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

  return {
    ...data,
    isConfigured,
    situations,
    startAt: isConfigured ? startAt : null,
    endAt: isConfigured ? endAt : null,
    initialCount
  };
};

const emptyTimerState = {
  isConfigured: false,
  situations: [],
  startAt: null,
  endAt: null,
  initialCount: null
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
    slices.push({
      id: sit.id,
      path: describeArc(120, 120, 100, startAngle, endAngle),
      color: sit.state === 'PAUSE' ? '#94a3b8' : sit.color,
      state: sit.state
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
  const [timerState, setTimerState] = useState(initialData.timerState);
  const [sessions, setSessions] = useState(initialData.sessions);
  const [activeSessionId, setActiveSessionId] = useState(initialData.activeSessionId);
  const [sessionName, setSessionName] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState(initialData.activeSessionId ?? '');
  const [wallNow, setWallNow] = useState(() => Date.now());
  const [showReset, setShowReset] = useState(false);
  const [configValues, setConfigValues] = useState({
    nb: 5,
    end: ''
  });
  const tickRef = useRef(null);
  const initialAvgRef = useRef(null);

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
    tickRef.current = window.setInterval(() => {
      setWallNow(Date.now());
    }, 250);

    return () => window.clearInterval(tickRef.current);
  }, []);

  const upsertSessionFromTimer = (name, sourceTimerState = timerState, forcedId = null) => {
    const cleanName = name.trim();
    if (!cleanName || !sourceTimerState.situations.length) return null;

    const now = Date.now();
    const nextId = forcedId ?? `session-${now}`;
    const nextSession = {
      id: nextId,
      name: cleanName,
      situations: sourceTimerState.situations,
      initialCount: sourceTimerState.initialCount ?? sourceTimerState.situations.length,
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
        return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
      }
      return [nextSession, ...prev];
    });

    setActiveSessionId(nextId);
    setSelectedSessionId(nextId);
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
      initialCount: n
    };

    setTimerState(nextTimerState);

    if (sessionName.trim()) {
      upsertSessionFromTimer(sessionName, nextTimerState);
      setSessionName('');
    }
  };

  const handleSaveSession = () => {
    if (!sessionName.trim()) return;
    upsertSessionFromTimer(sessionName);
    setSessionName('');
  };

  const handleLoadSession = () => {
    if (!selectedSessionId || !configValues.end) return;
    const target = sessions.find((session) => session.id === selectedSessionId);
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
      initialCount: target.initialCount ?? target.situations.length
    });
    setActiveSessionId(target.id);
  };

  const handleDeleteSelectedSession = () => {
    if (!selectedSessionId) return;
    setSessions((prev) => prev.filter((session) => session.id !== selectedSessionId));
    if (activeSessionId === selectedSessionId) {
      setActiveSessionId(null);
    }
    setSelectedSessionId('');
  };

  const handleReset = () => {
    setTimerState(emptyTimerState);
    initialAvgRef.current = null;
    setShowReset(false);
  };

  const addSituation = () => {
    setTimerState((prev) => {
      const newId = Math.max(0, ...prev.situations.map((s) => s.id)) + 1;
      return {
        ...prev,
        situations: [
          ...prev.situations,
          { id: newId, name: `Situation ${newId}`, color: COLORS[(newId - 1) % COLORS.length], state: 'ACTIVE' }
        ]
      };
    });
  };

  const removeSituation = (id) => {
    setTimerState((prev) => ({
      ...prev,
      situations: prev.situations.filter((s) => s.id !== id)
    }));
  };

  const toggleSituation = (id) => {
    setTimerState((prev) => ({
      ...prev,
      situations: prev.situations.map((s) =>
        s.id === id ? { ...s, state: s.state === 'ACTIVE' ? 'PAUSE' : 'ACTIVE' } : s
      )
    }));
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
  const isFinished = timerState.isConfigured && remainingGlobalMs === 0;

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
        <button type="button" className="btn-danger" onClick={() => setShowReset(true)}>
          🗑️ Nouvelle session
        </button>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="col" style={{ gap: '12px' }}>
          <span className="badge gray">💾 Sessions sauvegardées</span>
          <div className="grid session-controls">
            <div className="col">
              <label>Nom de session</label>
              <input
                type="text"
                placeholder="Ex: Atelier lundi"
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
              />
            </div>
            <button type="button" className="btn-outline" onClick={handleSaveSession} disabled={!sessionName.trim() || !timerState.situations.length}>
              Sauvegarder la session active
            </button>
          </div>

          <div className="grid session-controls">
            <div className="col">
              <label>Reprendre une session (avec nouvelle heure de fin)</label>
              <select
                value={selectedSessionId}
                onChange={(event) => setSelectedSessionId(event.target.value)}
              >
                <option value="">Choisir une session</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name} ({session.situations.length} situations)
                  </option>
                ))}
              </select>
            </div>
            <div className="row" style={{ gap: '10px' }}>
              <button type="button" className="btn-outline" onClick={handleLoadSession} disabled={!selectedSessionId || !configValues.end}>
                Reprendre
              </button>
              <button type="button" className="btn-outline danger" onClick={handleDeleteSelectedSession} disabled={!selectedSessionId}>
                Supprimer
              </button>
            </div>
          </div>
          <div className="sub">Choisissez une heure de fin ci-dessous avant de reprendre une session existante.</div>
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
                  {isFinished ? 'TERMINÉ' : 'EN COURS'}
                </span>
              </div>
            </div>

            <div className="hr"></div>

            <div className="col" style={{ gap: '12px' }}>
              <div className="sub">
                Le camembert représente la compression temporelle instantanée et la répartition actuelle.
              </div>
              <CompressionPie
                situations={timerState.situations}
                startAt={timerState.startAt}
                endAt={timerState.endAt}
                wallNow={wallNow}
                initialAvgMs={initialAvgRef.current}
              />
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
                      <span className="badge gray">{sit.state === 'ACTIVE' ? 'ACTIVE' : 'PAUSE'}</span>
                    </div>
                    <div className="row" style={{ gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => toggleSituation(sit.id)}
                      >
                        {sit.state === 'ACTIVE' ? '⏸ Pause' : '▶️ Reprendre'}
                      </button>
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

      <div id="modal" className={`modal ${showReset ? 'show' : ''}`}>
        <div className="box">
          <div style={{ fontWeight: 1000, fontSize: '18px', marginBottom: '6px' }}>Confirmer</div>
          <div className="muted" style={{ marginBottom: '14px' }}>
            Réinitialiser la session en cours ? Les sessions sauvegardées restent disponibles.
          </div>
          <div className="row" style={{ gap: '10px' }}>
            <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setShowReset(false)}>
              Annuler
            </button>
            <button type="button" className="btn-danger" style={{ flex: 1 }} onClick={handleReset}>
              Réinitialiser
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
