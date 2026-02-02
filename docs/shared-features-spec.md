# Ortak Özellikler – Fonksiyonel Spesifikasyon

## Genel Bakış

Bu doküman, tüm roller (Öğretmen, Öğrenci, Veli, Admin) için ortak olan çapraz özelliklerin fonksiyonel spesifikasyonunu içerir. Bu özellikler sistem genelinde tutarlı bir kullanıcı deneyimi sağlar ve her rolün kendi panelinde erişebileceği temel işlevleri tanımlar.

---

## 1. Giriş ve Rol Seçimi (Authentication & Role Selection)

### 1.1 Giriş Sayfası ve Rol Seçimi

**Amaç**: Kullanıcıların sisteme giriş yapmadan önce rollerini seçmelerini ve ilgili giriş formunu görmelerini sağlamak.

**Kullanıcı Akışı**:
1. Kullanıcı sisteme ilk eriştiğinde giriş sayfasını görür
2. Giriş sayfasında 4 rol seçeneği görünür:
   - **Öğretmen** (Teacher)
   - **Öğrenci** (Student)
   - **Veli** (Parent)
   - **Yönetici** (Admin)
3. Kullanıcı bir rol seçer (varsayılan: Öğrenci)
4. Seçilen role göre giriş formu gösterilir
5. Kullanıcı e-posta ve şifre ile giriş yapar
6. Sistem, seçilen rol ile giriş bilgilerini doğrular
7. Başarılı giriş sonrası kullanıcı kendi paneline yönlendirilir

**Sistem Davranışı**:
- Rol seçimi görsel olarak vurgulanır (aktif rol farklı renkte gösterilir)
- Her rol için aynı giriş formu kullanılır (e-posta + şifre)
- Giriş sırasında hem e-posta hem de rol kontrolü yapılır
- Hatalı giriş durumunda kullanıcıya açıklayıcı hata mesajı gösterilir
- Başarılı giriş sonrası JWT token oluşturulur ve localStorage'a kaydedilir
- Token 8 saat geçerlidir

**Güvenlik Gereksinimleri**:
- Şifreler bcrypt ile hash'lenir
- JWT token'lar role bilgisi içerir
- Her API isteğinde token doğrulaması yapılır
- Token süresi dolduğunda otomatik çıkış yapılır

**Veri Gereksinimleri**:
```typescript
interface LoginRequest {
  email: string;
  password: string;
  role: 'teacher' | 'student' | 'parent' | 'admin';
}

interface LoginResponse {
  token: string;
  user: User;
  demoInfo?: {
    password: string;
    exampleAdminEmail: string;
    exampleTeacherEmail: string;
    exampleStudentEmail: string;
    exampleParentEmail: string;
  };
}
```

**API Endpoint**:
- `POST /api/auth/login` - Giriş yapma

**Frontend Bileşenleri**:
- `LoginPage` - Ana giriş sayfası ve rol seçimi
- `AuthContext` - Kimlik doğrulama durumu yönetimi
- `useAuth` hook - Kimlik doğrulama durumuna erişim

### 1.2 Rol Tabanlı Yönlendirme

**Amaç**: Kullanıcıların giriş sonrası doğru paneline yönlendirilmesini sağlamak.

**Yönlendirme Kuralları**:
- **Öğretmen** → `/teacher` (Öğretmen Paneli)
- **Öğrenci** → `/student` (Öğrenci Paneli)
- **Veli** → `/parent` (Veli Paneli)
- **Yönetici** → `/admin` (Yönetici Paneli)

**Korumalı Rotalar**:
- Her panel rotası, ilgili rol için korumalıdır
- Yetkisiz erişim denemelerinde 403 hatası döner
- Token yoksa veya geçersizse 401 hatası döner

### 1.3 Çıkış (Logout)

**Amaç**: Kullanıcının güvenli bir şekilde sistemden çıkış yapmasını sağlamak.

**Kullanıcı Akışı**:
1. Kullanıcı paneldeki "Çıkış" butonuna tıklar
2. Sistem localStorage'dan token'ı siler
3. Kullanıcı giriş sayfasına yönlendirilir

**Sistem Davranışı**:
- Token ve kullanıcı bilgileri temizlenir
- Tüm oturum verileri silinir
- Kullanıcı tekrar giriş yapmak zorundadır

---

## 2. Bildirim Sistemi (Notification System)

### 2.1 Bildirim Merkezi

**Amaç**: Tüm kullanıcıların önemli olaylardan haberdar olmasını sağlamak.

**Bildirim Türleri**:
1. **assignment_created** - Yeni görev/test atandığında
2. **assignment_due_soon** - Görev teslim tarihi yaklaştığında
3. **assignment_overdue** - Görev teslim tarihi geçtiğinde
4. **test_result_ready** - Test sonuçları hazır olduğunda
5. **meeting_scheduled** - Toplantı planlandığında
6. **weekly_summary** - Haftalık özet raporu hazır olduğunda

**Bildirim Özellikleri**:
- Her bildirim bir kullanıcıya (`userId`) bağlıdır
- Bildirimler okundu/okunmadı durumuna sahiptir
- Bildirimler tarih/saat bilgisi içerir
- Bildirimler başlık ve içerik metni içerir

**Veri Modeli**:
```typescript
type NotificationType =
  | 'assignment_created'
  | 'assignment_due_soon'
  | 'assignment_overdue'
  | 'test_result_ready'
  | 'meeting_scheduled'
  | 'weekly_summary';

interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}
```

### 2.2 Bildirim Görüntüleme

**Kullanıcı Akışı**:
1. Kullanıcı panelinde bildirim ikonuna tıklar
2. Bildirim dropdown'ı açılır
3. Okunmamış bildirimler üstte, vurgulu gösterilir
4. Kullanıcı bir bildirime tıklayarak detayını görebilir
5. Bildirim okundu olarak işaretlenir

**Sistem Davranışı**:
- Bildirimler tarih sırasına göre listelenir (en yeni üstte)
- Okunmamış bildirim sayısı ikon üzerinde badge olarak gösterilir
- Bildirimler otomatik olarak okundu işaretlenmez (kullanıcı tıklamalı)
- Bildirimler silinebilir (opsiyonel)

**UI Gereksinimleri**:
- Bildirim ikonu tüm panellerde üst menüde görünür
- Okunmamış bildirim sayısı kırmızı badge ile gösterilir
- Bildirim dropdown'ı maksimum 10 bildirim gösterir
- "Tümünü Gör" linki ile tüm bildirimler sayfasına gidilir

### 2.3 Bildirim Oluşturma Kuralları

**Öğretmen Tarafından Tetiklenen Bildirimler**:
- Görev/test atandığında → İlgili öğrencilere `assignment_created`
- Toplantı planlandığında → İlgili öğrenci/velilere `meeting_scheduled`

**Sistem Tarafından Otomatik Oluşturulan Bildirimler**:
- Görev teslim tarihinden 24 saat önce → Öğrenciye `assignment_due_soon`
- Görev teslim tarihi geçtiğinde → Öğrenciye `assignment_overdue`
- Test sonuçları hazır olduğunda → Öğrenciye `test_result_ready`
- Haftalık özet hazır olduğunda → Veliye `weekly_summary`

**Bildirim İçeriği Örnekleri**:
- `assignment_created`: "Yeni görev: Denklemler Testi - Son teslim: 15 Şubat 2026"
- `assignment_due_soon`: "Yaklaşan görev: Fonksiyonlar Testi - Yarın son!"
- `assignment_overdue`: "Gecikmiş görev: Denklemler Testi - Lütfen tamamlayın"
- `test_result_ready`: "Test sonucunuz hazır: Denklemler Testi - %75 başarı"
- `meeting_scheduled`: "Toplantı planlandı: Denklemler Tekrar Dersi - 5 Şubat 14:00"
- `weekly_summary`: "Haftalık özet hazır: Bu hafta 5 test çözüldü"

### 2.4 Bildirim API Endpoints

**Tüm Roller İçin Ortak**:
- `GET /api/{role}/notifications` - Kullanıcının bildirimlerini listele
  - Query parametreleri:
    - `read` (opsiyonel): `true` veya `false` - Sadece okunmuş/okunmamış bildirimleri filtrele
    - `limit` (opsiyonel): Sayı - Maksimum bildirim sayısı (varsayılan: 50)
- `PUT /api/{role}/notifications/:id/read` - Bildirimi okundu olarak işaretle
- `PUT /api/{role}/notifications/read-all` - Tüm bildirimleri okundu olarak işaretle
- `DELETE /api/{role}/notifications/:id` - Bildirimi sil (opsiyonel)

**Örnek Response**:
```json
[
  {
    "id": "n1",
    "userId": "s1",
    "type": "assignment_created",
    "title": "Yeni görev: Denklemler Testi",
    "body": "Öğretmeniniz size yeni bir test görevi atadı. Son teslim: 15 Şubat 2026",
    "createdAt": "2026-02-01T10:00:00Z",
    "read": false
  }
]
```

---

## 3. Takvim ve Hatırlatmalar (Calendar & Reminders)

### 3.1 Ortak Takvim Görünümü

**Amaç**: Tüm kullanıcıların görevler, toplantılar ve önemli tarihleri tek bir yerde görmesini sağlamak.

**Takvim Öğeleri**:
1. **Görev Teslim Tarihleri** (Assignments)
   - Görev başlığı
   - Son teslim tarihi
   - Durum (beklemede, tamamlandı, gecikmiş)
   - İlgili ders/konu

2. **Toplantı Tarihleri** (Meetings)
   - Toplantı başlığı
   - Tarih ve saat
   - Süre
   - Toplantı tipi (birebir, veli-öğretmen, sınıf)

3. **Sınav Tarihleri** (Exams) - İleride eklenecek
   - Sınav adı
   - Tarih ve saat
   - Konum (fiziksel veya online)

**Takvim Görünümleri**:
- **Ay Görünümü**: Tüm ayı gösterir, öğeler tarih kutularında listelenir
- **Hafta Görünümü**: Seçilen haftayı detaylı gösterir
- **Gün Görünümü**: Seçilen günü saat saat gösterir
- **Liste Görünümü**: Yaklaşan öğeleri kronolojik liste halinde gösterir

**Veri Modeli**:
```typescript
interface CalendarEvent {
  id: string;
  type: 'assignment' | 'meeting' | 'exam';
  title: string;
  startDate: string; // ISO 8601 format
  endDate?: string; // ISO 8601 format (toplantılar için)
  description?: string;
  status?: 'pending' | 'completed' | 'overdue' | 'cancelled';
  color?: string; // Görsel ayırt etme için
  relatedId: string; // İlgili görev/toplantı/sınav ID'si
}

interface CalendarView {
  events: CalendarEvent[];
  startDate: string;
  endDate: string;
  viewType: 'month' | 'week' | 'day' | 'list';
}
```

### 3.2 Takvim Filtreleme

**Filtreleme Seçenekleri**:
- **Tip**: Tümü / Görevler / Toplantılar / Sınavlar
- **Durum**: Tümü / Bekleyen / Tamamlanmış / Gecikmiş
- **Tarih Aralığı**: Bugün / Bu Hafta / Bu Ay / Özel Tarih Aralığı
- **Ders**: Tümü / Matematik / Fen / Türkçe / vb.

**Rol Bazlı Filtreleme**:
- **Öğrenci**: Sadece kendi görevleri ve toplantıları
- **Veli**: Bağlı olduğu öğrencilerin görevleri ve toplantıları
- **Öğretmen**: Kendi sınıflarının görevleri ve planladığı toplantılar
- **Admin**: Tüm görevler ve toplantılar (genel görünüm)

### 3.3 Hatırlatma Sistemi

**Amaç**: Kullanıcıları yaklaşan önemli tarihler hakkında bilgilendirmek.

**Hatırlatma Kuralları**:
- **Görev Teslim Tarihi**: 
  - 3 gün önce bildirim
  - 1 gün önce bildirim
  - Teslim günü sabah bildirim
  - Teslim tarihi geçtiğinde gecikme bildirimi

- **Toplantı**:
  - 1 gün önce bildirim
  - 1 saat önce bildirim
  - Toplantı başlangıcında bildirim

**Hatırlatma Kanalları**:
1. **Sistem Bildirimleri**: Bildirim merkezinde görünür
2. **E-posta Bildirimleri**: İleride eklenecek
3. **Push Bildirimleri**: Mobil uygulama için ileride eklenecek

**Hatırlatma Ayarları**:
- Kullanıcılar hatırlatma tercihlerini ayarlayabilir
- Varsayılan: Tüm hatırlatmalar aktif

### 3.4 Takvim API Endpoints

**Tüm Roller İçin Ortak**:
- `GET /api/{role}/calendar` - Takvim öğelerini getir
  - Query parametreleri:
    - `startDate` (opsiyonel): ISO 8601 format - Başlangıç tarihi
    - `endDate` (opsiyonel): ISO 8601 format - Bitiş tarihi
    - `type` (opsiyonel): `assignment` | `meeting` | `exam` - Tip filtresi
    - `status` (opsiyonel): `pending` | `completed` | `overdue` - Durum filtresi
    - `viewType` (opsiyonel): `month` | `week` | `day` | `list` - Görünüm tipi

**Örnek Request**:
```
GET /api/student/calendar?startDate=2026-02-01&endDate=2026-02-28&viewType=month
```

**Örnek Response**:
```json
{
  "events": [
    {
      "id": "e1",
      "type": "assignment",
      "title": "Denklemler Testi",
      "startDate": "2026-02-15T23:59:59Z",
      "description": "Matematik - Denklemler konusu",
      "status": "pending",
      "color": "#FF6B6B",
      "relatedId": "a1"
    },
    {
      "id": "e2",
      "type": "meeting",
      "title": "Denklemler Tekrar Dersi",
      "startDate": "2026-02-05T14:00:00Z",
      "endDate": "2026-02-05T14:45:00Z",
      "description": "Sınıf dersi",
      "status": "pending",
      "color": "#4ECDC4",
      "relatedId": "m1"
    }
  ],
  "startDate": "2026-02-01T00:00:00Z",
  "endDate": "2026-02-28T23:59:59Z",
  "viewType": "month"
}
```

### 3.5 Takvim UI Bileşenleri

**Frontend Gereksinimleri**:
- Takvim görünümü tüm panellerde erişilebilir olmalı
- Takvim widget'ı dashboard'da özet görünüm olarak gösterilebilir
- Tam ekran takvim sayfası mevcut olmalı
- Etkinliklere tıklanınca ilgili detay sayfasına yönlendirme yapılmalı

**Görsel Gereksinimler**:
- Farklı etkinlik tipleri farklı renklerle gösterilmeli
- Durum göstergeleri (tamamlandı, gecikmiş) görsel olarak belirgin olmalı
- Yaklaşan etkinlikler vurgulanmalı
- Mobil uyumlu responsive tasarım olmalı

---

## 4. Ortak UI Bileşenleri ve Standartlar

### 4.1 Üst Menü (Header/Navigation)

**Tüm Panellerde Ortak Öğeler**:
- **Logo/Brand**: Sistem logosu ve adı
- **Bildirim İkonu**: Okunmamış bildirim sayısı ile
- **Kullanıcı Menüsü**: 
  - Kullanıcı adı/avatar
  - Profil ayarları (ileride)
  - Çıkış butonu
- **Takvim İkonu**: Hızlı takvim erişimi (opsiyonel)

**Rol Bazlı Menü Öğeleri**:
- Her rolün kendi navigasyon menüsü vardır
- Menü öğeleri rolün erişebileceği sayfalara göre değişir

### 4.2 Responsive Tasarım

**Gereksinimler**:
- Desktop (1920px+): Tam özellikli görünüm
- Tablet (768px - 1919px): Uyarlanmış görünüm, menü sidebar olabilir
- Mobil (< 768px): Hamburger menü, kompakt görünüm

### 4.3 Erişilebilirlik (Accessibility)

**Temel Gereksinimler**:
- Klavye navigasyonu desteği
- Ekran okuyucu uyumluluğu (ARIA etiketleri)
- Renk kontrastı standartlarına uyum
- Odak göstergeleri (focus indicators)

**Gelecek Özellikler**:
- Karanlık mod desteği
- Yazı boyutu ayarlama
- Renk körlüğü dostu tema seçenekleri

### 4.4 Çoklu Dil Desteği (İleride)

**Hazırlık**:
- Tüm metinler i18n altyapısına hazır olacak şekilde kodlanmalı
- Varsayılan dil: Türkçe
- Desteklenecek diller: Türkçe, İngilizce (ileride genişletilebilir)

---

## 5. Veri Güvenliği ve Erişim Kontrolü

### 5.1 Rol Tabanlı Erişim Kontrolü

**Temel İlkeler**:
- Her kullanıcı sadece kendi rolüne uygun verilere erişebilir
- Öğrenci: Sadece kendi verileri
- Veli: Sadece bağlı olduğu öğrencilerin verileri
- Öğretmen: Sadece kendi sınıflarının verileri
- Admin: Tüm verilere erişim (yönetim amaçlı)

### 5.2 API Güvenliği

**Güvenlik Katmanları**:
1. **Authentication**: JWT token doğrulaması
2. **Authorization**: Rol bazlı erişim kontrolü
3. **Input Validation**: Tüm girişler doğrulanır
4. **Rate Limiting**: İleride eklenecek (API kötüye kullanımını önlemek için)

### 5.3 Veri Gizliliği

**Gizlilik Kuralları**:
- Öğrenciler birbirlerinin sonuçlarını göremez
- Veliler sadece kendi çocuklarının verilerini görebilir
- Öğretmenler sınıf ortalaması gibi anonim verileri görebilir
- Kişisel veriler GDPR uyumlu şekilde işlenir (ileride)

---

## 6. Teknik Uygulama Notları

### 6.1 Backend Yapısı

**Ortak Modüller**:
- `auth.ts`: Kimlik doğrulama ve yetkilendirme
- `types.ts`: Ortak tip tanımları
- `data.ts`: Ortak veri yapıları (notifications, meetings, vb.)

**Rol Bazlı Route'lar**:
- Her rol için ayrı route dosyası (`routes.teacher.ts`, `routes.student.ts`, vb.)
- Ortak endpoint'ler her route dosyasında tekrarlanabilir veya ortak bir middleware'den türetilebilir

### 6.2 Frontend Yapısı

**Ortak Bileşenler**:
- `LoginPage.tsx`: Giriş ve rol seçimi
- `AuthContext.tsx`: Kimlik doğrulama durumu yönetimi
- `NotificationCenter.tsx`: Bildirim merkezi bileşeni (oluşturulacak)
- `CalendarView.tsx`: Takvim görünümü bileşeni (oluşturulacak)
- `Header.tsx`: Ortak üst menü bileşeni (oluşturulacak)

**Rol Bazlı Sayfalar**:
- Her rol için ayrı dashboard bileşeni
- Rol bazlı özel sayfalar

### 6.3 Veritabanı Yapısı (İleride)

**Ortak Tablolar**:
- `users`: Tüm kullanıcılar
- `notifications`: Bildirimler
- `meetings`: Toplantılar
- `assignments`: Görevler
- `calendar_events`: Takvim öğeleri (veya mevcut tablolardan türetilebilir)

---

## 7. Test Senaryoları

### 7.1 Giriş ve Rol Seçimi Testleri

1. **Başarılı Giriş**: Doğru e-posta, şifre ve rol ile giriş yapılabilmeli
2. **Hatalı Rol**: Yanlış rol seçilirse giriş başarısız olmalı
3. **Hatalı Şifre**: Yanlış şifre ile giriş başarısız olmalı
4. **Token Geçerliliği**: Token süresi dolduğunda otomatik çıkış yapılmalı
5. **Yönlendirme**: Her rol doğru paneline yönlendirilmeli

### 7.2 Bildirim Sistemi Testleri

1. **Bildirim Oluşturma**: Görev atandığında bildirim oluşturulmalı
2. **Bildirim Listeleme**: Kullanıcı sadece kendi bildirimlerini görmeli
3. **Bildirim Okundu İşaretleme**: Bildirim okundu olarak işaretlenebilmeli
4. **Bildirim Sayısı**: Okunmamış bildirim sayısı doğru gösterilmeli

### 7.3 Takvim Testleri

1. **Takvim Görüntüleme**: Kullanıcı kendi takvim öğelerini görebilmeli
2. **Filtreleme**: Tarih, tip ve durum filtreleri çalışmalı
3. **Rol Bazlı Filtreleme**: Her rol sadece kendi verilerini görmeli
4. **Hatırlatma**: Yaklaşan tarihler için bildirim oluşturulmalı

---

## 8. Gelecek Geliştirmeler

### 8.1 Kısa Vadeli (MVP Sonrası)

- E-posta bildirimleri entegrasyonu
- Push bildirimleri (mobil uygulama için)
- Gelişmiş takvim görünümleri (drag & drop, düzenleme)
- Bildirim tercihleri ayarları

### 8.2 Orta Vadeli

- Çoklu dil desteği (i18n)
- Karanlık mod
- Erişilebilirlik iyileştirmeleri
- Mobil uygulama

### 8.3 Uzun Vadeli

- Gerçek zamanlı bildirimler (WebSocket)
- Gelişmiş takvim entegrasyonları (Google Calendar, Outlook)
- Sesli bildirimler
- Özelleştirilebilir tema sistemi

---

## Sonuç

Bu doküman, sistemin tüm roller için ortak özelliklerini tanımlar. Bu özellikler:

1. **Tutarlı Kullanıcı Deneyimi**: Tüm roller aynı giriş akışını ve bildirim sistemini kullanır
2. **Merkezi Yönetim**: Takvim ve bildirimler tek bir yerden yönetilir
3. **Güvenlik**: Rol bazlı erişim kontrolü ile veri güvenliği sağlanır
4. **Genişletilebilirlik**: Gelecekte yeni özellikler kolayca eklenebilir

Bu spesifikasyon, geliştirme sürecinde referans olarak kullanılmalı ve gerektiğinde güncellenmelidir.
