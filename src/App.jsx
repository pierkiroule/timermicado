import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  Play,
  Plus,
  Settings,
  SkipForward,
  Trash2,
  X
} from 'lucide-react';

const COMPLETED_INDEX = 999;
const STORAGE_KEY = 'timermicado-state-v1';

const defaultCases = [
  { name: 'Louis', type: 'pedo1' },
  { name: 'Iza', type: 'pedo1' },
  { name: 'Lou', type: 'pedo1' },
  { name: 'Zoé', type: 'pedo1' },
  { name: 'Noa', type: 'pedo1' },
  { name: 'Malo', type: 'pedo1' },
  { name: 'Jade', type: 'pedo1' },
  { name: 'Eli', type: 'pedo1' },
  { name: 'Tao', type: 'pedo2' },
  { name: 'Mia', type: 'pedo2' },
  { name: 'Léa', type: 'pedo2' },
  { name: 'Sami', type: 'pedo2' },
  { name: 'Noé', type: 'pedo2' },
  { name: 'Lina', type: 'pedo2' },
  { name: 'Éden', type: 'pedo2' }
].map((item) => ({
  id: crypto.randomUUID(),
  name: item.name,
  type: item.type,
  priority: 3,
  plannedSeconds: 0,
  completed: false,
  remainingAtCompletion: null
}));

const defaultState = {
  duration: 60,
  breakTime: 5,
  cases: defaultCases,
  activeIndex: -1,
  isRunning: false,
  totalSecondsLeft: 60 * 60,
  currentCaseSecondsLeft: 0
};

const calculateDurations = (config) => {
  const totalPoints = config.cases.reduce((acc, item) => acc + (item.priority || 3), 0);
  const availableSeconds = Math.max((config.duration - config.breakTime) * 60, 0);

  return config.cases.map((item) => ({
    ...item,
    plannedSeconds:
      totalPoints > 0
        ? Math.floor(((item.priority || 3) / totalPoints) * availableSeconds)
        : 0
  }));
};

const loadState = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        ...defaultState,
        cases: calculateDurations(defaultState)
      };
    }
    const parsed = JSON.parse(raw);
    const merged = {
      ...defaultState,
      ...parsed
    };
    merged.cases = calculateDurations(merged);
    return merged;
  } catch (error) {
    console.warn('Impossible de charger le dernier état.', error);
    return {
      ...defaultState,
      cases: calculateDurations(defaultState)
    };
  }
};

const formatTime = (seconds) => {
  const isNegative = seconds < 0;
  const absSeconds = Math.abs(seconds);
  const minutes = Math.floor(absSeconds / 60);
  const rest = absSeconds % 60;
  return `${isNegative ? '-' : ''}${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

export default function App() {
  const [meetingState, setMeetingState] = useState(loadState);
  const [showConfig, setShowConfig] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  );
  const timerRef = useRef(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meetingState));
  }, [meetingState]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (meetingState.isRunning && meetingState.activeIndex >= 0 && meetingState.activeIndex !== COMPLETED_INDEX) {
      timerRef.current = window.setInterval(() => {
        setMeetingState((prev) => ({
          ...prev,
          totalSecondsLeft: prev.totalSecondsLeft - 1,
          currentCaseSecondsLeft: prev.currentCaseSecondsLeft - 1
        }));
      }, 1000);
    } else {
      window.clearInterval(timerRef.current);
    }

    return () => window.clearInterval(timerRef.current);
  }, [meetingState.isRunning, meetingState.activeIndex]);

  const updateConfig = (updates) => {
    setMeetingState((prev) => {
      const nextState = { ...prev, ...updates };
      nextState.cases = calculateDurations(nextState);

      if (nextState.activeIndex === -1) {
        nextState.totalSecondsLeft = nextState.duration * 60;
        nextState.currentCaseSecondsLeft = 0;
      }

      return nextState;
    });
  };

  const handleBulkImport = () => {
    const names = bulkInput
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    if (names.length === 0) return;

    const newCases = names.map((name) => ({
      id: crypto.randomUUID(),
      name,
      type: 'pedo1',
      priority: 3,
      plannedSeconds: 0,
      completed: false,
      remainingAtCompletion: null
    }));

    updateConfig({ cases: [...meetingState.cases, ...newCases] });
    setBulkInput('');
  };

  const handleNextCase = (forcedIndex) => {
    setMeetingState((prev) => {
      const currentIndex = prev.activeIndex;
      const nextIndex = typeof forcedIndex === 'number' ? forcedIndex : currentIndex + 1;
      const updatedCases = [...prev.cases];

      if (currentIndex >= 0 && currentIndex < updatedCases.length) {
        updatedCases[currentIndex] = {
          ...updatedCases[currentIndex],
          completed: true,
          remainingAtCompletion: prev.currentCaseSecondsLeft
        };
      }

      if (nextIndex < updatedCases.length) {
        const nextCase = updatedCases[nextIndex];
        return {
          ...prev,
          cases: updatedCases,
          activeIndex: nextIndex,
          isRunning: true,
          currentCaseSecondsLeft: nextCase.plannedSeconds
        };
      }

      return {
        ...prev,
        cases: updatedCases,
        isRunning: false,
        activeIndex: COMPLETED_INDEX
      };
    });
  };

  const toggleTimer = () => {
    if (!meetingState.isRunning && meetingState.activeIndex === -1) {
      if (meetingState.cases.length === 0) return;
      handleNextCase(0);
      return;
    }

    updateConfig({ isRunning: !meetingState.isRunning });
  };

  const resetMeeting = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      window.setTimeout(() => setConfirmReset(false), 3000);
      return;
    }

    setMeetingState(defaultState);
    setShowConfig(false);
    setConfirmReset(false);
  };

  const exportToExcel = async () => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
    script.onload = () => {
      const data = meetingState.cases.map((item) => ({
        Patient: item.name,
        Priorité: item.priority,
        'Temps prévu (min)': Math.round(item.plannedSeconds / 60),
        Statut: item.completed ? 'Traité' : 'En attente',
        'Écart (sec)': item.remainingAtCompletion ?? 0
      }));

      const worksheet = window.XLSX.utils.json_to_sheet(data);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Synthèse staff');
      window.XLSX.writeFile(workbook, `Staff_MICADO_${new Date().toISOString().split('T')[0]}.xlsx`);
    };
    document.head.appendChild(script);
  };

  const progressPercent = useMemo(() => {
    if (meetingState.cases.length === 0) return 0;
    const completed = meetingState.cases.filter((item) => item.completed).length;
    return Math.round((completed / meetingState.cases.length) * 100);
  }, [meetingState.cases]);

  const groupedCases = useMemo(() => {
    return {
      pedo1: meetingState.cases.filter((item) => item.type !== 'pedo2'),
      pedo2: meetingState.cases.filter((item) => item.type === 'pedo2')
    };
  }, [meetingState.cases]);

  return (
    <div className="min-h-screen bg-[#fcfdfe] text-slate-900 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between mb-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-indigo-100 shadow-xl">
              <Clock size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-800">TIMER MICADO</h1>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">
                Pédopsychiatrie • Session Clinique
              </p>
            </div>
          </div>
          <div className="text-left md:text-right">
            <div className="text-[10px] font-black text-slate-300 uppercase tracking-wider mb-1">Total restant</div>
            <div
              className={`text-3xl font-mono font-bold ${
                meetingState.totalSecondsLeft < 300 ? 'text-rose-500' : 'text-slate-700'
              }`}
            >
              {formatTime(meetingState.totalSecondsLeft)}
            </div>
            <div className="text-[10px] font-black text-slate-300 uppercase tracking-wider mt-3">Heure actuelle</div>
            <div className="text-xl font-mono font-bold text-slate-500">{currentTime}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white rounded-[2.5rem] p-10 md:p-12 border border-slate-100 shadow-sm text-center relative overflow-hidden">
            {meetingState.activeIndex === COMPLETED_INDEX ? (
              <div className="py-10 animate-in fade-in duration-700">
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 size={40} className="text-green-500" />
                </div>
                <h2 className="text-4xl font-black text-slate-800 mb-3 tracking-tight">Staff complété !</h2>
                <p className="text-slate-500 mb-10 max-w-md mx-auto text-lg">
                  Toutes les situations cliniques ont été discutées. Exportez le compte-rendu pour votre
                  synthèse.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={exportToExcel}
                    className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    <Download size={20} /> Exporter le board Excel
                  </button>
                  <button
                    onClick={() => setShowConfig(true)}
                    className="inline-flex items-center justify-center gap-2 bg-slate-100 text-slate-600 px-8 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                  >
                    <Settings size={20} /> Nouvelle session
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="absolute top-8 left-8 flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      meetingState.isRunning ? 'bg-green-500 animate-pulse' : 'bg-slate-200'
                    }`}
                  ></div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                    {meetingState.isRunning ? 'Live monitoring' : 'Session en pause'}
                  </span>
                </div>

                <div className="mb-6">
                  <div className="h-10 flex items-center justify-center">
                    <p
                      className={`font-bold italic text-lg transition-colors duration-300 ${
                        meetingState.currentCaseSecondsLeft < 0 ? 'text-rose-500' : 'text-indigo-500'
                      }`}
                    >
                      {meetingState.currentCaseSecondsLeft < 0
                        ? '⚠️ Temps dépassé ! Concluons...'
                        : meetingState.currentCaseSecondsLeft < 60 && meetingState.activeIndex >= 0
                          ? '⏳ Dernière minute !'
                          : meetingState.activeIndex === -1
                            ? 'Prêt pour le staff ?'
                            : 'Discussion en cours'}
                    </p>
                  </div>
                  <h2 className="text-5xl md:text-6xl font-black text-slate-800 tracking-tight mt-4">
                    {meetingState.activeIndex >= 0
                      ? meetingState.cases[meetingState.activeIndex]?.name
                      : 'En attente'}
                  </h2>
                </div>

                <div
                  className={`text-[7rem] md:text-[9rem] font-mono font-black my-4 tracking-tighter leading-none transition-colors ${
                    meetingState.currentCaseSecondsLeft < 0 ? 'text-rose-500' : 'text-slate-800'
                  }`}
                >
                  {formatTime(meetingState.currentCaseSecondsLeft)}
                </div>

                <div className="flex flex-wrap justify-center gap-4 mt-12">
                  {!meetingState.isRunning && (
                    <button
                      onClick={toggleTimer}
                      className="flex items-center gap-3 px-10 md:px-12 py-5 rounded-[1.5rem] font-black text-lg md:text-xl transition-all shadow-xl bg-indigo-600 text-white shadow-indigo-50/50 hover:bg-indigo-700"
                    >
                      <Play size={28} /> {meetingState.activeIndex === -1 ? 'Démarrer' : 'Reprendre'}
                    </button>
                  )}

                  {meetingState.activeIndex >= 0 && meetingState.activeIndex !== COMPLETED_INDEX && (
                    <button
                      onClick={() => handleNextCase()}
                      className="flex items-center gap-3 bg-white text-slate-700 px-8 md:px-10 py-5 rounded-[1.5rem] font-black text-lg md:text-xl hover:bg-slate-50 transition-all border-2 border-slate-100 shadow-sm"
                    >
                      Suivant <SkipForward size={28} />
                    </button>
                  )}

                  <button
                    onClick={() => setShowConfig(true)}
                    className="p-5 bg-slate-50 text-slate-400 rounded-[1.5rem] hover:text-slate-600 hover:bg-slate-100 transition-all border border-slate-100"
                  >
                    <Settings size={28} />
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <ClipboardList size={16} className="text-indigo-400" /> Ordre du jour
                </h3>
                <span className="text-[10px] font-bold text-slate-300">{meetingState.cases.length} patients</span>
              </div>
              <div className="space-y-3 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                {meetingState.cases.length === 0 && (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-slate-400 text-sm font-medium">Aucun cas configuré</p>
                  </div>
                )}
                {meetingState.cases.length > 0 && (
                  <>
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-sky-500"></span>PEDO 1
                      </span>
                      <span>{groupedCases.pedo1.length}</span>
                    </div>
                    {groupedCases.pedo1.map((item) => {
                      const index = meetingState.cases.findIndex((entry) => entry.id === item.id);
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                            meetingState.activeIndex === index
                              ? 'bg-sky-50/60 border-sky-100'
                              : 'bg-white border-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${
                                item.completed ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {item.completed ? <CheckCircle2 size={18} /> : `P${item.priority}`}
                            </div>
                            <span
                              className={`font-bold text-lg ${
                                item.completed ? 'text-slate-300 line-through' : 'text-slate-700'
                              }`}
                            >
                              {item.name}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-mono font-bold text-slate-400">
                              {Math.floor(item.plannedSeconds / 60)}m
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 pt-3">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>PEDO 2
                      </span>
                      <span>{groupedCases.pedo2.length}</span>
                    </div>
                    {groupedCases.pedo2.map((item) => {
                      const index = meetingState.cases.findIndex((entry) => entry.id === item.id);
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                            meetingState.activeIndex === index
                              ? 'bg-emerald-50/60 border-emerald-100'
                              : 'bg-white border-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${
                                item.completed ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {item.completed ? <CheckCircle2 size={18} /> : `P${item.priority}`}
                            </div>
                            <span
                              className={`font-bold text-lg ${
                                item.completed ? 'text-slate-300 line-through' : 'text-slate-700'
                              }`}
                            >
                              {item.name}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-mono font-bold text-slate-400">
                              {Math.floor(item.plannedSeconds / 60)}m
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <BarChart3 size={16} className="text-indigo-400" /> Analyse en direct
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#f8f9ff] p-5 rounded-2xl border border-indigo-50">
                  <div className="text-[10px] font-black text-indigo-300 uppercase mb-1">Moyenne / cas</div>
                  <div className="text-3xl font-black text-slate-800">
                    {meetingState.cases.length
                      ? Math.round((meetingState.duration - meetingState.breakTime) / meetingState.cases.length)
                      : 0}
                    <span className="text-sm font-bold text-slate-400 ml-1">min</span>
                  </div>
                </div>
                <div className="bg-[#fff9f9] p-5 rounded-2xl border border-rose-50">
                  <div className="text-[10px] font-black text-rose-300 uppercase mb-1">Pause prévue</div>
                  <div className="text-3xl font-black text-slate-800">
                    {meetingState.breakTime} <span className="text-sm font-bold text-slate-400 ml-1">min</span>
                  </div>
                </div>
                <div className="bg-[#f8fff9] p-5 rounded-2xl border border-green-50 col-span-2">
                  <div className="flex justify-between items-end mb-2">
                    <div className="text-[10px] font-black text-green-400 uppercase">Progression staff</div>
                    <div className="text-sm font-black text-green-600">{progressPercent}%</div>
                  </div>
                  <div className="w-full h-3 bg-white rounded-full overflow-hidden border border-green-50">
                    <div
                      className="h-full bg-green-500 transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {showConfig && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 my-auto">
              <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                  <Settings className="text-indigo-600" size={28} /> Configuration
                </h2>
                <button
                  onClick={() => setShowConfig(false)}
                  className="bg-white text-slate-400 hover:text-rose-500 p-3 rounded-xl transition-all shadow-sm border border-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-10 space-y-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                      Durée staff (min)
                    </label>
                    <input
                      type="number"
                      value={meetingState.duration}
                      onChange={(event) => updateConfig({ duration: parseInt(event.target.value, 10) || 0 })}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:border-indigo-500 focus:bg-white outline-none font-bold text-xl transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                      Temps pause (min)
                    </label>
                    <input
                      type="number"
                      value={meetingState.breakTime}
                      onChange={(event) => updateConfig({ breakTime: parseInt(event.target.value, 10) || 0 })}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:border-indigo-500 focus:bg-white outline-none font-bold text-xl transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block flex justify-between">
                    <span>Import patients (1 par ligne)</span>
                    <span className="text-indigo-500">Rapide</span>
                  </label>
                  <textarea
                    value={bulkInput}
                    onChange={(event) => setBulkInput(event.target.value)}
                    placeholder="Nicolas\nInès\nThomas..."
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:border-indigo-500 focus:bg-white outline-none h-40 font-medium text-lg transition-all"
                  />
                  <button
                    onClick={handleBulkImport}
                    className="w-full bg-slate-800 text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 hover:bg-slate-700 transition-all shadow-lg"
                  >
                    <Plus size={20} /> Ajouter à la liste
                  </button>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    Cas à traiter &amp; priorités
                  </label>
                  <div className="space-y-3">
                    {meetingState.cases.map((item, index) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100 transition-all hover:bg-white hover:shadow-md group"
                      >
                        <div className="flex-1">
                          <div className="flex justify-between mb-3">
                            <span className="font-black text-slate-800 text-lg uppercase tracking-tight">
                              {item.name}
                            </span>
                            <span className="font-mono font-bold text-indigo-600">
                              {Math.floor(item.plannedSeconds / 60)} min
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-[10px] font-black text-slate-400 w-20">
                              Urgence P{item.priority}
                            </span>
                            <input
                              type="range"
                              min="1"
                              max="5"
                              value={item.priority}
                              onChange={(event) => {
                                const newCases = meetingState.cases.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, priority: parseInt(event.target.value, 10) }
                                    : entry
                                );
                                updateConfig({ cases: newCases });
                              }}
                              className="flex-1 h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const newCases = meetingState.cases.filter((_, idx) => idx !== index);
                            updateConfig({ cases: newCases });
                          }}
                          className="text-slate-200 hover:text-rose-500 p-3 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={22} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-10 border-t border-slate-100">
                  <button
                    onClick={resetMeeting}
                    className={`w-full py-5 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 ${
                      confirmReset
                        ? 'bg-rose-600 text-white shadow-rose-100'
                        : 'bg-rose-50 text-rose-600 hover:bg-rose-100 shadow-sm'
                    }`}
                  >
                    <AlertCircle size={22} />
                    {confirmReset ? "Cliquez pour confirmer l'effacement" : 'Réinitialiser la session'}
                  </button>
                </div>
              </div>

              <div className="p-8 bg-white border-t border-slate-50 flex gap-4">
                <button
                  onClick={() => setShowConfig(false)}
                  className="flex-1 bg-indigo-600 text-white py-5 rounded-[1.5rem] font-black text-xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all transform active:scale-[0.98]"
                >
                  Démarrer le staff
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
