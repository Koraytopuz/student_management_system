import React, { useState } from 'react';
import { login, type UserRole } from './api';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';

const DEMO_EMAILS: Record<UserRole, string> = {
  teacher: 'ayse.teacher@example.com',
  student: 'koray@gmail.com',
  parent: 'mehmet.parent@example.com',
  admin: 'admin@example.com',
};

const DEMO_PASSWORDS: Record<UserRole, string> = {
  teacher: 'sky123',
  student: 'kry123',
  parent: 'sky123',
  admin: 'sky123',
};

type LoginRole = UserRole | 'system_admin';

function isStandardRole(role: LoginRole): role is UserRole {
  return role === 'teacher' || role === 'student' || role === 'parent' || role === 'admin';
}

const roles: { value: LoginRole; label: string }[] = [
  { value: 'system_admin', label: 'Kontrol Paneli' },
  { value: 'teacher', label: 'Öğretmen' },
  { value: 'student', label: 'Öğrenci' },
  { value: 'parent', label: 'Veli' },
  { value: 'admin', label: 'Yönetici' },
];

export const LoginPage: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<LoginRole>('system_admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { loginSuccess } = useAuth();
  const navigate = useNavigate();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number | null = null;
    let handleWindowMouseMove: ((e: MouseEvent) => void) | null = null;

    // Set canvas size
    const updateSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    // Initial size setup with a small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      updateSize();
      
      // Only initialize after canvas has proper dimensions
      if (canvas.width === 0 || canvas.height === 0) {
        console.warn('Canvas has no dimensions', canvas.width, canvas.height);
        return;
      }

      console.log('Canvas initialized:', canvas.width, 'x', canvas.height);

      // Premium interactive light orbs background
      type LightOrb = {
        x: number;
        y: number;
        radius: number;
        baseRadius: number;
        speedX: number;
        speedY: number;
        hue: number;
        phase: number;
      };

      const orbCount = 48;
      const followerCount = 6; // mouse-following orbs
      const orbs: LightOrb[] = [];

      for (let i = 0; i < orbCount; i++) {
        const baseRadius = 6 + Math.random() * 10;
        orbs.push({
          x: Math.random() * canvas.width,
          y: canvas.height * (0.25 + Math.random() * 0.6),
          radius: baseRadius,
          baseRadius,
          speedX: (Math.random() * 0.6 + 0.15) * (Math.random() > 0.5 ? 1 : -1),
          speedY: (Math.random() * 0.25 + 0.05) * (Math.random() > 0.5 ? 1 : -1),
          hue: 210 + Math.random() * 60,
          phase: Math.random() * Math.PI * 2,
        });
      }

      let mouse = { x: canvas.width / 2, y: canvas.height / 2 };

      // Mouse parallax effect - tüm sayfa içinde takip et, pencere dışına çıkınca son pozisyonda kalır
      handleWindowMouseMove = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Değerleri canvas sınırları içinde tutarak köşe jitter'ını azalt
        mouse.x = Math.min(Math.max(x, 0), canvas.width);
        mouse.y = Math.min(Math.max(y, 0), canvas.height);
      };

      window.addEventListener('mousemove', handleWindowMouseMove);

      // Animation loop
      const animate = (timestamp: number) => {
        const time = timestamp * 0.001;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Deep multi-tone background (daha zengin renk paleti)
        const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        bgGradient.addColorStop(0, '#020617');
        bgGradient.addColorStop(0.35, '#020617');
        bgGradient.addColorStop(0.7, '#020617');
        bgGradient.addColorStop(1, '#000814');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Diagonal soft color wash
        const colorWash = ctx.createLinearGradient(
          0,
          canvas.height * 0.1,
          canvas.width,
          canvas.height * 0.9
        );
        colorWash.addColorStop(0, 'rgba(56, 189, 248, 0.15)');
        colorWash.addColorStop(0.5, 'rgba(129, 140, 248, 0.06)');
        colorWash.addColorStop(1, 'rgba(94, 234, 212, 0.12)');
        ctx.fillStyle = colorWash;
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Subtle vignette
        const vignette = ctx.createRadialGradient(
          canvas.width / 2,
          canvas.height / 2,
          canvas.width * 0.1,
          canvas.width / 2,
          canvas.height / 2,
          canvas.width * 0.8
        );
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Mouse-based parallax strength
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const parallaxX = ((mouse.x - centerX) / centerX) * 20;
        // Kenarlara gelindiğinde dikey jitter'ı azaltmak için Y parallax'ını daha yumuşak tut
        const parallaxY = ((mouse.y - centerY) / centerY) * 6;

        // Light orbs (premium moving accents)
        orbs.forEach((orb, index) => {
          const t = time * 1.7 + orb.phase;

          const isFollower = index < followerCount;

          if (isFollower) {
            // Followers: smoothly track mouse (first) and previous follower (diğerleri)
            const target =
              index === 0
                ? { x: mouse.x, y: mouse.y }
                : { x: orbs[index - 1].x, y: orbs[index - 1].y };

            const followStrength = 0.16 + index * 0.02;
            orb.x += (target.x - orb.x) * followStrength;
            orb.y += (target.y - orb.y) * followStrength;

            // Hafif kıvrımlı hareket için küçük salınım
            orb.x += Math.sin(t * 1.3 + index) * 0.6;
            orb.y += Math.cos(t * 1.1 + index) * 0.4;
          } else {
            // Diğer küreler: serbest akış hareketi
            orb.x += orb.speedX * (1.3 + 0.7 * Math.sin(t + index));
            orb.y += orb.speedY * (1 + 0.4 * Math.cos(t * 0.7 + index));
          }

          // Mouse interaction
          const dx = orb.x - mouse.x;
          const dy = orb.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          const influenceRadius = Math.min(canvas.width, canvas.height) * 0.4;
          let proximity = 0;
          if (dist < influenceRadius) {
            proximity = 1 - dist / influenceRadius;
            // Sadece takip etmeyen küreler mouse’dan itilerek uzaklaşsın
            if (!isFollower) {
              const push = 0.55 * (0.5 + proximity);
              orb.x += (dx / dist) * push;
              orb.y += (dy / dist) * push;
            }
          }

          // Wrap around screen softly (ekranın dışında, görünmeyen bölgede sar)
          if (orb.x < -80) orb.x = canvas.width + 40;
          if (orb.x > canvas.width + 80) orb.x = -40;
          if (orb.y < -80) orb.y = canvas.height + 40;
          if (orb.y > canvas.height + 80) orb.y = -40;

          // Pulsing radius with proximity boost
          const pulse = Math.sin(t * 1.4 + index * 0.3) * 0.4;
          const proximityBoost = proximity * 0.9;
          const dynamicRadius = orb.baseRadius * (0.85 + pulse + proximityBoost);
          orb.radius = Math.max(4, dynamicRadius);

          const intensity =
            0.5 +
            0.5 * Math.sin(t * 0.9 + index * 0.6) +
            proximity * 0.8;

          // Parallax offset for drawing
          const parallaxFactor = 0.3 + (index / orbCount) * 0.5;
          const drawX = orb.x + parallaxX * parallaxFactor;
          const drawY = orb.y + parallaxY * parallaxFactor;

          // Core
          ctx.beginPath();
          ctx.arc(drawX, drawY, orb.radius * 0.65, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${orb.hue}, 100%, ${68 + intensity * 12}%, 0.98)`;
          ctx.fill();

          // Glow
          const gradient = ctx.createRadialGradient(
            drawX,
            drawY,
            0,
            drawX,
            drawY,
            orb.radius * 3.6
          );
          gradient.addColorStop(
            0,
            `hsla(${orb.hue}, 100%, 72%, ${0.45 * intensity})`
          );
          gradient.addColorStop(1, `hsla(${orb.hue}, 100%, 72%, 0)`);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(drawX, drawY, orb.radius * 3.6, 0, Math.PI * 2);
          ctx.fill();
        });

        // Pointer halo
        const pointerRadius = Math.min(canvas.width, canvas.height) * 0.18;
        const pointerGradient = ctx.createRadialGradient(
          mouse.x,
          mouse.y,
          0,
          mouse.x,
          mouse.y,
          pointerRadius
        );
        pointerGradient.addColorStop(0, 'rgba(129, 140, 248, 0.25)');
        pointerGradient.addColorStop(1, 'rgba(129, 140, 248, 0)');
        ctx.fillStyle = pointerGradient;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, pointerRadius, 0, Math.PI * 2);
        ctx.fill();

        // Soft highlight behind card area
        const cardGlow = ctx.createRadialGradient(
          canvas.width * 0.35,
          canvas.height * 0.45,
          0,
          canvas.width * 0.35,
          canvas.height * 0.45,
          canvas.width * 0.5
        );
        cardGlow.addColorStop(0, 'rgba(148, 163, 253, 0.34)');
        cardGlow.addColorStop(1, 'rgba(148, 163, 253, 0)');
        ctx.fillStyle = cardGlow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        animationId = requestAnimationFrame(animate);
      };
      animate(performance.now());
    }, 100);

    window.addEventListener('resize', updateSize);

    // Cleanup
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateSize);
      if (handleWindowMouseMove) {
        window.removeEventListener('mousemove', handleWindowMouseMove);
      }
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const apiRole: UserRole = selectedRole === 'system_admin' ? 'admin' : selectedRole;
      const res = await login(email, password, apiRole);
      loginSuccess(res.user, res.token);
      if (selectedRole === 'system_admin') navigate('/system-admin');
      else if (res.user.role === 'teacher') navigate('/teacher');
      else if (res.user.role === 'student') navigate('/student');
      else if (res.user.role === 'parent') navigate('/parent');
      else navigate('/admin');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (role: LoginRole) => {
    setSelectedRole(role);
    if (isStandardRole(role)) {
      setEmail(DEMO_EMAILS[role]);
      setPassword(DEMO_PASSWORDS[role]);
    } else {
      // Kontrol paneli için giriş bilgileri her zaman manuel girilsin
      setEmail('');
      setPassword('');
    }
    setError(null);
  };

  return (
    <div className="login-layout">
      <canvas 
        ref={canvasRef}
        className="login-particles-canvas"
        aria-hidden="true"
      />

      <div className="login-card">
        <h1>Öğrenci Yönetim Sistemi</h1>
        <p className="subtitle">
          Öğretmen, öğrenci ve veliler için tek panelden yönetim.
        </p>

        <div className="role-selector">
          {roles.map((role) => (
            <button
              key={role.value}
              type="button"
              className={
                selectedRole === role.value ? 'role-btn active' : 'role-btn'
              }
              onClick={() => handleRoleChange(role.value)}
            >
              {role.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span>E-posta</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={
                isStandardRole(selectedRole)
                  ? DEMO_EMAILS[selectedRole]
                  : 'E-posta adresiniz'
              }
              required
            />
          </label>
          <label className="field">
            <span>Şifre</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="primary-btn" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

      </div>
    </div>
  );
};

