# Lokal Verileri Render'a Taşıma

Bu kılavuz, **yerel (local) veritabanınızdaki tüm verileri** Render'daki veritabanına kopyalamanızı sağlar. Demo verileri değil, sizin eklediğiniz öğrenci, öğretmen, dersler, sorular, ödevler vb. her şey taşınır.

## Özet

1. **Render'da migration çalıştır** (şema hazır olsun)
2. **Render DATABASE_URL'ini al**
3. **Migration script'i çalıştır** (lokal makineden)

---

## Adım 1: Render'da Migration

Render'da veritabanı şeması hazır olmalı. Build Command içinde:

```bash
cd backend && npm install && npm run build && npx prisma migrate deploy
```

İlk deploy'da bu otomatik çalışır. Şema hazır değilse yeni deploy alın.

---

## Adım 2: Render DATABASE_URL

1. **Render Dashboard** → Backend servisiniz
2. **Environment** sekmesi
3. `DATABASE_URL` değişkenini bulun (Render PostgreSQL kullanıyorsanız otomatik eklenir)
4. **Internal Database** kullanıyorsanız: `DATABASE_URL` zaten tanımlı
5. **Harici veritabanı** (Neon, Supabase vb.) kullanıyorsanız: kendi bağlantı URL'inizi kullanın

> ⚠️ **Internal Database** kullanıyorsanız: Render servisinin içinden erişim için `INTERNAL_DATABASE_URL` kullanılır. Dışarıdan (lokal makineden) bağlanmak için **External** URL gerekir. Render Dashboard → Database → Connection String → **External** adresini kopyalayın.

---

## Adım 3: .env.migrate Oluştur

`backend` klasöründe `.env.migrate` dosyası oluşturun:

```bash
cd backend
cp .env.migrate.example .env.migrate
```

`.env.migrate` içeriği:

```env
# Lokal veritabanı (mevcut .env'deki DATABASE_URL)
SOURCE_DATABASE_URL="postgresql://user:pass@localhost:5432/student_management"

# Render veritabanı (Render Dashboard'dan)
TARGET_DATABASE_URL="postgresql://user:pass@dpg-xxx.region.render.com/dbname?sslmode=require"
```

- **SOURCE_DATABASE_URL**: Yerel `.env` dosyanızdaki `DATABASE_URL` ile aynı
- **TARGET_DATABASE_URL**: Render'daki veritabanı bağlantı URL'i (External)

---

## Adım 4: Migration Script Çalıştır

```bash
cd backend
npm run db:migrate-to-render
```

veya environment variable ile:

```bash
cd backend
SOURCE_DATABASE_URL="postgresql://..." TARGET_DATABASE_URL="postgresql://..." npx tsx scripts/migrate-local-to-render.ts
```

Script şunları yapar:

1. Lokal veritabanına bağlanır
2. Render veritabanına bağlanır
3. Render'daki mevcut verileri temizler (CASCADE)
4. Tüm tabloları lokal → Render'a kopyalar

Örnek çıktı:

```
Lokal veritabanı → Render veritabanı
SOURCE: postgresql://user:****@localhost:5432/student_management
TARGET: postgresql://user:****@dpg-xxx.render.com/dbname
Lokal bağlantı OK
Render bağlantı OK

Hedef veritabanı tabloları temizleniyor (CASCADE)...
Tablolar temizlendi.

  users: 15 satır kopyalandı
  subjects: 18 satır kopyalandı
  class_groups: 3 satır kopyalandı
  ...
Toplam 523 satır taşındı.
Render'da lokal verileriniz artık mevcut.
```

---

## Taşınan Tablolar

| Tablo | İçerik |
|-------|--------|
| users | Öğretmen, öğrenci, veli, admin |
| subjects | Dersler |
| class_groups | Sınıflar |
| contents | Video, döküman vb. içerikler |
| tests, questions | Testler ve sorular |
| question_bank | Soru bankası |
| assignments | Ödevler |
| curriculum_topics | Müfredat konuları |
| meetings, messages, notifications | Toplantılar, mesajlar, bildirimler |
| ... | Diğer tüm tablolar |

---

## Sık Karşılaşılan Sorunlar

### "Render veritabanına bağlanılamadı"

- `TARGET_DATABASE_URL` **External** URL mi? (Internal sadece Render ağı içinden erişilebilir)
- `?sslmode=require` URL sonunda var mı?
- Firewall / IP kısıtlaması var mı? (Neon, Supabase vb. için "Allow from anywhere" açın)

### "relation X does not exist"

- Render'da önce `npx prisma migrate deploy` çalıştırın
- Yeni migration varsa lokal ve Render'da aynı migration geçmişine sahip olun

### "DATABASE_URL environment variable is not set"

- `.env.migrate` dosyası `backend` klasöründe mi?
- `SOURCE_DATABASE_URL` ve `TARGET_DATABASE_URL` doğru tanımlı mı?

---

## Uploads (Videolar, Profil Görselleri)

Veritabanı sadece **dosya URL'lerini** tutar (`/uploads/videos/xxx.mp4` gibi). Gerçek dosyalar `backend/uploads/` klasöründedir. Render'a geçince:

- **Kısa yol:** Önemli videoları/görselleri tekrar yükleyin
- **Kalıcı çözüm:** S3, Cloudinary vb. kullanın; URL'ler zaten veritabanında olacak

---

## Render Sonrası

Migration tamamlandıktan sonra:

1. Vercel frontend'i Render backend URL'ine yönlendirin (`VITE_API_BASE_URL`)
2. Render backend'i yeniden deploy etmeyin (veriler zaten orada)
3. Lokal veritabanında yeni veri ekledikçe, tekrar `npm run db:migrate-to-render` çalıştırarak Render'ı güncelleyebilirsiniz
