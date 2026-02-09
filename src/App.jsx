import { useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'micado_timer_ultra_robust_v2';

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

const buildInitialSituations = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Situation ${i + 1}`,
    color: COLORS[i % COLORS.length],
    state: 'ACTIVE'
  }));

const loadState = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        isConfigured: false,
        situations: [],
        startAt: null,
        endAt: null
      };
    }

    const data = JSON.parse(raw);
    if (!data || !data.isConfigured || !Array.isArray(data.situations)) {
      return {
        isConfigured: false,
        situations: [],
        startAt: null,
        endAt: null
      };
    }

    return data;
  } catch (error) {
    console.warn('Impossible de charger la session.', error);
    return {
      isConfigured: false,
      situations: [],
      startAt: null,
      endAt: null
    };
  }
};

export default function App() {
  const [timerState, setTimerState] = useState(loadState);
  const [wallNow, setWallNow] = useState(() => Date.now());
  const [showReset, setShowReset] = useState(false);
  const [configValues, setConfigValues] = useState({
    nb: 5,
    end: ''
  });
  const tickRef = useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(timerState));
    } catch (error) {
      console.warn('Impossible de sauvegarder la session.', error);
    }
  }, [timerState]);

  useEffect(() => {
    tickRef.current = window.setInterval(() => {
      setWallNow(Date.now());
    }, 250);

    return () => window.clearInterval(tickRef.current);
  }, []);

  const handleLaunch = () => {
    const n = clamp(parseInt(configValues.nb || '5', 10) || 5, 1, 25);

    if (!configValues.end) return;

    const now = Date.now();
    let endAt = parseTimeToToday(configValues.end);
    if (endAt <= now) endAt += 24 * 60 * 60 * 1000;

    setTimerState({
      isConfigured: true,
      situations: buildInitialSituations(n),
      startAt: now,
      endAt
    });
  };

  const handleReset = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setTimerState({
      isConfigured: false,
      situations: [],
      startAt: null,
      endAt: null
    });
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

  const totalDurationMs = timerState.isConfigured
    ? Math.max(1, timerState.endAt - timerState.startAt)
    : 1;
  const remainingGlobalMs = timerState.isConfigured ? Math.max(0, timerState.endAt - wallNow) : 0;
  const remainingRatio = clamp(remainingGlobalMs / totalDurationMs, 0, 1);
  const remainingPct = remainingRatio * 100;

  const activeCount = useMemo(
    () => timerState.situations.filter((s) => s.state === 'ACTIVE').length,
    [timerState.situations]
  );

  const timePerActive = activeCount > 0 ? remainingGlobalMs / activeCount : 0;
  const isFinished = timerState.isConfigured && remainingGlobalMs === 0;

  return (
    <div className="wrap">
      <div className="topbar">
        <div>
          <h1>Timer MICADO</h1>
          <div className="sub">
            Le temps est global : toutes les situations se grignotent ensemble, pauses incluses.
          </div>
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
              <div className="stat-value mono">{formatMMSS(remainingGlobalMs)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Pourcentage restant</div>
              <div className="stat-value gray">{remainingPct.toFixed(0)}%</div>
            </div>
          </div>
          <div className="mini-dashboard secondary">
            <div className="stat-card flat">
              <div className="stat-label">Situations actives</div>
              <div className="stat-value mono">{activeCount}</div>
            </div>
            <div className="stat-card flat">
              <div className="stat-label">Temps par situation active</div>
              <div className="stat-value mono">{formatMMSS(timePerActive)}</div>
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

            <div className="col" style={{ gap: '12px' }}>
              {activeCount === 0 && (
                <div className="badge red">Aucune situation active</div>
              )}
              <div className="sub">
                Chaque barre se réduit en hauteur avec le temps global. Les situations en pause sont grisées
                mais continuent d’être grignotées.
              </div>
              <div className="mikado-stack">
                {timerState.situations.map((sit) => (
                  <div key={sit.id} className="mikado-row">
                    <div className="mikado-stick">
                      <div
                        className={`mikado-stick-fill ${sit.state === 'PAUSE' ? 'muted' : ''}`}
                        style={{
                          height: `${remainingPct}%`,
                          background: sit.color
                        }}
                      ></div>
                    </div>
                    <div className="mikado-info">
                      <div className="mikado-title">
                        <span className="dot" style={{ background: sit.color }}></span>
                        <input
                          data-name={sit.id}
                          type="text"
                          value={sit.name}
                          onChange={(event) => updateSituationName(sit.id, event.target.value)}
                        />
                      </div>
                      <div className="mikado-meta-row">
                        <span className="mono">
                          {sit.state === 'ACTIVE' ? formatMMSS(timePerActive) : 'Pause'}
                        </span>
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
                          disabled={timerState.situations.length <= 1}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
                  <div className="row" style={{ gap: '10px' }}>
                    <div className="dot" style={{ background: sit.color }}></div>
                    <div style={{ fontWeight: 800 }}>{sit.name}</div>
                    <span className="badge gray">{sit.state === 'ACTIVE' ? 'ACTIVE' : 'PAUSE'}</span>
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
