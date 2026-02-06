import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  useParticipants,
  useDataChannel,
  useLocalParticipant,
  useRoomContext,
} from '@livekit/components-react';
import '@livekit/components-styles';
import type { Participant } from 'livekit-client';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  MonitorUp, 
  Users, 
  MessageSquare, 
  PhoneOff, 
  MessageCircle, 
  VolumeX, 
  Hand, 
  Maximize, 
  Minimize 
} from 'lucide-react';

// (İkon tanımları kaldırıldı, lucide-react kullanılacak)

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
  | 'chat'
  | 'private_message'
  | 'session_ended'
  | 'assignment_completed';

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
  isPrivate?: boolean;
};

type ParticipantData = {
  id: string;
  name: string;
  isLocal?: boolean;
};

// Timer Hook
const useElapsedTime = () => {
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const LiveClassOverlay: React.FC<LiveClassOverlayProps> = ({
  url,
  token,
  title,
  role,
  onClose,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={rootRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <LiveKitRoom 
        serverUrl={url} 
        token={token} 
        connect={true}
        style={{ width: '100%', height: '100%' }}
      >
        <LiveClassInner role={role} title={title} onClose={onClose} />
      </LiveKitRoom>
    </div>
  );
};

const LiveClassInner: React.FC<{ role?: 'teacher' | 'student'; title?: string; onClose: () => void }> = ({
  role,
  title,
  onClose,
}) => {
  // Room context available if needed
  useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const elapsedTime = useElapsedTime();

  const identity = localParticipant?.identity ?? '';
  const displayName =
    (localParticipant?.name as string | undefined) ??
    identity ??
    (role === 'teacher' ? 'Öğretmen' : 'Öğrenci');

  // State
  const [isMicOn, setIsMicOn] = useState(false); // Varsayılan olarak kapalı
  const [isCameraOn, setIsCameraOn] = useState(false); // Varsayılan olarak kapalı
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [canShareScreen, setCanShareScreen] = useState<boolean>(role === 'teacher');
  const [pendingScreenRequest, setPendingScreenRequest] = useState(false);
  const [pendingHandRaise, setPendingHandRaise] = useState(false);
  const [screenRequests, setScreenRequests] = useState<Array<{ id: string; name: string }>>([]);
  const [handRequests, setHandRequests] = useState<Array<{ id: string; name: string }>>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [privateMessageTarget, setPrivateMessageTarget] = useState<ParticipantData | null>(null);
  const [privateMessageText, setPrivateMessageText] = useState('');
  const [infoToasts, setInfoToasts] = useState<Toast[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  
  // Assignment state
  const [assignmentsOpen, setAssignmentsOpen] = useState(false);
  const [pendingAssignments, setPendingAssignments] = useState<Array<{
    id: string;
    title: string;
    description?: string;
    dueDate: string;
    points: number;
  }>>([]);

  
  // Teacher view state
  const [studentStats, setStudentStats] = useState<Record<string, { completed: number; total: number }>>({});

  // Participant data
  const remoteParticipants = useMemo(
    () =>
      (participants as Participant[])
        .filter((p) => !p.isLocal && (p.identity || p.name))
        .map((p) => ({
          id: p.identity || p.sid,
          name: p.name || p.identity || 'Katılımcı',
          isLocal: false,
        })),
    [participants],
  );

  const localParticipantData: ParticipantData = {
    id: identity,
    name: displayName + ' (Siz)',
    isLocal: true,
  };

  const allParticipants = [localParticipantData, ...remoteParticipants];

  const filteredParticipants = allParticipants.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Toast helper
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

  // Assignment API functions
  const fetchPendingAssignments = useCallback(async () => {
    if (role !== 'student') return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/student/assignments/pending', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setPendingAssignments(data);
      }
    } catch (error) {
      console.error('Failed to fetch pending assignments:', error);
    }

  }, [role]);

  const fetchStudentStats = useCallback(async () => {
    if (role !== 'teacher') return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/teacher/assignments/live-status', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json() as Array<{
          assignmentId: string;
          studentId: string;
          status: string;
        }>;
        
        const stats: Record<string, { completed: number; total: number }> = {};
        
        // Group by student
        data.forEach(item => {
          if (!stats[item.studentId]) {
            stats[item.studentId] = { completed: 0, total: 0 };
          }
          stats[item.studentId].total += 1;
          if (item.status === 'completed') {
            stats[item.studentId].completed += 1;
          }
        });
        
        setStudentStats(stats);
      }
    } catch (error) {
      console.error('Failed to fetch student stats:', error);
    }
  }, [role]);



  // Load assignments on mount for students
  useEffect(() => {
    if (role === 'student') {
      fetchPendingAssignments();
    }
  }, [role, fetchPendingAssignments]);

  useEffect(() => {
    if (role === 'teacher') {
      fetchStudentStats();
    }
  }, [role, fetchStudentStats]);

  // Message handling
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
        if (!chatOpen && fromId !== identity) {
          pushInfoToast(`${fromName} yeni bir mesaj gönderdi`);
        }
        return;
      }

      if (data.type === 'private_message') {
        const payload = (data.payload ?? {}) as { text?: string };
        const msgText = payload.text ?? '';
        if (!msgText.trim()) return;
        if (data.targetId && data.targetId !== identity) return;
        const ts = typeof data.ts === 'number' ? data.ts : Date.now();
        setChatMessages((prev) => [
          ...prev,
          {
            id: ts + Math.random(),
            fromId,
            fromName,
            text: `[Özel] ${msgText}`,
            ts,
            isPrivate: true,
          },
        ]);
        pushInfoToast(`${fromName} size özel mesaj gönderdi`);
        if (!chatOpen) setChatOpen(true);
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
        pushInfoToast('Öğretmen ekran paylaşımı isteğini onayladı.');
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

      if (data.type === 'session_ended' && role === 'student') {
        setSessionEnded(true);
      }

      if (data.type === 'assignment_completed' && role === 'teacher') {
        // const payload = (data.payload ?? {}) as { assignmentId?: string };
        const studentId = fromId;
        
        if (studentId) {
          setStudentStats(prev => {
            const current = prev[studentId] || { completed: 0, total: 0 };
            return {
              ...prev,
              [studentId]: {
                ...current,
                completed: current.completed + 1
              }
            };
          });
          pushInfoToast(`${fromName} bir ödevi tamamladı!`);
        }
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
        sendData(bytes, {} as any);
      } catch {
        // ignore
      }
    },
    [displayName, identity, sendData],
  );

  const markAssignmentComplete = useCallback(async (assignmentId: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/student/assignments/${assignmentId}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ submittedInLiveClass: true }),
      });
      
      if (response.ok) {

        setPendingAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
        pushInfoToast('Ödev tamamlandı olarak işaretlendi');
        
        // Notify teacher via data channel
        sendControlMessage({
          type: 'assignment_completed' as any,
          fromId: identity,
          payload: { assignmentId },
        });
      }
    } catch (error) {
      console.error('Failed to mark assignment complete:', error);
      pushInfoToast('Ödev işaretlenemedi');
    }
  }, [identity, pushInfoToast, sendControlMessage]);

  // Handle close - send session_ended if teacher
  const handleClose = () => {
    if (role === 'teacher') {
      sendControlMessage({ type: 'session_ended', fromId: identity });
    }
    onClose();
  };

  // Media controls
  const toggleMic = async () => {
    try {
      await localParticipant?.setMicrophoneEnabled(!isMicOn);
      setIsMicOn(!isMicOn);
    } catch (e) {
      console.error('Mic toggle error:', e);
    }
  };

  const toggleCamera = async () => {
    try {
      await localParticipant?.setCameraEnabled(!isCameraOn);
      setIsCameraOn(!isCameraOn);
    } catch (e) {
      console.error('Camera toggle error:', e);
    }
  };

  const toggleScreenShare = async () => {
    if (!canShareScreen) {
      if (role === 'student' && !pendingScreenRequest) {
        setPendingScreenRequest(true);
        sendControlMessage({
          type: 'screen_request',
          fromId: identity,
        });
        pushInfoToast('Ekran paylaşımı isteği gönderildi');
      }
      return;
    }
    try {
      await localParticipant?.setScreenShareEnabled(!isScreenSharing);
      setIsScreenSharing(!isScreenSharing);
    } catch (e) {
      console.error('Screen share error:', e);
    }
  };

  // Requests handling (teacher)
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

  // Hand raise (student)
  const handleRequestHand = () => {
    if (role !== 'student' || !identity || pendingHandRaise) return;
    setPendingHandRaise(true);
    sendControlMessage({
      type: 'hand_raise',
      fromId: identity,
    });
    pushInfoToast('Söz hakkı isteği gönderildi');
  };

  // Video area ref
  const videoAreaRef = useRef<HTMLDivElement>(null);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    const elem = videoAreaRef.current;
    if (!elem) return;

    if (!isFullscreen) {
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        (elem as any).webkitRequestFullscreen();
      } else if ((elem as any).msRequestFullscreen) {
        (elem as any).msRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  // Chat
  const handleSendChat = () => {
    const text = chatInput.trim();
    if (!text || !identity) return;
    const ts = Date.now();
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

  // Private message
  const handleSendPrivateMessage = () => {
    if (!privateMessageTarget || !privateMessageText.trim()) return;
    const ts = Date.now();
    setChatMessages((prev) => [
      ...prev,
      {
        id: ts + Math.random(),
        fromId: identity,
        fromName: displayName,
        text: `[${privateMessageTarget.name}'a özel] ${privateMessageText}`,
        ts,
        isPrivate: true,
      },
    ]);
    sendControlMessage({
      type: 'private_message',
      fromId: identity,
      targetId: privateMessageTarget.id,
      payload: { text: privateMessageText },
      ts,
    });
    setPrivateMessageText('');
    setPrivateMessageTarget(null);
  };

  // Mute all (teacher)
  const muteAll = () => {
    pushInfoToast('Tüm katılımcıların sesi kapatıldı');
  };

  // Meeting code
  const meetingCode = useMemo(() => {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const part = () => Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${part()}-${part()}-${part()}`;
  }, []);

  return (
    <div className="live-class-container">
      {/* Video Area */}
      <div className="live-video-area" ref={videoAreaRef}>
        <VideoConference />

        {/* Top Bar */}
        <div className="live-top-bar">
          <div className="live-meeting-info">
            <span className="live-meeting-title">{title ?? 'Canlı Ders'}</span>
            <span className="live-meeting-code">{meetingCode}</span>
          </div>
          <div className="live-timer">
            <span className="live-timer-dot" />
            <span>{elapsedTime}</span>
          </div>
        </div>

        {/* Info Toasts */}
        {infoToasts.length > 0 && (
          <div
            style={{
              position: 'absolute',
              left: 16,
              top: 72,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
              pointerEvents: 'none',
              zIndex: 20,
            }}
          >
            {infoToasts.map((toast) => (
              <div
                key={toast.id}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 999,
                  background: 'rgba(0, 0, 0, 0.8)',
                  color: '#fff',
                  fontSize: '0.85rem',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                }}
              >
                {toast.message}
              </div>
            ))}
          </div>
        )}

        {/* Teacher Request Badges */}
        {role === 'teacher' && (screenRequests.length > 0 || handRequests.length > 0) && (
          <div
            style={{
              position: 'absolute',
              left: 16,
              bottom: 100,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              zIndex: 20,
            }}
          >
            {screenRequests.map((req) => (
              <div
                key={`screen-${req.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: 12,
                  background: 'rgba(0, 0, 0, 0.85)',
                  color: '#fff',
                  fontSize: '0.85rem',
                }}
              >
                <MonitorUp />
                <span style={{ flex: 1 }}>{req.name} ekran paylaşımı istiyor</span>
                <button
                  onClick={() => approveScreen(req.id)}
                  className="control-btn"
                  style={{ width: 32, height: 32, background: '#34a853' }}
                >
                  ✓
                </button>
                <button
                  onClick={() => denyScreen(req.id)}
                  className="control-btn"
                  style={{ width: 32, height: 32, background: '#ea4335' }}
                >
                  ✕
                </button>
              </div>
            ))}
            {handRequests.map((req) => (
              <div
                key={`hand-${req.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: 12,
                  background: 'rgba(0, 0, 0, 0.85)',
                  color: '#fff',
                  fontSize: '0.85rem',
                }}
              >
                <Hand size={20} strokeWidth={2.5} />
                <span style={{ flex: 1 }}>{req.name} söz hakkı istiyor</span>
                <button
                  onClick={() => acknowledgeHand(req.id)}
                  className="control-btn"
                  style={{ width: 32, height: 32, background: '#1a73e8' }}
                >
                  ✓
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Participants Panel */}
        {participantsOpen && (
          <div className="participants-panel">
            <div className="participants-header">
              <span className="participants-title">Kullanıcılar</span>
              <button className="participants-close" onClick={() => setParticipantsOpen(false)}>
                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>✕</span>
              </button>
            </div>

            {role === 'teacher' && (
              <div className="participants-actions">
                <button className="participants-action-btn" onClick={muteAll}>
                  <VolumeX size={20} strokeWidth={2.5} />
                  <span>Tümünün sesini kapat</span>
                </button>
              </div>
            )}

            <input
              type="text"
              className="participants-search"
              placeholder="Kullanıcı arayın"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div className="participants-section">
              <div className="participants-section-title">
                Katılımcılar
                <span className="participant-count-badge">{allParticipants.length}</span>
              </div>
            </div>

            <div className="participants-list">
              {filteredParticipants.map((p) => (
                <div key={p.id} className="participant-item">
                  <div className="participant-avatar">{p.name.charAt(0).toUpperCase()}</div>
                  <div className="participant-info">
                    <div className="participant-name">{p.name}</div>
                    <div className="participant-role">
                      {p.isLocal ? 'Toplantıyı düzenleyen' : 'Katılımcı'}
                    </div>
                    {role === 'teacher' && !p.isLocal && studentStats[p.id] && studentStats[p.id].total > 0 && (
                      <div style={{ marginTop: '4px' }}>
                        <span style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          padding: '2px 6px', 
                          borderRadius: '12px', 
                          fontSize: '0.7rem', 
                          fontWeight: 600,
                          backgroundColor: studentStats[p.id].completed === studentStats[p.id].total ? '#e6f4ea' : '#fce8e6',
                          color: studentStats[p.id].completed === studentStats[p.id].total ? '#137333' : '#c5221f',
                          border: `1px solid ${studentStats[p.id].completed === studentStats[p.id].total ? '#ceead6' : '#fad2cf'}`
                        }}>
                          {studentStats[p.id].completed}/{studentStats[p.id].total} Ödev
                        </span>
                      </div>
                    )}
                  </div>
                  {!p.isLocal && role === 'teacher' && (
                    <div className="participant-actions">
                      <button
                        className="participant-action-btn"
                        onClick={() => setPrivateMessageTarget(p)}
                        title="Özel mesaj gönder"
                      >
                        <MessageCircle size={18} strokeWidth={2.5} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chat Panel */}
        {chatOpen && (
          <div className="live-chat-panel">
            <div className="live-chat-header">
              <span className="live-chat-title">Sohbet</span>
              <button className="participants-close" onClick={() => setChatOpen(false)}>
                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>✕</span>
              </button>
            </div>

            <div className="live-chat-messages">
              {chatMessages.length === 0 && (
                <div style={{ color: '#9aa0a6', fontSize: '0.9rem', textAlign: 'center', marginTop: '2rem' }}>
                  Henüz mesaj yok
                </div>
              )}
              {chatMessages.map((msg) => {
                const isSelf = msg.fromId === identity;
                return (
                  <div
                    key={msg.id}
                    className={`live-chat-message ${isSelf ? 'live-chat-message--self' : ''}`}
                  >
                    {!isSelf && <div className="live-chat-message-sender">{msg.fromName}</div>}
                    <div className="live-chat-message-bubble">{msg.text}</div>
                  </div>
                );
              })}
            </div>

            <div className="live-chat-input-area">
              <input
                type="text"
                className="live-chat-input"
                placeholder="Mesaj yazın..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
              />
              <button
                className="live-chat-send-btn"
                onClick={handleSendChat}
                disabled={!chatInput.trim()}
              >
                <span style={{ fontSize: '16px' }}>▶</span>
              </button>
            </div>
          </div>
        )}

        {/* Assignments Modal (Student Only) */}
        {role === 'student' && assignmentsOpen && (
          <div className="assignments-modal">
            <div className="assignments-header">
              <span className="assignments-title">
                Bekleyen Ödevler ({pendingAssignments.length})
              </span>
              <button className="participants-close" onClick={() => setAssignmentsOpen(false)}>
                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>✕</span>
              </button>
            </div>
            
            <div className="assignments-list">
              {pendingAssignments.length === 0 ? (
                <div style={{ 
                  padding: '2rem', 
                  textAlign: 'center', 
                  color: '#9aa0a6' 
                }}>
                  Tebrikler! Bekleyen ödeviniz yok.
                </div>
              ) : (
                pendingAssignments.map((assignment) => (
                  <div key={assignment.id} className="assignment-card">
                    <div style={{ marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', color: '#202124' }}>
                        {assignment.title}
                      </h4>
                      {assignment.description && (
                        <p style={{ 
                          margin: '0.25rem 0 0', 
                          fontSize: '0.85rem', 
                          color: '#5f6368' 
                        }}>
                          {assignment.description}
                        </p>
                      )}
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginTop: '0.75rem'
                    }}>
                      <span style={{ fontSize: '0.85rem', color: '#5f6368' }}>
                        Son: {new Date(assignment.dueDate).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'long',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      <label style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        color: '#1a73e8',
                        fontWeight: 500
                      }}>
                        <input
                          type="checkbox"
                          onChange={() => markAssignmentComplete(assignment.id)}
                          style={{ cursor: 'pointer' }}
                        />
                        Tamamlandı
                      </label>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Private Message Modal */}
        {privateMessageTarget && (
          <div className="private-message-modal" onClick={() => setPrivateMessageTarget(null)}>
            <div className="private-message-content" onClick={(e) => e.stopPropagation()}>
              <div className="private-message-header">
                <div className="participant-avatar">{privateMessageTarget.name.charAt(0).toUpperCase()}</div>
                <span className="private-message-title">{privateMessageTarget.name}'a Mesaj Gönder</span>
              </div>
              <div className="private-message-body">
                <textarea
                  className="private-message-textarea"
                  placeholder="Mesajınızı yazın..."
                  value={privateMessageText}
                  onChange={(e) => setPrivateMessageText(e.target.value)}
                />
              </div>
              <div className="private-message-footer">
                <button className="private-message-cancel" onClick={() => setPrivateMessageTarget(null)}>
                  İptal
                </button>
                <button
                  className="private-message-send"
                  onClick={handleSendPrivateMessage}
                  disabled={!privateMessageText.trim()}
                >
                  Gönder
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="live-control-bar">
        <div className="live-control-bar-left">
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', fontFamily: 'monospace', letterSpacing: '1px' }}>
            {meetingCode}
          </span>
        </div>

        {/* Center Controls */}
        <button
          className={`control-btn ${!isMicOn ? 'control-btn--muted' : ''}`}
          onClick={toggleMic}
          title={isMicOn ? 'Mikrofonu kapat' : 'Mikrofonu aç'}
        >
          {isMicOn ? <Mic size={24} strokeWidth={2} /> : <MicOff size={24} strokeWidth={2} />}
        </button>

        <button
          className={`control-btn ${!isCameraOn ? 'control-btn--muted' : ''}`}
          onClick={toggleCamera}
          title={isCameraOn ? 'Kamerayı kapat' : 'Kamerayı aç'}
        >
          {isCameraOn ? <Video size={24} strokeWidth={2} /> : <VideoOff size={24} strokeWidth={2} />}
        </button>

        <button
          className={`control-btn ${isScreenSharing ? 'control-btn--active' : ''}`}
          onClick={toggleScreenShare}
          title={
            canShareScreen
              ? isScreenSharing
                ? 'Ekran paylaşımını durdur'
                : 'Ekran paylaş'
              : 'Ekran paylaşımı izni iste'
          }
        >
          <MonitorUp size={24} strokeWidth={2} />
        </button>

        {role === 'student' && (
          <button
            className={`control-btn ${pendingHandRaise ? 'control-btn--active' : ''}`}
            onClick={handleRequestHand}
            disabled={pendingHandRaise}
            title={pendingHandRaise ? 'Söz hakkı bekleniyor' : 'Söz hakkı iste'}
          >
            <Hand size={24} strokeWidth={2} />
          </button>
        )}

        <button
          className={`control-btn ${participantsOpen ? 'control-btn--active' : ''}`}
          onClick={() => {
            setParticipantsOpen(!participantsOpen);
            if (chatOpen) setChatOpen(false);
          }}
          title="Katılımcılar"
        >
          <Users size={24} strokeWidth={2} />
        </button>

        <button
          className={`control-btn ${chatOpen ? 'control-btn--active' : ''}`}
          onClick={() => {
            setChatOpen(!chatOpen);
            if (participantsOpen) setParticipantsOpen(false);
            if (assignmentsOpen) setAssignmentsOpen(false);
          }}
          title="Sohbet"
        >
          <MessageSquare size={24} strokeWidth={2} />
        </button>

        {role === 'student' && (
          <button
            className={`control-btn ${assignmentsOpen ? 'control-btn--active' : ''}`}
            onClick={() => {
              setAssignmentsOpen(!assignmentsOpen);
              if (chatOpen) setChatOpen(false);
              if (participantsOpen) setParticipantsOpen(false);
            }}
            title="Ödevler"
            style={{ position: 'relative' }}
          >
            <span style={{ fontSize: '20px', fontWeight: 'bold' }}>📚</span>
            {pendingAssignments.length > 0 && (
              <span style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                background: '#ea4335',
                color: '#fff',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 'bold',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}>
                {pendingAssignments.length}
              </span>
            )}
          </button>
        )}

        <button className="control-btn control-btn--danger" onClick={handleClose} title="Toplantıdan çık">
          <PhoneOff size={24} strokeWidth={2} />
        </button>

        <button
          className="control-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
        >
          {isFullscreen ? <Minimize size={24} strokeWidth={2} /> : <Maximize size={24} strokeWidth={2} />}
        </button>

        <div className="live-control-bar-right">
          {/* Right side empty for now */}
        </div>
      </div>

      {/* Session Ended Modal */}
      {sessionEnded && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '2.5rem',
              maxWidth: '400px',
              textAlign: 'center',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📺</div>
            <h2 style={{ margin: 0, marginBottom: '0.75rem', fontSize: '1.5rem', color: '#202124' }}>
              Canlı Yayın Sonlandırıldı
            </h2>
            <p style={{ margin: 0, marginBottom: '1.5rem', color: '#5f6368', fontSize: '0.95rem' }}>
              Öğretmen canlı yayını sonlandırdı. Sayfayı kapatabilirsiniz.
            </p>
            <button
              onClick={handleClose}
              style={{
                padding: '0.75rem 2rem',
                background: '#1a73e8',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
