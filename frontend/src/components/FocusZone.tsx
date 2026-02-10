import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  RotateCcw,
  CloudRain,
  Coffee,
  Music,
  Flame,
  Zap,
  Target,
  Sparkles,
  Plus,
  Minus,
} from 'lucide-react';

const DEFAULT_DURATION_MINUTES = 25;
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 60;
const DURATION_STEP = 5;
const XP_PER_SESSION = 50;
const XP_PER_LEVEL = 100; // Her level için gerekli XP

const FOCUS_LEVELS: { level: number; title: string }[] = [
  { level: 1, title: 'Acemi' },
  { level: 2, title: 'Çırak' },
  { level: 3, title: 'Uzman' },
  { level: 4, title: 'Usta' },
  { level: 5, title: 'Bilge' },
  { level: 6, title: 'Efsane' },
];

const getSoundUrl = (id: string) => {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
  return `${base}/sounds/${id}.mp3`;
};

// Telifsiz ses kaynakları - public/sounds/ klasöründeki dosyalar kullanılır
const AMBIENT_OPTIONS: Array<{
  id: string;
  label: string;
  icon: typeof CloudRain;
  url: string;
}> = [
  { id: 'rain', label: 'Yağmur', icon: CloudRain, url: getSoundUrl('rain') },
  { id: 'cafe', label: 'Kafe', icon: Coffee, url: getSoundUrl('cafe') },
  { id: 'lofi', label: 'Lo-Fi', icon: Music, url: getSoundUrl('lofi') },
];

const STORAGE_KEY = 'focus_zone_data';

type FocusZoneData = {
  totalXp: number;
  dailyStreak: number;
  lastCompletedDate: string | null;
};

function loadFocusData(): FocusZoneData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FocusZoneData;
      return {
        totalXp: parsed.totalXp ?? 0,
        dailyStreak: parsed.dailyStreak ?? 0,
        lastCompletedDate: parsed.lastCompletedDate ?? null,
      };
    }
  } catch {
    // ignore
  }
  return { totalXp: 0, dailyStreak: 0, lastCompletedDate: null };
}

function saveFocusData(data: FocusZoneData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function getLevelAndTitle(xp: number) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const capped = Math.min(level, FOCUS_LEVELS.length);
  const info = FOCUS_LEVELS[capped - 1] ?? FOCUS_LEVELS[0];
  const xpInLevel = xp % XP_PER_LEVEL;
  const progressPct = (xpInLevel / XP_PER_LEVEL) * 100;
  return { level: info.level, title: info.title, progressPct };
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const FocusZone: React.FC<{
  todoItems?: Array<{ id: string; title: string }>;
  token?: string | null;
  onXpEarned?: (xp: number) => void;
}> = ({ todoItems = [], onXpEarned }) => {
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const totalSeconds = durationMinutes * 60;
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [focusData, setFocusData] = useState<FocusZoneData>(loadFocusData);
  const [subject, setSubject] = useState('');
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [ambient, setAmbient] = useState<string | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevXpRef = useRef(focusData.totalXp);

  const { level, title, progressPct } = getLevelAndTitle(focusData.totalXp);
  const progress = totalSeconds > 0 ? 1 - secondsLeft / totalSeconds : 0;

  const completeSession = useCallback(() => {
    const newXp = focusData.totalXp + XP_PER_SESSION;
    const today = new Date().toISOString().slice(0, 10);

    let newStreak = focusData.dailyStreak;
    if (focusData.lastCompletedDate) {
      const last = new Date(focusData.lastCompletedDate);
      const diff = Math.floor((Date.now() - last.getTime()) / (24 * 60 * 60 * 1000));
      if (diff === 1) newStreak += 1;
      else if (diff > 1) newStreak = 1;
    } else {
      newStreak = 1;
    }

    const next = {
      totalXp: newXp,
      dailyStreak: newStreak,
      lastCompletedDate: today,
    };
    setFocusData(next);
    saveFocusData(next);
    onXpEarned?.(XP_PER_SESSION);

    // Level up kontrolü
    const prevLevel = Math.floor(prevXpRef.current / XP_PER_LEVEL) + 1;
    const currLevel = Math.floor(newXp / XP_PER_LEVEL) + 1;
    if (currLevel > prevLevel) setShowLevelUp(true);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 2500);
    setTimeout(() => setShowLevelUp(false), 3500);
    prevXpRef.current = newXp;

    setSecondsLeft(durationMinutes * 60);
    setIsRunning(false);
  }, [focusData.totalXp, focusData.dailyStreak, focusData.lastCompletedDate, onXpEarned, durationMinutes]);

  useEffect(() => {
    if (isRunning && secondsLeft > 0) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            completeSession();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, secondsLeft, completeSession]);

  const handlePlay = () => setIsRunning(true);
  const handlePause = () => setIsRunning(false);
  const handleReset = () => {
    setIsRunning(false);
    setSecondsLeft(durationMinutes * 60);
  };

  const handleDurationUp = () => {
    if (isRunning) return;
    setDurationMinutes((m) => Math.min(MAX_DURATION_MINUTES, m + DURATION_STEP));
  };
  const handleDurationDown = () => {
    if (isRunning) return;
    setDurationMinutes((m) => Math.max(MIN_DURATION_MINUTES, m - DURATION_STEP));
  };

  // Süre değişince (ve çalışmıyorken) timer'ı güncelle
  useEffect(() => {
    if (!isRunning) setSecondsLeft(durationMinutes * 60);
  }, [durationMinutes, isRunning]);

  // Ambient ses çalma
  useEffect(() => {
    const opt = AMBIENT_OPTIONS.find((a) => a.id === ambient);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (ambient && opt?.url) {
      const audio = new Audio(opt.url);
      audio.loop = true;
      audio.volume = 0.4;
      audioRef.current = audio;
      audio.play().catch(() => {});
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, [ambient]);

  const isDark = document.documentElement.dataset.theme === 'dark';

  return (
    <div
      className="focus-zone-page"
      style={{
        minHeight: 480,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Animated gradient background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: isDark
            ? 'radial-gradient(ellipse 120% 80% at 50% 0%, rgba(99,102,241,0.15), transparent 50%), radial-gradient(ellipse 80% 60% at 80% 100%, rgba(16,185,129,0.1), transparent 40%)'
            : 'radial-gradient(ellipse 120% 80% at 50% 0%, rgba(99,102,241,0.12), transparent 50%), radial-gradient(ellipse 80% 60% at 80% 100%, rgba(16,185,129,0.08), transparent 40%)',
          animation: 'focus-bg-pulse 12s ease-in-out infinite alternate',
          pointerEvents: 'none',
        }}
      />
      <style>{`
        @keyframes focus-bg-pulse {
          0% { opacity: 0.7; transform: scale(1); }
          100% { opacity: 1; transform: scale(1.05); }
        }
      `}</style>

      {/* Gamification header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div
            className="focus-stat-pill"
            style={{
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 12,
              padding: '0.5rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Zap size={18} color="#facc15" />
            <span style={{ fontWeight: 600 }}>Level {level}</span>
            <span style={{ opacity: 0.8 }}>— {title}</span>
          </div>
          <div
            className="focus-progress-track"
            style={{
              width: 120,
              height: 8,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.1)',
              overflow: 'hidden',
            }}
          >
            <motion.div
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, #4f46e5, #22c55e)',
                borderRadius: 999,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div
            className="focus-stat-pill"
            style={{
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 12,
              padding: '0.5rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Flame size={18} color="#f97316" />
            <span style={{ fontWeight: 600 }}>{focusData.dailyStreak}</span>
            <span style={{ opacity: 0.8, fontSize: '0.85rem' }}>gün seri</span>
          </div>
          <div
            className="focus-stat-pill"
            style={{
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 12,
              padding: '0.5rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Target size={18} color="#22c55e" />
            <span style={{ fontWeight: 600 }}>{focusData.totalXp} XP</span>
          </div>
        </div>
      </div>

      <div className="focus-zone-grid">
        {/* Sol panel - Görev seçimi */}
        <motion.div
          className="focus-panel"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 20,
            padding: '1.25rem',
          }}
        >
          <h3
            style={{
              margin: '0 0 1rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              opacity: 0.9,
            }}
          >
            Hangi derse çalışıyorsun?
          </h3>
          <input
            type="text"
            placeholder="Örn: Matematik - Türev"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{
              width: '100%',
              padding: '0.65rem 1rem',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(0,0,0,0.2)',
              color: 'inherit',
              fontSize: '0.95rem',
              marginBottom: '1rem',
            }}
          />
          {todoItems.length > 0 && (
            <>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', opacity: 0.8 }}>veya todo'dan seç:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {todoItems.slice(0, 5).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTodoId(selectedTodoId === t.id ? null : t.id)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: 10,
                      border: selectedTodoId === t.id ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.1)',
                      background: selectedTodoId === t.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                      color: 'inherit',
                      fontSize: '0.85rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </>
          )}
        </motion.div>

        {/* Merkez - Timer */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 360,
            position: 'relative',
          }}
        >
          <AnimatePresence>
            {showConfetti && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  overflow: 'hidden',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {[...Array(24)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
                    animate={{
                      opacity: 0,
                      scale: 1,
                      x: Math.cos((i / 24) * Math.PI * 2) * 120,
                      y: Math.sin((i / 24) * Math.PI * 2) * 120,
                    }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: ['#facc15', '#22c55e', '#4f46e5', '#f97316'][i % 4],
                      position: 'absolute',
                    }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showLevelUp && (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: 'spring', damping: 15 }}
                style={{
                  position: 'absolute',
                  top: '10%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'linear-gradient(135deg, #facc15, #f97316)',
                  padding: '0.75rem 1.5rem',
                  borderRadius: 16,
                  fontWeight: 800,
                  fontSize: '1.4rem',
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 20px 50px rgba(250,204,21,0.4)',
                }}
              >
                <Sparkles size={24} />
                Level Up!
              </motion.div>
            )}
          </AnimatePresence>

          {/* Progress Circle */}
          <motion.div
            style={{
              position: 'relative',
              width: 240,
              height: 240,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="240" height="240" viewBox="0 0 240 240" style={{ transform: 'rotate(-90deg)' }}>
              <circle
                className="focus-svg-bg"
                cx="120"
                cy="120"
                r="108"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="12"
              />
              <motion.circle
                cx="120"
                cy="120"
                r="108"
                fill="none"
                stroke="url(#focusGradient)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 108}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 108 }}
                animate={{
                  strokeDashoffset: 2 * Math.PI * 108 * (1 - progress),
                }}
                transition={{ duration: 0.5 }}
              />
              <defs>
                <linearGradient id="focusGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4f46e5" />
                  <stop offset="100%" stopColor="#22c55e" />
                </linearGradient>
              </defs>
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Süre ayarlama: +/- 5 dk */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  marginBottom: '0.5rem',
                }}
              >
                <motion.button
                  type="button"
                  className="focus-duration-btn"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleDurationDown}
                  disabled={isRunning || durationMinutes <= MIN_DURATION_MINUTES}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.3)',
                    background: 'rgba(255,255,255,0.08)',
                    color: 'inherit',
                    cursor: isRunning || durationMinutes <= MIN_DURATION_MINUTES ? 'default' : 'pointer',
                    opacity: isRunning || durationMinutes <= MIN_DURATION_MINUTES ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Minus size={20} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                </motion.button>
                <span className="focus-duration-label" style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: 48, textAlign: 'center' }}>
                  {durationMinutes} dk
                </span>
                <motion.button
                  type="button"
                  className="focus-duration-btn"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleDurationUp}
                  disabled={isRunning || durationMinutes >= MAX_DURATION_MINUTES}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.3)',
                    background: 'rgba(255,255,255,0.08)',
                    color: 'inherit',
                    cursor: isRunning || durationMinutes >= MAX_DURATION_MINUTES ? 'default' : 'pointer',
                    opacity: isRunning || durationMinutes >= MAX_DURATION_MINUTES ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Plus size={20} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                </motion.button>
              </div>
              <motion.span
                key={secondsLeft}
                className="focus-timer-text"
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                style={{
                  fontSize: '3.2rem',
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0.02em',
                }}
              >
                {formatTime(secondsLeft)}
              </motion.span>
              <span className="focus-timer-sub" style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '0.25rem' }}>
                {isRunning ? 'Odaklan...' : 'Hazır mısın?'}
              </span>
            </div>
          </motion.div>

          {/* Controls */}
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              marginTop: '1.5rem',
              alignItems: 'center',
            }}
          >
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handlePlay}
              disabled={isRunning}
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                border: 'none',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: 'white',
                cursor: isRunning ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isRunning ? 0.6 : 1,
                boxShadow: '0 12px 28px rgba(34,197,94,0.4)',
              }}
            >
              <Play size={24} strokeWidth={3} style={{ marginLeft: 2 }} />
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handlePause}
              disabled={!isRunning}
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                border: 'none',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: 'white',
                cursor: !isRunning ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !isRunning ? 0.6 : 1,
                boxShadow: '0 12px 28px rgba(245,158,11,0.4)',
              }}
            >
              <Pause size={24} strokeWidth={3} />
            </motion.button>
            <motion.button
              type="button"
              className="focus-reset-btn"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleReset}
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                border: '1px solid rgba(71,85,105,0.5)',
                background: 'linear-gradient(135deg, #475569, #334155)',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 20px rgba(71,85,105,0.35)',
              }}
            >
              <RotateCcw size={22} strokeWidth={2.5} />
            </motion.button>
          </div>
        </div>

        {/* Sağ panel - Ambient */}
        <motion.div
          className="focus-panel"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 20,
            padding: '1.25rem',
          }}
        >
          <h3
            style={{
              margin: '0 0 1rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              opacity: 0.9,
            }}
          >
            Ambient Mode
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {AMBIENT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = ambient === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className="focus-ambient-btn"
                  data-active={active ? 'true' : 'false'}
                  onClick={() => setAmbient(active ? null : opt.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.65rem 1rem',
                    borderRadius: 12,
                    border: active ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)',
                    background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                  }}
                >
                  <Icon size={20} opacity={active ? 1 : 0.7} />
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p style={{ margin: '1rem 0 0', fontSize: '0.75rem', opacity: 0.6 }}>
            Sesler döngü halinde çalınır • Telifsiz kaynaklar
          </p>
        </motion.div>
      </div>

      {/* XP hint */}
      <div
        className="focus-xp-hint"
        style={{
          marginTop: '1.5rem',
          textAlign: 'center',
          fontSize: '0.85rem',
          opacity: 0.8,
          position: 'relative',
          zIndex: 1,
        }}
      >
        Her 25 dakika tamamlandığında <strong style={{ color: '#22c55e' }}>+50 XP</strong> kazanırsın
      </div>
    </div>
  );
};
