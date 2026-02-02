# Öğrenci Paneli – Fonksiyonel Özellik Spesifikasyonu

## Genel Bakış

Bu doküman, öğrenci paneli için gorev/test akışları, ilerleme takibi, to-do list, içerik izleme ve iletişim özelliklerinin fonksiyonel spesifikasyonunu içerir. Her özellik için detaylı kullanıcı akışları, sistem davranışları ve veri gereksinimleri tanımlanmıştır.

---

## 1. Görev ve Test Akışları (Assignment & Test Flows)

### 1.1 Görev Listesi Görüntüleme

**Amaç**: Öğrenci, kendisine atanmış tüm görevleri görüntüleyebilir ve filtreleyebilir.

**Kullanıcı Akışı**:
1. Öğrenci ana panelden "Görevlerim" sekmesine tıklar
2. Sistem, öğrenciye atanmış tüm görevleri listeler
3. Öğrenci filtreleme seçeneklerini kullanabilir:
   - Durum: Tümü / Bekleyen / Devam Eden / Tamamlanmış / Gecikmiş
   - Tarih: Bugün / Bu Hafta / Bu Ay / Tümü
   - Ders: Matematik / Fen / Türkçe / vb.
   - Görev Tipi: Test / İçerik İzleme / Ödev

**Sistem Davranışı**:
- Görevler, son teslim tarihine göre sıralanır (yaklaşanlar üstte)
- Her görev kartında şu bilgiler gösterilir:
  - Görev başlığı
  - İlgili ders ve konu
  - Görev tipi (test/içerik)
  - Son teslim tarihi
  - Durum göstergesi (renk kodlu: yeşil=tamamlanmış, sarı=yaklaşıyor, kırmızı=gecikmiş)
  - Tamamlanma yüzdesi (eğer kısmen tamamlandıysa)
- Gecikmiş görevler özel olarak vurgulanır

**Veri Gereksinimleri**:
```typescript
interface AssignmentListItem {
  id: string;
  title: string;
  description?: string;
  type: 'test' | 'content' | 'mixed';
  subjectName: string;
  topic: string;
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  completionPercent?: number;
  points: number;
  testId?: string;
  contentId?: string;
}
```

**API Endpoint**: `GET /student/assignments`
- Query parametreleri: `status`, `dateRange`, `subjectId`, `type`
- Response: `AssignmentListItem[]`

---

### 1.2 Görev Detayı Görüntüleme

**Amaç**: Öğrenci, bir görevin detaylarını görüntüleyebilir ve görevi tamamlamaya başlayabilir.

**Kullanıcı Akışı**:
1. Öğrenci görev listesinden bir göreve tıklar
2. Görev detay sayfası açılır
3. Görev bilgileri gösterilir:
   - Görev açıklaması
   - İlgili test veya içerik bilgileri
   - Son teslim tarihi ve kalan süre
   - Puan değeri
   - Öğretmenin notları (varsa)
4. Öğrenci "Görevi Başlat" butonuna tıklar

**Sistem Davranışı**:
- Eğer görev bir test içeriyorsa → Test çözme ekranına yönlendirilir
- Eğer görev içerik izleme içeriyorsa → İçerik görüntüleme ekranına yönlendirilir
- Eğer görev hem test hem içerik içeriyorsa → Önce içerik izleme, sonra test çözme akışı başlatılır
- Görev daha önce başlatıldıysa, kaldığı yerden devam etme seçeneği sunulur

**Veri Gereksinimleri**:
```typescript
interface AssignmentDetail {
  id: string;
  title: string;
  description?: string;
  type: 'test' | 'content' | 'mixed';
  subjectName: string;
  topic: string;
  dueDate: string;
  points: number;
  testId?: string;
  contentId?: string;
  test?: TestDetail;
  content?: ContentDetail;
  teacherNotes?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  startedAt?: string;
  completedAt?: string;
}
```

**API Endpoint**: `GET /student/assignments/:id`

---

### 1.3 Test Çözme Akışı

**Amaç**: Öğrenci, kendisine atanmış bir testi çözebilir ve sonuçlarını anında görebilir.

**Kullanıcı Akışı**:
1. Öğrenci görev detayından veya doğrudan test listesinden bir teste başlar
2. Test başlatma ekranı gösterilir:
   - Test başlığı ve açıklaması
   - Toplam soru sayısı
   - Tahmini süre (varsa)
   - Test kuralları (geri dönüş yapılabilir mi, süre sınırı var mı)
3. Öğrenci "Testi Başlat" butonuna tıklar
4. Test ekranı açılır:
   - Soru numarası ve toplam soru sayısı gösterilir
   - Soru metni ve seçenekler gösterilir
   - Süre sayacı (eğer süre sınırı varsa)
   - Soru navigasyonu (önceki/sonraki soru butonları)
   - Soru işaretleme (daha sonra dönmek için)
5. Öğrenci soruları cevaplar ve "Testi Bitir" butonuna tıklar
6. Onay ekranı gösterilir (boş bırakılan sorular varsa uyarı)
7. Test sonuç ekranı gösterilir

**Sistem Davranışı**:
- Test başladığında, sistem test başlangıç zamanını kaydeder
- Her cevap değişikliğinde, geçici olarak localStorage'a kaydedilir (sayfa yenilense bile kaybolmasın)
- Süre sayacı gerçek zamanlı olarak güncellenir
- Test bitirildiğinde:
  - Cevaplar doğrulanır
  - Doğru/yanlış/boş sayıları hesaplanır
  - Net puan hesaplanır (doğru - yanlış/4)
  - Toplam süre hesaplanır
  - Sonuçlar veritabanına kaydedilir
  - Sonuç ekranı gösterilir

**Test Sonuç Ekranı**:
- Genel istatistikler:
  - Toplam soru sayısı
  - Doğru sayısı (yeşil)
  - Yanlış sayısı (kırmızı)
  - Boş sayısı (gri)
  - Net puan
  - Başarı yüzdesi
  - Kullanılan süre
- Soru bazlı detaylar:
  - Her soru için doğru/yanlış durumu
  - Yanlış yapılan soruların doğru cevabı
  - Çözüm açıklamaları (varsa)
- Konu bazlı performans:
  - Hangi konularda başarılı/başarısız olduğu
- Öğretmen geri bildirimi (varsa)

**Veri Gereksinimleri**:
```typescript
interface TestSession {
  assignmentId: string;
  testId: string;
  startedAt: string;
  answers: TestAnswer[];
  currentQuestionIndex: number;
  markedQuestions: string[]; // questionId'ler
  timeSpentSeconds: number;
}

interface TestSubmission {
  assignmentId: string;
  testId: string;
  answers: TestAnswer[];
  durationSeconds: number;
}

interface TestResultDisplay {
  testId: string;
  assignmentId: string;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  blankCount: number;
  netScore: number;
  scorePercent: number;
  durationSeconds: number;
  questionResults: QuestionResult[];
  topicPerformance: TopicPerformance[];
  teacherFeedback?: string;
}

interface QuestionResult {
  questionId: string;
  questionText: string;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  solutionExplanation?: string;
}

interface TopicPerformance {
  topic: string;
  correctCount: number;
  totalCount: number;
  successPercent: number;
}
```

**API Endpoints**:
- `GET /student/tests/:id` - Test detaylarını getir
- `POST /student/assignments/:id/start` - Test oturumunu başlat
- `POST /student/assignments/:id/submit` - Test cevaplarını gönder
- `GET /student/test-results/:id` - Test sonuçlarını getir

---

### 1.4 Görev Tamamlama ve Durum Güncelleme

**Amaç**: Öğrenci, bir görevi tamamladığında sistem durumu otomatik günceller.

**Kullanıcı Akışı**:
1. Öğrenci bir testi tamamlar veya içeriği izler
2. Sistem görev durumunu kontrol eder:
   - Test tamamlandıysa → Görev durumu "tamamlandı" olarak işaretlenir
   - İçerik %100 izlendiyse → Görev durumu "tamamlandı" olarak işaretlenir
   - Karma görevlerde → Her iki bileşen de tamamlanmalı
3. Öğrenciye tamamlama bildirimi gösterilir
4. Görev listesinde durum güncellenir

**Sistem Davranışı**:
- Görev tamamlandığında:
  - `completedAt` zamanı kaydedilir
  - Durum "completed" olarak güncellenir
  - Tamamlama bildirimi oluşturulur
  - Öğretmene bildirim gönderilir (opsiyonel)
- Görev gecikmişse:
  - Durum "overdue" olarak işaretlenir
  - Öğrenciye ve veliye bildirim gönderilir

**API Endpoint**: `PUT /student/assignments/:id/complete`

---

## 2. İlerleme Takibi (Progress Tracking)

### 2.1 Konu Bazlı İlerleme Görüntüleme

**Amaç**: Öğrenci, her konu için ilerlemesini görüntüleyebilir.

**Kullanıcı Akışı**:
1. Öğrenci ana panelden "İlerlemem" sekmesine tıklar
2. Konu bazlı ilerleme sayfası açılır
3. Her ders için konular listelenir:
   - Konu adı
   - Tamamlanma yüzdesi (progress bar)
   - Çözülen test sayısı / Toplam test sayısı
   - Ortalama başarı yüzdesi
   - Son çalışma tarihi
4. Öğrenci bir konuya tıklayarak detaylı istatistikleri görüntüleyebilir

**Sistem Davranışı**:
- İlerleme hesaplaması:
  - Test tamamlama: (Tamamlanan test sayısı / Toplam test sayısı) × 100
  - İçerik izleme: (İzlenen içerik süresi / Toplam içerik süresi) × 100
  - Karma ilerleme: (Test ilerlemesi + İçerik ilerlemesi) / 2
- Başarı yüzdesi: Konuya ait tüm testlerin ortalama başarı yüzdesi
- Zayıf konular özel olarak vurgulanır (başarı %50'nin altındaysa)

**Veri Gereksinimleri**:
```typescript
interface TopicProgress {
  topicId: string;
  topicName: string;
  subjectName: string;
  completionPercent: number;
  testsCompleted: number;
  testsTotal: number;
  averageScorePercent: number;
  lastActivityDate?: string;
  strengthLevel: 'weak' | 'average' | 'strong';
}

interface ProgressOverview {
  topics: TopicProgress[];
  overallCompletionPercent: number;
  totalTestsCompleted: number;
  totalQuestionsSolved: number;
  averageScorePercent: number;
}
```

**API Endpoint**: `GET /student/progress/topics`

---

### 2.2 Zaman Çizelgesi ve Grafikler

**Amaç**: Öğrenci, çalışma aktivitelerini zaman bazlı grafiklerle görüntüleyebilir.

**Kullanıcı Akışı**:
1. Öğrenci "İlerlemem" sayfasında "Zaman Çizelgesi" sekmesine tıklar
2. Grafik görünümü açılır
3. Öğrenci zaman aralığı seçebilir:
   - Günlük (son 7 gün)
   - Haftalık (son 4 hafta)
   - Aylık (son 6 ay)
4. Grafikler gösterilir:
   - Günlük çözülen soru sayısı (bar chart)
   - Haftalık test skorları (line chart)
   - Aylık çalışma süresi (area chart)
   - Konu bazlı aktivite dağılımı (pie chart)

**Sistem Davranışı**:
- Veriler seçilen zaman aralığına göre filtrelenir
- Grafikler interaktif olabilir (hover ile detay gösterimi)
- Veri yoksa uygun mesaj gösterilir

**Veri Gereksinimleri**:
```typescript
interface TimeSeriesData {
  date: string; // ISO format
  questionsSolved: number;
  testsCompleted: number;
  averageScore: number;
  studyMinutes: number;
}

interface ProgressCharts {
  dailyData: TimeSeriesData[];
  weeklyData: TimeSeriesData[];
  monthlyData: TimeSeriesData[];
  topicDistribution: { topic: string; count: number }[];
}
```

**API Endpoint**: `GET /student/progress/charts?period=daily|weekly|monthly`

---

### 2.3 Hedef Belirleme ve Takibi

**Amaç**: Öğrenci, kendine hedefler koyabilir ve bu hedeflere ulaşma durumunu takip edebilir.

**Kullanıcı Akışı**:
1. Öğrenci "İlerlemem" sayfasında "Hedeflerim" sekmesine tıklar
2. Mevcut hedefler listelenir:
   - Aktif hedefler
   - Tamamlanmış hedefler
   - İptal edilmiş hedefler
3. Öğrenci "Yeni Hedef Ekle" butonuna tıklar
4. Hedef oluşturma formu açılır:
   - Hedef tipi: Haftalık soru sayısı / Haftalık test sayısı / Konu tamamlama / Başarı yüzdesi
   - Hedef değeri (örn: 300 soru)
   - Başlangıç tarihi
   - Bitiş tarihi
   - Bildirim tercihleri
5. Öğrenci hedefi kaydeder
6. Sistem hedef ilerlemesini takip eder ve gösterir

**Sistem Davranışı**:
- Hedef ilerlemesi gerçek zamanlı güncellenir
- Hedef %75 tamamlandığında uyarı bildirimi gönderilir
- Hedef tamamlandığında:
  - Tamamlama bildirimi gösterilir
  - Rozet kazanılır (gamification)
  - Hedef "tamamlandı" olarak işaretlenir
- Hedef süresi dolduğunda:
  - Başarılı/başarısız durumu belirlenir
  - Özet rapor gösterilir

**Veri Gereksinimleri**:
```typescript
interface Goal {
  id: string;
  type: 'weekly_questions' | 'weekly_tests' | 'topic_completion' | 'score_percent';
  targetValue: number;
  currentValue: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  progressPercent: number;
  createdAt: string;
}

interface GoalProgress {
  goal: Goal;
  dailyProgress: { date: string; value: number }[];
  estimatedCompletionDate?: string;
  onTrack: boolean; // Hedefe ulaşılabilir mi?
}
```

**API Endpoints**:
- `GET /student/goals` - Hedefleri listele
- `POST /student/goals` - Yeni hedef oluştur
- `PUT /student/goals/:id` - Hedefi güncelle
- `DELETE /student/goals/:id` - Hedefi iptal et
- `GET /student/goals/:id/progress` - Hedef ilerlemesini getir

---

## 3. To-Do List (Kişisel Çalışma Listesi)

### 3.1 To-Do Listesi Görüntüleme

**Amaç**: Öğrenci, kendi kişisel çalışma görevlerini yönetebilir.

**Kullanıcı Akışı**:
1. Öğrenci ana panelden "Yapılacaklarım" sekmesine tıklar
2. To-do listesi görüntülenir
3. Görevler durumlarına göre gruplanabilir:
   - Beklemede
   - Devam Ediyor
   - Tamamlandı
4. Görevler öncelik sırasına göre sıralanabilir

**Sistem Davranışı**:
- Görevler varsayılan olarak oluşturulma tarihine göre sıralanır
- Tamamlanmış görevler en altta gösterilir (gizlenebilir)
- Her görev kartında:
  - Görev başlığı
  - Açıklama (varsa)
  - Durum
  - Öncelik (düşük/orta/yüksek)
  - Oluşturulma tarihi
  - Planlanan tarih (varsa)
  - Tamamlanma tarihi (tamamlandıysa)

**Veri Gereksinimleri**:
```typescript
interface TodoItem {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  plannedDate?: string;
  completedAt?: string;
  relatedAssignmentId?: string; // Öğretmen göreviyle ilişkilendirilebilir
  relatedContentId?: string;
}
```

**API Endpoint**: `GET /student/todos`

---

### 3.2 To-Do Görevi Oluşturma

**Amaç**: Öğrenci, kendi çalışma görevlerini oluşturabilir.

**Kullanıcı Akışı**:
1. Öğrenci "Yeni Görev Ekle" butonuna tıklar
2. Görev oluşturma formu açılır:
   - Başlık (zorunlu)
   - Açıklama (opsiyonel)
   - Öncelik seviyesi (düşük/orta/yüksek)
   - Planlanan tarih (opsiyonel)
   - İlişkili görev/içerik (opsiyonel)
3. Öğrenci "Kaydet" butonuna tıklar
4. Görev listeye eklenir

**Sistem Davranışı**:
- Görev oluşturulduğunda durum "pending" olarak ayarlanır
- Planlanan tarih varsa, o tarihe yaklaştığında bildirim gönderilir
- İlişkili görev/içerik varsa, o görev/içerik tamamlandığında bu to-do otomatik tamamlanabilir (opsiyonel)

**API Endpoint**: `POST /student/todos`

---

### 3.3 To-Do Görevi Güncelleme ve Tamamlama

**Amaç**: Öğrenci, görevlerinin durumunu güncelleyebilir ve tamamlayabilir.

**Kullanıcı Akışı**:
1. Öğrenci bir göreve tıklar veya görev kartındaki durum butonunu kullanır
2. Görev detayı açılır veya durum değiştirilir
3. Durum değişiklikleri:
   - "Beklemede" → "Devam Ediyor"
   - "Devam Ediyor" → "Tamamlandı"
   - Herhangi bir durumdan → "Tamamlandı" (doğrudan)
4. Görev tamamlandığında tamamlanma tarihi otomatik kaydedilir

**Sistem Davranışı**:
- Durum değişikliği anında kaydedilir
- Görev tamamlandığında:
  - `completedAt` zamanı kaydedilir
  - Tamamlama bildirimi gösterilir (opsiyonel)
  - İlişkili görev/içerik varsa kontrol edilir

**API Endpoints**:
- `PUT /student/todos/:id` - Görevi güncelle
- `PUT /student/todos/:id/complete` - Görevi tamamla
- `DELETE /student/todos/:id` - Görevi sil

---

### 3.4 Takvim Görünümü

**Amaç**: Öğrenci, görevlerini takvim üzerinde görüntüleyebilir ve planlama yapabilir.

**Kullanıcı Akışı**:
1. Öğrenci "Yapılacaklarım" sayfasında "Takvim Görünümü" butonuna tıklar
2. Takvim görünümü açılır
3. Öğrenci ay/hafta/gün görünümü seçebilir
4. Görevler planlanan tarihlerine göre takvimde gösterilir:
   - Öğretmen görevleri (mavi)
   - Kişisel to-do görevleri (yeşil)
   - Toplantılar (turuncu)
5. Öğrenci bir tarihe tıklayarak o güne görev ekleyebilir

**Sistem Davranışı**:
- Takvim görünümü, öğretmen görevleri ve kişisel to-do'ları birleştirir
- Her görev tipi farklı renkle gösterilir
- Tarihe tıklandığında o güne ait görevler listelenir

**API Endpoint**: `GET /student/calendar?startDate=...&endDate=...`

---

## 4. İçerik İzleme (Content Viewing)

### 4.1 İçerik Listesi Görüntüleme

**Amaç**: Öğrenci, kendisine atanmış ders içeriklerini görüntüleyebilir.

**Kullanıcı Akışı**:
1. Öğrenci ana panelden "Ders İçerikleri" sekmesine tıklar
2. İçerik listesi açılır
3. İçerikler şu şekilde organize edilir:
   - Ders bazlı gruplama
   - Konu bazlı alt gruplama
   - İçerik tipine göre filtreleme (Video/Ses/Doküman)
4. Her içerik kartında:
   - İçerik başlığı
   - İçerik tipi ikonu
   - Süre (video/ses için)
   - İzlenme durumu (progress bar)
   - Son izlenme tarihi

**Sistem Davranışı**:
- İçerikler, öğrenciye atanmış veya sınıfına atanmış içerikleri gösterir
- İzlenme durumu gerçek zamanlı güncellenir
- Tamamlanmış içerikler özel işaretle gösterilir

**Veri Gereksinimleri**:
```typescript
interface ContentListItem {
  id: string;
  title: string;
  description?: string;
  type: 'video' | 'audio' | 'document';
  subjectName: string;
  topic: string;
  durationMinutes?: number;
  watchedPercent: number;
  lastWatchedAt?: string;
  isCompleted: boolean;
  assignedDate: string;
}
```

**API Endpoint**: `GET /student/contents`

---

### 4.2 İçerik İzleme Akışı

**Amaç**: Öğrenci, video/ses içeriklerini izleyebilir ve kaldığı yerden devam edebilir.

**Kullanıcı Akışı**:
1. Öğrenci bir içeriğe tıklar
2. İçerik görüntüleme sayfası açılır
3. İçerik oynatıcı yüklenir:
   - Video içerikleri için video oynatıcı
   - Ses içerikleri için ses oynatıcı
   - Dokümanlar için PDF görüntüleyici veya indirme linki
4. Öğrenci içeriği izler/dinler
5. İçerik bittiğinde veya öğrenci sayfadan ayrıldığında ilerleme kaydedilir

**Sistem Davranışı**:
- İçerik başlatıldığında:
  - Eğer daha önce izlenmişse, kaldığı yerden devam etme seçeneği sunulur
  - İzlenme kaydı oluşturulur veya güncellenir
- İzleme sırasında:
  - Her 10 saniyede bir ilerleme kaydedilir (throttling)
  - İzlenme süresi güncellenir
- İçerik tamamlandığında:
  - `completed` flag'i `true` olarak işaretlenir
  - Tamamlama bildirimi gösterilir
  - İlgili görev varsa kontrol edilir ve tamamlanma durumu güncellenir

**Video/Ses Oynatıcı Özellikleri**:
- Oynat/Duraklat
- Ses seviyesi kontrolü
- Hız kontrolü (0.5x, 1x, 1.25x, 1.5x, 2x)
- İlerleme çubuğu (seek)
- Tam ekran modu (video için)
- Altyazı desteği (varsa)

**Veri Gereksinimleri**:
```typescript
interface ContentDetail {
  id: string;
  title: string;
  description?: string;
  type: 'video' | 'audio' | 'document';
  subjectName: string;
  topic: string;
  durationMinutes?: number;
  url: string;
  watchRecord?: WatchRecord;
  relatedAssignments: Assignment[];
}

interface WatchProgressUpdate {
  contentId: string;
  watchedSeconds: number;
  completed: boolean;
}
```

**API Endpoints**:
- `GET /student/contents/:id` - İçerik detayını getir
- `POST /student/contents/:id/watch` - İzlenme ilerlemesini güncelle
- `GET /student/contents/:id/watch-record` - İzlenme kaydını getir

---

### 4.3 İçerik Notları ve Etkileşim

**Amaç**: Öğrenci, izlediği içerikler hakkında not alabilir.

**Kullanıcı Akışı**:
1. Öğrenci içerik izlerken "Not Ekle" butonuna tıklar
2. Not ekleme paneli açılır
3. Öğrenci notunu yazar ve kaydeder
4. Notlar, içerik sayfasında görüntülenir
5. Öğrenci notları düzenleyebilir veya silebilir

**Sistem Davranışı**:
- Notlar içerik ID'si ve zaman damgası ile ilişkilendirilir
- Notlar sadece öğrencinin kendisi tarafından görülebilir
- Notlar içerik silinse bile korunur (opsiyonel)

**Veri Gereksinimleri**:
```typescript
interface ContentNote {
  id: string;
  contentId: string;
  studentId: string;
  noteText: string;
  timestampSeconds?: number; // İçerikteki hangi dakikada not alındı
  createdAt: string;
  updatedAt: string;
}
```

**API Endpoints**:
- `GET /student/contents/:id/notes` - İçerik notlarını getir
- `POST /student/contents/:id/notes` - Yeni not ekle
- `PUT /student/notes/:id` - Notu güncelle
- `DELETE /student/notes/:id` - Notu sil

---

## 5. İletişim Özellikleri (Communication Features)

### 5.1 Mesajlaşma Sistemi

**Amaç**: Öğrenci, öğretmeniyle mesajlaşabilir.

**Kullanıcı Akışı**:
1. Öğrenci ana panelden "Mesajlarım" sekmesine tıklar
2. Mesaj listesi açılır:
   - Konuşmalar listelenir (öğretmenlerle)
   - Her konuşmada son mesaj önizlemesi
   - Okunmamış mesaj sayısı gösterilir
3. Öğrenci bir konuşmaya tıklar
4. Mesaj görüntüleme ekranı açılır:
   - Mesaj geçmişi gösterilir
   - Mesajlar kronolojik sırada listelenir
   - Gönderilen mesajlar sağda, alınan mesajlar solda
5. Öğrenci yeni mesaj yazar ve "Gönder" butonuna tıklar
6. Mesaj gönderilir ve listede görünür

**Sistem Davranışı**:
- Mesaj gönderildiğinde:
  - Mesaj veritabanına kaydedilir
  - Alıcıya bildirim gönderilir
  - Mesaj listesi güncellenir
- Mesaj okunduğunda:
  - `read` flag'i `true` olarak işaretlenir
  - Gönderene bildirim gönderilir (opsiyonel)
- Dosya ekleme desteği (opsiyonel):
  - Resim, PDF, doküman eklenebilir
  - Dosya boyutu sınırı: 10MB

**Veri Gereksinimleri**:
```typescript
interface Message {
  id: string;
  fromUserId: string;
  toUserId: string;
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
  userRole: string;
  lastMessage?: Message;
  unreadCount: number;
}
```

**API Endpoints**:
- `GET /student/messages` - Mesajları listele
- `GET /student/messages/conversations` - Konuşmaları listele
- `GET /student/messages/conversation/:userId` - Belirli bir kullanıcıyla konuşmayı getir
- `POST /student/messages` - Yeni mesaj gönder
- `PUT /student/messages/:id/read` - Mesajı okundu olarak işaretle

---

### 5.2 Toplantı Yönetimi

**Amaç**: Öğrenci, öğretmen tarafından planlanmış toplantıları görüntüleyebilir ve katılabilir.

**Kullanıcı Akışı**:
1. Öğrenci ana panelden "Toplantılarım" sekmesine tıklar
2. Toplantı listesi açılır:
   - Yaklaşan toplantılar
   - Geçmiş toplantılar
   - İptal edilmiş toplantılar
3. Her toplantı kartında:
   - Toplantı başlığı
   - Tarih ve saat
   - Süre
   - Katılımcılar (öğretmen, veli varsa)
   - Toplantı tipi (birebir/sınıf/veli-öğretmen)
4. Öğrenci bir toplantıya tıklar
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
  parentIds?: string[];
  scheduledAt: string;
  durationMinutes: number;
  meetingUrl: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  recordingUrl?: string;
  notes?: string;
}
```

**API Endpoints**:
- `GET /student/meetings` - Toplantıları listele
- `GET /student/meetings/:id` - Toplantı detayını getir
- `POST /student/meetings/:id/join` - Toplantıya katıl (log kaydı)

---

### 5.3 Bildirim Merkezi

**Amaç**: Öğrenci, sistem bildirimlerini görüntüleyebilir ve yönetebilir.

**Kullanıcı Akışı**:
1. Öğrenci ana paneldeki bildirim ikonuna tıklar
2. Bildirim dropdown'ı açılır (son 5 bildirim)
3. Öğrenci "Tüm Bildirimler" linkine tıklar
4. Bildirim listesi sayfası açılır:
   - Okunmamış bildirimler üstte
   - Bildirimler tarih sırasına göre listelenir
   - Her bildirimde:
     - Bildirim tipi ikonu
     - Başlık ve içerik
     - Tarih
     - İlgili sayfaya yönlendirme linki
4. Öğrenci bir bildirime tıklar:
   - Bildirim okundu olarak işaretlenir
   - İlgili sayfaya yönlendirilir

**Bildirim Türleri**:
- `assignment_created`: Yeni görev atandı
- `assignment_due_soon`: Görev teslim tarihi yaklaşıyor (24 saat kala)
- `assignment_overdue`: Görev teslim tarihi geçti
- `test_result_ready`: Test sonucu hazır
- `meeting_scheduled`: Yeni toplantı planlandı
- `meeting_reminder`: Toplantı hatırlatması (15 dakika kala)
- `weekly_summary`: Haftalık özet raporu
- `message_received`: Yeni mesaj alındı
- `goal_achieved`: Hedef tamamlandı
- `content_assigned`: Yeni içerik atandı

**Sistem Davranışı**:
- Bildirimler gerçek zamanlı olarak gösterilir (WebSocket veya polling)
- Bildirim okunduğunda `read` flag'i güncellenir
- Bildirimler 30 gün sonra otomatik silinir (opsiyonel)
- Bildirim ayarları:
  - Öğrenci hangi bildirim türlerini almak istediğini seçebilir
  - E-posta bildirimleri açık/kapalı yapılabilir

**Veri Gereksinimleri**:
```typescript
interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  relatedEntityType?: 'assignment' | 'test' | 'meeting' | 'message' | 'content';
  relatedEntityId?: string;
  createdAt: string;
  read: boolean;
  readAt?: string;
}
```

**API Endpoints**:
- `GET /student/notifications` - Bildirimleri listele
- `GET /student/notifications/unread-count` - Okunmamış bildirim sayısı
- `PUT /student/notifications/:id/read` - Bildirimi okundu olarak işaretle
- `PUT /student/notifications/read-all` - Tüm bildirimleri okundu olarak işaretle
- `DELETE /student/notifications/:id` - Bildirimi sil
- `GET /student/notification-settings` - Bildirim ayarlarını getir
- `PUT /student/notification-settings` - Bildirim ayarlarını güncelle

---

## 6. Entegrasyon ve Veri Akışları

### 6.1 Görev-Test-İçerik Entegrasyonu

**Amaç**: Görevler, testler ve içerikler arasındaki ilişkileri yönetmek.

**Akış**:
- Bir görev oluşturulduğunda:
  - Test görevi → Test çözme ekranına yönlendirme
  - İçerik görevi → İçerik görüntüleme ekranına yönlendirme
  - Karma görev → Önce içerik, sonra test akışı
- Test tamamlandığında:
  - Test sonucu kaydedilir
  - İlgili görev durumu güncellenir
  - İlerleme hesaplanır
- İçerik izlendiğinde:
  - İzlenme kaydı güncellenir
  - İlgili görev durumu kontrol edilir
  - İlerleme hesaplanır

---

### 6.2 Bildirim Tetikleme Noktaları

**Amaç**: Sistemin otomatik bildirim gönderme noktalarını tanımlamak.

**Tetikleme Noktaları**:
1. Yeni görev atandığında → `assignment_created`
2. Görev teslim tarihi 24 saat kala → `assignment_due_soon`
3. Görev teslim tarihi geçtiğinde → `assignment_overdue`
4. Test sonucu hazır olduğunda → `test_result_ready`
5. Toplantı planlandığında → `meeting_scheduled`
6. Toplantı başlamadan 15 dakika kala → `meeting_reminder`
7. Haftalık özet hazır olduğunda → `weekly_summary`
8. Yeni mesaj alındığında → `message_received`
9. Hedef tamamlandığında → `goal_achieved`
10. Yeni içerik atandığında → `content_assigned`

---

## 7. Performans ve Kullanılabilirlik

### 7.1 Sayfa Yükleme Optimizasyonu

- Dashboard verileri lazy loading ile yüklenir
- Liste sayfalarında pagination kullanılır (sayfa başına 20 öğe)
- Görseller lazy loading ile yüklenir
- API çağrıları cache'lenir (5 dakika)

### 7.2 Offline Desteği

- Test cevapları localStorage'a kaydedilir (sayfa yenilense bile kaybolmasın)
- İçerik izleme ilerlemesi offline'da kaydedilir, online olduğunda senkronize edilir
- To-do görevleri offline'da oluşturulabilir

### 7.3 Responsive Tasarım

- Mobil, tablet ve masaüstü için optimize edilmiş arayüz
- Touch-friendly butonlar ve navigasyon
- Mobilde swipe gesture'ları (bildirimleri kaydırma, vb.)

---

## 8. Güvenlik ve Erişim Kontrolü

### 8.1 Yetkilendirme

- Öğrenci sadece kendi verilerine erişebilir
- Görev ve test erişimi kontrol edilir (öğrenciye atanmış mı?)
- İçerik erişimi kontrol edilir (öğrenciye veya sınıfına atanmış mı?)

### 8.2 Veri Gizliliği

- Öğrenci notları sadece öğrencinin kendisi tarafından görülebilir
- Mesajlar sadece gönderen ve alan tarafından görülebilir
- Test sonuçları sadece öğrenci, öğretmen ve veli tarafından görülebilir

---

## Sonuç

Bu doküman, öğrenci paneli için gerekli tüm fonksiyonel özellikleri ve akışları tanımlamaktadır. Her özellik için:

- Kullanıcı akışları detaylandırılmıştır
- Sistem davranışları açıklanmıştır
- Veri modelleri tanımlanmıştır
- API endpoint'leri belirtilmiştir

Bu spesifikasyon, geliştirme ekibinin öğrenci paneli özelliklerini implement etmesi için yeterli detayı sağlamaktadır.
