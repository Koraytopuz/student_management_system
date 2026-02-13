import React, { useState } from 'react';
import { login, type UserRole } from './api';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';

const DEMO_EMAILS: Record<UserRole, string> = {
  teacher: 'ayse.teacher@example.com',
  student: 'ali.student@example.com',
  parent: 'mehmet.parent@example.com',
  admin: 'admin@example.com',
};

const DEMO_STUDENTS = [
  { id: '1', name: 'Ali Yılmaz', email: 'ali.student@example.com', grade: '12. Sınıf' },
  { id: '2', name: 'Ayşe Demir', email: 'ayse.student@example.com', grade: '11. Sınıf' },
  { id: '3', name: 'Mehmet Öz', email: 'mehmet.student@example.com', grade: '10. Sınıf' },
  { id: '4', name: 'Zeynep Kaya', email: 'zeynep.student@example.com', grade: '9. Sınıf' },
];

const roles: { value: UserRole; label: string }[] = [
  { value: 'teacher', label: 'Öğretmen' },
  { value: 'student', label: 'Öğrenci' },
  { value: 'parent', label: 'Veli' },
  { value: 'admin', label: 'Yönetici' },
];

export const LoginPage: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('teacher');
  const [email, setEmail] = useState(DEMO_EMAILS.teacher);
  const [password, setPassword] = useState('sky123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { loginSuccess } = useAuth();
  const navigate = useNavigate();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const card = cardRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number | null = null;
    let handleMouseMove: ((e: MouseEvent) => void) | null = null;
    let handleMouseLeave: ((e: MouseEvent) => void) | null = null;

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

      // Mouse parallax effect - sadece login kartı üzerindeyken takip et
      handleMouseMove = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
      };
      handleMouseLeave = () => {
        // Kartın dışına çıkınca yeni mouse hareketi alınmasın, son konumda sabit kalsın
      };
      if (card) {
        card.addEventListener('mousemove', handleMouseMove);
        card.addEventListener('mouseleave', handleMouseLeave);
      }

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
        const parallaxY = ((mouse.y - centerY) / centerY) * 12;

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

          // Wrap around screen softly
          if (orb.x < -80) orb.x = canvas.width + 40;
          if (orb.x > canvas.width + 80) orb.x = -40;
          if (orb.y < canvas.height * 0.18) orb.y = canvas.height * 0.9;
          if (orb.y > canvas.height * 0.95) orb.y = canvas.height * 0.22;

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
      if (card && handleMouseMove) {
        card.removeEventListener('mousemove', handleMouseMove);
      }
      if (card && handleMouseLeave) {
        card.removeEventListener('mouseleave', handleMouseLeave);
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
      const res = await login(email, password, selectedRole);
      loginSuccess(res.user, res.token);
      if (res.user.role === 'teacher') navigate('/teacher');
      else if (res.user.role === 'student') navigate('/student');
      else if (res.user.role === 'parent') navigate('/parent');
      else navigate('/admin');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (role: UserRole) => {
    setSelectedRole(role);
    setEmail(DEMO_EMAILS[role]);
    setError(null);
  };

  return (
    <div className="login-layout">
      <canvas 
        ref={canvasRef}
        className="login-particles-canvas"
        aria-hidden="true"
      />

      <div className="login-card" ref={cardRef}>
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

        {selectedRole === 'student' && (
          <div style={{ marginBottom: '1rem' }}>
            <label className="field">
              <span>Demo Öğrenci Seçimi</span>
              <select
                value={DEMO_STUDENTS.find(s => s.email === email)?.email ? email : ''}
                onChange={(e) => {
                  if (e.target.value) setEmail(e.target.value);
                }}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  borderRadius: '0.7rem',
                  border: '1px solid #d1d5db',
                  background: 'var(--color-surface, #f9fafb)',
                  fontSize: '0.9rem',
                  color: 'var(--color-text-main, #0f172a)',
                  cursor: 'pointer'
                }}
              >
                <option value="" disabled>Listeden seçin...</option>
                {DEMO_STUDENTS.map((s) => (
                  <option key={s.id} value={s.email}>
                    {s.name} ({s.grade})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span>E-posta</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={DEMO_EMAILS[selectedRole]}
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
          <button type="submit" disabled={loading}>
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

      </div>
    </div>
  );
};

