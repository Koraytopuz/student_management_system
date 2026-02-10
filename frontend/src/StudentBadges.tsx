import React from 'react';
import {
  Award,
  ClipboardCheck,
  ClipboardList,
  Flame,
  Lock,
  Medal,
  PlayCircle,
  Star,
  Target,
} from 'lucide-react';
import type { StudentBadgeProgress } from './api';
import { GlassCard } from './components/DashboardPrimitives';

interface StudentBadgesTabProps {
  badges: StudentBadgeProgress[];
  loading: boolean;
  error?: string | null;
}

const formatCategory = (category: StudentBadgeProgress['category']) => {
  switch (category) {
    case 'questions_solved':
      return 'Çözülen Soru';
    case 'tests_completed':
      return 'Tamamlanan Test';
    case 'assignments_completed':
      return 'Tamamlanan Ödev';
    case 'content_watched':
      return 'Tamamlanan İçerik';
    case 'streak':
      return 'Seri';
    case 'mixed':
      return 'Karma';
    default:
      return category;
  }
};

const getBadgeIcon = (badge: StudentBadgeProgress, size: 'sm' | 'md' | 'lg', locked: boolean) => {
  const iconSize = size === 'lg' ? 34 : size === 'md' ? 26 : 18;

  if (locked) {
    return <Lock size={iconSize} color="#9ca3af" strokeWidth={2.1} />;
  }

  let strokeColor = '#10b981'; // emerald
  switch (badge.color) {
    case 'bronze':
      strokeColor = '#b45309';
      break;
    case 'silver':
      strokeColor = '#d1d5db';
      break;
    case 'gold':
      strokeColor = '#facc15';
      break;
    default:
      strokeColor = '#60a5fa';
  }

  let Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

  // Focus Zone rozetleri için Target ikonu
  if (badge.icon === 'target' || badge.code?.startsWith('focus_')) {
    Icon = Target;
  } else switch (badge.category) {
    case 'questions_solved':
      // Soru çözme: madalya + kitap hissi
      Icon = Medal;
      break;
    case 'tests_completed':
      // Test rozetleri: test listesi ikonu
      Icon = ClipboardList;
      break;
    case 'assignments_completed':
      // Ödev rozetleri: onaylı ödev ikonu
      Icon = ClipboardCheck;
      break;
    case 'content_watched':
      // Video / içerik rozetleri: oynat tuşu
      Icon = PlayCircle;
      break;
    case 'streak':
      // Seri rozetleri: alev ikonu
      Icon = Flame;
      break;
    case 'mixed':
      // Karma başarılar: yıldız / ödül
      Icon = Star;
      break;
    default:
      Icon = Award;
  }

  return <Icon size={iconSize} color={strokeColor} strokeWidth={2.1} />;
};

export const StudentBadgesTab: React.FC<StudentBadgesTabProps> = ({
  badges,
  loading,
  error,
}) => {
  const earned = badges.filter((b) => b.earned);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-400" />
          Rozetlerim
        </h2>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Çalışma performansına göre rozetler kazan, ilerlemeni takip et.
        </p>
      </div>

      <GlassCard className="p-4 space-y-4" title="Kazanılan Rozetler" subtitle="Başarıların">
        {loading && (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Rozetler yükleniyor...
          </p>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {!loading && !error && earned.length === 0 && (
          <div className="text-sm text-white/70">
            Henüz bir rozet kazanmadın. Çalışmaya devam ettikçe rozetler burada görünecek.
          </div>
        )}

        {!loading && !error && earned.length > 0 && (
          <div className="badge-grid">
            {earned.map((badge) => (
              <div key={badge.badgeId} className="badge-wrapper">
                <div
                  className={[
                    'badge-icon-circle',
                    badge.color === 'bronze'
                      ? 'badge-icon-circle--bronze'
                      : badge.color === 'silver'
                        ? 'badge-icon-circle--silver'
                        : badge.color === 'gold'
                          ? 'badge-icon-circle--gold'
                          : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {getBadgeIcon(badge, 'lg', false)}
                </div>

                {/* Tooltip – sadece hover'da detay */}
                <div className="badge-tooltip">
                  <strong>{badge.title}</strong>
                  <p>{badge.description}</p>
                  <p>
                    Kategori: <span>{formatCategory(badge.category)}</span>
                  </p>
                  <p>
                    Hedef:{' '}
                    <span>{badge.targetValue.toLocaleString('tr-TR')}</span>
                  </p>
                  {typeof badge.currentValue === 'number' && (
                    <p>
                      Şu an:{' '}
                      <span>{badge.currentValue.toLocaleString('tr-TR')}</span>
                    </p>
                  )}
                  <p>
                    İlerleme:{' '}
                    <span>
                      %
                      {Math.max(
                        0,
                        Math.min(100, Math.round(badge.progressPercent ?? 0)),
                      )}
                    </span>
                  </p>
                  {badge.earnedAt && (
                    <p className="badge-tooltip-meta">
                      Kazanılma:{' '}
                      {new Date(badge.earnedAt).toLocaleDateString('tr-TR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard
        className="p-4 space-y-4"
        title="Tüm Rozetler"
        subtitle="Almadığın rozetler için ilerlemeni takip et"
      >
        {loading && (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Rozetler yükleniyor, lütfen bekle...
          </p>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {!loading && !error && badges.length === 0 && (
          <div className="text-sm text-white/70">
            Henüz sistemde tanımlı rozet bulunmuyor.
          </div>
        )}

        {!loading && !error && badges.length > 0 && (
          <div className="badge-grid badge-grid-all">
            {badges.map((badge) => {
              const pct = badge.progressPercent ?? 0;
              const current = badge.currentValue ?? 0;
              const target = badge.targetValue || 1;

              return (
                <div key={badge.badgeId} className="badge-wrapper">
                  <div
                    className={[
                      'badge-icon-circle',
                      'badge-icon-circle-small',
                      badge.color === 'bronze'
                        ? 'badge-icon-circle--bronze'
                        : badge.color === 'silver'
                          ? 'badge-icon-circle--silver'
                          : badge.color === 'gold'
                            ? 'badge-icon-circle--gold'
                            : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {getBadgeIcon(badge, 'md', !badge.earned)}
                  </div>
                  <span className="badge-title">{badge.title}</span>

                  <div className="badge-tooltip">
                    <strong>{badge.title}</strong>
                    <p>{badge.description}</p>
                    <p>
                      Kategori: <span>{formatCategory(badge.category)}</span>
                    </p>
                    <p>
                      Hedef:{' '}
                      <span>{badge.targetValue.toLocaleString('tr-TR')}</span>
                    </p>
                    <p>
                      Şu an: <span>{current.toLocaleString('tr-TR')}</span>
                    </p>
                    <p>
                      İlerleme:{' '}
                      <span>
                        %{Math.max(0, Math.min(100, Math.round(pct)))}
                      </span>
                    </p>
                    {!badge.earned && (
                      <p className="badge-tooltip-meta">
                        Eksik: {Math.max(0, target - current).toLocaleString('tr-TR')}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
};

