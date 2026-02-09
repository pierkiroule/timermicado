import { useEffect, useRef, useState } from 'react';

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
  const initialCount =
    typeof data.initialCount === 'number' && data.initialCount > 0
      ? data.initialCount
      : data.situations.length || 1;

  return {
    ...data,
    initialCount
  };
};

const loadState = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        isConfigured: false,
        situations: [],
        startAt: null,
        endAt: null,
        initialCount: null
      };
    }

    const data = JSON.parse(raw);
    if (!data || !data.isConfigured || !Array.isArray(data.situations)) {
      return {
        isConfigured: false,
        situations: [],
        startAt: null,
        endAt: null,
        initialCount: null
      };
    }

    return normalizeState(data);
  } catch (error) {
    console.warn('Impossible de charger la session.', error);
    return {
      isConfigured: false,
      situations: [],
      startAt: null,
      endAt: null,
      initialCount: null
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

const CompressionPie = ({ situations, endAt, wallNow }) => {
  const remainingGlobalMs = Math.max(0, endAt - wallNow);
  const remainingCount = situations.length;
  const anglePerSituation = remainingCount > 0 ? 360 / remainingCount : 0;

  const slices = [];
  let cursor = -90;

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

  return (
    <div className="compression-pie">
      <svg width="240" height="240" viewBox="0 0 240 240" role="img" aria-label="Répartition du temps">
        <circle cx="120" cy="120" r="108" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
        {slices.map((slice) => (
          <path key={slice.id} d={slice.path} fill={slice.color} opacity={slice.state === 'PAUSE' ? 0.55 : 1} />
        ))}
        <circle cx="120" cy="120" r="64" fill="#fff" stroke="#e2e8f0" strokeWidth="2" />
        <text x="120" y="112" textAnchor="middle" className="pie-label">
          Temps restant
        </text>
        <text x="120" y="138" textAnchor="middle" className="pie-value">
          {formatMMSS(remainingGlobalMs)}
        </text>
        {remainingCount === 0 && (
          <text x="120" y="164" textAnchor="middle" className="pie-sub">
            Aucune situation
          </text>
        )}
      </svg>
      <div className="pie-meta">
        <span className="badge gray">Temps restant : {formatMMSS(remainingGlobalMs)}</span>
        <span className="badge gray">Étapes en cours : {remainingCount}</span>
      </div>
    </div>
  );
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
      endAt,
      initialCount: n
    });
  };

  const handleReset = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setTimerState({
      isConfigured: false,
      situations: [],
      startAt: null,
      endAt: null,
      initialCount: null
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

  const remainingGlobalMs = timerState.isConfigured ? Math.max(0, timerState.endAt - wallNow) : 0;
  const isFinished = timerState.isConfigured && remainingGlobalMs === 0;

  return (
    <div className="wrap">
      <div className="topbar">
        <div>
          <h1>Timer MICADO</h1>
          <div className="sub">
            Un minuteur clair pour suivre vos étapes et garder le rythme.
          </div>
        </div>
        <button type="button" className="btn-danger" onClick={() => setShowReset(true)}>
          🗑️ Nouvelle session
        </button>
      </div>

      {!timerState.isConfigured ? (
        <div id="configView" className="card">
          <div className="col" style={{ gap: '12px' }}>
            <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>
              <div className="col">
                <label>Nombre d'étapes</label>
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
                <label>Heure de fin</label>
                <input
                  id="inpEnd"
                  type="time"
                  value={configValues.end}
                  onChange={(event) => setConfigValues((prev) => ({ ...prev, end: event.target.value }))}
                />
              </div>
            </div>

            <button type="button" className="btn-primary" onClick={handleLaunch}>
              🚀 Démarrer
            </button>

            <div className="sub">Choisissez une heure limite, puis laissez le tableau de bord vous guider.</div>
          </div>
        </div>
      ) : (
        <div id="runView" className="section-grid">
          <section className="section">
            <div className="section-head">
              <div>
                <h2>Tableau de bord</h2>
                <p className="sub">Gérez vos étapes et gardez la vue d'ensemble.</p>
              </div>
              <div className="pill">
                <span id="runState" className={`badge ${isFinished ? 'red' : 'gray'}`}>
                  {isFinished ? 'TERMINÉ' : 'EN COURS'}
                </span>
              </div>
            </div>
            <div className="card">
              <div className="row-between" style={{ marginBottom: '10px' }}>
                <div className="row" style={{ gap: '10px' }}>
                  <span className="badge gray">📋 Liste</span>
                  <span className="badge gray">
                    Étapes : <span id="nbLabel">{timerState.situations.length}</span>
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
                        <span className="badge gray">{sit.state === 'ACTIVE' ? 'EN COURS' : 'PAUSE'}</span>
                      </div>
                      <div className="row" style={{ gap: '10px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => toggleSituation(sit.id)}
                        >
                          {sit.state === 'ACTIVE' ? '⏸ Mettre en pause' : '▶️ Reprendre'}
                        </button>
                        <button
                          type="button"
                          className="btn-outline danger"
                          onClick={() => removeSituation(sit.id)}
                          disabled={timerState.situations.length <= 1}
                        >
                          ✕ Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <div>
                <h2>Camembert du temps</h2>
                <p className="sub">Une lecture simple pour savoir où vous en êtes.</p>
              </div>
            </div>
            <div className="card">
              <div className="col" style={{ gap: '12px' }}>
                <CompressionPie
                  situations={timerState.situations}
                  endAt={timerState.endAt}
                  wallNow={wallNow}
                />
              </div>
            </div>
          </section>
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
