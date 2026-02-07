# Öğrenci Yönetim Sistemi - www.skytechyazilim.com.tr/demo Kurulumu

## Yapılan Değişiklikler

### Frontend (student_management_system/frontend)
1. **vite.config.ts** – `base: '/demo/'` eklendi
2. **App.tsx** – `BrowserRouter basename="/demo"` eklendi
3. **api.ts** – Login redirect ve path kontrolleri base path ile uyumlu hale getirildi
4. **api.ts** – `uploadTeacherVideo` artık `API_BASE_URL` kullanıyor

### Skyweb (ana site)
1. **.htaccess** – `/demo` SPA routing eklendi
2. **build-for-plesk.bat** – `demo` klasörü ve `.htaccess` dist'e kopyalanıyor
3. **App.jsx** – Menüye "ÖYS Demo" linki eklendi (`/demo`)

## Demo Güncelleme Akışı

1. **Student Management build al:**
   ```bash
   cd student_management_system/frontend
   npx vite build
   ```

2. **Build çıktısını skyweb'e kopyala:**
   ```powershell
   Copy-Item -Path "dist\*" -Destination "..\..\..\skyweb\demo" -Recurse -Force
   ```
   (veya manuel kopyalama: `frontend/dist/*` → `skyweb/demo/`)

3. **Skyweb deploy:** `build-for-plesk.bat` çalıştırıp `dist/` klasörünü Plesk httpdocs'a yükle

## Production API URL

Build öncesi `.env.production` oluştur:
```
VITE_API_BASE_URL=https://www.skytechyazilim.com.tr/api
```
(API'nizin gerçek adresine göre düzenleyin)

## Backend CORS

API farklı domain'deyse backend CORS ayarlarına `https://www.skytechyazilim.com.tr` ekleyin.

## Sunucu Yapılandırması

- **Apache:** `.htaccess` zaten güncellendi (RewriteRule ile /demo SPA fallback)
- **Nginx:** 
  ```nginx
  location /demo {
      alias /var/www/student-management/dist;
      try_files $uri $uri/ /demo/index.html;
  }
  ```
