import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, LogOut, Menu } from 'lucide-react';
import { useDashboardSidebar } from '../DashboardSidebarContext';

export type BreadcrumbItem = {
  label: string;
  onClick?: () => void;
};

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Varsayılan: 'slate'. Overlay'lerde 'light' kullanılabilir */
  variant?: 'default' | 'light';
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => {
  if (items.length === 0) return null;

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
                className="breadcrumb-sep"
                aria-hidden
              />
            )}
            {isClickable ? (
              <button type="button" onClick={item.onClick} className="breadcrumb-link">
                {item.label}
              </button>
            ) : (
              <span className={isLast ? 'breadcrumb-current' : 'breadcrumb-text'}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export type SidebarSubItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
  active?: boolean;
  onClick: () => void;
};

export type SidebarItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
  badge?: string | number;
  active?: boolean;
  onClick?: () => void;
  /** Alt menü öğeleri – varsa accordion olarak render edilir */
  children?: SidebarSubItem[];
};

export type UserPersona = {
  initials: string;
  name: string;
  subtitle: string;
  profilePictureUrl?: string; // Add this
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
  /** Varsa sidebar başlığında vurgulu gösterilir (örn. "Analiz"); yoksa brand sondan 4 karakter vurgulanır */
  brandSuffix?: string;
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
  brandSuffix,
  tagline: _tagline,
  title,
  subtitle: _subtitle,
  status,
  breadcrumbs,
  sidebarItems,
  user,
  headerActions,
  onLogout,
  children,
}) => {
  const highlightIndex = Math.max(brand.length - 4, 0);
  const sidebarCtx = useDashboardSidebar();
  const [localOverlayOpen, setLocalOverlayOpen] = useState(false);

  const sidebarOpen = sidebarCtx?.isOverlayOpen ?? localOverlayOpen;
  const isSidebarExpanded = sidebarCtx?.isExpanded ?? true;
  const isMobile = sidebarCtx?.isMobile ?? false;
  const closeSidebar = sidebarCtx?.closeOverlay ?? (() => setLocalOverlayOpen(false));
  const toggleSidebarExpanded = sidebarCtx?.toggleExpanded ?? (() => {});

  // Menü öğesine tıklanınca mobilde overlay sidebar'ı kapat
  const handleMenuClick = useCallback(
    (item: { onClick: () => void }) => {
      item.onClick();
      closeSidebar();
    },
    [closeSidebar],
  );

  // Escape ile mobil overlay kapat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSidebar();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeSidebar]);

  const sidebarCollapsed = !isSidebarExpanded && !isMobile;
  const [expandedAccordions, setExpandedAccordions] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    sidebarItems.forEach((item) => {
      if (item.children?.some((c) => c.active)) ids.add(item.id);
    });
    return ids;
  });

  useEffect(() => {
    sidebarItems.forEach((item) => {
      if (item.children?.some((c) => c.active)) {
        setExpandedAccordions((prev) => (prev.has(item.id) ? prev : new Set(prev).add(item.id)));
      }
    });
  }, [sidebarItems]);

  const toggleAccordion = useCallback((id: string) => {
    setExpandedAccordions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCategoryClick = useCallback(
    (itemId: string) => {
      if (sidebarCollapsed && sidebarCtx?.toggleExpanded) {
        sidebarCtx.toggleExpanded();
      }
      if (isMobile && !sidebarCtx?.isExpanded && sidebarCtx?.toggleExpanded) {
        sidebarCtx.toggleExpanded();
      }
      toggleAccordion(itemId);
    },
    [sidebarCollapsed, isMobile, sidebarCtx, toggleAccordion],
  );
  const sidebarClasses = [
    'dashboard-sidebar',
    sidebarOpen ? 'dashboard-sidebar--open' : '',
    sidebarCollapsed ? 'dashboard-sidebar--collapsed' : '',
    isMobile ? 'dashboard-sidebar--mobile' : '',
  ].filter(Boolean).join(' ');

  const shellClasses = [
    'dashboard-shell',
    accentClass[accent],
    sidebarCollapsed ? 'dashboard-shell--sidebar-collapsed' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={shellClasses}>
      {/* Mobil: Floating hamburger – overlay açmak için (topbar’da da hamburger var, bu yedek) */}
      <div
        className={`sidebar-overlay ${sidebarOpen && isMobile ? 'sidebar-overlay--open' : ''}`}
        onClick={closeSidebar}
        onKeyDown={(e) => e.key === 'Enter' && closeSidebar()}
        role="button"
        tabIndex={-1}
        aria-hidden
      />

      <aside className={sidebarClasses}>
        <div className="sidebar-header-row">
          <div className="sidebar-brand">
            <h1 className="sidebar-brand-title">
              {brandSuffix != null ? brand : brand.slice(0, highlightIndex)}
              {brandSuffix != null ? (
                <span className="sidebar-brand-highlight">{brandSuffix}</span>
              ) : (
                <span>{brand.slice(highlightIndex)}</span>
              )}
            </h1>
          </div>
          {/* Desktop: Toggle collapsed/expanded */}
          {!isMobile && (
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={toggleSidebarExpanded}
              aria-label={isSidebarExpanded ? 'Menüyü daralt' : 'Menüyü genişlet'}
              aria-expanded={isSidebarExpanded}
            >
              {isSidebarExpanded ? (
                <ChevronLeft size={20} strokeWidth={2} />
              ) : (
                <Menu size={22} strokeWidth={2} aria-hidden />
              )}
            </button>
          )}
        </div>

        <div className="sidebar-menu-scroll">
          <nav className="sidebar-menu">
          {sidebarItems.map((item) =>
            item.children && item.children.length > 0 ? (
              <div key={item.id} className="menu-accordion-wrapper">
                <div className="menu-item-wrapper">
                  <button
                    type="button"
                    onClick={() => handleCategoryClick(item.id)}
                    className={`menu-item menu-item-category${item.active || item.children.some((c) => c.active) ? ' active' : ''}`}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <div className="menu-item-icon">{item.icon}</div>
                    <div className="menu-item-text">
                      <span className="menu-item-label">{item.label}</span>
                    </div>
                  </button>
                  {sidebarCollapsed && (
                    <span className="menu-item-tooltip" role="tooltip">
                      {item.label}
                    </span>
                  )}
                </div>
                <div className={`menu-accordion-content${expandedAccordions.has(item.id) ? ' menu-accordion-content--open' : ''}`}>
                  <div className="menu-accordion-inner">
                  {item.children.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => handleMenuClick(sub)}
                      className={`menu-item menu-item-sub${sub.active ? ' active' : ''}`}
                    >
                      <div className="menu-item-icon menu-item-icon-sub">{sub.icon}</div>
                      <div className="menu-item-text">
                        <span className="menu-item-label">{sub.label}</span>
                      </div>
                    </button>
                  ))}
                  </div>
                </div>
              </div>
            ) : (
              <div key={item.id} className="menu-item-wrapper">
                <button
                  type="button"
                  onClick={() => item.onClick && handleMenuClick({ onClick: item.onClick })}
                  className={`menu-item${item.active ? ' active' : ''}`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <div className="menu-item-icon">{item.icon}</div>
                  <div className="menu-item-text">
                    <span className="menu-item-label">{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge !== null && !sidebarCollapsed && (
                    <span className="menu-item-badge">{item.badge}</span>
                  )}
                </button>
                {sidebarCollapsed && (
                  <span className="menu-item-tooltip" role="tooltip">
                    {item.label}
                  </span>
                )}
              </div>
            )
          )}
          </nav>
        </div>

        <button
          type="button"
          className="sidebar-logout"
          onClick={onLogout}
          title={sidebarCollapsed ? 'Çıkış Yap' : undefined}
        >
          <LogOut size={16} />
          {!sidebarCollapsed && <span>Çıkış Yap</span>}
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
            <div className="header-title-row">
              <h1>{title}</h1>
              {status && <span className={`status-pill ${status.tone ?? 'neutral'}`}>{status.label}</span>}
            </div>
          </div>

          <div className="dashboard-user">
            {headerActions}
            {user.profilePictureUrl ? (
              <img
                src={user.profilePictureUrl}
                alt={user.name}
                style={{
                  width: '3rem',
                  height: '3rem',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid var(--glass-border)',
                }}
              />
            ) : (
              <div className="user-avatar">{user.initials}</div>
            )}
            <div className="user-meta">
              <strong>{user.name}</strong>
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
