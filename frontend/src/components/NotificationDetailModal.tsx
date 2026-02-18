import React from 'react';
import { X } from 'lucide-react';
import { TagChip } from './DashboardPrimitives';

export type NotificationDetailModalData = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  type?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
};

export const NotificationDetailModal: React.FC<{
  open: boolean;
  notification: NotificationDetailModalData | null;
  onClose: () => void;
  actions?: React.ReactNode;
  details?: React.ReactNode;
}> = ({ open, notification, onClose, actions, details }) => {
  if (!open || !notification) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(2, 6, 23, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(780px, 100%)',
          maxHeight: 'min(85vh, 900px)',
          overflow: 'auto',
          borderRadius: 18,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: '0 30px 70px rgba(0,0,0,0.35)',
          padding: '1.1rem 1.15rem',
          color: 'var(--color-text-main)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '0.75rem',
            marginBottom: '0.85rem',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <TagChip label={notification.read ? 'Okundu' : 'Yeni'} tone={notification.read ? 'success' : 'warning'} />
            </div>
            <h3 style={{ margin: '0.55rem 0 0', fontSize: '1.1rem', fontWeight: 800 }}>
              {notification.title}
            </h3>
            <div style={{ marginTop: '0.35rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              {new Date(notification.createdAt).toLocaleString('tr-TR')}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {actions}
            <button type="button" className="ghost-btn" onClick={onClose} aria-label="Kapat">
              <X size={16} />
            </button>
          </div>
        </div>

        <div
          style={{
            padding: '0.85rem 0.9rem',
            borderRadius: 14,
            border: '1px solid var(--color-border-subtle)',
            background: 'var(--color-surface-soft)',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.5,
            fontSize: '0.95rem',
          }}
        >
          {notification.body}
        </div>

        {details ? <div style={{ marginTop: '0.85rem' }}>{details}</div> : null}
      </div>
    </div>
  );
};

