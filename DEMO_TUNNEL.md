# Localtunnel ile Demo Paylaşımı

Backend ve frontend'i internete açıp başkalarıyla paylaşmak için localtunnel kullanın.

## Adımlar

### 1. Backend ve frontend'i başlatın

**Terminal 1 – Backend:**
```powershell
cd backend
npm run dev
```

**Terminal 2 – Frontend:**
```powershell
cd frontend
npm run dev
```

### 2. Backend tünelini açın

**Terminal 3:**
```powershell
npx localtunnel --port 4000
```

Çıkan URL'i not edin (örn. `https://random-name.loca.lt`). **Bu backend tünel URL'iniz.**

### 3. Frontend tünelini açın

**Terminal 4:**
```powershell
npx localtunnel --port 5173
```

Çıkan URL'i not edin. **Bu frontend tünel URL'iniz – paylaşacağınız link.**

### 4. Frontend'e backend URL'ini verin

`frontend/.env.local` dosyasını açın ve `VITE_API_BASE_URL` satırını backend tünel URL'inizle değiştirin:

```
VITE_API_BASE_URL=https://random-name.loca.lt
```

Frontend'i yeniden başlatın (Terminal 2'de Ctrl+C, sonra `npm run dev`).

### 5. Vite allowedHosts (zaten yapıldı)

`vite.config.ts` içinde `allowedHosts: true` veya `.loca.lt` ekli olmalı. Localtunnel "Blocked request" hatası verirse bu ayarı kontrol edin.

### 6. Paylaşın

Karşı tarafa **frontend tünel URL'ini** (Terminal 4'teki) gönderin. Tarayıcıda açtıklarında uygulama çalışır.

---

## Notlar

- **Backend CORS:** `.loca.lt` ve `ngrok-free` origin'leri otomatik izinli.
- **URL değişimi:** Localtunnel her çalıştırmada yeni URL verir. Her seferinde `.env.local` güncelleyip frontend'i yeniden başlatın.
- **Tünel parolası:** `loca.lt` açıldığında "Tunnel Password" istenirse, sayfada gösterilen IP adresinizi girin.
