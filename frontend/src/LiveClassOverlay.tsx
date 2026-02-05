import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  useParticipants,
  useDataChannel,
  useLocalParticipant,
} from '@livekit/components-react';
import '@livekit/components-styles';
import type { Participant } from 'livekit-client';

type LiveClassOverlayProps = {
  url: string;
  token: string;
  title?: string;
  role?: 'teacher' | 'student';
  onClose: () => void;
};

type Toast = {
  id: number;
  message: string;
};

type ControlMessageType =
  | 'screen_request'
  | 'screen_approved'
  | 'screen_denied'
  | 'hand_raise'
  | 'hand_lower'
  | 'chat';

type ControlMessage = {
  type: ControlMessageType;
  fromId: string;
  fromName?: string;
  targetId?: string;
  payload?: unknown;
  ts?: number;
};

type ChatMessage = {
  id: number;
  fromId: string;
  fromName: string;
  text: string;
  ts: number;
};

const ParticipantOverlay: React.FC<{ role?: 'teacher' | 'student' }> = ({ role }) => {
  const participants = useParticipants();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastParticipantsRef = useRef<Map<string, string>>(new Map());

  // Katılımcı giriş/çıkışlarını takip et
  useEffect(() => {
    const current = new Map<string, string>();
    (participants as Participant[]).forEach((p) => {
      const id = p.identity || p.sid;
      if (!id) return;
      if (p.isLocal) return; // sadece uzaktakileri bildir
      const name = p.name || p.identity || 'Bir katılımcı';
      current.set(id, name);
    });

    const prev = lastParticipantsRef.current;

    const joined: string[] = [];
    const left: string[] = [];

    current.forEach((_name, id) => {
      if (!prev.has(id)) joined.push(id);
    });
    prev.forEach((_name, id) => {
      if (!current.has(id)) left.push(id);
    });

    if (joined.length || left.length) {
      setToasts((prevToasts) => {
        const next = [...prevToasts];

        joined.forEach((id) => {
          const name = current.get(id) ?? 'Bir katılımcı';
          const toastId = Date.now() + Math.random();
          next.push({ id: toastId, message: `${name} katıldı` });
          setTimeout(() => {
            setToasts((inner) => inner.filter((t) => t.id !== toastId));
          }, 3500);
        });

        left.forEach((id) => {
          const name = prev.get(id) ?? 'Bir katılımcı';
          const toastId = Date.now() + Math.random();
          next.push({ id: toastId, message: `${name} ayrıldı` });
          setTimeout(() => {
            setToasts((inner) => inner.filter((t) => t.id !== toastId));
          }, 3500);
        });

        // Son 4 bildirimi tut
        return next.slice(-4);
      });
    }

    lastParticipantsRef.current = current;
  }, [participants]);

  const remoteParticipants = useMemo(
    () =>
      (participants as Participant[]).filter((p) => !p.isLocal && (p.identity || p.name)).map((p) => ({
        id: p.identity || p.sid,
        name: p.name || p.identity || 'Katılımcı',
      })),
    [participants],
  );

  return (
    <>
      {/* Katılımcı listesi – sadece öğretmen için */}
      {role === 'teacher' && remoteParticipants.length > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 16,
            top: 64,
            maxWidth: 220,
            padding: '0.6rem 0.75rem',
            borderRadius: 14,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-subtle)',
            boxShadow: 'var(--shadow-soft)',
            fontSize: '0.8rem',
            color: 'var(--color-text-main)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.3rem',
            }}
          >
            <span style={{ opacity: 0.8, textTransform: 'uppercase', fontSize: '0.7rem' }}>
              Katılımcılar
            </span>
            <span
              style={{
                padding: '0.1rem 0.45rem',
                borderRadius: 999,
                background: 'rgba(22,163,74,0.12)',
                color: '#15803d',
                fontSize: '0.7rem',
              }}
            >
              {remoteParticipants.length}
            </span>
          </div>
          <div style={{ maxHeight: 140, overflow: 'auto', display: 'grid', gap: '0.25rem' }}>
            {remoteParticipants.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.2rem 0.45rem',
                  borderRadius: 999,
                  background: 'var(--list-row-bg)',
                  border: '1px solid var(--list-row-border)',
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '999px',
                    background: 'rgba(37,99,235,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                  }}
                >
                  {p.name.charAt(0).toUpperCase()}
                </span>
                <span>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Katılımcı bildirimleri */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 16,
            bottom: 80,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            pointerEvents: 'none',
          }}
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              style={{
                pointerEvents: 'none',
                padding: '0.45rem 0.8rem',
                borderRadius: 999,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border-subtle)',
                    color: 'var(--color-text-main)',
                fontSize: '0.8rem',
                    boxShadow: 'var(--shadow-soft)',
              }}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export const LiveClassOverlay: React.FC<LiveClassOverlayProps> = ({
  url,
  token,
  title,
  role,
  onClose,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
    };
  }, []);

  const handleToggleFullscreen = () => {
    const el = rootRef.current;
    if (!el) return;

    if (!document.fullscreenElement) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div
      ref={rootRef}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.35)',
        backdropFilter: 'blur(12px)',
        zIndex: 2147483647, // her şeyin üstünde dursun
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: isFullscreen ? 0 : '0.25rem',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1280,
          height: '100%',
          maxHeight: '100vh',
          background: 'var(--panel-surface)',
          borderRadius: isFullscreen ? 0 : 20,
          boxShadow: isFullscreen ? 'none' : 'var(--shadow-strong)',
          border: '1px solid var(--panel-border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--glass-border)',
            background: 'var(--glass-bg)',
            color: 'var(--color-text-main)',
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7, textTransform: 'uppercase' }}>
              Canlı Ders
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
              {title ?? 'Canlı sınıf oturumu'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleToggleFullscreen}
              className="ghost-btn"
              style={{
                border: '1px solid var(--color-border-subtle)',
                background: 'transparent',
                color: 'var(--color-text-main)',
              }}
            >
              {isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ghost-btn"
              style={{
                border: '1px solid rgba(248,113,113,0.8)',
                background: 'rgba(254,242,242,0.95)',
                color: '#b91c1c',
              }}
            >
              Kapat
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <LiveKitRoom serverUrl={url} token={token} connect options={{ autoSubscribe: true }}>
            <LiveClassInner role={role} title={title} />
          </LiveKitRoom>
        </div>
      </div>
    </div>
  );
};

const LiveClassInner: React.FC<{ role?: 'teacher' | 'student'; title?: string }> = ({
  role,
  title,
}) => {
  const { localParticipant } = useLocalParticipant();
  const identity = localParticipant?.identity ?? '';
  const displayName =
    (localParticipant?.name as string | undefined) ??
    identity ??
    (role === 'teacher' ? 'Öğretmen' : 'Öğrenci');

  const [canShareScreen, setCanShareScreen] = useState<boolean>(role === 'teacher');
  const [pendingScreenRequest, setPendingScreenRequest] = useState(false);
  const [pendingHandRaise, setPendingHandRaise] = useState(false);
  const [screenRequests, setScreenRequests] = useState<Array<{ id: string; name: string }>>([]);
  const [handRequests, setHandRequests] = useState<Array<{ id: string; name: string }>>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [infoToasts, setInfoToasts] = useState<Toast[]>([]);

  const pushInfoToast = useCallback((message: string) => {
    setInfoToasts((prev) => {
      const id = Date.now() + Math.random();
      const next = [...prev, { id, message }];
      setTimeout(() => {
        setInfoToasts((inner) => inner.filter((t) => t.id !== id));
      }, 3500);
      return next.slice(-4);
    });
  }, []);

  const handleIncomingMessage = useCallback(
    (raw: Uint8Array | string | undefined) => {
      if (!raw) return;
      let text: string;
      if (typeof raw === 'string') {
        text = raw;
      } else {
        try {
          text = new TextDecoder().decode(raw);
        } catch {
          return;
        }
      }
      let data: ControlMessage | null = null;
      try {
        data = JSON.parse(text) as ControlMessage;
      } catch {
        return;
      }
      if (!data || !data.type) return;

      // Ortak alanlar
      const fromId = data.fromId;
      const fromName = data.fromName || fromId || 'Katılımcı';

      if (data.type === 'chat') {
        const payload = (data.payload ?? {}) as { text?: string };
        const chatText = payload.text ?? '';
        if (!chatText.trim()) return;
        const ts = typeof data.ts === 'number' ? data.ts : Date.now();
        setChatMessages((prev) => [
          ...prev,
          {
            id: ts + Math.random(),
            fromId,
            fromName,
            text: chatText,
            ts,
          },
        ]);
        // Yeni mesaj geldiğinde chat kapalıysa rozet amaçlı açık tutalım (şimdilik sadece toast)
        if (!chatOpen && fromId !== identity) {
          pushInfoToast(`${fromName} yeni bir mesaj gönderdi`);
        }
        return;
      }

      if (data.type === 'screen_request' && role === 'teacher') {
        if (!fromId) return;
        setScreenRequests((prev) => {
          if (prev.some((r) => r.id === fromId)) return prev;
          return [...prev, { id: fromId, name: fromName }];
        });
        pushInfoToast(`${fromName} ekran paylaşımı istiyor`);
        return;
      }

      if (data.type === 'hand_raise' && role === 'teacher') {
        if (!fromId) return;
        setHandRequests((prev) => {
          if (prev.some((r) => r.id === fromId)) return prev;
          return [...prev, { id: fromId, name: fromName }];
        });
        pushInfoToast(`${fromName} söz hakkı istiyor`);
        return;
      }

      if (data.type === 'screen_approved' && role === 'student') {
        if (data.targetId && data.targetId !== identity) return;
        setPendingScreenRequest(false);
        setCanShareScreen(true);
        pushInfoToast('Öğretmen ekran paylaşımı isteğini onayladı. Şimdi ekran paylaş butonunu kullanabilirsin.');
        return;
      }

      if (data.type === 'screen_denied' && role === 'student') {
        if (data.targetId && data.targetId !== identity) return;
        setPendingScreenRequest(false);
        pushInfoToast('Öğretmen ekran paylaşımı isteğini reddetti.');
        return;
      }

      if (data.type === 'hand_lower' && role === 'student') {
        if (data.targetId && data.targetId !== identity) return;
        setPendingHandRaise(false);
        pushInfoToast('Söz hakkı isteğiniz kapatıldı.');
      }
    },
    [chatOpen, identity, pushInfoToast, role],
  );

  const { send: sendData } = useDataChannel('class-control', (msg) =>
    handleIncomingMessage(msg.payload as Uint8Array | undefined),
  );

  const sendControlMessage = useCallback(
    (message: ControlMessage) => {
      if (!sendData || !identity) return;
      const msg: ControlMessage = {
        ...message,
        fromId: identity,
        fromName: displayName,
        ts: message.ts ?? Date.now(),
      };
      try {
        const encoded = JSON.stringify(msg);
        const bytes = new TextEncoder().encode(encoded);
        // topic 'class-control' zaten hook içinde ayarlı; boş options ile gönderiyoruz
        sendData(bytes, {} as any);
      } catch {
        // yut
      }
    },
    [displayName, identity, sendData],
  );

  const handleRequestScreen = () => {
    if (role !== 'student' || !identity || pendingScreenRequest || canShareScreen) return;
    setPendingScreenRequest(true);
    sendControlMessage({
      type: 'screen_request',
      fromId: identity,
    });
  };

  const handleRequestHand = () => {
    if (role !== 'student' || !identity || pendingHandRaise) return;
    setPendingHandRaise(true);
    sendControlMessage({
      type: 'hand_raise',
      fromId: identity,
    });
  };

  const approveScreen = (studentId: string) => {
    if (role !== 'teacher') return;
    setScreenRequests((prev) => prev.filter((r) => r.id !== studentId));
    sendControlMessage({
      type: 'screen_approved',
      fromId: identity,
      targetId: studentId,
    });
  };

  const denyScreen = (studentId: string) => {
    if (role !== 'teacher') return;
    setScreenRequests((prev) => prev.filter((r) => r.id !== studentId));
    sendControlMessage({
      type: 'screen_denied',
      fromId: identity,
      targetId: studentId,
    });
  };

  const acknowledgeHand = (studentId: string) => {
    if (role !== 'teacher') return;
    setHandRequests((prev) => prev.filter((r) => r.id !== studentId));
    sendControlMessage({
      type: 'hand_lower',
      fromId: identity,
      targetId: studentId,
    });
  };

  const handleSendChat = () => {
    const text = chatInput.trim();
    if (!text || !identity) return;
    const ts = Date.now();
    // Kendi mesajını anında göster (LiveKit kendi mesajını geri yollamayabilir)
    setChatMessages((prev) => [
      ...prev,
      {
        id: ts + Math.random(),
        fromId: identity,
        fromName: displayName,
        text,
        ts,
      },
    ]);
    sendControlMessage({
      type: 'chat',
      fromId: identity,
      payload: { text },
      ts,
    });
    setChatInput('');
  };

  const handleRootClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const button = target.closest('button');
    if (!button) return;

    const aria = (button.getAttribute('aria-label') ?? '').toLowerCase();
    const text = (button.textContent ?? '').trim().toLowerCase();

    // LiveKit ControlBar Chat butonunu yakala ve kendi sohbetimizi aç/kapat.
    // Not: UI metni şu an "Chat" görünüyor; aria-label de olabilir.
    if (text === 'chat' || aria.includes('chat')) {
      event.preventDefault();
      event.stopPropagation();
      setChatOpen((prev) => !prev);
    }
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
      onClickCapture={handleRootClickCapture}
    >
      <VideoConference />
      <ParticipantOverlay role={role} />

      {/* Öğrenci alt kontrol barı */}
      {role === 'student' && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            bottom: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '0.4rem',
            }}
          >
            <button
              type="button"
              className="ghost-btn"
              onClick={handleRequestScreen}
              disabled={pendingScreenRequest || canShareScreen}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.9rem' }}
            >
              {pendingScreenRequest
                ? 'Ekran isteği gönderildi...'
                : canShareScreen
                  ? 'Ekran paylaşımına izin verildi'
                  : 'Ekran paylaşımı iste'}
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={handleRequestHand}
              disabled={pendingHandRaise}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.9rem' }}
            >
              {pendingHandRaise ? 'Söz hakkı istendi' : 'Söz hakkı iste'}
            </button>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Ekran paylaşımı için önce öğretmeninizin onay vermesi gerekir.
          </div>
        </div>
      )}

      {/* Öğretmen istek paneli */}
      {role === 'teacher' && (screenRequests.length > 0 || handRequests.length > 0) && (
        <div
          style={{
            position: 'absolute',
            right: 16,
            bottom: 16,
            minWidth: 260,
            maxWidth: 320,
            padding: '0.75rem 0.85rem',
            borderRadius: 16,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-subtle)',
            boxShadow: 'var(--shadow-soft)',
            fontSize: '0.8rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.4rem',
            }}
          >
            <span style={{ fontWeight: 600 }}>İstekler</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {screenRequests.length + handRequests.length} aktif
            </span>
          </div>
          <div style={{ display: 'grid', gap: '0.3rem', maxHeight: 220, overflow: 'auto' }}>
            {screenRequests.map((req) => (
              <div
                key={`screen-${req.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.4rem',
                  padding: '0.35rem 0.4rem',
                  borderRadius: 10,
                  background: 'var(--list-row-bg)',
                  border: '1px solid var(--list-row-border)',
                }}
              >
                <div>
                  <div>{req.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Ekran paylaşımı istiyor
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => approveScreen(req.id)}
                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem' }}
                  >
                    İzin ver
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => denyScreen(req.id)}
                    style={{
                      fontSize: '0.7rem',
                      padding: '0.2rem 0.6rem',
                      borderColor: 'rgba(248,113,113,0.7)',
                      color: '#b91c1c',
                    }}
                  >
                    Reddet
                  </button>
                </div>
              </div>
            ))}
            {handRequests.map((req) => (
              <div
                key={`hand-${req.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.4rem',
                  padding: '0.35rem 0.4rem',
                  borderRadius: 10,
                  background: 'var(--list-row-bg)',
                  border: '1px solid var(--list-row-border)',
                }}
              >
                <div>
                  <div>{req.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Söz hakkı istiyor
                  </div>
                </div>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => acknowledgeHand(req.id)}
                  style={{ fontSize: '0.7rem', padding: '0.25rem 0.7rem' }}
                >
                  Söz ver
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sohbet paneli – alt taraftan açılan modern kutu */}
      {chatOpen && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 64,
            transform: 'translateX(-50%)',
            width: 'min(520px, 100% - 32px)',
            maxHeight: '60%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 20,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-subtle)',
            boxShadow: '0 24px 60px rgba(15,23,42,0.35)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '0.7rem 0.9rem',
              borderBottom: '1px solid var(--color-border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '0.8rem', opacity: 0.75, textTransform: 'uppercase' }}>
                Canlı Ders Sohbeti
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{title ?? 'Sınıf odası'}</div>
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-muted)',
              }}
            >
              {chatMessages.length} mesaj
            </span>
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              padding: '0.6rem 0.9rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              overflowY: 'auto',
            }}
          >
            {chatMessages.length === 0 && (
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-muted)',
                }}
              >
                Henüz mesaj yok. İlk mesajı sen yaz.
              </div>
            )}
            {chatMessages.map((msg) => {
              const isSelf = msg.fromId === identity;
              return (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: isSelf ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.75rem',
                      marginBottom: '0.1rem',
                      color: 'var(--color-text-muted)',
                      textAlign: isSelf ? 'right' : 'left',
                    }}
                  >
                    {isSelf ? 'Sen' : msg.fromName}
                  </div>
                  <div
                    style={{
                      padding: '0.45rem 0.7rem',
                      borderRadius: 14,
                      background: isSelf
                        ? 'linear-gradient(135deg, #4f46e5, #2563eb)'
                        : 'var(--list-row-bg)',
                      color: isSelf ? '#f9fafb' : 'var(--color-text-main)',
                      fontSize: '0.85rem',
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}
          </div>
          <div
            style={{
              padding: '0.6rem 0.9rem',
              borderTop: '1px solid var(--color-border-subtle)',
              display: 'flex',
              gap: '0.5rem',
              background: 'var(--color-surface-soft)',
            }}
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendChat();
                }
              }}
              placeholder="Mesaj yaz..."
              style={{
                flex: 1,
                fontSize: '0.85rem',
              }}
            />
            <button
              type="button"
              className="primary-btn"
              onClick={handleSendChat}
              disabled={!chatInput.trim()}
              style={{ fontSize: '0.85rem', padding: '0.45rem 1.1rem' }}
            >
              Gönder
            </button>
          </div>
        </div>
      )}

      {/* Bilgilendirici toasts */}
      {infoToasts.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            top: 64,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.3rem',
            pointerEvents: 'none',
          }}
        >
          {infoToasts.map((toast) => (
            <div
              key={toast.id}
              style={{
                pointerEvents: 'none',
                padding: '0.35rem 0.7rem',
                borderRadius: 999,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-main)',
                fontSize: '0.8rem',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

