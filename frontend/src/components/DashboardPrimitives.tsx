import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, LogOut, Menu } from 'lucide-react';

export type BreadcrumbItem = {
  label: string;
  onClick?: () => void;
};

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Varsayılan: 'slate'. Overlay'lerde 'light' kullanılabilir */
  variant?: 'default' | 'light';
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, variant = 'default' }) => {
  if (items.length === 0) return null;
  const isDark = variant === 'default';
  const sepColor = isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.7)';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const hoverColor = isDark ? '#e2e8f0' : '#475569';

  return (
    <nav
      className="breadcrumb"
      aria-label="Sayfa yolu"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        fontSize: '0.8rem',
        flexWrap: 'wrap',
      }}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const isClickable = !isLast && typeof item.onClick === 'function';
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <ChevronRight
                size={14}
                style={{ color: sepColor, flexShrink: 0 }}
                aria-hidden
              />
            )}
            {isClickable ? (
              <button
                type="button"
                onClick={item.onClick}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: textColor,
                  font: 'inherit',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = hoverColor;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = textColor;
                }}
              >
                {item.label}
              </button>
            ) : (
              <span style={{ color: isLast ? (isDark ? '#e2e8f0' : '#1e293b') : textColor, fontWeight: isLast ? 600 : 400 }}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

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
  /** Navigasyon breadcrumb'ı – örn. Ana Sayfa > Görevler */
  breadcrumbs?: BreadcrumbItem[];
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
  breadcrumbs,
  sidebarItems,
  user,
  headerActions,
  onLogout,
  children,
}) => {
  const highlightIndex = Math.max(brand.length - 4, 0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Menü öğesine tıklanınca mobilde sidebar'ı kapat
  const handleMenuClick = useCallback(
    (item: SidebarItem) => {
      item.onClick();
      closeSidebar();
    },
    [closeSidebar],
  );

  // Escape ile sidebar kapat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSidebar();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeSidebar]);

  // Geniş ekranda sidebar açıksa kapat (viewport değişirse)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)');
    const handler = () => {
      if (mq.matches) setSidebarOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div className={`dashboard-shell ${accentClass[accent]}`}>
      <button
        type="button"
        className="sidebar-hamburger"
        onClick={() => setSidebarOpen(true)}
        aria-label="Menüyü aç"
        aria-expanded={sidebarOpen}
      >
        <Menu size={24} />
      </button>

      <div
        className={`sidebar-overlay ${sidebarOpen ? 'sidebar-overlay--open' : ''}`}
        onClick={closeSidebar}
        onKeyDown={(e) => e.key === 'Enter' && closeSidebar()}
        role="button"
        tabIndex={-1}
        aria-hidden
      />

      <aside className={`dashboard-sidebar ${sidebarOpen ? 'dashboard-sidebar--open' : ''}`}>
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
              onClick={() => handleMenuClick(item)}
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
            {breadcrumbs && breadcrumbs.length > 0 && (
              <div style={{ marginBottom: '0.35rem' }}>
                <Breadcrumb items={breadcrumbs} />
              </div>
            )}
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
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const GlassCard: React.FC<GlassCardProps> = ({ title, subtitle, icon, actions, children, className }) => {
  return (
    <div className={`glass-card${className ? ` ${className}` : ''}`}>
      {(title || subtitle || actions) && (
        <div className="card-header">
          <div>
            {title && (
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {icon ? <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span> : null}
                <span>{title}</span>
              </h3>
            )}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
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
