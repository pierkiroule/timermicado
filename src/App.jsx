import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'micado_timer_ultra_robust_v1';

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

const formatClock = (ts) => {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

const formatHHMM = (ts) => {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const formatMMSS = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = pad2(Math.floor(s / 60));
  const ss = pad2(s % 60);
  return `${mm}:${ss}`;
};

const formatDeltaMMSS = (ms) => {
  const s = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const mm = pad2(Math.floor(s / 60));
  const ss = pad2(s % 60);
  return `${mm}:${ss}`;
};

const buildInitialSituations = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Situation ${i + 1}`,
    color: COLORS[i % COLORS.length]
  }));

const getProgressNow = (state, wallNow) => {
  if (!state.isPaused) return wallNow;
  return state.pausedProgressAt ?? wallNow;
};

const syncPlan = (state, fromWallNow, remainingFromWallNow = fromWallNow) => {
  const n = state.situations.length;
  const idx = clamp(state.currentIndex, 0, Math.max(0, n - 1));
  const remainingCount = n - idx;
  const remainingMs = Math.max(0, state.endAt - remainingFromWallNow);
  const sliceMs = remainingCount > 0 ? remainingMs / remainingCount : 0;

  const plan =
    Array.isArray(state.plan) && state.plan.length === n
      ? state.plan.map((entry) => ({ ...entry }))
      : new Array(n).fill(null).map(() => ({ plannedStart: null, plannedEnd: null }));

  let cursor = fromWallNow;
  for (let i = idx; i < n; i += 1) {
    plan[i] = {
      plannedStart: cursor,
      plannedEnd: cursor + sliceMs
    };
    cursor += sliceMs;
  }

  for (let i = 0; i < idx; i += 1) {
    if (!plan[i] || plan[i].plannedStart == null || plan[i].plannedEnd == null) {
      plan[i] = { plannedStart: state.startAt, plannedEnd: state.startAt };
    }
  }

  return {
    ...state,
    plan,
    lastSyncAt: remainingFromWallNow
  };
};

const syncFuturePlan = (state, fromWallNow) => {
  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.situations.length) return state;
  const tempState = syncPlan({ ...state, currentIndex: nextIndex }, fromWallNow);
  return {
    ...tempState,
    currentIndex: state.currentIndex
  };
};

const loadState = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        isConfigured: false,
        situations: [],
        currentIndex: 0,
        startAt: null,
        endAt: null,
        isPaused: false,
        pauseStartedAt: null,
        pausedProgressAt: null,
        plan: [],
        lastSyncAt: null,
        initialPauseMs: 0,
        initialPauseApplied: false
      };
    }

    const data = JSON.parse(raw);
    if (!data || !data.isConfigured || !Array.isArray(data.situations)) {
      return {
        isConfigured: false,
        situations: [],
        currentIndex: 0,
        startAt: null,
        endAt: null,
        isPaused: false,
        pauseStartedAt: null,
        pausedProgressAt: null,
        plan: [],
        lastSyncAt: null,
        initialPauseMs: 0,
        initialPauseApplied: false
      };
    }

    const plan =
      Array.isArray(data.plan) && data.plan.length === data.situations.length
        ? data.plan
        : new Array(data.situations.length).fill(null).map(() => ({ plannedStart: null, plannedEnd: null }));

    return {
      ...data,
      plan
    };
  } catch (error) {
    console.warn('Impossible de charger la session.', error);
    return {
      isConfigured: false,
      situations: [],
      currentIndex: 0,
      startAt: null,
      endAt: null,
      isPaused: false,
      pauseStartedAt: null,
      pausedProgressAt: null,
      plan: [],
      lastSyncAt: null,
      initialPauseMs: 0,
      initialPauseApplied: false
    };
  }
};

const getSliceStatus = (state, index, wallNow) => {
  const p = state.plan[index];
  if (!p || p.plannedStart == null || p.plannedEnd == null) {
    return { isPast: false, isActive: false, isFuture: true, progress: 0, remainingMs: 0, durationMs: 0 };
  }
  const duration = Math.max(0, p.plannedEnd - p.plannedStart);
  const progressNow = getProgressNow(state, wallNow);
  const remaining = Math.max(0, p.plannedEnd - progressNow);
  const isPast = progressNow >= p.plannedEnd;
  const isFuture = progressNow < p.plannedStart;
  const isActive = !isPast && !isFuture;

  let prog = 0;
  if (duration > 0) {
    prog = clamp(((progressNow - p.plannedStart) / duration) * 100, 0, 100);
  } else {
    prog = isPast ? 100 : 0;
  }

  return {
    isPast,
    isActive,
    isFuture,
    progress: prog,
    remainingMs: remaining,
    durationMs: duration
  };
};

const getTotalRemainingMs = (state, wallNow) => Math.max(0, state.endAt - wallNow);

const getSliceRemainingMs = (status) => {
  if (status.isPast) return 0;
  if (status.isFuture) return status.durationMs;
  return status.remainingMs;
};

export default function App() {
  const [timerState, setTimerState] = useState(loadState);
  const [wallNow, setWallNow] = useState(() => Date.now());
  const [showReset, setShowReset] = useState(false);
  const [deltaInfo, setDeltaInfo] = useState(null);
  const [configValues, setConfigValues] = useState({
    nb: 5,
    pauseMin: 0,
    end: ''
  });
  const deltaTimeoutRef = useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(timerState));
    } catch (error) {
      console.warn('Impossible de sauvegarder la session.', error);
    }
  }, [timerState]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setWallNow(now);
      setTimerState((prev) => {
        if (!prev.isConfigured) return prev;
        if (prev.isPaused) {
          const progressAnchor = prev.pausedProgressAt ?? now;
          return syncPlan(prev, progressAnchor, now);
        }
        const idx = prev.currentIndex;
        const p = prev.plan[idx];
        if (!p) return prev;
        if (now >= p.plannedEnd) {
          return syncFuturePlan(prev, now);
        }
        return prev;
      });
    }, 250);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => () => window.clearTimeout(deltaTimeoutRef.current), []);

  const showDelta = useCallback((deltaMs) => {
    if (deltaMs == null) return;
    const abs = Math.abs(deltaMs);
    const mm = Math.floor(abs / 60000);
    const ss = Math.floor((abs % 60000) / 1000);
    const sign = deltaMs < 0 ? -1 : 1;
    const label = `${pad2(mm)}:${pad2(ss)}`;

    let message = { tone: 'gray', label: "À l'heure" };
    if (sign < 0) {
      message = { tone: 'blue', label: `En avance : ${label}` };
    } else if (sign > 0) {
      message = { tone: 'red', label: `En retard : ${label}` };
    }

    setDeltaInfo(message);
    window.clearTimeout(deltaTimeoutRef.current);
    deltaTimeoutRef.current = window.setTimeout(() => setDeltaInfo(null), 2200);
  }, []);

  const handleLaunch = () => {
    const n = clamp(parseInt(configValues.nb || '5', 10) || 5, 1, 25);
    const pauseMin = clamp(parseInt(configValues.pauseMin || '0', 10) || 0, 0, 240);

    if (!configValues.end) return;

    const now = Date.now();
    const startAt = now;
    let endAt = parseTimeToToday(configValues.end);
    if (endAt <= now) endAt += 24 * 60 * 60 * 1000;

    const baseState = {
      isConfigured: true,
      situations: buildInitialSituations(n),
      currentIndex: 0,
      startAt,
      endAt,
      isPaused: false,
      pauseStartedAt: null,
      pausedProgressAt: null,
      plan: new Array(n).fill(null).map(() => ({ plannedStart: null, plannedEnd: null })),
      lastSyncAt: null,
      initialPauseMs: pauseMin * 60 * 1000,
      initialPauseApplied: false
    };

    const from = now;
    const nextState =
      baseState.initialPauseMs > 0 && !baseState.initialPauseApplied
        ? syncPlan({ ...baseState, initialPauseApplied: true }, from + baseState.initialPauseMs)
        : syncPlan(baseState, from);

    setTimerState(nextState);
  };

  const handleReset = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setTimerState({
      isConfigured: false,
      situations: [],
      currentIndex: 0,
      startAt: null,
      endAt: null,
      isPaused: false,
      pauseStartedAt: null,
      pausedProgressAt: null,
      plan: [],
      lastSyncAt: null,
      initialPauseMs: 0,
      initialPauseApplied: false
    });
    setShowReset(false);
  };

  const handlePauseToggle = () => {
    const now = Date.now();
    if (!timerState.isConfigured) return;

    if (timerState.isPaused) {
      setTimerState((prev) => syncPlan({
        ...prev,
        isPaused: false,
        pauseStartedAt: null,
        pausedProgressAt: null
      }, now));
    } else {
      setTimerState((prev) => ({
        ...prev,
        isPaused: true,
        pauseStartedAt: now,
        pausedProgressAt: now
      }));
    }
  };

  const jumpTo = (index) => {
    const now = Date.now();
    setTimerState((prev) => {
      const idx = clamp(index, 0, prev.situations.length - 1);
      const p = prev.plan[idx];
      const deltaMs = p && p.plannedStart != null ? now - p.plannedStart : null;
      showDelta(deltaMs);
      return syncPlan({ ...prev, currentIndex: idx }, now);
    });
  };

  const addSituation = () => {
    const now = Date.now();
    setTimerState((prev) => {
      const newId = Math.max(0, ...prev.situations.map((s) => s.id)) + 1;
      const nextSituations = [
        ...prev.situations,
        { id: newId, name: `Situation ${newId}`, color: COLORS[(newId - 1) % COLORS.length] }
      ];
      return syncPlan({ ...prev, situations: nextSituations }, now);
    });
  };

  const removeSituation = (id) => {
    const now = Date.now();
    setTimerState((prev) => {
      if (prev.situations.length <= 1) return prev;
      const idx = prev.situations.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const nextSituations = prev.situations.filter((s) => s.id !== id);
      let nextIndex = prev.currentIndex;
      if (nextIndex >= nextSituations.length) nextIndex = nextSituations.length - 1;
      if (idx < nextIndex) nextIndex = Math.max(0, nextIndex - 1);
      return syncPlan(
        {
          ...prev,
          situations: nextSituations,
          currentIndex: nextIndex,
          plan: new Array(nextSituations.length)
            .fill(null)
            .map(() => ({ plannedStart: null, plannedEnd: null }))
        },
        now
      );
    });
  };

  const updateSituationName = (id, value) => {
    setTimerState((prev) => ({
      ...prev,
      situations: prev.situations.map((s) => (s.id === id ? { ...s, name: value } : s))
    }));
  };

  const activeSlice = useMemo(() => {
    if (!timerState.isConfigured || timerState.situations.length === 0) return null;
    return timerState.situations[timerState.currentIndex] ?? null;
  }, [timerState]);

  const activeStatus = useMemo(() => {
    if (!timerState.isConfigured || !activeSlice) return null;
    return getSliceStatus(timerState, timerState.currentIndex, wallNow);
  }, [timerState, wallNow, activeSlice]);

  const plannedEnd = useMemo(() => {
    const p = timerState.plan[timerState.currentIndex];
    return p?.plannedEnd ?? null;
  }, [timerState]);

  const isFinished = timerState.isConfigured && wallNow >= timerState.endAt;
  const totalRemainingMs = timerState.isConfigured ? getTotalRemainingMs(timerState, wallNow) : 0;
  const totalDurationMs = timerState.isConfigured ? Math.max(1, timerState.endAt - timerState.startAt) : 1;
  const totalRemainingPct = clamp((totalRemainingMs / totalDurationMs) * 100, 0, 100);
  const totalDeltaMs = timerState.isConfigured && timerState.endAt ? wallNow - timerState.endAt : 0;
  const totalDeltaLabel =
    totalDeltaMs === 0
      ? "À l'heure"
      : totalDeltaMs > 0
        ? `Retard de ${formatDeltaMMSS(totalDeltaMs)}`
        : `Avance de ${formatDeltaMMSS(totalDeltaMs)}`;
  const totalDeltaTone = totalDeltaMs > 0 ? 'red' : totalDeltaMs < 0 ? 'blue' : 'gray';
  const currentDeltaMs = plannedEnd ? wallNow - plannedEnd : 0;
  const currentDeltaLabel =
    currentDeltaMs === 0
      ? "À l'heure"
      : currentDeltaMs > 0
        ? `Retard de ${formatDeltaMMSS(currentDeltaMs)}`
        : `Avance de ${formatDeltaMMSS(currentDeltaMs)}`;
  const currentDeltaTone = currentDeltaMs > 0 ? 'red' : currentDeltaMs < 0 ? 'blue' : 'gray';
  const overtimeMs =
    !timerState.isPaused && plannedEnd && wallNow > plannedEnd ? wallNow - plannedEnd : 0;

  const sliceSummaries = useMemo(() => {
    if (!timerState.isConfigured) return [];
    return timerState.situations.map((sit, index) => {
      const status = getSliceStatus(timerState, index, wallNow);
      return {
        id: sit.id,
        name: sit.name,
        color: sit.color,
        index,
        status,
        remainingMs: getSliceRemainingMs(status)
      };
    });
  }, [timerState, wallNow]);

  const totalRemainingSlicesMs = sliceSummaries.reduce((acc, item) => acc + item.remainingMs, 0);

  return (
    <div className="wrap">
      <div className="topbar">
        <div>
          <h1>Timer MICADO</h1>
          <div className="sub">Version robuste : fin fixe, pause = compression, recalcul propre</div>
        </div>
        <button type="button" className="btn-danger" onClick={() => setShowReset(true)}>
          🗑️ Nouvelle session
        </button>
      </div>

      {timerState.isConfigured && (
        <div className="hero-dashboard">
          <div className="mini-dashboard">
            <div className="stat-card emphasis">
              <div className="stat-label">Durée globale restante</div>
              <div className="stat-value mono">{formatMMSS(totalRemainingMs)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Retard / avance cumulée</div>
              <div className={`stat-value ${totalDeltaTone}`}>{totalDeltaLabel}</div>
            </div>
          </div>
          <div className="mini-dashboard secondary">
            <div className="stat-card flat">
              <div className="stat-label">Durée restante (situation)</div>
              <div className="stat-value mono">{formatMMSS(activeStatus?.remainingMs ?? 0)}</div>
            </div>
            <div className="stat-card flat">
              <div className="stat-label">Retard / avance (situation)</div>
              <div className={`stat-value ${currentDeltaTone}`}>{currentDeltaLabel}</div>
            </div>
          </div>
        </div>
      )}

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
              <div className="col">
                <label>Durée pause (min) (option)</label>
                <input
                  id="inpPauseMin"
                  type="number"
                  min="0"
                  max="240"
                  value={configValues.pauseMin}
                  onChange={(event) =>
                    setConfigValues((prev) => ({ ...prev, pauseMin: event.target.value }))
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

            <div className="sub">
              Règles : l’heure de fin est fixe. La pause n’allonge pas la réunion : elle compresse les
              situations restantes.
            </div>
          </div>
        </div>
      ) : (
        <div id="runView" className="grid">
          <div className="card">
            <div className="row-between">
              <div className="pill">
                <span
                  id="runState"
                  className={`badge ${isFinished ? 'red' : timerState.isPaused ? 'blue' : 'gray'}`}
                >
                  {isFinished ? 'TERMINÉ' : timerState.isPaused ? 'PAUSE' : 'EN COURS'}
                </span>
              </div>
              <div className="col" style={{ gap: '6px', alignItems: 'flex-end' }}>
                <div className="badge gray">
                  Fin : <span id="endLabel" className="mono">{formatHHMM(timerState.endAt)}</span>
                </div>
                <div className="badge gray">
                  Début : <span id="startLabel" className="mono">{formatHHMM(timerState.startAt)}</span>
                </div>
              </div>
            </div>

            <div className="hr"></div>

            <div className="col" style={{ gap: '10px' }}>
              <div className="row-between">
                <div className="badge gray">
                  Temps total restant :
                  <span id="totalRemaining" className="mono">{formatMMSS(totalRemainingMs)}</span>
                </div>
                <div className="badge gray">
                  Situations : <span id="nbLabel">{timerState.situations.length}</span>
                </div>
              </div>

              <div
                id="activeBox"
                className="card"
                style={{
                  boxShadow: 'none',
                  borderRadius: '18px',
                  border: '2px solid var(--b)',
                  padding: '12px',
                  background: '#fafafa'
                }}
              >
                {activeSlice && activeStatus ? (
                  <>
                    <div className="row-between" style={{ gap: '10px' }}>
                      <div className="row" style={{ gap: '10px' }}>
                        <div className="dot" style={{ background: activeSlice.color }}></div>
                        <div style={{ fontWeight: 1000 }}>{activeSlice.name}</div>
                      </div>
                      <div className="mono" style={{ fontWeight: 1000, color: activeSlice.color }}>
                        {formatMMSS(activeStatus.remainingMs)}
                      </div>
                    </div>
                    <div className="mini">
                      <span>
                        Fin prévue :
                        <span className="mono">{plannedEnd ? formatClock(plannedEnd) : '--:--:--'}</span>
                      </span>
                      <span>{activeStatus.progress.toFixed(0)}%</span>
                    </div>
                    <div className="bar">
                      <div style={{ width: `${activeStatus.progress}%`, background: activeSlice.color }}></div>
                    </div>
                    {deltaInfo && (
                      <div style={{ marginTop: '10px' }}>
                        <span className={`badge ${deltaInfo.tone}`}>{deltaInfo.label}</span>
                      </div>
                    )}
                    {overtimeMs > 0 && (
                      <div style={{ marginTop: '10px' }}>
                        <span className="badge red">Retard de {formatMMSS(overtimeMs)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="muted">Aucune situation active.</div>
                )}
              </div>

              <button type="button" className={timerState.isPaused ? 'btn-green' : 'btn-dark'} onClick={handlePauseToggle}>
                {timerState.isPaused ? '▶️ REPRENDRE' : '⏸️ PAUSE'}
              </button>

              <div className="row" style={{ gap: '10px' }}>
                <button
                  type="button"
                  className="btn-outline"
                  style={{ flex: 1 }}
                  onClick={() => jumpTo(timerState.currentIndex - 1)}
                  disabled={timerState.currentIndex === 0}
                >
                  ◀︎ Précédent
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  style={{ flex: 1 }}
                  onClick={() => jumpTo(timerState.currentIndex + 1)}
                  disabled={timerState.currentIndex === timerState.situations.length - 1}
                >
                  Suivant ▶︎
                </button>
              </div>

              <div className="sub">
                Navigation : si tu forces une situation, on affiche avance/retard et on recalcule proprement
                les durées restantes jusqu’à l’heure de fin.
              </div>

              <div className="hr"></div>

              <div className="col">
                <label>Mikado vertical (100% = durée totale)</label>
                <div className="mikado">
                  <div className="mikado-bar">
                    <div className="mikado-fill" style={{ height: `${totalRemainingPct}%` }}>
                      {sliceSummaries
                        .filter((item) => item.remainingMs > 0)
                        .map((item) => (
                          <div
                            key={item.id}
                            className="mikado-segment"
                            style={{
                              height: `${
                                totalRemainingSlicesMs > 0 ? (item.remainingMs / totalRemainingSlicesMs) * 100 : 0
                              }%`,
                              background: item.color
                            }}
                          ></div>
                        ))}
                    </div>
                  </div>
                  <div className="mikado-labels">
                    <div className="mikado-meta">
                      <span className="badge gray">Restant global</span>
                      <span className="mono">{totalRemainingPct.toFixed(0)}%</span>
                    </div>
                    {sliceSummaries.map((item) => (
                      <div key={item.id} className={`mikado-label${item.status.isPast ? ' past' : ''}`}>
                        <span className="dot" style={{ background: item.color }}></span>
                        <div className="mikado-label-text">
                          <span>{item.name}</span>
                          <span className="mono">{formatMMSS(item.remainingMs)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="row-between" style={{ marginBottom: '10px' }}>
              <div className="row" style={{ gap: '10px' }}>
                <span className="badge gray">📋 Liste</span>
                <span className="badge gray">
                  Actuel : <span id="idxLabel">{timerState.currentIndex + 1}/{timerState.situations.length}</span>
                </span>
              </div>
              <button type="button" className="btn-outline" onClick={addSituation}>+ Ajouter</button>
            </div>

            <div id="list" className="list">
              {timerState.situations.map((sit, index) => {
                const status = getSliceStatus(timerState, index, wallNow);
                const klass = `item${index === timerState.currentIndex ? ' active' : ''}${status.isPast ? ' past' : ''}`;
                const p2 = timerState.plan[index] || {};
                const startT = p2.plannedStart ? formatClock(p2.plannedStart) : '--:--:--';
                const endT = p2.plannedEnd ? formatClock(p2.plannedEnd) : '--:--:--';
                const remaining = status.isPast ? 0 : status.remainingMs;

                return (
                  <div
                    key={sit.id}
                    className={klass}
                    style={{
                      background: `${sit.color}10`,
                      borderColor: index === timerState.currentIndex ? sit.color : 'transparent'
                    }}
                  >
                    <div className="row" style={{ gap: '10px' }}>
                      <div className="dot" style={{ background: sit.color }}></div>
                      <input
                        data-name={sit.id}
                        type="text"
                        value={sit.name}
                        style={{ flex: 1, color: sit.color }}
                        onChange={(event) => updateSituationName(sit.id, event.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-outline"
                        style={{ padding: '8px 10px', borderRadius: '12px', fontWeight: 1000 }}
                        onClick={() => jumpTo(index)}
                      >
                        Aller
                      </button>
                      {timerState.situations.length > 1 && (
                        <button
                          type="button"
                          className="btn-outline"
                          style={{
                            padding: '8px 10px',
                            borderRadius: '12px',
                            fontWeight: 1000,
                            color: '#e11d48',
                            borderColor: '#fecaca'
                          }}
                          onClick={() => removeSituation(sit.id)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="mini">
                      <span className="mono">{startT} → {endT}</span>
                      <span className="mono" style={{ fontWeight: 1000, color: sit.color }}>
                        {formatMMSS(remaining)}
                      </span>
                    </div>
                    <div className="bar">
                      <div style={{ width: `${status.progress}%`, background: sit.color }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div id="modal" className={`modal ${showReset ? 'show' : ''}`}>
        <div className="box">
          <div style={{ fontWeight: 1000, fontSize: '18px', marginBottom: '6px' }}>Confirmer</div>
          <div className="muted" style={{ marginBottom: '14px' }}>
            Supprimer la session et repartir à zéro ?
          </div>
          <div className="row" style={{ gap: '10px' }}>
            <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setShowReset(false)}>
              Annuler
            </button>
            <button type="button" className="btn-danger" style={{ flex: 1 }} onClick={handleReset}>
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
