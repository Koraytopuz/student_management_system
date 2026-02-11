# Render Deployment - 500 Hatası Çözümü

Vercel frontend + Render backend kullanırken login'de 500 hatası alıyorsanız aşağıdaki adımları kontrol edin.

## 1. Render'da Environment Variables

Render Dashboard → Backend Service → Environment:

| Değişken | Açıklama | Örnek |
|----------|----------|-------|
| `DATABASE_URL` | PostgreSQL bağlantı URL'i (zorunlu) | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `JWT_SECRET` | JWT imzalama anahtarı | Rastgele güvenli string |
| `NODE_ENV` | Ortam | `production` |

**Önemli:** Render kendi PostgreSQL eklediyseniz, `DATABASE_URL` otomatik eklenir. Dış veritabanı (örn. Neon, Supabase) kullanıyorsanız elle ekleyin.

## 2. Build Command

Render'da Build Command:

```bash
cd backend && npm install && npm run build && npx prisma migrate deploy
```

Veya `package.json` root'taysa:

```bash
npm install && cd backend && npm run build && npx prisma migrate deploy
```

## 3. Seed (Demo Kullanıcılar)

İlk deploy sonrası veya veritabanı boşsa seed çalıştırın.

**Seçenek A – Render Shell:**
1. Render Dashboard → backend service → Shell
2. Shell açın ve:
```bash
cd backend && npx prisma db seed
```

**Seçenek B – Build sonrası:**
Build Command’a ekleyin:
```bash
... && npx prisma migrate deploy && npx prisma db seed
```

> Not: Seed idempotent (upsert) olduğu için tekrar çalıştırmak sorun çıkarmaz.

## 4. Render Logları

500 hatası alıyorsanız:
1. Render Dashboard → backend service → Logs
2. `[auth/login] Error:` satırını arayın
3. Hata mesajı genelde şunlardan biri:
   - `DATABASE_URL environment variable is not set` → DATABASE_URL ekleyin
   - `Connection refused` / `ECONNREFUSED` → Veritabanı erişilemiyor
   - `relation "users" does not exist` → `prisma migrate deploy` çalıştırın
   - `invalid password` (bcrypt) → Seed’i tekrar çalıştırın (şifre: `password123`)

## 5. Vercel Frontend API URL

Vercel Dashboard → Project → Settings → Environment Variables:

```
VITE_API_BASE_URL=https://student-management-system-tb1k.onrender.com
```

(Backend URL’inizi kendi Render adresinizle değiştirin.)

## 6. CORS

Backend `index.ts` içinde `.vercel.app` origin’leri zaten izinli. Özel domain kullanıyorsanız:

```
ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://your-custom-domain.com
```

## Demo Giriş Bilgileri

Seed çalıştıktan sonra:

| Rol | E-posta | Şifre |
|-----|---------|-------|
| Öğretmen | ayse.teacher@example.com | password123 |
| Öğrenci | ali.student@example.com | password123 |
| Veli | mehmet.parent@example.com | password123 |
| Yönetici | admin@example.com | password123 |
