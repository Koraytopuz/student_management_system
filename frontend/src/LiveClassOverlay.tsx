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
  BarChart2,
  ClipboardList,
  Hand,
  Maximize,
  MessageCircle,
  MessageSquare,
  Mic,
  MicOff,
  Minimize,
  MonitorUp,
  PhoneOff,
  Users,
  Video,
  VideoOff,
  VolumeX,
} from 'lucide-react';
import { getMeetingAttendanceStudents, muteAllInMeeting, submitMeetingAttendance } from './api';

// (İkon tanımları kaldırıldı, lucide-react kullanılacak)

type LiveClassOverlayProps = {
  url: string;
  token: string;
  title?: string;
  role?: 'teacher' | 'student';
  meetingId?: string;
  /** Backend API için auth token (localStorage'dan bağımsız) */
  authToken?: string;
  /** reason: 'teacher_missing' = öğretmen yayında değil, ana sayfada uyarı gösterilebilir */
  onClose: (reason?: 'teacher_missing') => void;
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
  | 'assignment_completed'
  | 'poll_create'
  | 'poll_vote'
  | 'poll_result';

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
  joinedAt?: number;
};

type PollOption = { id: string; text: string };
type Poll = {
  id: string;
  question: string;
  options: PollOption[];
  ts: number;
};

const formatDuration = (joinedAt: number) => {
  const sec = Math.floor((Date.now() - joinedAt) / 1000);
  if (sec < 60) return `${sec} sn`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dk`;
  return `${Math.floor(min / 60)} sa ${min % 60} dk`;
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
  meetingId,
  authToken,
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
        <LiveClassInner
          role={role}
          title={title}
          meetingId={meetingId}
          authToken={authToken}
          onClose={onClose}
        />
      </LiveKitRoom>
    </div>
  );
};

const LiveClassInner: React.FC<{
  role?: 'teacher' | 'student';
  title?: string;
  meetingId?: string;
  authToken?: string;
  onClose: (reason?: 'teacher_missing') => void;
}> = ({ role, title, meetingId, authToken, onClose }) => {
  // Room context available if needed
  useRoomContext();
  const { 
    localParticipant, 
    isCameraEnabled, 
    isMicrophoneEnabled, 
    isScreenShareEnabled 
  } = useLocalParticipant();
  const participants = useParticipants();
  const elapsedTime = useElapsedTime();

  const identity = localParticipant?.identity ?? '';
  const displayName =
    (localParticipant?.name as string | undefined) ??
    identity ??
    (role === 'teacher' ? 'Öğretmen' : 'Öğrenci');

  // State - sync with LiveKit track states
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

  // Poll state
  const [activePoll, setActivePoll] = useState<Poll | null>(null);
  const [pollVotes, setPollVotes] = useState<Record<string, number>>({}); // optionId -> count
  const [myPollVote, setMyPollVote] = useState<string | null>(null);
  const [pollPanelOpen, setPollPanelOpen] = useState(false);
  const [pollCreateQuestion, setPollCreateQuestion] = useState('');
  const [pollCreateOptions, setPollCreateOptions] = useState(['', '']);
  const [participantJoinTimes, setParticipantJoinTimes] = useState<Record<string, number>>({});

  // Yoklama modal state
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [attendanceStudents, setAttendanceStudents] = useState<Array<{ id: string; name: string }>>([]);
  const [attendanceMeetingTitle, setAttendanceMeetingTitle] = useState('');
  const [attendancePresent, setAttendancePresent] = useState<Record<string, boolean>>({});
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);

  // Participant data
  const remoteParticipants = useMemo(
    () =>
      (participants as Participant[])
        .filter((p) => !p.isLocal && (p.identity || p.name))
        .map((p) => {
          const id = p.identity || p.sid;
          return {
            id,
            name: p.name || p.identity || 'Katılımcı',
            isLocal: false,
            joinedAt: participantJoinTimes[id] ?? Date.now(),
          };
        }),
    [participants, participantJoinTimes],
  );

  const sessionStartRef = useRef(Date.now());
  const localParticipantData: ParticipantData = {
    id: identity,
    name: displayName + ' (Siz)',
    isLocal: true,
    joinedAt: sessionStartRef.current,
  };

  const allParticipants = [localParticipantData, ...remoteParticipants];

  // Öğrenci, öğretmen gelmeden odaya girmesin (öğretmen başlatmadı/katılmadı)
  const [teacherMissing, setTeacherMissing] = useState(false);
  const teacherWaitTimeoutRef = useRef<number | null>(null);
  const remoteCountRef = useRef<number>(0);

  useEffect(() => {
    remoteCountRef.current = remoteParticipants.length;
  }, [remoteParticipants.length]);

  useEffect(() => {
    if (role !== 'student') return;
    if (!identity) return;
    if (sessionEnded) return;
    if (teacherMissing) return;

    // Öğretmen veya başka bir katılımcı geldiyse bekleme iptal
    if (remoteParticipants.length > 0) {
      if (teacherWaitTimeoutRef.current != null) {
        window.clearTimeout(teacherWaitTimeoutRef.current);
        teacherWaitTimeoutRef.current = null;
      }
      return;
    }

    if (teacherWaitTimeoutRef.current == null) {
      teacherWaitTimeoutRef.current = window.setTimeout(() => {
        if (remoteCountRef.current === 0) {
          setTeacherMissing(true);
        }
      }, 4500);
    }

    return () => {
      if (teacherWaitTimeoutRef.current != null) {
        window.clearTimeout(teacherWaitTimeoutRef.current);
        teacherWaitTimeoutRef.current = null;
      }
    };
  }, [role, identity, sessionEnded, teacherMissing, remoteParticipants.length]);

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
      // Sadece JSON dönen ve başarılı cevapları işle
      if (!response.ok) return;
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        // Geliştirme sırasında HTML veya başka bir cevap geldiyse sessizce yok say
        return;
      }

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
    } catch (error) {
      // Bu istatistikler kritik değil; sessizce yok sayıyoruz
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

  // Sync track states with LiveKit
  useEffect(() => {
    if (isCameraEnabled !== undefined) {
      setIsCameraOn(isCameraEnabled);
    }
  }, [isCameraEnabled]);

  useEffect(() => {
    if (isMicrophoneEnabled !== undefined) {
      setIsMicOn(isMicrophoneEnabled);
    }
  }, [isMicrophoneEnabled]);

  useEffect(() => {
    if (isScreenShareEnabled !== undefined) {
      setIsScreenSharing(isScreenShareEnabled);
    }
  }, [isScreenShareEnabled]);

  const knownParticipantIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = Date.now();
    (participants as Participant[]).forEach((p) => {
      const id = p.identity || p.sid;
      if (id && !knownParticipantIds.current.has(id)) {
        knownParticipantIds.current.add(id);
        setParticipantJoinTimes((prev) => (prev[id] ? prev : { ...prev, [id]: now }));
      }
    });
  }, [participants]);

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
        const studentId = fromId;
        if (studentId) {
          setStudentStats(prev => {
            const current = prev[studentId] || { completed: 0, total: 0 };
            return {
              ...prev,
              [studentId]: { ...current, completed: current.completed + 1 },
            };
          });
          pushInfoToast(`${fromName} bir ödevi tamamladı!`);
        }
      }

      if (data.type === 'poll_create') {
        const payload = (data.payload ?? {}) as { poll?: Poll };
        if (payload.poll) {
          setActivePoll(payload.poll);
          setPollVotes({});
          setMyPollVote(null);
          setPollPanelOpen(true);
          pushInfoToast('Yeni anket başladı');
        }
      }

      if (data.type === 'poll_vote') {
        const payload = (data.payload ?? {}) as { optionId?: string };
        if (payload.optionId) {
          setPollVotes((prev) => ({
            ...prev,
            [payload.optionId!]: (prev[payload.optionId!] ?? 0) + 1,
          }));
        }
      }

      if (data.type === 'poll_result') {
        const payload = (data.payload ?? {}) as { votes?: Record<string, number> };
        if (payload.votes) setPollVotes(payload.votes);
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
    if (!localParticipant) return;
    try {
      const newState = !isMicOn;
      await localParticipant.setMicrophoneEnabled(newState);
      setIsMicOn(newState);
    } catch (e) {
      console.error('Mic toggle error:', e);
      pushInfoToast('Mikrofon açılamadı/kapatılamadı');
    }
  };

  const toggleCamera = async () => {
    if (!localParticipant) return;
    try {
      const newState = !isCameraOn;
      await localParticipant.setCameraEnabled(newState);
      setIsCameraOn(newState);
    } catch (e) {
      console.error('Camera toggle error:', e);
      pushInfoToast('Kamera açılamadı/kapatılamadı');
    }
  };

  const toggleScreenShare = async () => {
    if (!localParticipant) return;
    
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
      const newState = !isScreenSharing;
      await localParticipant.setScreenShareEnabled(newState);
      setIsScreenSharing(newState);
    } catch (e) {
      console.error('Screen share error:', e);
      pushInfoToast('Ekran paylaşımı başlatılamadı/durdurulamadı');
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

  // Poll (teacher)
  const createPoll = () => {
    const question = pollCreateQuestion.trim();
    const options = pollCreateOptions.filter((o) => o.trim()).map((t, i) => ({ id: `opt-${Date.now()}-${i}`, text: t.trim() }));
    if (!question || options.length < 2) {
      pushInfoToast('Soru ve en az 2 seçenek girin');
      return;
    }
    const poll: Poll = { id: `poll-${Date.now()}`, question, options, ts: Date.now() };
    setActivePoll(poll);
    setPollVotes({});
    setPollCreateQuestion('');
    setPollCreateOptions(['', '']);
    setPollPanelOpen(true);
    sendControlMessage({
      type: 'poll_create',
      fromId: identity,
      payload: { poll },
      ts: poll.ts,
    });
  };

  const votePoll = (optionId: string) => {
    if (!activePoll || myPollVote) return;
    setMyPollVote(optionId);
    setPollVotes((prev) => ({ ...prev, [optionId]: (prev[optionId] ?? 0) + 1 }));
    sendControlMessage({
      type: 'poll_vote',
      fromId: identity,
      payload: { optionId },
      ts: Date.now(),
    });
  };

  const endPoll = () => {
    if (role === 'teacher' && activePoll) {
      sendControlMessage({
        type: 'poll_result',
        fromId: identity,
        payload: { votes: pollVotes },
        ts: Date.now(),
      });
    }
    setActivePoll(null);
    setPollVotes({});
    setMyPollVote(null);
    setPollPanelOpen(false);
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
    pushInfoToast('Mesaj iletildi.');
  };

  // Mute all (teacher) – LiveKit RoomService ile gerçek muting
  const muteAll = async () => {
    if (!meetingId || !authToken || role !== 'teacher') {
      pushInfoToast('Ses kapatma işlemi yapılamadı');
      return;
    }
    try {
      const res = await muteAllInMeeting(authToken, meetingId);
      pushInfoToast(
        res.muted > 0
          ? `${res.muted} katılımcının sesi kapatıldı`
          : 'Tüm katılımcıların sesi zaten kapalı',
      );
    } catch {
      pushInfoToast('Ses kapatma işlemi başarısız oldu');
    }
  };

  // Yoklama modal – aç ve derse kayıtlı öğrencileri getir, aktif katılımcıları varsayılan Geldi yap
  const openAttendanceModal = useCallback(async () => {
    if (!meetingId || role !== 'teacher') return;
    setAttendanceModalOpen(true);
    setAttendanceLoading(true);
    try {
      if (!authToken) {
        pushInfoToast('Oturum bulunamadı');
        setAttendanceLoading(false);
        return;
      }
      const data = await getMeetingAttendanceStudents(authToken, meetingId);
      setAttendanceStudents(data.students);
      setAttendanceMeetingTitle(data.meetingTitle);

      const activeParticipantIds = new Set(
        remoteParticipants.map((p) => p.id),
      );
      const initial: Record<string, boolean> = {};
      data.students.forEach((s) => {
        initial[s.id] = activeParticipantIds.has(s.id);
      });
      setAttendancePresent(initial);
    } catch (err) {
      console.error('Yoklama öğrencileri yüklenemedi:', err);
      pushInfoToast('Yoklama listesi yüklenemedi');
    } finally {
      setAttendanceLoading(false);
    }
  }, [meetingId, role, remoteParticipants, authToken, pushInfoToast]);

  const saveAttendance = useCallback(async () => {
    if (!meetingId || role !== 'teacher') return;
    setAttendanceSaving(true);
    try {
      if (!authToken) {
        pushInfoToast('Oturum bulunamadı');
        setAttendanceSaving(false);
        return;
      }
      const attendance = attendanceStudents.map((s) => ({
        studentId: s.id,
        present: attendancePresent[s.id] ?? true,
      }));
      await submitMeetingAttendance(authToken, meetingId, attendance);
      pushInfoToast('Yoklama kaydedildi. Velilere bildirim gönderildi.');
      setAttendanceModalOpen(false);
    } catch (err) {
      console.error('Yoklama kaydedilemedi:', err);
      pushInfoToast('Yoklama kaydedilemedi');
    } finally {
      setAttendanceSaving(false);
    }
  }, [meetingId, role, attendanceStudents, attendancePresent, authToken, pushInfoToast]);

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
                      {p.joinedAt && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', opacity: 0.8 }}>
                          • {formatDuration(p.joinedAt)}
                        </span>
                      )}
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

        {/* Anket (Poll) Panel */}
        {pollPanelOpen && (
          <div className="live-chat-panel" style={{ right: chatOpen ? 340 : 16 }}>
            <div className="live-chat-header">
              <span className="live-chat-title">Anket</span>
              <button className="participants-close" onClick={() => setPollPanelOpen(false)}>
                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>✕</span>
              </button>
            </div>
            <div style={{ padding: '1rem', overflowY: 'auto' }}>
              {role === 'teacher' && !activePoll && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <input
                    type="text"
                    placeholder="Anket sorusu"
                    value={pollCreateQuestion}
                    onChange={(e) => setPollCreateQuestion(e.target.value)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: 10,
                      border: '1px solid rgba(51,65,85,0.9)',
                      background: 'rgba(15,23,42,0.9)',
                      color: '#e2e8f0',
                    }}
                  />
                  {pollCreateOptions.map((opt, i) => (
                    <input
                      key={i}
                      type="text"
                      placeholder={`Seçenek ${i + 1}`}
                      value={opt}
                      onChange={(e) => setPollCreateOptions((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      })}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: 10,
                        border: '1px solid rgba(51,65,85,0.9)',
                        background: 'rgba(15,23,42,0.9)',
                        color: '#e2e8f0',
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => setPollCreateOptions((prev) => [...prev, ''])}
                    style={{ alignSelf: 'flex-start', fontSize: '0.85rem' }}
                  >
                    + Seçenek ekle
                  </button>
                  <button type="button" className="primary-btn" onClick={createPoll}>
                    Anketi Başlat
                  </button>
                </div>
              )}
              {(activePoll || (role === 'student' && pollPanelOpen)) && activePoll && (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '0.75rem', color: '#e2e8f0' }}>{activePoll.question}</div>
                  {!myPollVote ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {activePoll.options.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className="ghost-btn"
                          onClick={() => votePoll(opt.id)}
                          style={{
                            padding: '0.6rem 1rem',
                            textAlign: 'left',
                            border: '1px solid rgba(51,65,85,0.9)',
                            borderRadius: 10,
                            color: '#e2e8f0',
                          }}
                        >
                          {opt.text}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {activePoll.options.map((opt) => {
                        const count = pollVotes[opt.id] ?? 0;
                        const total = Object.values(pollVotes).reduce((s, v) => s + v, 0);
                        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                        return (
                          <div key={opt.id}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
                              <span>{opt.text}</span>
                              <span>{count} oy (%{pct})</span>
                            </div>
                            <div
                              style={{
                                height: 8,
                                background: 'rgba(51,65,85,0.6)',
                                borderRadius: 4,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background: 'rgba(59,130,246,0.8)',
                                  transition: 'width 0.3s',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {role === 'teacher' && (
                        <button type="button" className="ghost-btn" onClick={endPoll} style={{ marginTop: '0.75rem' }}>
                          Anketi Kapat
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {role === 'student' && !activePoll && pollPanelOpen && (
                <div style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>
                  Henüz aktif anket yok
                </div>
              )}
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

        {/* Yoklama Modal (Teacher) */}
        {role === 'teacher' && attendanceModalOpen && (
          <div className="participants-panel" style={{ right: 0, left: 'auto', maxWidth: 420 }}>
            <div className="participants-header">
              <span className="participants-title">Yoklama Al</span>
              <button
                className="participants-close"
                onClick={() => setAttendanceModalOpen(false)}
              >
                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>✕</span>
              </button>
            </div>
            <div style={{ padding: '1rem', overflowY: 'auto' }}>
              {attendanceLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9aa0a6' }}>
                  Yükleniyor...
                </div>
              ) : attendanceStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9aa0a6' }}>
                  Bu derse kayıtlı öğrenci bulunamadı.
                </div>
              ) : (
                <>
                  <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#9aa0a6' }}>
                    {attendanceMeetingTitle}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                    }}
                  >
                    {attendanceStudents.map((student) => (
                      <div
                        key={student.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem 1rem',
                          borderRadius: 12,
                          background: 'rgba(15, 23, 42, 0.8)',
                          backdropFilter: 'blur(8px)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                        }}
                      >
                        <span style={{ fontWeight: 500, color: '#e2e8f0' }}>
                          {student.name}
                        </span>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 500,
                            color: attendancePresent[student.id] !== false ? '#22c55e' : '#ef4444',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '8px',
                            background: attendancePresent[student.id] !== false 
                              ? 'rgba(34, 197, 94, 0.15)' 
                              : 'rgba(239, 68, 68, 0.15)',
                            border: `1px solid ${attendancePresent[student.id] !== false 
                              ? 'rgba(34, 197, 94, 0.3)' 
                              : 'rgba(239, 68, 68, 0.3)'}`,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={attendancePresent[student.id] ?? true}
                            onChange={(e) =>
                              setAttendancePresent((prev) => ({
                                ...prev,
                                [student.id]: e.target.checked,
                              }))
                            }
                            style={{ cursor: 'pointer', width: 18, height: 18 }}
                          />
                          {attendancePresent[student.id] !== false ? 'Geldi' : 'Gelmedi'}
                        </label>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={saveAttendance}
                    disabled={attendanceSaving}
                    style={{ marginTop: '1rem', width: '100%' }}
                  >
                    {attendanceSaving ? 'Kaydediliyor...' : 'Kaydet'}
                  </button>
                </>
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
        <div className="live-control-bar-left" />

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
            if (pollPanelOpen) setPollPanelOpen(false);
          }}
          title="Sohbet"
        >
          <MessageSquare size={24} strokeWidth={2} />
        </button>

        {role === 'teacher' && (
          <button
            className={`control-btn ${pollPanelOpen ? 'control-btn--active' : ''}`}
            onClick={() => {
              setPollPanelOpen(!pollPanelOpen);
              if (chatOpen) setChatOpen(false);
              if (participantsOpen) setParticipantsOpen(false);
            }}
            title="Anket"
          >
            <BarChart2 size={24} strokeWidth={2} />
          </button>
        )}

        {role === 'teacher' && meetingId && (
          <button
            className={`control-btn ${attendanceModalOpen ? 'control-btn--active' : ''}`}
            onClick={() => {
              if (attendanceModalOpen) {
                setAttendanceModalOpen(false);
              } else {
                openAttendanceModal();
              }
            }}
            title="Yoklama Al"
          >
            <ClipboardList size={24} strokeWidth={2} />
          </button>
        )}

        {/* Student assignments control intentionally removed */}

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

      {/* Teacher not started / not joined yet (Student) */}
      {role === 'student' && teacherMissing && !sessionEnded && (
        <div
          className="ui-modal-overlay ui-modal-overlay--strong"
          style={{ zIndex: 210 }}
          onClick={() => onClose('teacher_missing')}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="ui-modal"
            style={{ width: 'min(520px, 94vw)', padding: '1.25rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ui-modal-title" style={{ marginBottom: '0.35rem' }}>
              Katılım mümkün değil
            </div>
            <div className="ui-modal-subtitle" style={{ marginBottom: '1rem' }}>
              Canlı dersiniz öğretmen tarafından başlatılmamıştır. Lütfen öğretmeninizin derse
              katılmasını bekleyin ve tekrar deneyin.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="primary-btn" onClick={() => onClose('teacher_missing')}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

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
