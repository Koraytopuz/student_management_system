# Veli Paneli – Fonksiyonel Özellik Spesifikasyonu

## Genel Bakış

Bu doküman, veli paneli için öğrenci aktivite takibi, raporlama ve öğretmen ile iletişim özelliklerinin fonksiyonel spesifikasyonunu içerir. Her özellik için detaylı kullanıcı akışları, sistem davranışları ve veri gereksinimleri tanımlanmıştır.

**Temel Prensipler**:
- Veli sadece kendi çocuk(lar)ının verilerine erişebilir
- Diğer öğrencilerin kişisel verilerine erişim yoktur (sadece anonim sınıf ortalamaları gösterilebilir)
- Çoklu öğrenci desteği: Bir velinin birden fazla çocuğu olabilir

---

## 1. Ana Dashboard ve Genel Durum Özeti

### 1.1 Çoklu Öğrenci Dashboard Görünümü

**Amaç**: Veli, tüm çocuklarının genel durumunu tek bir ekranda görebilir.

**Kullanıcı Akışı**:
1. Veli giriş yaptıktan sonra ana dashboard'a yönlendirilir
2. Sistem, velinin bağlı olduğu tüm öğrencileri listeler
3. Her öğrenci için bir özet kartı gösterilir

**Sistem Davranışı**:
- Her öğrenci kartında şu bilgiler gösterilir:
  - Öğrenci adı ve sınıf bilgisi
  - Son 7 günde çözülen test sayısı
  - Ortalama başarı yüzdesi (son 7 gün)
  - Toplam çalışma süresi (dakika)
  - Son aktivite tarihi
  - Durum göstergesi (aktif/pasif - son 3 gün içinde aktivite varsa aktif)
- Kartlar, son aktivite tarihine göre sıralanır (en aktif üstte)
- Veli bir öğrenci kartına tıklayarak o öğrencinin detaylı sayfasına gidebilir

**Veri Gereksinimleri**:
```typescript
interface ParentDashboardSummaryStudentCard {
  studentId: string;
  studentName: string;
  gradeLevel: string;
  classId: string;
  className?: string;
  testsSolvedLast7Days: number;
  averageScorePercent: number;
  totalStudyMinutes: number;
  lastActivityDate?: string;
  status: 'active' | 'inactive'; // Son 3 gün içinde aktivite varsa aktif
  pendingAssignmentsCount: number;
  overdueAssignmentsCount: number;
}

interface ParentDashboardSummary {
  children: ParentDashboardSummaryStudentCard[];
  overallStats?: {
    totalChildren: number;
    totalTestsSolved: number;
    averageScoreAcrossAll: number;
  };
}
```

**API Endpoint**: `GET /parent/dashboard`
- Response: `ParentDashboardSummary`

---

### 1.2 Tek Öğrenci Detay Sayfası

**Amaç**: Veli, belirli bir çocuğunun detaylı bilgilerini görüntüleyebilir.

**Kullanıcı Akışı**:
1. Veli ana dashboard'dan bir öğrenci kartına tıklar
2. Öğrenci detay sayfası açılır
3. Sayfa şu bölümleri içerir:
   - Hızlı istatistikler (kartlar halinde)
   - Son aktiviteler listesi
   - Yaklaşan görevler
   - Performans grafikleri (küçük önizleme)

**Sistem Davranışı**:
- Sayfa yüklendiğinde öğrencinin tüm aktivite verileri getirilir
- Erişim kontrolü: Veli sadece kendi çocuğunun verilerine erişebilir
- Veri yoksa uygun mesaj gösterilir

**API Endpoint**: `GET /parent/children/:studentId/summary`
- Response: `StudentDetailSummary`

---

## 2. Öğrenci Aktivite Takibi (Activity Tracking)

### 2.1 Panelde Geçirilen Süre Takibi

**Amaç**: Veli, çocuğunun sistemde ne kadar zaman geçirdiğini görebilir.

**Kullanıcı Akışı**:
1. Veli "Aktivite Takibi" sekmesine tıklar
2. Zaman takibi sayfası açılır
3. Veli zaman aralığı seçebilir:
   - Bugün
   - Son 7 gün
   - Son 30 gün
   - Özel tarih aralığı
4. Grafik ve istatistikler gösterilir:
   - Günlük/haftalık toplam süre grafiği (bar chart)
   - Günlük ortalama süre
   - En aktif günler
   - Aktivite saatleri dağılımı (hangi saatlerde daha aktif)

**Sistem Davranışı**:
- Panel aktivite süresi hesaplaması:
  - Sistemde oturum açık olduğu süre (session tracking)
  - Test çözme süresi
  - Video/ders içerik izleme süresi
  - Toplam = Test süresi + İçerik izleme süresi + Aktif oturum süresi
- Veriler gerçek zamanlı güncellenir
- İnaktif süreler (30 dakikadan fazla aktivite yoksa) hesaba katılmaz

**Veri Gereksinimleri**:
```typescript
interface ActivityTimeTracking {
  date: string; // ISO format
  totalMinutes: number;
  testMinutes: number;
  contentWatchingMinutes: number;
  activeSessionMinutes: number;
  breakCount: number; // Kaç kez ara verdi
}

interface ActivityTimeSummary {
  period: 'today' | 'last7days' | 'last30days' | 'custom';
  startDate?: string;
  endDate?: string;
  dailyData: ActivityTimeTracking[];
  totalMinutes: number;
  averageMinutesPerDay: number;
  mostActiveDay: string;
  activityByHour: { hour: number; minutes: number }[]; // 0-23 saatleri
}
```

**API Endpoint**: `GET /parent/children/:studentId/activity-time?period=...&startDate=...&endDate=...`
- Query parametreleri: `period`, `startDate`, `endDate`
- Response: `ActivityTimeSummary`

---

### 2.2 Test ve Görev Aktivite Takibi

**Amaç**: Veli, çocuğunun test çözme ve görev tamamlama aktivitelerini takip edebilir.

**Kullanıcı Akışı**:
1. Veli "Test ve Görevler" sekmesine tıklar
2. Test ve görev listesi açılır
3. Filtreleme seçenekleri:
   - Durum: Tümü / Tamamlanmış / Devam Eden / Gecikmiş
   - Tarih: Bugün / Bu Hafta / Bu Ay / Tümü
   - Ders: Matematik / Fen / Türkçe / vb.
4. Her görev/test için:
   - Görev/test başlığı
   - Ders ve konu
   - Son teslim tarihi
   - Durum (tamamlandı/gecikmiş/devam ediyor)
   - Test sonucu (tamamlandıysa)
   - Tamamlanma tarihi

**Sistem Davranışı**:
- Görevler son teslim tarihine göre sıralanır
- Gecikmiş görevler özel olarak vurgulanır (kırmızı)
- Test sonuçları detaylı gösterilir:
  - Doğru/yanlış/boş sayıları
  - Net puan
  - Başarı yüzdesi
  - Kullanılan süre
- Tamamlanmamış görevler için kalan süre gösterilir

**Veri Gereksinimleri**:
```typescript
interface AssignmentActivityItem {
  assignmentId: string;
  title: string;
  description?: string;
  type: 'test' | 'content' | 'mixed';
  subjectName: string;
  topic: string;
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  completedAt?: string;
  testResult?: {
    testId: string;
    correctCount: number;
    incorrectCount: number;
    blankCount: number;
    scorePercent: number;
    durationSeconds: number;
  };
  contentProgress?: {
    contentId: string;
    watchedPercent: number;
    completed: boolean;
  };
}

interface AssignmentActivitySummary {
  assignments: AssignmentActivityItem[];
  statistics: {
    totalCount: number;
    completedCount: number;
    pendingCount: number;
    overdueCount: number;
    averageScorePercent: number;
  };
}
```

**API Endpoint**: `GET /parent/children/:studentId/assignments?status=...&dateRange=...&subjectId=...`
- Query parametreleri: `status`, `dateRange`, `subjectId`
- Response: `AssignmentActivitySummary`

---

### 2.3 Video ve İçerik Kullanım Takibi

**Amaç**: Veli, çocuğunun hangi ders içeriklerini izlediğini ve ne kadar süre harcadığını görebilir.

**Kullanıcı Akışı**:
1. Veli "İçerik Kullanımı" sekmesine tıklar
2. İçerik izleme listesi açılır
3. İçerikler şu şekilde organize edilir:
   - Ders bazlı gruplama
   - Konu bazlı alt gruplama
   - İzlenme durumuna göre filtreleme (Tamamlanmış / Devam Eden / Başlanmamış)
4. Her içerik için:
   - İçerik başlığı ve tipi (video/ses/doküman)
   - Toplam süre
   - İzlenen süre ve yüzde
   - İzlenme durumu (tamamlandı/devam ediyor/başlanmadı)
   - Son izlenme tarihi
   - Kaç kez izlendiği

**Sistem Davranışı**:
- İçerikler, öğrenciye atanmış içerikleri gösterir
- İzlenme yüzdesi: (İzlenen süre / Toplam süre) × 100
- Tamamlanmış içerikler özel işaretle gösterilir
- İçerik başlığına tıklandığında detaylı izlenme geçmişi gösterilir:
  - Hangi tarihlerde izlendiği
  - Her izleme oturumunda ne kadar süre harcandığı
  - İçeriğin hangi bölümlerinde daha çok zaman harcandığı (video için)

**Veri Gereksinimleri**:
```typescript
interface ContentUsageItem {
  contentId: string;
  title: string;
  description?: string;
  type: 'video' | 'audio' | 'document';
  subjectName: string;
  topic: string;
  totalDurationMinutes: number;
  watchedDurationMinutes: number;
  watchedPercent: number;
  watchCount: number; // Kaç kez izlendi
  lastWatchedAt?: string;
  completed: boolean;
  assignedDate: string;
}

interface ContentUsageDetail {
  contentId: string;
  watchSessions: {
    date: string;
    watchedSeconds: number;
    completed: boolean;
  }[];
  totalWatchTime: number;
  averageWatchTime: number;
  completionRate: number; // %100 tamamlanma oranı
}

interface ContentUsageSummary {
  contents: ContentUsageItem[];
  statistics: {
    totalContents: number;
    completedCount: number;
    inProgressCount: number;
    notStartedCount: number;
    totalWatchTimeMinutes: number;
    averageCompletionPercent: number;
  };
}
```

**API Endpoints**:
- `GET /parent/children/:studentId/content-usage?status=...&subjectId=...` - İçerik kullanım listesi
- `GET /parent/children/:studentId/content-usage/:contentId` - İçerik detaylı izlenme geçmişi

---

### 2.4 Günlük/Haftalık Aktivite Özeti

**Amaç**: Veli, çocuğunun günlük ve haftalık aktivite özetini görüntüleyebilir.

**Kullanıcı Akışı**:
1. Veli ana dashboard'da veya aktivite sayfasında "Günlük Özet" / "Haftalık Özet" butonuna tıklar
2. Özet sayfası açılır
3. Özet içeriği:
   - Tarih aralığı
   - Çözülen test sayısı
   - Çözülen soru sayısı
   - Ortalama başarı yüzdesi
   - Toplam çalışma süresi
   - İzlenen içerik sayısı ve süresi
   - Tamamlanan görev sayısı
   - Geciken görev sayısı (varsa)
   - En çok çalışılan dersler
   - En çok çalışılan konular

**Sistem Davranışı**:
- Özet, seçilen tarih aralığına göre otomatik hesaplanır
- Veriler grafiklerle desteklenir:
  - Günlük aktivite çizelgesi
  - Ders bazlı dağılım (pie chart)
  - Başarı trendi (line chart)
- Özet PDF olarak indirilebilir (opsiyonel)

**Veri Gereksinimleri**:
```typescript
interface ActivitySummary {
  period: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  testsSolved: number;
  questionsSolved: number;
  averageScorePercent: number;
  totalStudyMinutes: number;
  contentsWatched: number;
  contentsWatchTimeMinutes: number;
  assignmentsCompleted: number;
  assignmentsOverdue: number;
  topSubjects: { subjectName: string; studyMinutes: number }[];
  topTopics: { topic: string; studyMinutes: number }[];
  dailyBreakdown: {
    date: string;
    testsSolved: number;
    questionsSolved: number;
    studyMinutes: number;
  }[];
}
```

**API Endpoint**: `GET /parent/children/:studentId/activity-summary?period=...&startDate=...&endDate=...`
- Query parametreleri: `period`, `startDate`, `endDate`
- Response: `ActivitySummary`

---

## 3. Raporlama ve Özetler (Reporting)

### 3.1 Haftalık Otomatik Rapor

**Amaç**: Veli, çocuğunun haftalık performans özetini otomatik olarak alabilir.

**Kullanıcı Akışı**:
1. Sistem her hafta sonunda (Pazar günü) otomatik rapor oluşturur
2. Veli bildirim merkezinde rapor hazır olduğunu görür
3. Veli "Haftalık Raporlar" sekmesine tıklar
4. Rapor listesi açılır (tarih sırasına göre)
5. Veli bir rapora tıklar
6. Rapor detay sayfası açılır:
   - Hafta bilgisi (başlangıç-bitiş tarihi)
   - Genel performans özeti
   - Test sonuçları özeti
   - İçerik kullanım özeti
   - Görev tamamlama durumu
   - Grafikler ve görselleştirmeler
   - Öğretmen geri bildirimi (varsa)

**Sistem Davranışı**:
- Rapor otomatik oluşturulur (cron job veya scheduled task)
- Rapor içeriği:
  - Haftalık istatistikler
  - Önceki hafta ile karşılaştırma (iyileşme/düşüş göstergeleri)
  - Konu bazlı performans analizi
  - Zayıf ve güçlü alanlar
  - Öneriler ve tavsiyeler
- Rapor PDF formatında indirilebilir
- Rapor e-posta ile gönderilebilir (veli tercihine göre)

**Veri Gereksinimleri**:
```typescript
interface WeeklyReport {
  id: string;
  studentId: string;
  weekStartDate: string;
  weekEndDate: string;
  generatedAt: string;
  summary: ActivitySummary;
  comparisonWithPreviousWeek?: {
    testsSolvedChange: number; // +5 veya -3 gibi
    averageScoreChange: number;
    studyTimeChange: number;
  };
  topicPerformance: {
    topic: string;
    averageScore: number;
    testsCompleted: number;
    strengthLevel: 'weak' | 'average' | 'strong';
  }[];
  teacherFeedback?: string;
  recommendations: string[]; // Sistem önerileri
}

interface WeeklyReportList {
  reports: WeeklyReport[];
  hasMore: boolean;
}
```

**API Endpoints**:
- `GET /parent/children/:studentId/weekly-reports` - Haftalık raporları listele
- `GET /parent/children/:studentId/weekly-reports/:reportId` - Rapor detayını getir
- `GET /parent/children/:studentId/weekly-reports/:reportId/pdf` - PDF olarak indir

---

### 3.2 Aylık Performans Raporu

**Amaç**: Veli, çocuğunun aylık performans raporunu görüntüleyebilir.

**Kullanıcı Akışı**:
1. Veli "Raporlar" sekmesinde "Aylık Raporlar" bölümüne tıklar
2. Ay seçici açılır
3. Veli bir ay seçer
4. Aylık rapor gösterilir:
   - Ay bilgisi
   - Genel performans özeti
   - Haftalık trendler (4 haftalık karşılaştırma)
   - Test sonuçları özeti
   - İçerik kullanım özeti
   - Konu bazlı detaylı analiz
   - Başarı grafikleri
   - Öğretmen değerlendirmesi (varsa)

**Sistem Davranışı**:
- Rapor isteğe bağlı oluşturulur (otomatik değil)
- Rapor oluşturulduğunda cache'lenir (aynı ay için tekrar oluşturulmaz)
- Rapor PDF formatında indirilebilir

**Veri Gereksinimleri**:
```typescript
interface MonthlyReport {
  id: string;
  studentId: string;
  month: number; // 1-12
  year: number;
  generatedAt: string;
  summary: {
    testsSolved: number;
    questionsSolved: number;
    averageScorePercent: number;
    totalStudyMinutes: number;
    assignmentsCompleted: number;
  };
  weeklyBreakdown: {
    week: number;
    testsSolved: number;
    averageScore: number;
    studyMinutes: number;
  }[];
  topicAnalysis: {
    topic: string;
    testsCompleted: number;
    averageScore: number;
    improvementTrend: 'improving' | 'stable' | 'declining';
  }[];
  teacherEvaluation?: {
    overallComment: string;
    strengths: string[];
    areasForImprovement: string[];
  };
}
```

**API Endpoints**:
- `GET /parent/children/:studentId/monthly-reports?month=...&year=...` - Aylık raporları listele
- `POST /parent/children/:studentId/monthly-reports` - Yeni aylık rapor oluştur
- `GET /parent/children/:studentId/monthly-reports/:reportId` - Rapor detayını getir
- `GET /parent/children/:studentId/monthly-reports/:reportId/pdf` - PDF olarak indir

---

### 3.3 Özel Tarih Aralığı Raporu

**Amaç**: Veli, istediği tarih aralığı için özel rapor oluşturabilir.

**Kullanıcı Akışı**:
1. Veli "Raporlar" sekmesinde "Özel Rapor Oluştur" butonuna tıklar
2. Rapor oluşturma formu açılır:
   - Başlangıç tarihi
   - Bitiş tarihi
   - Rapor tipi (Genel / Detaylı / Sadece Testler / Sadece İçerikler)
3. Veli "Rapor Oluştur" butonuna tıklar
4. Sistem raporu oluşturur (işlem birkaç saniye sürebilir)
5. Rapor hazır olduğunda bildirim gösterilir
6. Rapor görüntülenir ve PDF olarak indirilebilir

**Sistem Davranışı**:
- Rapor oluşturma asenkron bir işlemdir
- Rapor hazır olana kadar "Hazırlanıyor..." durumu gösterilir
- Rapor oluşturulduktan sonra kaydedilir ve tekrar görüntülenebilir
- Rapor içeriği seçilen tipe göre değişir:
  - Genel: Tüm aktiviteler
  - Detaylı: Tüm aktiviteler + konu bazlı analiz + grafikler
  - Sadece Testler: Test sonuçları ve istatistikleri
  - Sadece İçerikler: İçerik izleme ve kullanım verileri

**Veri Gereksinimleri**:
```typescript
interface CustomReportRequest {
  studentId: string;
  startDate: string;
  endDate: string;
  reportType: 'general' | 'detailed' | 'tests_only' | 'content_only';
}

interface CustomReport {
  id: string;
  studentId: string;
  startDate: string;
  endDate: string;
  reportType: string;
  generatedAt: string;
  status: 'pending' | 'completed' | 'failed';
  data?: ActivitySummary | DetailedReportData;
  error?: string;
}
```

**API Endpoints**:
- `POST /parent/children/:studentId/custom-reports` - Özel rapor oluştur
- `GET /parent/children/:studentId/custom-reports` - Oluşturulan raporları listele
- `GET /parent/children/:studentId/custom-reports/:reportId` - Rapor detayını getir
- `GET /parent/children/:studentId/custom-reports/:reportId/pdf` - PDF olarak indir

---

### 3.4 Performans Trend Analizi

**Amaç**: Veli, çocuğunun performans trendini zaman içinde görebilir.

**Kullanıcı Akışı**:
1. Veli "Raporlar" sekmesinde "Performans Trendi" bölümüne tıklar
2. Trend analizi sayfası açılır
3. Veli zaman aralığı seçebilir:
   - Son 1 ay
   - Son 3 ay
   - Son 6 ay
   - Son 1 yıl
4. Grafikler gösterilir:
   - Başarı yüzdesi trendi (line chart)
   - Çözülen test sayısı trendi (bar chart)
   - Çalışma süresi trendi (area chart)
   - Konu bazlı performans karşılaştırması (heatmap)
5. Trend analizi:
   - İyileşme/düşüş göstergeleri
   - En iyi performans gösterilen dönemler
   - Dikkat edilmesi gereken dönemler

**Sistem Davranışı**:
- Grafikler interaktif olabilir (hover ile detay gösterimi)
- Trend analizi otomatik hesaplanır:
  - Artış/azalış yönü
  - İyileşme hızı
  - Tahmin (basit lineer regresyon ile gelecek tahmini)

**Veri Gereksinimleri**:
```typescript
interface PerformanceTrend {
  period: '1month' | '3months' | '6months' | '1year';
  startDate: string;
  endDate: string;
  weeklyData: {
    weekStart: string;
    averageScore: number;
    testsSolved: number;
    studyMinutes: number;
  }[];
  trendAnalysis: {
    scoreTrend: 'improving' | 'stable' | 'declining';
    scoreChangeRate: number; // Aylık ortalama değişim
    bestPeriod: { start: string; end: string; averageScore: number };
    attentionNeededPeriods: { start: string; end: string; reason: string }[];
  };
  topicPerformanceHeatmap: {
    topic: string;
    weeklyScores: { week: string; score: number }[];
  }[];
}
```

**API Endpoint**: `GET /parent/children/:studentId/performance-trend?period=...`
- Query parametreleri: `period`
- Response: `PerformanceTrend`

---

## 4. Öğretmen ile İletişim (Teacher Communication)

### 4.1 Mesajlaşma Sistemi

**Amaç**: Veli, çocuğunun öğretmeniyle mesajlaşabilir.

**Kullanıcı Akışı**:
1. Veli ana panelden "Mesajlar" sekmesine tıklar
2. Mesaj listesi açılır:
   - Konuşmalar listelenir (öğretmenlerle)
   - Her konuşmada son mesaj önizlemesi
   - Okunmamış mesaj sayısı gösterilir
   - Hangi öğrenci için olduğu gösterilir (çoklu öğrenci durumunda)
3. Veli bir konuşmaya tıklar
4. Mesaj görüntüleme ekranı açılır:
   - Mesaj geçmişi gösterilir
   - Mesajlar kronolojik sırada listelenir
   - Gönderilen mesajlar sağda, alınan mesajlar solda
   - Her mesajda öğrenci bilgisi gösterilir (hangi çocuk için)
5. Veli yeni mesaj yazar ve "Gönder" butonuna tıklar
6. Mesaj gönderilir ve listede görünür

**Sistem Davranışı**:
- Mesaj gönderildiğinde:
  - Mesaj veritabanına kaydedilir
  - Öğretmene bildirim gönderilir
  - Mesaj listesi güncellenir
- Mesaj okunduğunda:
  - `read` flag'i `true` olarak işaretlenir
  - Gönderene bildirim gönderilir (opsiyonel)
- Dosya ekleme desteği:
  - Resim, PDF, doküman eklenebilir
  - Dosya boyutu sınırı: 10MB
- Mesaj konusu belirtilebilir (opsiyonel):
  - "Genel", "Performans", "Görevler", "Davranış", vb.

**Veri Gereksinimleri**:
```typescript
interface Message {
  id: string;
  fromUserId: string;
  toUserId: string;
  studentId?: string; // Hangi öğrenci için (çoklu öğrenci durumunda)
  subject?: string; // Mesaj konusu
  text: string;
  attachments?: Attachment[];
  createdAt: string;
  read: boolean;
  readAt?: string;
}

interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  url: string;
}

interface Conversation {
  userId: string;
  userName: string;
  userRole: 'teacher';
  studentId?: string;
  studentName?: string;
  lastMessage?: Message;
  unreadCount: number;
}

interface MessageListResponse {
  conversations: Conversation[];
  messages: Message[];
}
```

**API Endpoints**:
- `GET /parent/messages` - Mesajları listele
- `GET /parent/messages/conversations` - Konuşmaları listele
- `GET /parent/messages/conversation/:teacherId?studentId=...` - Belirli bir öğretmenle konuşmayı getir
- `POST /parent/messages` - Yeni mesaj gönder
- `PUT /parent/messages/:id/read` - Mesajı okundu olarak işaretle

---

### 4.2 Toplantı Planlama ve Katılım

**Amaç**: Veli, öğretmen tarafından planlanmış toplantıları görüntüleyebilir ve katılabilir.

**Kullanıcı Akışı**:
1. Veli ana panelden "Toplantılar" sekmesine tıklar
2. Toplantı listesi açılır:
   - Yaklaşan toplantılar
   - Geçmiş toplantılar
   - İptal edilmiş toplantılar
3. Her toplantı kartında:
   - Toplantı başlığı
   - Tarih ve saat
   - Süre
   - Katılımcılar (öğretmen, öğrenci)
   - Toplantı tipi (birebir/veli-öğretmen/sınıf)
   - Hangi öğrenci için olduğu
4. Veli bir toplantıya tıklar
5. Toplantı detayı açılır:
   - Toplantı bilgileri
   - Toplantı linki (yaklaşan toplantılar için)
   - "Toplantıya Katıl" butonu
   - Toplantı notları (geçmiş toplantılar için)

**Sistem Davranışı**:
- Toplantı başlamadan 15 dakika önce hatırlatma bildirimi gönderilir
- Toplantı başladığında:
  - Toplantı linki aktif hale gelir
  - "Toplantıya Katıl" butonu görünür
- Toplantıya katılım:
  - Butona tıklandığında toplantı linki yeni sekmede açılır
  - Toplantı platformu entegrasyonu (Zoom, Google Meet, vb.)
- Geçmiş toplantılar:
  - Toplantı kaydı varsa görüntülenebilir
  - Toplantı özeti gösterilir
  - Toplantı notları gösterilir (öğretmen tarafından eklenmişse)

**Veri Gereksinimleri**:
```typescript
interface MeetingDetail {
  id: string;
  type: 'teacher_student' | 'teacher_student_parent' | 'class';
  title: string;
  description?: string;
  teacherId: string;
  teacherName: string;
  studentIds: string[];
  studentNames: string[];
  parentIds: string[];
  scheduledAt: string;
  durationMinutes: number;
  meetingUrl: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  recordingUrl?: string;
  notes?: string;
  relatedStudentId?: string; // Veli için hangi öğrenci
}
```

**API Endpoints**:
- `GET /parent/meetings` - Toplantıları listele
- `GET /parent/meetings/:id` - Toplantı detayını getir
- `POST /parent/meetings/:id/join` - Toplantıya katıl (log kaydı)

---

### 4.3 Öğretmen Geri Bildirimlerini Görüntüleme

**Amaç**: Veli, öğretmenin çocuğu hakkında verdiği geri bildirimleri görebilir.

**Kullanıcı Akışı**:
1. Veli "Geri Bildirimler" sekmesine tıklar
2. Geri bildirim listesi açılır:
   - Test sonuçlarına eklenen geri bildirimler
   - Genel performans değerlendirmeleri
   - Özel notlar
3. Her geri bildirim için:
   - Tarih
   - Öğretmen adı
   - İlgili test/görev (varsa)
   - Geri bildirim içeriği
   - Öğrenci adı (çoklu öğrenci durumunda)
4. Veli bir geri bildirime tıklar
5. Detaylı geri bildirim görüntülenir

**Sistem Davranışı**:
- Geri bildirimler tarih sırasına göre listelenir (en yeni üstte)
- Geri bildirimler filtrelenebilir:
  - Öğrenci bazlı (çoklu öğrenci durumunda)
  - Tarih aralığı
  - Geri bildirim tipi
- Yeni geri bildirim geldiğinde bildirim gösterilir

**Veri Gereksinimleri**:
```typescript
interface TeacherFeedback {
  id: string;
  studentId: string;
  teacherId: string;
  teacherName: string;
  type: 'test_feedback' | 'general_feedback' | 'performance_note';
  relatedTestId?: string;
  relatedAssignmentId?: string;
  title: string;
  content: string;
  createdAt: string;
  read: boolean;
  readAt?: string;
}
```

**API Endpoints**:
- `GET /parent/children/:studentId/feedback` - Geri bildirimleri listele
- `GET /parent/feedback` - Tüm çocuklar için geri bildirimleri listele
- `PUT /parent/feedback/:id/read` - Geri bildirimi okundu olarak işaretle

---

## 5. Bildirimler ve Uyarılar

### 5.1 Bildirim Merkezi

**Amaç**: Veli, sistem bildirimlerini görüntüleyebilir ve yönetebilir.

**Kullanıcı Akışı**:
1. Veli ana paneldeki bildirim ikonuna tıklar
2. Bildirim dropdown'ı açılır (son 5 bildirim)
3. Veli "Tüm Bildirimler" linkine tıklar
4. Bildirim listesi sayfası açılır:
   - Okunmamış bildirimler üstte
   - Bildirimler tarih sırasına göre listelenir
   - Her bildirimde:
     - Bildirim tipi ikonu
     - Başlık ve içerik
     - Tarih
     - İlgili öğrenci (çoklu öğrenci durumunda)
     - İlgili sayfaya yönlendirme linki
5. Veli bir bildirime tıklar:
   - Bildirim okundu olarak işaretlenir
   - İlgili sayfaya yönlendirilir

**Bildirim Türleri**:
- `assignment_created`: Çocuğa yeni görev atandı
- `assignment_due_soon`: Görev teslim tarihi yaklaşıyor (24 saat kala)
- `assignment_overdue`: Görev teslim tarihi geçti
- `test_result_ready`: Test sonucu hazır
- `meeting_scheduled`: Yeni toplantı planlandı
- `meeting_reminder`: Toplantı hatırlatması (15 dakika kala)
- `weekly_summary`: Haftalık özet raporu hazır
- `message_received`: Öğretmenden yeni mesaj alındı
- `feedback_received`: Öğretmenden geri bildirim alındı
- `low_activity`: Çocuk belirli bir süre sisteme girmemiş (3 gün)
- `low_performance`: Performans düşüşü tespit edildi

**Sistem Davranışı**:
- Bildirimler gerçek zamanlı olarak gösterilir (WebSocket veya polling)
- Bildirim okunduğunda `read` flag'i güncellenir
- Bildirimler 30 gün sonra otomatik silinir (opsiyonel)
- Bildirim ayarları:
  - Veli hangi bildirim türlerini almak istediğini seçebilir
  - E-posta bildirimleri açık/kapalı yapılabilir
  - Her öğrenci için ayrı bildirim tercihleri (çoklu öğrenci durumunda)

**Veri Gereksinimleri**:
```typescript
interface Notification {
  id: string;
  userId: string;
  studentId?: string; // Hangi öğrenci için (çoklu öğrenci durumunda)
  type: NotificationType;
  title: string;
  body: string;
  relatedEntityType?: 'assignment' | 'test' | 'meeting' | 'message' | 'content' | 'feedback';
  relatedEntityId?: string;
  createdAt: string;
  read: boolean;
  readAt?: string;
}

type NotificationType =
  | 'assignment_created'
  | 'assignment_due_soon'
  | 'assignment_overdue'
  | 'test_result_ready'
  | 'meeting_scheduled'
  | 'meeting_reminder'
  | 'weekly_summary'
  | 'message_received'
  | 'feedback_received'
  | 'low_activity'
  | 'low_performance';
```

**API Endpoints**:
- `GET /parent/notifications` - Bildirimleri listele
- `GET /parent/notifications/unread-count` - Okunmamış bildirim sayısı
- `PUT /parent/notifications/:id/read` - Bildirimi okundu olarak işaretle
- `PUT /parent/notifications/read-all` - Tüm bildirimleri okundu olarak işaretle
- `DELETE /parent/notifications/:id` - Bildirimi sil
- `GET /parent/notification-settings` - Bildirim ayarlarını getir
- `PUT /parent/notification-settings` - Bildirim ayarlarını güncelle

---

### 5.2 Uyarı Sistemi

**Amaç**: Veli, çocuğunun aktivite eksikliği veya performans düşüşü gibi durumlar hakkında uyarı alabilir.

**Uyarı Türleri**:
1. **Aktivite Eksikliği Uyarısı**:
   - Çocuk 3 gün boyunca sisteme girmemişse
   - Çocuk 7 gün boyunca test çözmemişse
   - Çocuk 7 gün boyunca içerik izlememişse

2. **Performans Düşüşü Uyarısı**:
   - Son 3 testin ortalaması, önceki 3 testin ortalamasından %20 daha düşükse
   - Belirli bir konuda sürekli düşük performans gösteriyorsa

3. **Görev Aksatma Uyarısı**:
   - 3 veya daha fazla görev gecikmişse
   - Görevler sürekli gecikiyorsa

**Sistem Davranışı**:
- Uyarılar otomatik olarak tespit edilir (arka plan işlemi)
- Uyarı oluşturulduğunda:
  - Bildirim gönderilir
  - Uyarı listesine eklenir
  - E-posta gönderilebilir (veli tercihine göre)
- Uyarı durumu güncellenir:
  - Sorun çözüldüğünde uyarı "çözüldü" olarak işaretlenir
  - Uyarı hala geçerliyse "aktif" olarak kalır

**Veri Gereksinimleri**:
```typescript
interface Alert {
  id: string;
  studentId: string;
  type: 'low_activity' | 'performance_decline' | 'assignment_neglect';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  detectedAt: string;
  status: 'active' | 'resolved' | 'dismissed';
  resolvedAt?: string;
  relatedData?: {
    testsSolved?: number;
    averageScore?: number;
    overdueAssignments?: number;
  };
}
```

**API Endpoints**:
- `GET /parent/children/:studentId/alerts` - Uyarıları listele
- `PUT /parent/alerts/:id/resolve` - Uyarıyı çözüldü olarak işaretle
- `PUT /parent/alerts/:id/dismiss` - Uyarıyı reddet

---

## 6. Hedef Belirleme ve Takibi (Goal Setting)

### 6.1 Hedef Oluşturma

**Amaç**: Veli, çocuğuyla birlikte hedefler belirleyebilir ve bu hedeflerin takibini yapabilir.

**Kullanıcı Akışı**:
1. Veli "Hedefler" sekmesine tıklar
2. Mevcut hedefler listelenir (her öğrenci için ayrı)
3. Veli "Yeni Hedef Ekle" butonuna tıklar
4. Hedef oluşturma formu açılır:
   - Öğrenci seçimi (çoklu öğrenci durumunda)
   - Hedef tipi: Haftalık soru sayısı / Haftalık test sayısı / Konu tamamlama / Başarı yüzdesi / Çalışma süresi
   - Hedef değeri (örn: 300 soru)
   - Başlangıç tarihi
   - Bitiş tarihi
   - Ödül açıklaması (opsiyonel, örn: "Bu hedefe ulaşınca birlikte sinemaya gideceğiz")
   - Bildirim tercihleri
5. Veli hedefi kaydeder
6. Hedef listeye eklenir ve takip edilmeye başlanır

**Sistem Davranışı**:
- Hedef oluşturulduğunda öğrenciye bildirim gönderilir (opsiyonel)
- Hedef ilerlemesi gerçek zamanlı güncellenir
- Hedef %75 tamamlandığında uyarı bildirimi gönderilir
- Hedef tamamlandığında:
  - Tamamlama bildirimi gösterilir
  - Hedef "tamamlandı" olarak işaretlenir
  - Ödül bilgisi gösterilir (varsa)
- Hedef süresi dolduğunda:
  - Başarılı/başarısız durumu belirlenir
  - Özet rapor gösterilir

**Veri Gereksinimleri**:
```typescript
interface Goal {
  id: string;
  studentId: string;
  createdByParentId: string;
  type: 'weekly_questions' | 'weekly_tests' | 'topic_completion' | 'score_percent' | 'study_time';
  targetValue: number;
  currentValue: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  progressPercent: number;
  reward?: string; // Ödül açıklaması
  createdAt: string;
  completedAt?: string;
}

interface GoalProgress {
  goal: Goal;
  dailyProgress: { date: string; value: number }[];
  estimatedCompletionDate?: string;
  onTrack: boolean; // Hedefe ulaşılabilir mi?
}
```

**API Endpoints**:
- `GET /parent/children/:studentId/goals` - Hedefleri listele
- `POST /parent/children/:studentId/goals` - Yeni hedef oluştur
- `PUT /parent/goals/:id` - Hedefi güncelle
- `DELETE /parent/goals/:id` - Hedefi iptal et
- `GET /parent/goals/:id/progress` - Hedef ilerlemesini getir

---

## 7. Entegrasyon ve Veri Akışları

### 7.1 Öğrenci-Veli Veri Senkronizasyonu

**Amaç**: Veli panelindeki verilerin öğrenci aktiviteleriyle senkronize olmasını sağlamak.

**Akış**:
- Öğrenci bir test çözdüğünde:
  - Test sonucu kaydedilir
  - Veli panelinde test sonucu görünür
  - İlgili istatistikler güncellenir
- Öğrenci bir içerik izlediğinde:
  - İzlenme kaydı güncellenir
  - Veli panelinde içerik kullanımı güncellenir
- Öğrenci bir görevi tamamladığında:
  - Görev durumu güncellenir
  - Veli panelinde görev durumu görünür

---

### 7.2 Bildirim Tetikleme Noktaları

**Amaç**: Sistemin veliye otomatik bildirim gönderme noktalarını tanımlamak.

**Tetikleme Noktaları**:
1. Çocuğa yeni görev atandığında → `assignment_created`
2. Görev teslim tarihi 24 saat kala → `assignment_due_soon`
3. Görev teslim tarihi geçtiğinde → `assignment_overdue`
4. Test sonucu hazır olduğunda → `test_result_ready`
5. Toplantı planlandığında → `meeting_scheduled`
6. Toplantı başlamadan 15 dakika kala → `meeting_reminder`
7. Haftalık özet hazır olduğunda → `weekly_summary`
8. Öğretmenden yeni mesaj alındığında → `message_received`
9. Öğretmenden geri bildirim alındığında → `feedback_received`
10. Çocuk 3 gün sisteme girmemişse → `low_activity`
11. Performans düşüşü tespit edildiğinde → `low_performance`

---

## 8. Güvenlik ve Erişim Kontrolü

### 8.1 Yetkilendirme

- Veli sadece kendi çocuk(lar)ının verilerine erişebilir
- Görev ve test erişimi kontrol edilir (çocuğuna atanmış mı?)
- İçerik erişimi kontrol edilir (çocuğuna veya sınıfına atanmış mı?)
- Mesajlaşma erişimi kontrol edilir (çocuğunun öğretmeniyle mi?)

### 8.2 Veri Gizliliği

- Veli sadece kendi çocuğunun verilerini görebilir
- Diğer öğrencilerin kişisel verilerine erişim yoktur
- Sınıf ortalamaları gibi anonim veriler gösterilebilir (opsiyonel)
- Mesajlar sadece gönderen ve alan tarafından görülebilir
- Test sonuçları sadece öğrenci, öğretmen ve veli tarafından görülebilir

---

## 9. Performans ve Kullanılabilirlik

### 9.1 Sayfa Yükleme Optimizasyonu

- Dashboard verileri lazy loading ile yüklenir
- Liste sayfalarında pagination kullanılır (sayfa başına 20 öğe)
- Grafikler lazy loading ile yüklenir
- API çağrıları cache'lenir (5 dakika)
- Rapor oluşturma asenkron işlem olarak yapılır

### 9.2 Responsive Tasarım

- Mobil, tablet ve masaüstü için optimize edilmiş arayüz
- Touch-friendly butonlar ve navigasyon
- Mobilde swipe gesture'ları (bildirimleri kaydırma, vb.)

---

## Sonuç

Bu doküman, veli paneli için gerekli tüm fonksiyonel özellikleri ve akışları tanımlamaktadır. Her özellik için:

- Kullanıcı akışları detaylandırılmıştır
- Sistem davranışları açıklanmıştır
- Veri modelleri tanımlanmıştır
- API endpoint'leri belirtilmiştir

Bu spesifikasyon, geliştirme ekibinin veli paneli özelliklerini implement etmesi için yeterli detayı sağlamaktadır.
