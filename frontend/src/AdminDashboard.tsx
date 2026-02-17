import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  FileSearch,
  GraduationCap,
  ScanLine,
  Users,
  Pencil,
  Trash2,
} from 'lucide-react';
import { apiRequest, getAdminNotifications, markAdminNotificationRead, type AdminNotification, getSubjectsList, uploadAdminStudentImage, resolveContentUrl } from './api';
import { useAuth } from './AuthContext';
import {
  DashboardLayout,
  GlassCard,
  TagChip,
} from './components/DashboardPrimitives';
import type { BreadcrumbItem, SidebarItem, SidebarSubItem } from './components/DashboardPrimitives';
import { QuestionParserPage } from './pages/admin/QuestionParserPage';
import OpticalScanningPage from './pages/admin/OpticalScanningPage';
import { PersonalizedReport } from './pages/admin/PersonalizedReport';
import { AdminReports } from './AdminReports';
import ExamManagement from './pages/admin/ExamManagement';
import { QuestionBankTab } from './QuestionBankTab';
import { AdminAttendanceTab } from './AdminAttendanceTab';
import { NotificationDetailModal, type NotificationDetailModalData } from './components/NotificationDetailModal';

interface AdminSummary {
  teacherCount: number;
  studentCount: number;
  parentCount: number;
  assignmentCount: number;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  subjectAreas?: string[];
  assignedGrades?: string[];
  profilePictureUrl?: string;
}

interface ClassGroup {
  id: string;
  name: string;
  gradeLevel: string;
  stream?: string | null;
  section?: string | null;
}

function getClassSectionLabel(cg: ClassGroup | undefined | null): string | null {
  if (!cg) return null;
  // Backend'de section alanı varsa onu kullan
  if (cg.section) return cg.section;

  const name = (cg.name || '').toUpperCase();

  // Örn: "5. Sınıf A Şubesi" gibi, harf ayrı kelime olarak geçiyorsa
  const standaloneMatch = name.match(/\b([A-E])\b/);
  if (standaloneMatch) return standaloneMatch[1];

  // Örn: "5/A", "10-B", "8C" gibi sınıf-kodlu isimleri yakala
  const combinedMatch = name.match(/(4|5|6|7|8|9|10|11|12)\s*[-/ ]?\s*([A-E])/);
  if (combinedMatch) return combinedMatch[2];

  return null;
}

interface Student {
  id: string;
  name: string;
  email: string;
  gradeLevel?: string;
  classId?: string;
  parentPhone?: string;
  profilePictureUrl?: string;
}

interface Parent {
  id: string;
  name: string;
  email: string;
  studentIds: string[];
}

interface Complaint {
  id: string;
  fromRole: string;
  fromUser: { id: string; name: string; email: string; role: string };
  aboutTeacher?: { id: string; name: string; email: string; role: string };
  subject: string;
  body: string;
  status: 'open' | 'reviewed' | 'closed';
  createdAt: string;
  reviewedAt?: string;
  closedAt?: string;
}

function normalizeParentPhoneInput(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D+/g, '');
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length !== 10 || !digits.startsWith('5')) {
    return null;
  }
  return digits;
}

function formatParentPhoneForDisplay(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D+/g, '');
  if (digits.length !== 10) return phone;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
}

export const AdminDashboard: React.FC = () => {
  const { token, user, logout } = useAuth();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newTeacher, setNewTeacher] = useState({
    name: '',
    email: '',
    password: '',
    subjectAreas: [] as string[],
    assignedGrades: [] as string[],
  });
  const [newStudent, setNewStudent] = useState({
    name: '',
    email: '',
    gradeLevel: '',
    classId: '',
    parentPhone: '',
    password: '',
    profilePictureUrl: '',
  });
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [newParent, setNewParent] = useState({
    name: '',
    email: '',
  });
  const [assignState, setAssignState] = useState({
    parentId: '',
    studentId: '',
  });
  // Veli atama için sınıf / şube / alan filtreleri
  const [parentAssignGrade, setParentAssignGrade] = useState<string>('');
  const [parentAssignSection, setParentAssignSection] = useState<string>('');
  const [parentAssignStream, setParentAssignStream] = useState<string>('');

  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [editTeacher, setEditTeacher] = useState<{
    name: string;
    email: string;
    subjectAreas: string[];
    assignedGrades: string[];
    password: string;
  }>({
    name: '',
    email: '',
    subjectAreas: [],
    assignedGrades: [],
    password: '',
  });

  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const editTeacherFormRef = useRef<HTMLDivElement>(null);
  const editStudentFormRef = useRef<HTMLDivElement>(null);

  const [studentsPanelOpen, setStudentsPanelOpen] = useState(false);
  const [addStudentPanelOpen, setAddStudentPanelOpen] = useState(false);
  const [studentFilterGrade, setStudentFilterGrade] = useState<string>('');
  const [studentFilterClassId, setStudentFilterClassId] = useState<string>('');
  const [studentFilterStream, setStudentFilterStream] = useState<string>('');
  const [studentSuccess, setStudentSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (editingTeacherId && editTeacherFormRef.current) {
      editTeacherFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [editingTeacherId]);

  useEffect(() => {
    if (editingStudentId && editStudentFormRef.current) {
      editStudentFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [editingStudentId]);

  useEffect(() => {
    // Alan filtresi sadece 11,12 ve Mezun için geçerli; diğer sınıfa geçilince sıfırla
    if (!['11', '12', 'Mezun'].includes(studentFilterGrade)) {
      setStudentFilterStream('');
    }
  }, [studentFilterGrade]);

  // Veli atamada alan filtresi sadece 11,12 ve Mezun için geçerli; diğer sınıfa geçilince sıfırla
  useEffect(() => {
    if (!['11', '12', 'Mezun'].includes(parentAssignGrade)) {
      setParentAssignStream('');
    }
  }, [parentAssignGrade]);

  // Veli atamada sınıf / şube / alan değiştiğinde seçili öğrenciyi temizle
  useEffect(() => {
    setAssignState((st) => ({ ...st, studentId: '' }));
  }, [parentAssignGrade, parentAssignSection, parentAssignStream]);

  useEffect(() => {
    if (!studentSuccess) return;
    const t = setTimeout(() => setStudentSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [studentSuccess]);

  const [teacherSuccess, setTeacherSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!teacherSuccess) return;
    const t = setTimeout(() => setTeacherSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [teacherSuccess]);

  const [editStudent, setEditStudent] = useState<{
    name: string;
    email: string;
    gradeLevel: string;
    classId: string;
    parentPhone: string;
    password: string;
    profilePictureUrl: string;
  }>({
    name: '',
    email: '',
    gradeLevel: '',
    classId: '',
    parentPhone: '',
    password: '',
    profilePictureUrl: '',
  });

  const filteredStudents = useMemo(
    () =>
      students.filter((s) => {
        if (studentFilterGrade && s.gradeLevel !== studentFilterGrade) return false;
        const cg = classGroups.find((g) => g.id === s.classId);
        if (studentFilterClassId) {
          const section = getClassSectionLabel(cg);
          // Backend'de şube bilgisi yoksa (section=null), filtreyi zorlamayalım
          if (section && section !== studentFilterClassId) return false;
        }
        const shouldApplyStreamFilter =
          studentFilterStream && ['11', '12', 'Mezun'].includes(studentFilterGrade);
        if (shouldApplyStreamFilter) {
          const streamLabel =
            cg?.stream === 'SAYISAL'
              ? 'Sayısal'
              : cg?.stream === 'SOZEL'
                ? 'Sözel'
                : cg?.stream === 'ESIT_AGIRLIK'
                  ? 'Eşit Ağırlık'
                  : null;
          if (streamLabel !== studentFilterStream) return false;
        }
        return true;
      }),
    [students, classGroups, studentFilterGrade, studentFilterClassId, studentFilterStream],
  );

  // Veli atama ekranında kullanılacak, sınıf / şube / alan ile filtrelenmiş öğrenci listesi
  const filteredStudentsForParentAssign = useMemo(
    () =>
      students.filter((s) => {
        if (parentAssignGrade && s.gradeLevel !== parentAssignGrade) return false;
        const cg = classGroups.find((g) => g.id === s.classId);
        if (parentAssignSection) {
          const section = getClassSectionLabel(cg);
          // Şube bilgisi olmayan sınıflarda filtreyi zorlamayalım
          if (section && section !== parentAssignSection) return false;
        }
        const shouldApplyStreamFilter =
          parentAssignStream && ['11', '12', 'Mezun'].includes(parentAssignGrade);
        if (shouldApplyStreamFilter) {
          const streamLabel =
            cg?.stream === 'SAYISAL'
              ? 'Sayısal'
              : cg?.stream === 'SOZEL'
                ? 'Sözel'
                : cg?.stream === 'ESIT_AGIRLIK'
                  ? 'Eşit Ağırlık'
                  : null;
          if (streamLabel !== parentAssignStream) return false;
        }
        return true;
      }),
    [students, classGroups, parentAssignGrade, parentAssignSection, parentAssignStream],
  );

  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);


  type AdminTab =
    | 'overview'
    | 'teachers'
    | 'students'
    | 'parents'
    | 'notifications'
    | 'complaints'
    | 'reports'
    | 'personalized-report'
    | 'ai-question-parser'
    | 'optical-scanning'
    | 'exam-management'
    | 'test-center'
    | 'questionbank'
    | 'attendance';
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab') as AdminTab | null;
    const validTabs: AdminTab[] = [
      'overview',
      'teachers',
      'students',
      'parents',
      'notifications',
      'complaints',
      'reports',
      'personalized-report',
      'ai-question-parser',
      'optical-scanning',
      'exam-management',
      'test-center',
      'questionbank',
      'attendance',
    ];
    return tab && validTabs.includes(tab) ? tab : 'overview';
  });
  const [adminNotifications, setAdminNotifications] = useState<AdminNotification[]>([]);
  const [adminNotificationsLoading, setAdminNotificationsLoading] = useState(false);
  const [notificationDetailOpen, setNotificationDetailOpen] = useState(false);
  const [activeNotificationId, setActiveNotificationId] = useState<string | null>(null);
  const activeNotification =
    adminNotifications.find((n) => n.id === activeNotificationId) ?? null;
  const [activeComplaintId, setActiveComplaintId] = useState<string | null>(null);

  const handleEditTeacher = (teacher: Teacher) => {
    setEditingTeacherId(teacher.id);
    setEditTeacher({
      name: teacher.name,
      email: teacher.email,
      subjectAreas: teacher.subjectAreas ?? [],
      assignedGrades: teacher.assignedGrades ?? [],
      password: '',
    });
  };

  const handleDeleteTeacher = async (teacher: Teacher) => {
    if (!token) return;
    const confirmed = window.confirm(
      `"${teacher.name}" adlı öğretmeni silmek istediğinize emin misiniz?`,
    );
    if (!confirmed) return;
    try {
      await apiRequest(
        `/admin/teachers/${teacher.id}`,
        { method: 'DELETE' },
        token,
      );
      setTeachers((prev) => prev.filter((t) => t.id !== teacher.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (!token || activeTab !== 'notifications') return;
    setAdminNotificationsLoading(true);
    getAdminNotifications(token)
      .then(setAdminNotifications)
      .catch(() => setAdminNotifications([]))
      .finally(() => setAdminNotificationsLoading(false));
  }, [token, activeTab]);



  const testCenterSubItems: SidebarSubItem[] = useMemo(
    () => [
      {
        id: 'reports',
        label: 'Raporlar',
        icon: <BarChart3 size={18} />,
        description: 'Yıllık gelişim',
        active: activeTab === 'reports',
        onClick: () => setActiveTab('reports'),
      },
      {
        id: 'ai-question-parser',
        label: 'AI PDF Ayrıştırıcı',
        icon: <FileSearch size={18} />,
        description: 'PDF soru ayrıştırma',
        active: activeTab === 'ai-question-parser',
        onClick: () => setActiveTab('ai-question-parser'),
      },
      {
        id: 'optical-scanning',
        label: 'Optik Tarama',
        icon: <ScanLine size={18} />,
        description: 'Optik form analizi',
        active: activeTab === 'optical-scanning',
        onClick: () => setActiveTab('optical-scanning'),
      },
      {
        id: 'exam-management',
        label: 'Sınav Yönetimi',
        icon: <BookOpen size={18} />,
        description: 'Sınav oluştur ve yönet',
        active: activeTab === 'exam-management',
        onClick: () => setActiveTab('exam-management'),
      },
    ],
    [activeTab],
  );

  const sidebarItems = useMemo<SidebarItem[]>(
    () => {
      return [
        {
          id: 'overview',
          label: 'Genel Bakış',
          icon: <BarChart3 size={18} />,
          description: 'Özet',
          active: activeTab === 'overview',
          onClick: () => setActiveTab('overview'),
        },
        {
          id: 'teachers',
          label: 'Öğretmenler',
          icon: <Users size={18} />,
          description: 'Kadrolar',
          active: activeTab === 'teachers',
          onClick: () => setActiveTab('teachers'),
        },
        {
          id: 'students',
          label: 'Öğrenciler',
          icon: <GraduationCap size={18} />,
          description: 'Kayıtlar',
          active: activeTab === 'students',
          onClick: () => setActiveTab('students'),
        },
        {
          id: 'parents',
          label: 'Veliler',
          icon: <Users size={18} />,
          description: 'İlişkilendirme',
          active: activeTab === 'parents',
          onClick: () => setActiveTab('parents'),
        },
        {
          id: 'complaints',
          label: 'Şikayet / Öneri',
          icon: <ClipboardList size={18} />,
          description: 'Geri bildirim',
          active: activeTab === 'complaints',
          onClick: () => setActiveTab('complaints'),
        },
        {
          id: 'test-center',
          label: 'Test & Sorular',
          icon: <BookOpen size={18} />,
          description: 'Sınav ve analiz araçları',
          active: testCenterSubItems.some((s) => s.active),
          children: testCenterSubItems,
        },
        {
          id: 'attendance',
          label: 'Devamsızlık',
          icon: <CalendarCheck size={18} />,
          description: 'Yoklama analizi',
          active: activeTab === 'attendance',
          onClick: () => setActiveTab('attendance'),
        },
      ];
    },
    [activeTab, adminNotifications, testCenterSubItems],
  );

  const adminBreadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const tabLabels: Record<string, string> = {
      overview: 'Genel Bakış',
      teachers: 'Öğretmenler',
      students: 'Öğrenciler',
      parents: 'Veliler',
      notifications: 'Bildirimler',
      complaints: 'Şikayet / Öneri',
      reports: 'Yıllık Rapor',
      'personalized-report': 'Kişiye Özel Rapor',
      'ai-question-parser': 'AI PDF Ayrıştırıcı',
      'optical-scanning': 'Optik Tarama',
      'exam-management': 'Sınav Yönetimi',
      'test-center': 'Test & Sorular',
      'questionbank': 'Soru Havuzu',
      attendance: 'Devamsızlık',
    };
    const items: BreadcrumbItem[] = [
      { label: 'Ana Sayfa', onClick: activeTab !== 'overview' ? () => setActiveTab('overview') : undefined },
    ];
    if (tabLabels[activeTab]) items.push({ label: tabLabels[activeTab] });
    return items;
  }, [activeTab]);

  useEffect(() => {
    if (!token) return;

    const fetchAll = async () => {
      try {
        setError(null);
        const [s, t, st, p, c] = await Promise.all([
          apiRequest<AdminSummary>('/admin/summary', {}, token),
          apiRequest<Teacher[]>('/admin/teachers', {}, token),
          apiRequest<Student[]>('/admin/students', {}, token),
          apiRequest<Parent[]>('/admin/parents', {}, token),
          apiRequest<Complaint[]>('/admin/complaints', {}, token),
        ]);
        setSummary(s);
        setTeachers(t);
        setStudents(st);
        setParents(p);
        setComplaints(c);
      } catch (e) {
        setError((e as Error).message);
      }
    };

    fetchAll();
  }, [token]);

  // Tüm dersleri listele (branş seçimi için)
  useEffect(() => {
    if (!token) return;
    setSubjectsLoading(true);
    getSubjectsList(token)
      .then((list) => {
        // Aynı ders ismi birden fazla kez gelirse tekilleştir
        // ve Sosyoloji / Mantık / Psikoloji derslerini hariç tut
        const blocked = new Set(
          ['sosyoloji', 'mantık', 'psikoloji'].map((n) => n.toLowerCase()),
        );
        const byName = new Map<string, { id: string; name: string }>();
        list.forEach((s) => {
          const lower = s.name.toLowerCase();
          if (blocked.has(lower)) return;
          if (!byName.has(lower)) {
            byName.set(lower, { id: s.id, name: s.name });
          }
        });
        setSubjects(Array.from(byName.values()));
      })
      .catch(() => setSubjects([]))
      .finally(() => setSubjectsLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || activeTab !== 'notifications') return;
    setAdminNotificationsLoading(true);
    getAdminNotifications(token)
      .then(setAdminNotifications)
      .catch(() => setAdminNotifications([]))
      .finally(() => setAdminNotificationsLoading(false));
  }, [token, activeTab]);

  useEffect(() => {
    if (
      !token ||
      (activeTab !== 'students' && activeTab !== 'parents')
    ) {
      return;
    }
    apiRequest<ClassGroup[]>('/admin/class-groups', {}, token)
      .then((list) => {
        // 9A sınıfını tüm panellerde gizle
        const filtered = list.filter((cg) => {
          const name = (cg.name || '').toLowerCase();
          return !name.includes('9a') && !name.includes('9/a') && !name.includes('9-a');
        });
        setClassGroups(filtered);
      })
      .catch(() => setClassGroups([]));
  }, [token, activeTab]);

  async function handleAddTeacher(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      if (!newTeacher.password || newTeacher.password.length < 4) {
        setError('Öğretmen şifresi en az 4 karakter olmalıdır.');
        return;
      }
      const created = await apiRequest<Teacher>(
        '/admin/teachers',
        {
          method: 'POST',
          body: JSON.stringify({
            name: newTeacher.name,
            email: newTeacher.email,
            subjectAreas: newTeacher.subjectAreas,
            assignedGrades: newTeacher.assignedGrades,
            password: newTeacher.password,
          }),
        },
        token,
      );
      setTeachers((prev) => [...prev, created]);
      setNewTeacher({ name: '', email: '', password: '', subjectAreas: [], assignedGrades: [] });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleUpdateTeacher(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !editingTeacherId) return;
    try {
      const updated = await apiRequest<Teacher>(
        `/admin/teachers/${editingTeacherId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: editTeacher.name,
            email: editTeacher.email,
            subjectAreas: editTeacher.subjectAreas,
            assignedGrades: editTeacher.assignedGrades,
            password: editTeacher.password || undefined,
          }),
        },
        token,
      );
      setTeachers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setEditingTeacherId(null);
      setEditTeacher({
        name: '',
        email: '',
        subjectAreas: [],
        assignedGrades: [],
        password: '',
      });
      setTeacherSuccess('Öğretmen başarıyla güncellendi.');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      let normalizedParentPhone: string | undefined;
      if (newStudent.parentPhone.trim()) {
        const cleaned = normalizeParentPhoneInput(newStudent.parentPhone);
        if (!cleaned) {
          setError('Geçersiz veli telefon numarası. Lütfen 555 123 45 67 formatında girin.');
          return;
        }
        normalizedParentPhone = cleaned;
      }

      if (!newStudent.password || newStudent.password.length < 4) {
        setError('Öğrenci şifresi en az 4 karakter olmalıdır.');
        return;
      }

      // Sınıf bilgisi: formda / filtrelerden al
      const effectiveGrade = newStudent.gradeLevel || studentFilterGrade;
      if (!effectiveGrade) {
        setError('Öğrenci için önce bir sınıf seçin.');
        return;
      }

      let effectiveClassId = newStudent.classId;
      if (!effectiveClassId) {
        const candidates = classGroups.filter((cg) => {
          if (cg.gradeLevel !== effectiveGrade) return false;
          const section = getClassSectionLabel(cg);
          if (studentFilterClassId && section !== studentFilterClassId) return false;
          const streamLabel =
            cg.stream === 'SAYISAL'
              ? 'Sayısal'
              : cg.stream === 'SOZEL'
                ? 'Sözel'
                : cg.stream === 'ESIT_AGIRLIK'
                  ? 'Eşit Ağırlık'
                  : null;
          if (studentFilterStream && streamLabel !== studentFilterStream) return false;
          return true;
        });

        // Eğer Sınıf + Şube (+ Alan) net seçilmişse, ilk eşleşen ClassGroup'u ata
        if (candidates.length >= 1 && studentFilterGrade && studentFilterClassId) {
          effectiveClassId = candidates[0].id;
        } else if (candidates.length === 1) {
          // Mevcut davranışı da koru
          effectiveClassId = candidates[0].id;
        }
      }

      const created = await apiRequest<Student>(
        '/admin/students',
        {
          method: 'POST',
          body: JSON.stringify({
            name: newStudent.name,
            email: newStudent.email,
            gradeLevel: effectiveGrade,
            classId: effectiveClassId || undefined,
            parentPhone: normalizedParentPhone,
            password: newStudent.password,
            profilePictureUrl: newStudent.profilePictureUrl || undefined,
          }),
        },
        token,
      );
      setStudents((prev) => [...prev, created]);
      setNewStudent({ name: '', email: '', gradeLevel: '', classId: '', parentPhone: '', password: '', profilePictureUrl: '' });
      setStudentSuccess('Öğrenci başarıyla eklendi.');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleAddParent(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      const created = await apiRequest<Parent>(
        '/admin/parents',
        {
          method: 'POST',
          body: JSON.stringify({
            name: newParent.name,
            email: newParent.email,
            password: 'password123',
          }),
        },
        token,
      );
      setParents((prev) => [...prev, created]);
      setNewParent({ name: '', email: '' });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleAssignStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !assignState.parentId || !assignState.studentId) return;
    try {
      const updatedParent = await apiRequest<Parent>(
        `/admin/parents/${assignState.parentId}/assign-student`,
        {
          method: 'POST',
          body: JSON.stringify({ studentId: assignState.studentId }),
        },
        token,
      );
      setParents((prev) =>
        prev.map((p) => (p.id === updatedParent.id ? updatedParent : p)),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEditStudent(s: Student) {
    setEditingStudentId(s.id);
    setEditStudent({
      name: s.name,
      email: s.email,
      gradeLevel: s.gradeLevel ?? '',
      classId: s.classId ?? '',
      parentPhone: s.parentPhone ? formatParentPhoneForDisplay(s.parentPhone) : '',
      password: '',
      profilePictureUrl: s.profilePictureUrl || '',
    });
  }

  async function handleUpdateStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !editingStudentId) return;
    try {
      let normalizedParentPhone: string | undefined | null = undefined;
      if (editStudent.parentPhone.trim()) {
        const cleaned = normalizeParentPhoneInput(editStudent.parentPhone);
        if (!cleaned) {
          setError('Geçersiz veli telefon numarası. Lütfen 555 123 45 67 formatında girin.');
          return;
        }
        normalizedParentPhone = cleaned;
      } else {
        normalizedParentPhone = null;
      }

      const updated = await apiRequest<Student>(
        `/admin/students/${editingStudentId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: editStudent.name,
            email: editStudent.email,
            gradeLevel: editStudent.gradeLevel,
            classId: editStudent.classId || undefined,
            parentPhone: normalizedParentPhone,
            password: editStudent.password || undefined,
            profilePictureUrl: editStudent.profilePictureUrl || undefined,
          }),
        },
        token,
      );
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditingStudentId(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!token) {
    return <div>Önce yönetici olarak giriş yapmalısınız.</div>;
  }

  return (
    <DashboardLayout
      accent="slate"
      brand="SKY"
      brandSuffix="ANALİZ"
      tagline="Admin Paneli"
      title="Yönetim Konsolu"
      subtitle="Kullanıcılar, atamalar ve geri bildirimleri yönetin."
      status={
        summary
          ? {
              label: `${summary.teacherCount} öğretmen · ${summary.studentCount} öğrenci`,
              tone: 'neutral',
            }
          : undefined
      }
      breadcrumbs={adminBreadcrumbs}
      sidebarItems={sidebarItems}
      user={{
        initials: user?.name?.slice(0, 2).toUpperCase() ?? 'AD',
        name: user?.name ?? 'Admin',
        subtitle: 'Yönetici',
        profilePictureUrl: resolveContentUrl(user?.profilePictureUrl),
      }}
      onLogout={logout}
    >
      {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {activeTab === 'overview' && summary && (
        <>
          <GlassCard
            title="Kısayollar"
            subtitle="Sık kullanılan sayfalara hızlı erişim"
            className="overview-shortcuts-card"
          >
            <div
              className="overview-shortcuts-grid"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
            >
              {(
                [
                  { id: 'teachers' as const, label: 'Öğretmenler', icon: <Users size={20} /> },
                  { id: 'students' as const, label: 'Öğrenciler', icon: <GraduationCap size={20} /> },
                  { id: 'parents' as const, label: 'Veliler', icon: <Users size={20} /> },
                  { id: 'attendance' as const, label: 'Devamsızlık', icon: <CalendarCheck size={20} /> },
                  { id: 'notifications' as const, label: 'Bildirimler', icon: <Bell size={20} /> },
                  { id: 'reports' as const, label: 'Raporlar', icon: <BarChart3 size={20} /> },
                  { id: 'test-center' as const, label: 'Test & Sorular', icon: <ClipboardList size={20} /> },
                  { id: 'ai-question-parser' as const, label: 'AI PDF Ayrıştırıcı', icon: <FileSearch size={20} /> },
                  { id: 'optical-scanning' as const, label: 'Optik Tarama', icon: <ScanLine size={20} /> },
                  { id: 'exam-management' as const, label: 'Sınav Yönetimi', icon: <BookOpen size={20} /> },
                ] satisfies Array<{ id: AdminTab; label: string; icon: React.ReactNode }>
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="overview-shortcut-btn"
                  onClick={() => setActiveTab(s.id)}
                >
                  <span className="overview-shortcut-icon">{s.icon}</span>
                  <span className="overview-shortcut-label">{s.label}</span>
                </button>
              ))}
            </div>
          </GlassCard>
        </>
      )}

      {activeTab === 'notifications' && (
        <GlassCard title="Bildirimler" subtitle="Şikayet / öneri ve sistem bildirimleri">
          {adminNotificationsLoading && adminNotifications.length === 0 && (
            <div className="empty-state">Yükleniyor...</div>
          )}
          {!adminNotificationsLoading && adminNotifications.length === 0 && (
            <div className="empty-state">Henüz bildirim yok.</div>
          )}
          {adminNotifications.length > 0 && (
            <div className="list-stack">
              {adminNotifications.map((n) => (
                <div
                  key={n.id}
                  className="list-row"
                  style={{ alignItems: 'flex-start', cursor: 'pointer' }}
                  onClick={() => {
                    setActiveNotificationId(n.id);
                    setNotificationDetailOpen(true);
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block' }}>{n.title}</strong>
                    <small style={{ display: 'block', marginTop: '0.15rem' }}>{n.body}</small>
                    <small style={{ display: 'block', marginTop: '0.25rem', opacity: 0.75 }}>
                      {new Date(n.createdAt).toLocaleString('tr-TR')}
                    </small>
                    {n.relatedEntityType === 'complaint' && n.relatedEntityId && (
                      <button
                        type="button"
                        className="ghost-btn"
                        style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveComplaintId(n.relatedEntityId!);
                          setActiveTab('complaints');
                        }}
                      >
                        Şikayeti incele
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <TagChip label={n.read ? 'Okundu' : 'Yeni'} tone={n.read ? 'success' : 'warning'} />
                    {!n.read && (
                      <button
                        type="button"
                        className="ghost-btn"
                        style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!token) return;
                          try {
                            await markAdminNotificationRead(token, n.id);
                            setAdminNotifications((prev) =>
                              prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
                            );
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        Okundu
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      <NotificationDetailModal
        open={notificationDetailOpen}
        notification={
          activeNotification
            ? ({
                id: activeNotification.id,
                title: activeNotification.title,
                body: activeNotification.body,
                createdAt: activeNotification.createdAt,
                read: activeNotification.read,
                type: activeNotification.type,
                relatedEntityType: activeNotification.relatedEntityType,
                relatedEntityId: activeNotification.relatedEntityId,
              } satisfies NotificationDetailModalData)
            : null
        }
        onClose={() => setNotificationDetailOpen(false)}
        actions={
          activeNotification && !activeNotification.read && token ? (
            <button
              type="button"
              className="ghost-btn"
              onClick={async () => {
                if (!token) return;
                try {
                  await markAdminNotificationRead(token, activeNotification.id);
                  setAdminNotifications((prev) =>
                    prev.map((x) => (x.id === activeNotification.id ? { ...x, read: true } : x)),
                  );
                } catch {
                  // ignore
                }
              }}
            >
              Okundu
            </button>
          ) : null
        }
      />

      {activeTab === 'questionbank' && <QuestionBankTab token={token} />}
      {activeTab === 'attendance' && <AdminAttendanceTab token={token} />}

      {activeTab === 'complaints' && (
        <>
          <div className="dual-grid">
            <GlassCard
              title="Şikayet / Öneri Gelen Kutusu"
              subtitle="Öğrenci ve velilerden gelen tüm kayıtlar."
            >
              {complaints.length === 0 ? (
                <div className="empty-state">Kayıt yok.</div>
              ) : (
                <ul
                  style={{
                    display: 'grid',
                    gap: '0.5rem',
                    paddingLeft: 0,
                    listStyle: 'none',
                    maxHeight: 420,
                    overflowY: 'auto',
                  }}
                >
                  {complaints.slice(0, 50).map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setActiveComplaintId(c.id)}
                        className="list-row"
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          justifyContent: 'space-between',
                          borderRadius: 10,
                        }}
                      >
                        <div>
                          <strong>{c.subject}</strong>
                          <small style={{ display: 'block', marginTop: '0.15rem' }}>
                            {c.fromUser?.name ?? '-'} ·{' '}
                            {new Date(c.createdAt).toLocaleDateString('tr-TR')}
                          </small>
                        </div>
                        <TagChip
                          label={c.status === 'open' ? 'Yeni' : 'Okundu'}
                          tone={c.status === 'open' ? 'warning' : 'success'}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>

            <GlassCard
              title="Detaylı İnceleme"
              subtitle="Seçili şikayetin tam içeriği ve durum yönetimi."
            >
              {(() => {
                const current =
                  complaints.find((c) => c.id === activeComplaintId) ?? complaints[0] ?? null;
                if (!current) {
                  return (
                    <div className="empty-state">
                      İncelemek için soldan bir kayıt seçin.
                    </div>
                  );
                }
                return (
                  <div style={{ padding: '1rem' }}>
                    <div style={{ marginBottom: '1rem' }}>
                      <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{current.subject}</h3>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Gönderen: {current.fromUser.name} ({current.fromRole}) &bull;{' '}
                        {new Date(current.createdAt).toLocaleString('tr-TR')}
                      </div>
                    </div>
                    <div
                      style={{
                        background: 'var(--surface-sunken)',
                        padding: '1rem',
                        borderRadius: 8,
                        marginBottom: '1rem',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {current.body}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {current.status === 'open' && (
                        <button
                          className="primary-btn"
                          onClick={async () => {
                            if (!token) return;
                            try {
                              const updated = await apiRequest<Complaint>(
                                `/admin/complaints/${current.id}`,
                                {
                                  method: 'PUT',
                                  body: JSON.stringify({ status: 'closed' }),
                                },
                                token,
                              );
                              setComplaints((prev) =>
                                prev.map((c) => (c.id === updated.id ? updated : c)),
                              );
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          Okundu Olarak İşaretle
                        </button>
                      )}
                      <button
                        className="danger-btn"
                        style={{ marginLeft: 'auto' }}
                        onClick={async () => {
                          if (!token) return;
                          if (!window.confirm('Bu şikayeti silmek istediğinize emin misiniz?')) return;
                          try {
                            await apiRequest(
                              `/admin/complaints/${current.id}`,
                              { method: 'DELETE' },
                              token,
                            );
                            setComplaints((prev) => prev.filter((c) => c.id !== current.id));
                            if (activeComplaintId === current.id) {
                              setActiveComplaintId(null);
                            }
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        <Trash2 size={16} />
                        <span className="ml-1">Sil</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </GlassCard>
          </div>

          <GlassCard
            title="Bildirimler"
            subtitle="Sistem bildirimlerini buradan görüntüleyin."
          >
            {adminNotificationsLoading && adminNotifications.length === 0 && (
              <div className="empty-state">Yükleniyor...</div>
            )}
            {!adminNotificationsLoading && adminNotifications.length === 0 && (
              <div className="empty-state">Henüz bildirim yok.</div>
            )}
            {adminNotifications.length > 0 && (
              <div className="list-stack">
                {adminNotifications.map((n) => (
                  <div
                    key={n.id}
                    className="list-row"
                    style={{ alignItems: 'flex-start', cursor: 'pointer' }}
                    onClick={() => {
                      setActiveNotificationId(n.id);
                      setNotificationDetailOpen(true);
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: 'block' }}>{n.title}</strong>
                      <small style={{ display: 'block', marginTop: '0.15rem' }}>{n.body}</small>
                      <small style={{ display: 'block', marginTop: '0.25rem', opacity: 0.75 }}>
                        {new Date(n.createdAt).toLocaleString('tr-TR')}
                      </small>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <TagChip label={n.read ? 'Okundu' : 'Yeni'} tone={n.read ? 'success' : 'warning'} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </>
      )}



      {activeTab === 'reports' && (
        <AdminReports />
      )}

      {activeTab === 'personalized-report' && (
        <PersonalizedReport />
      )}

      {activeTab === 'ai-question-parser' && (
        <GlassCard title="AI PDF Ayrıştırıcı" subtitle="Otomatik PDF tarama ve soru ayrıştırma">
          <QuestionParserPage />
        </GlassCard>
      )}

      {activeTab === 'optical-scanning' && (
        <GlassCard
          title="Optik Tarama ve Analiz"
          subtitle="Optik form dosyalarını yükleyin, sonuçları inceleyin ve öğrencilere gönderin."
        >
          <OpticalScanningPage />
        </GlassCard>
      )}

      {activeTab === 'test-center' && (
        <GlassCard
          title="Test & Sorular"
          subtitle="Sınavlar, optik tarama ve raporlar için araçları seçin."
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              marginTop: '0.5rem',
            }}
          >
            <button
              type="button"
              className="ghost-btn"
              style={{ justifyContent: 'flex-start', borderRadius: 16, padding: '0.85rem 1rem', textAlign: 'left' }}
              onClick={() => setActiveTab('ai-question-parser')}
            >
              <span style={{ marginRight: '0.6rem' }}>🤖</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>AI PDF Ayrıştırıcı</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>PDF içinden otomatik soru çıkarma</div>
              </div>
            </button>

            <button
              type="button"
              className="ghost-btn"
              style={{ justifyContent: 'flex-start', borderRadius: 16, padding: '0.85rem 1rem', textAlign: 'left' }}
              onClick={() => setActiveTab('optical-scanning')}
            >
              <span style={{ marginRight: '0.6rem' }}>📄</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Optik Tarama</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Optik formları oku, sonuçları analiz et</div>
              </div>
            </button>

            <button
              type="button"
              className="ghost-btn"
              style={{ justifyContent: 'flex-start', borderRadius: 16, padding: '0.85rem 1rem', textAlign: 'left' }}
              onClick={() => setActiveTab('exam-management')}
            >
              <span style={{ marginRight: '0.6rem' }}>📝</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Sınav Yönetimi</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Deneme ekleyin, sınıflara atayın</div>
              </div>
            </button>

            <button
              type="button"
              className="ghost-btn"
              style={{ justifyContent: 'flex-start', borderRadius: 16, padding: '0.85rem 1rem', textAlign: 'left' }}
              onClick={() => setActiveTab('reports')}
            >
              <span style={{ marginRight: '0.6rem' }}>📈</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Raporlar</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Yıllık gelişim ve başarı raporları</div>
              </div>
            </button>
          </div>
        </GlassCard>
      )}

      {activeTab === 'teachers' && (
        <GlassCard
          title="Öğretmenler"
          subtitle="Yeni öğretmen ekleyin ve listeyi yönetin."
        >
          <form onSubmit={handleAddTeacher} className="form" style={{ marginBottom: '0.75rem' }}>
            <div className="field">
              <span>İsim</span>
              <input
                value={newTeacher.name}
                onChange={(e) =>
                  setNewTeacher((t) => ({ ...t, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="field">
              <span>E-posta</span>
              <input
                type="email"
                value={newTeacher.email}
                onChange={(e) =>
                  setNewTeacher((t) => ({ ...t, email: e.target.value }))
                }
                required
              />
            </div>
            <div className="field">
              <span>Şifre</span>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Örn. Ogretmen123"
                value={newTeacher.password}
                onChange={(e) =>
                  setNewTeacher((t) => ({ ...t, password: e.target.value }))
                }
                required
              />
            </div>
            <div className="field">
              <span>Hangi sınıflara giriyor?</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
                {['4', '5', '6', '7', '8', '9', '10', '11', '12'].map((grade) => {
                  const selected = newTeacher.assignedGrades.includes(grade);
                  return (
                    <button
                      key={grade}
                      type="button"
                      className={selected ? 'primary-btn' : 'ghost-btn'}
                      onClick={() =>
                        setNewTeacher((t) => ({
                          ...t,
                          assignedGrades: selected
                            ? t.assignedGrades.filter((g) => g !== grade)
                            : [...t.assignedGrades, grade],
                        }))
                      }
                      style={
                        selected
                          ? { padding: '0.25rem 0.6rem', fontSize: '0.8rem' }
                          : {
                              padding: '0.25rem 0.6rem',
                              fontSize: '0.8rem',
                              border: '1px solid rgba(209,213,219,0.9)',
                              background: '#f9fafb',
                              color: '#111827',
                            }
                      }
                    >
                      {grade}. Sınıf
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="field">
              <span>Hangi derslere giriyor?</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
                {subjectsLoading && <span style={{ fontSize: '0.85rem' }}>Yükleniyor...</span>}
                {!subjectsLoading &&
                  subjects.map((s) => {
                    const selected = newTeacher.subjectAreas.includes(s.name);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={selected ? 'primary-btn' : 'ghost-btn'}
                        onClick={() =>
                          setNewTeacher((t) => ({
                            ...t,
                            subjectAreas: selected
                              ? t.subjectAreas.filter((name) => name !== s.name)
                              : [...t.subjectAreas, s.name],
                          }))
                        }
                        style={
                          selected
                            ? { padding: '0.25rem 0.6rem', fontSize: '0.8rem' }
                            : {
                                padding: '0.25rem 0.6rem',
                                fontSize: '0.8rem',
                                border: '1px solid rgba(209,213,219,0.9)',
                                background: '#f9fafb',
                                color: '#111827',
                              }
                        }
                      >
                        {s.name}
                      </button>
                    );
                  })}
              </div>
            </div>
            <button type="submit" className="primary-btn">Öğretmen Ekle</button>
          </form>
          <div className="list-stack">
            {teachers.length === 0 && (
              <div className="empty-state">Henüz öğretmen kaydı yok.</div>
            )}
            {teachers.map((t) => (
              <div
                key={t.id}
                className="list-row flex items-center justify-between gap-3 flex-nowrap"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {t.profilePictureUrl ? (
                    <img
                      src={resolveContentUrl(t.profilePictureUrl)}
                      alt={t.name}
                      style={{
                        width: '2.5rem',
                        height: '2.5rem',
                        borderRadius: '50%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '2.5rem',
                        height: '2.5rem',
                        borderRadius: '50%',
                        background: 'var(--color-primary-soft)',
                        color: 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {t.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex flex-col truncate">
                    <strong className="text-sm font-semibold truncate">{t.name}</strong>
                    <small className="text-xs text-slate-300 truncate">{t.email}</small>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEditTeacher(t)}
                    aria-label="Öğretmeni düzenle"
                    className="rounded-full transition-transform transition-colors hover:scale-105"
                    style={{
                      padding: '0.4rem',
                      borderRadius: 999,
                      border: '1px solid rgba(148,163,184,0.55)',
                      background:
                        'radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent-color) 22%, transparent), transparent 60%)',
                      boxShadow: '0 8px 18px rgba(15,23,42,0.35)',
                      color: 'var(--color-text-main)',
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTeacher(t)}
                    aria-label="Öğretmeni sil"
                    className="rounded-full transition-transform transition-colors hover:scale-110"
                    style={{
                      padding: '0.4rem',
                      borderRadius: 999,
                      border: '1px solid color-mix(in srgb, var(--danger-color) 70%, transparent)',
                      background:
                        'radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--danger-color) 28%, transparent), transparent 60%)',
                      boxShadow: '0 10px 24px rgba(127,29,29,0.45)',
                      color: 'var(--danger-color-soft)',
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div ref={editTeacherFormRef} style={{ marginTop: '1rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Öğretmen Düzenle</h3>
            {editingTeacherId ? (
              <form onSubmit={handleUpdateTeacher} className="form">
                <div className="field">
                  <span>İsim</span>
                  <input
                    value={editTeacher.name}
                    onChange={(e) =>
                      setEditTeacher((prev) => ({ ...prev, name: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="field">
                  <span>E-posta</span>
                  <input
                    type="email"
                    value={editTeacher.email}
                    onChange={(e) =>
                      setEditTeacher((prev) => ({ ...prev, email: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="field">
                  <span>Hangi sınıflara giriyor?</span>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.4rem',
                      marginTop: '0.25rem',
                    }}
                  >
                    {['4', '5', '6', '7', '8', '9', '10', '11', '12'].map((grade) => {
                      const selected = editTeacher.assignedGrades.includes(grade);
                      return (
                        <button
                          key={grade}
                          type="button"
                          className={selected ? 'primary-btn' : 'ghost-btn'}
                          onClick={() =>
                            setEditTeacher((prev) => ({
                              ...prev,
                              assignedGrades: selected
                                ? prev.assignedGrades.filter((g) => g !== grade)
                                : [...prev.assignedGrades, grade],
                            }))
                          }
                          style={
                            selected
                              ? { padding: '0.25rem 0.6rem', fontSize: '0.8rem' }
                              : {
                                  padding: '0.25rem 0.6rem',
                                  fontSize: '0.8rem',
                                  border: '1px solid rgba(209,213,219,0.9)',
                                  background: '#f9fafb',
                                  color: '#111827',
                                }
                          }
                        >
                          {grade}. Sınıf
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="field">
                  <span>Hangi derslere giriyor?</span>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.4rem',
                      marginTop: '0.25rem',
                    }}
                  >
                    {subjectsLoading && (
                      <span style={{ fontSize: '0.85rem' }}>Yükleniyor...</span>
                    )}
                    {!subjectsLoading &&
                      subjects.map((s) => {
                        const selected = editTeacher.subjectAreas.includes(s.name);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={selected ? 'primary-btn' : 'ghost-btn'}
                            onClick={() =>
                              setEditTeacher((prev) => ({
                                ...prev,
                                subjectAreas: selected
                                  ? prev.subjectAreas.filter((name) => name !== s.name)
                                  : [...prev.subjectAreas, s.name],
                              }))
                            }
                            style={
                              selected
                                ? { padding: '0.25rem 0.6rem', fontSize: '0.8rem' }
                                : {
                                    padding: '0.25rem 0.6rem',
                                    fontSize: '0.8rem',
                                    border: '1px solid rgba(209,213,219,0.9)',
                                    background: '#f9fafb',
                                    color: '#111827',
                                  }
                            }
                          >
                            {s.name}
                          </button>
                        );
                      })}
                  </div>
                </div>
                <div className="field">
                  <span>Yeni Şifre (opsiyonel)</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Boş bırakırsanız değişmez"
                    value={editTeacher.password}
                    onChange={(e) =>
                      setEditTeacher((prev) => ({ ...prev, password: e.target.value }))
                    }
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    marginTop: '0.5rem',
                    alignItems: 'center',
                  }}
                >
                  <button type="submit" className="primary-btn">
                    Kaydet
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      setEditingTeacherId(null);
                      setEditTeacher({
                        name: '',
                        email: '',
                        subjectAreas: [],
                        assignedGrades: [],
                        password: '',
                      });
                    }}
                  >
                    İptal
                  </button>
                  {teacherSuccess && (
                    <span style={{ fontSize: '0.8rem', color: 'rgb(52, 211, 153)' }}>
                      {teacherSuccess}
                    </span>
                  )}
                </div>
              </form>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'rgba(148,163,184,0.9)' }}>
                Düzenlemek için listeden bir öğretmenin yanındaki kalem ikonuna tıklayın.
              </p>
            )}
          </div>
        </GlassCard>
      )}

      {activeTab === 'students' && (
        <>
          <GlassCard
            title="Öğrenci Listesi"
            subtitle="Sınıf, şube ve alana göre öğrencileri filtreleyin; satıra tıklayarak detayları düzenleyin."
            collapsible
            collapsed={!studentsPanelOpen}
            onToggleCollapsed={() => setStudentsPanelOpen((prev) => !prev)}
          >
            {/* Filtreler */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
              <div style={{ minWidth: 160 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', opacity: 0.85, marginBottom: '0.3rem' }}>Sınıf</label>
                <select
                  value={studentFilterGrade}
                  onChange={(e) => setStudentFilterGrade(e.target.value)}
                  className="attendance-select"
                  style={{ padding: '0.5rem 0.65rem', minWidth: 120 }}
                >
                  <option value="">Tümü</option>
                  {['4', '5', '6', '7', '8', '9', '10', '11', '12', 'Mezun'].map((grade) => (
                    <option key={grade} value={grade}>
                      {grade === 'Mezun' ? 'Mezun' : `${grade}. Sınıf`}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: 200 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', opacity: 0.85, marginBottom: '0.3rem' }}>Şube</label>
                <select
                  value={studentFilterClassId}
                  onChange={(e) => setStudentFilterClassId(e.target.value)}
                  className="attendance-select"
                  style={{ padding: '0.5rem 0.65rem', minWidth: 90 }}
                >
                  <option value="">Tümü</option>
                  {['A', 'B', 'C', 'D', 'E'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: 200 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', opacity: 0.85, marginBottom: '0.3rem' }}>Alan</label>
                <select
                  value={studentFilterStream}
                  onChange={(e) => setStudentFilterStream(e.target.value)}
                  className="attendance-select"
                  style={{ padding: '0.5rem 0.65rem' }}
                  disabled={!['11', '12', 'Mezun'].includes(studentFilterGrade)}
                >
                  <option value="">Tümü</option>
                  {['Sayısal', 'Sözel', 'Eşit Ağırlık'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="dual-grid">
              <div
                className="list-stack"
                style={{ height: '100%', maxHeight: 'none', overflowY: 'auto', overflowX: 'hidden', minWidth: 360 }}
              >
              {filteredStudents.map((s) => {
                const phoneDisplay = s.parentPhone ? formatParentPhoneForDisplay(s.parentPhone) : '—';
                return (
                  <div
                    key={s.id}
                    className="list-row"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      borderRadius: 12,
                      border: editingStudentId === s.id ? '1px solid var(--accent-color)' : undefined,
                      background:
                        editingStudentId === s.id
                          ? 'linear-gradient(145deg, color-mix(in srgb, var(--accent-color) 12%, transparent), rgba(59,130,246,0.06))'
                          : undefined,
                    }}
                    role="button"
                    tabIndex={0}
                    onClick={() => startEditStudent(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') startEditStudent(s);
                    }}
                  >
                    {s.profilePictureUrl ? (
                      <img
                        src={resolveContentUrl(s.profilePictureUrl)}
                        alt={s.name}
                        style={{
                          width: '3rem',
                          height: '3rem',
                          borderRadius: '12px',
                          objectFit: 'cover',
                          boxShadow: 'var(--shadow-sm)',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '3rem',
                          height: '3rem',
                          borderRadius: '12px',
                          background: 'var(--color-primary-soft)',
                          color: 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1rem',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {s.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <strong>{s.name}</strong>
                      <small>{s.email}</small>
                      <div style={{ fontSize: '0.8rem', marginTop: '0.2rem', opacity: 0.9 }}>
                        Sınıf: {s.gradeLevel || '—'}
                      </div>
                      <div
                        style={{ fontSize: '0.8rem', marginTop: '0.1rem', opacity: 0.9 }}
                        title={s.parentPhone ? `Veli Tel: ${phoneDisplay}` : 'Veli telefonu girilmemiş'}
                      >
                        Veli Tel:{' '}
                        <span style={{ filter: 'blur(2px)' }}>
                          {phoneDisplay}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTab('reports');
                        }}
                      >
                        PDF / Rapor
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {editingStudentId && (
              <div
                ref={editStudentFormRef}
                style={{ maxWidth: 420, margin: '0 auto' }}
              >
                <h3 style={{ marginBottom: '0.5rem', textAlign: 'center' }}>Öğrencileri Görüntüle</h3>
                <form onSubmit={handleUpdateStudent} className="form" style={{ maxWidth: '100%' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                    <div className="field">
                      <span>İsim</span>
                      <input
                        value={editStudent.name}
                        onChange={(e) =>
                          setEditStudent((s) => ({ ...s, name: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="field">
                      <span>E-posta</span>
                      <input
                        type="email"
                        value={editStudent.email}
                        onChange={(e) =>
                          setEditStudent((s) => ({ ...s, email: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="field">
                      <span>Sınıf</span>
                      <select
                        value={editStudent.gradeLevel}
                        onChange={(e) =>
                          setEditStudent((s) => ({
                            ...s,
                            gradeLevel: e.target.value,
                          }))
                        }
                        required
                      >
                        <option value="">Seçin</option>
                        {['4', '5', '6', '7', '8', '9', '10', '11', '12', 'Mezun'].map((grade) => (
                          <option key={grade} value={grade}>
                            {grade === 'Mezun' ? 'Mezun' : `${grade}. Sınıf`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <span>Şube</span>
                      <select
                        value={getClassSectionLabel(
                          classGroups.find((cg) => cg.id === editStudent.classId) ?? null,
                        ) ?? ''}
                        onChange={(e) => {
                          const section = e.target.value || null;
                          if (!section) {
                            setEditStudent((s) => ({ ...s, classId: '' }));
                            return;
                          }
                          const candidate = classGroups.find((cg) => {
                            if (cg.gradeLevel !== editStudent.gradeLevel) return false;
                            return getClassSectionLabel(cg) === section;
                          });
                          setEditStudent((s) => ({
                            ...s,
                            classId: candidate?.id ?? s.classId,
                          }));
                        }}
                      >
                        <option value="">Tümü</option>
                        {['A', 'B', 'C', 'D', 'E'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <span>Alan</span>
                      <select
                        value={(() => {
                          const cg = classGroups.find((g) => g.id === editStudent.classId);
                          if (!cg) return '';
                          if (cg.stream === 'SAYISAL') return 'Sayısal';
                          if (cg.stream === 'SOZEL') return 'Sözel';
                          if (cg.stream === 'ESIT_AGIRLIK') return 'Eşit Ağırlık';
                          return '';
                        })()}
                        disabled={!['4', '5', '6', '7', '8', '9', '10', '11', '12', 'Mezun'].includes(editStudent.gradeLevel) || !['11', '12', 'Mezun'].includes(editStudent.gradeLevel)}
                        onChange={(e) => {
                          const streamLabel = e.target.value;
                          const targetStream =
                            streamLabel === 'Sayısal'
                              ? 'SAYISAL'
                              : streamLabel === 'Sözel'
                                ? 'SOZEL'
                                : streamLabel === 'Eşit Ağırlık'
                                  ? 'ESIT_AGIRLIK'
                                  : null;
                          const candidate = classGroups.find((cg) => {
                            if (cg.gradeLevel !== editStudent.gradeLevel) return false;
                            if (!targetStream) return true;
                            return cg.stream === targetStream;
                          });
                          setEditStudent((s) => ({
                            ...s,
                            classId: candidate?.id ?? s.classId,
                          }));
                        }}
                      >
                        <option value="">Tümü</option>
                        {['Sayısal', 'Sözel', 'Eşit Ağırlık'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <span>Veli Telefonu</span>
                      <input
                        placeholder="555 123 45 67"
                        value={editStudent.parentPhone}
                        onChange={(e) =>
                          setEditStudent((s) => ({
                            ...s,
                            parentPhone: e.target.value.replace(/[^\d\s]/g, ''),
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <span>Yeni Şifre (opsiyonel)</span>
                      <input
                        type="password"
                        value={editStudent.password}
                        onChange={(e) =>
                          setEditStudent((s) => ({
                            ...s,
                            password: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="field" style={{ marginTop: '0.5rem' }}>
                    <span>Profil Resmi</span>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {editStudent.profilePictureUrl && (
                        <img
                          src={resolveContentUrl(editStudent.profilePictureUrl)}
                          alt="Profil önizleme"
                          style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                        />
                      )}
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.4rem 0.9rem',
                          borderRadius: 999,
                          border: '1px solid rgba(148,163,184,0.6)',
                          background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(241,245,249,0.95))',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: 'var(--color-text-main)',
                          boxShadow: '0 8px 20px rgba(15,23,42,0.08)',
                        }}
                      >
                        Resim Seç
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file && token) {
                              try {
                                const { url } = await uploadAdminStudentImage(token, file);
                                setEditStudent((s) => ({ ...s, profilePictureUrl: url }));
                              } catch (err) {
                                setError('Resim yüklenemedi');
                              }
                            }
                          }}
                        />
                      </label>
                      {!editStudent.profilePictureUrl && (
                        <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Henüz resim seçilmedi</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <button type="submit" className="primary-btn">
                      Kaydet
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setEditingStudentId(null)}
                    >
                      İptal
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard
          title="Öğrenci Ekle"
          subtitle="Yeni öğrenciyi sisteme kaydedin."
          collapsible
          collapsed={!addStudentPanelOpen}
          onToggleCollapsed={() => setAddStudentPanelOpen((prev) => !prev)}
        >
          <form onSubmit={handleAddStudent} className="form" style={{ maxWidth: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              <div className="field">
                <span>İsim</span>
                <input
                  value={newStudent.name}
                  onChange={(e) =>
                    setNewStudent((s) => ({ ...s, name: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <span>E-posta</span>
                <input
                  type="email"
                  value={newStudent.email}
                  onChange={(e) =>
                    setNewStudent((s) => ({ ...s, email: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <span>Veli Telefonu</span>
                <input
                  placeholder="555 123 45 67"
                  value={newStudent.parentPhone}
                  onChange={(e) =>
                    setNewStudent((s) => ({
                      ...s,
                      parentPhone: e.target.value.replace(/[^\d\s]/g, ''),
                    }))
                  }
                />
              </div>
              <div className="field">
                <span>Şifre</span>
                <input
                  type="password"
                  value={newStudent.password}
                  onChange={(e) =>
                    setNewStudent((s) => ({
                      ...s,
                      password: e.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>
            {/* Sınıf filtreleri – öğrenci eklerken de erişilebilir olsun */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '1rem' }}>
              <div style={{ minWidth: 160 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', opacity: 0.85, marginBottom: '0.3rem' }}>Sınıf</label>
                <select
                  value={studentFilterGrade}
                  onChange={(e) => setStudentFilterGrade(e.target.value)}
                  className="attendance-select"
                  style={{ padding: '0.5rem 0.65rem', minWidth: 120 }}
                >
                  <option value="">Tümü</option>
                  {['4', '5', '6', '7', '8', '9', '10', '11', '12', 'Mezun'].map((grade) => (
                    <option key={grade} value={grade}>
                      {grade === 'Mezun' ? 'Mezun' : `${grade}. Sınıf`}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: 200 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', opacity: 0.85, marginBottom: '0.3rem' }}>Şube</label>
                <select
                  value={studentFilterClassId}
                  onChange={(e) => setStudentFilterClassId(e.target.value)}
                  className="attendance-select"
                  style={{ padding: '0.5rem 0.65rem', minWidth: 90 }}
                >
                  <option value="">Tümü</option>
                  {['A', 'B', 'C', 'D', 'E'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: 200 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', opacity: 0.85, marginBottom: '0.3rem' }}>Alan</label>
                <select
                  value={studentFilterStream}
                  onChange={(e) => setStudentFilterStream(e.target.value)}
                  className="attendance-select"
                  style={{ padding: '0.5rem 0.65rem' }}
                  disabled={!['11', '12', 'Mezun'].includes(studentFilterGrade)}
                >
                  <option value="">Tümü</option>
                  {['Sayısal', 'Sözel', 'Eşit Ağırlık'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field" style={{ marginTop: '0.75rem' }}>
              <span>Profil Resmi</span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {newStudent.profilePictureUrl && (
                  <img
                    src={resolveContentUrl(newStudent.profilePictureUrl)}
                    alt="Profil önizleme"
                    style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                  />
                )}
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.4rem 0.9rem',
                    borderRadius: 999,
                    border: '1px solid rgba(148,163,184,0.6)',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(241,245,249,0.95))',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--color-text-main)',
                    boxShadow: '0 8px 20px rgba(15,23,42,0.08)',
                  }}
                >
                  Resim Seç
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file && token) {
                        try {
                          const { url } = await uploadAdminStudentImage(token, file);
                          setNewStudent((s) => ({ ...s, profilePictureUrl: url }));
                        } catch (err) {
                          setError('Resim yüklenemedi');
                        }
                      }
                    }}
                  />
                </label>
                {!newStudent.profilePictureUrl && (
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Henüz resim seçilmedi</span>
                )}
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <button type="submit" className="primary-btn">Öğrenci Ekle</button>
            </div>
            {studentSuccess && (
              <div style={{ marginTop: '0.5rem' }}>
                <TagChip label={studentSuccess} tone="success" />
              </div>
            )}
          </form>
        </GlassCard>
      </>
      )}

      {activeTab === 'parents' && (
        <GlassCard
          title="Veliler & Öğrenci Atama"
          subtitle="Veli hesapları oluşturun ve öğrenci atamalarını yönetin. Yeni velilerin varsayılan şifresi: password123"
        >
          <form onSubmit={handleAddParent} className="form" style={{ marginBottom: '0.75rem' }}>
            <div className="field">
              <span>İsim</span>
              <input
                value={newParent.name}
                onChange={(e) =>
                  setNewParent((p) => ({ ...p, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="field">
              <span>E-posta</span>
              <input
                type="email"
                value={newParent.email}
                onChange={(e) =>
                  setNewParent((p) => ({ ...p, email: e.target.value }))
                }
                required
              />
            </div>
            <button type="submit" className="primary-btn">Veli Ekle</button>
          </form>

          <form onSubmit={handleAssignStudent} className="form" style={{ marginBottom: '0.75rem' }}>
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                marginBottom: '0.75rem',
              }}
            >
              <div style={{ minWidth: 140 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    opacity: 0.85,
                    marginBottom: '0.3rem',
                  }}
                >
                  Sınıf
                </label>
                <select
                  value={parentAssignGrade}
                  onChange={(e) => setParentAssignGrade(e.target.value)}
                  className="attendance-select"
                  style={{ padding: '0.5rem 0.65rem', minWidth: 120 }}
                >
                  <option value="">Tümü</option>
                  {['4', '5', '6', '7', '8', '9', '10', '11', '12', 'Mezun'].map((grade) => (
                    <option key={grade} value={grade}>
                      {grade === 'Mezun' ? 'Mezun' : `${grade}. Sınıf`}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: 120 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    opacity: 0.85,
                    marginBottom: '0.3rem',
                  }}
                >
                  Şube
                </label>
                <select
                  value={parentAssignSection}
                  onChange={(e) => setParentAssignSection(e.target.value)}
                  className="attendance-select"
                  style={{ padding: '0.5rem 0.65rem', minWidth: 90 }}
                >
                  <option value="">Tümü</option>
                  {['A', 'B', 'C', 'D', 'E'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: 160 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    opacity: 0.85,
                    marginBottom: '0.3rem',
                  }}
                >
                  Alan
                </label>
                <select
                  value={parentAssignStream}
                  onChange={(e) => setParentAssignStream(e.target.value)}
                  className="attendance-select"
                  style={{ padding: '0.5rem 0.65rem' }}
                  disabled={!['11', '12', 'Mezun'].includes(parentAssignGrade)}
                >
                  <option value="">Tümü</option>
                  {['Sayısal', 'Sözel', 'Eşit Ağırlık'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <span>Veli</span>
              <select
                value={assignState.parentId}
                onChange={(e) =>
                  setAssignState((st) => ({ ...st, parentId: e.target.value }))
                }
              >
                <option value="">Veli seçin</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span>Öğrenci</span>
              <select
                value={assignState.studentId}
                onChange={(e) =>
                  setAssignState((st) => ({
                    ...st,
                    studentId: e.target.value,
                  }))
                }
              >
                <option value="">
                  {parentAssignGrade || parentAssignSection || parentAssignStream
                    ? 'Öğrenci seçin'
                    : 'Önce sınıf / şube seçin'}
                </option>
                {filteredStudentsForParentAssign.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="primary-btn">Velinin Öğrencilerine Ekle</button>
          </form>

          <div className="list-stack">
            {parents.length === 0 && (
              <div className="empty-state">Henüz veli kaydı yok.</div>
            )}
            {parents.map((p) => {
              const linkedStudentNames = p.studentIds
                .map((id) => students.find((s) => s.id === id)?.name)
                .filter((name): name is string => !!name);
              const label =
                linkedStudentNames.length > 0
                  ? linkedStudentNames.join(', ')
                  : p.studentIds.join(', ');

              return (
                <div key={p.id} className="list-row">
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.email}</small>
                    {p.studentIds.length > 0 && (
                      <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                        Öğrenciler: {label}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {activeTab === 'exam-management' && <ExamManagement token={token!} />}

    </DashboardLayout>
  );
};

