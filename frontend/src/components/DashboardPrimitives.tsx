import React from 'react';
import { LogOut } from 'lucide-react';

export type SidebarItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
  badge?: string | number;
  active?: boolean;
  onClick: () => void;
};

export type UserPersona = {
  initials: string;
  name: string;
  subtitle: string;
};

export type StatusMeta = {
  label: string;
  tone?: 'success' | 'warning' | 'neutral';
};

type Accent = 'emerald' | 'indigo' | 'slate';

const accentClass: Record<Accent, string> = {
  emerald: 'accent-emerald',
  indigo: 'accent-indigo',
  slate: 'accent-slate',
};

export interface DashboardLayoutProps {
  accent?: Accent;
  brand?: string;
  tagline?: string;
  title: string;
  subtitle?: string;
  status?: StatusMeta;
  sidebarItems: SidebarItem[];
  user: UserPersona;
  headerActions?: React.ReactNode;
  onLogout: () => void;
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  accent = 'emerald',
  brand = 'AKADEMİPLUS',
  tagline,
  title,
  subtitle,
  status,
  sidebarItems,
  user,
  headerActions,
  onLogout,
  children,
}) => {
  const highlightIndex = Math.max(brand.length - 4, 0);
  return (
    <div className={`dashboard-shell ${accentClass[accent]}`}>
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">Skytech</p>
          <h1>
            {brand.slice(0, highlightIndex)}
            <span>{brand.slice(highlightIndex)}</span>
          </h1>
        </div>

        <nav className="sidebar-menu">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={`menu-item${item.active ? ' active' : ''}`}
            >
              <div className="menu-item-icon">{item.icon}</div>
              <div>
                <span className="menu-item-label">{item.label}</span>
                {item.description && <span className="menu-item-desc">{item.description}</span>}
              </div>
              {item.badge !== undefined && item.badge !== null && (
                <span className="menu-item-badge">{item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <button type="button" className="sidebar-logout" onClick={onLogout}>
          <LogOut size={16} /> Çıkış Yap
        </button>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-header">
          <div>
            {tagline && <span className="eyebrow">{tagline}</span>}
            <div className="header-title-row">
              <h1>{title}</h1>
              {status && <span className={`status-pill ${status.tone ?? 'neutral'}`}>{status.label}</span>}
            </div>
            {subtitle && <p>{subtitle}</p>}
          </div>

          <div className="dashboard-user">
            {headerActions}
            <div className="user-avatar">{user.initials}</div>
            <div className="user-meta">
              <strong>{user.name}</strong>
              <span>{user.subtitle}</span>
            </div>
          </div>
        </header>

        <div className="dashboard-content">{children}</div>
      </section>
    </div>
  );
};

type TrendTone = 'positive' | 'negative' | 'neutral';

export interface MetricCardProps {
  label: string;
  value: string;
  helper?: string;
  trendLabel?: string;
  trendTone?: TrendTone;
  children?: React.ReactNode;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  helper,
  trendLabel,
  trendTone = 'neutral',
  children,
}) => {
  const trendClass =
    trendTone === 'positive' ? 'metric-trend' : trendTone === 'negative' ? 'metric-trend negative' : 'metric-trend';

  return (
    <div className="metric-card">
      <h3>{label}</h3>
      <p className="metric-value">{value}</p>
      {helper && <p className="card-subtitle">{helper}</p>}
      {trendLabel && <p className={trendClass}>{trendLabel}</p>}
      {children}
    </div>
  );
};

export interface GlassCardProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const GlassCard: React.FC<GlassCardProps> = ({ title, subtitle, actions, children }) => {
  return (
    <div className="glass-card">
      <div className="card-header">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="card-actions">{actions}</div>}
      </div>
      {children}
    </div>
  );
};

export const TagChip: React.FC<{ label: string; tone?: 'success' | 'warning' | 'info' }> = ({
  label,
  tone = 'info',
}) => {
  const toneClass = tone === 'success' ? 'tag-chip success' : tone === 'warning' ? 'tag-chip warning' : 'tag-chip';
  return <span className={toneClass}>{label}</span>;
};
