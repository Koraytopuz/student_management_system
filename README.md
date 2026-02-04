## Öğrenci Yönetim Sistemi

Bu proje, öğretmen, öğrenci ve velilerin tek bir platformdan:

- Ders içeriklerini (video, ses, doküman) yönetmesini,
- Test/görev ataması ve çözümünü,
- Öğrenci performans takibini,
- Veli bilgilendirmesini,
- Mesajlaşma ve görüntülü toplantı planlamasını

sağlayan bir **öğrenci yönetim sistemi** örnek uygulamasıdır.

### Proje Yapısı

- `backend`: Express + TypeScript tabanlı REST API
- `frontend`: React + Vite + TypeScript tabanlı web arayüzü

### Çalıştırma (önerilen)

> Not: Aşağıdaki komutlar için sisteminizde `Node.js` ve `npm` kurulu olmalıdır.

#### Backend ortam değişkenleri + veritabanı

Backend artık **PostgreSQL + Prisma** kullanır.

1. `backend/.env.example` dosyasını `backend/.env` olarak kopyalayın
2. `DATABASE_URL` ve `JWT_SECRET` değerlerini kendi ortamınıza göre ayarlayın
3. Migration ve seed çalıştırın:

```bash
cd backend
npm install

# Migration'ları uygula
npm run db:migrate

# Demo veriyi yükle (demo kullanıcılar: şifre password123)
npm run db:seed
```

```bash
# Backend bağımlılıkları
cd backend
npm install
npm run dev

# Ayrı bir terminalde frontend'i başlatın
cd ../frontend
npm install
npm run dev
```

Varsayılan olarak:

- Backend `http://localhost:4000`
- Frontend `http://localhost:5173`

üzerinden çalışacak şekilde yapılandırılmıştır.

