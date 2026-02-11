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
  const [password, setPassword] = useState('password123');
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
    let handleCanvasMouseMove: ((e: MouseEvent) => void) | null = null;

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

      // Particle system
      const particles: Array<{
        x: number;
        y: number;
        vx: number;
        vy: number;
        radius: number;
      }> = [];

      const particleCount = 120;
      const maxDistance = 180;
      const mouseInfluence = 150;
      let mouse = { x: canvas.width / 2, y: canvas.height / 2 };

      // Initialize particles
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 1.0,
          vy: (Math.random() - 0.5) * 1.0,
          radius: Math.random() * 2 + 3,
        });
      }

      // Update mouse position - track on parent to avoid pointer-events issue
      handleCanvasMouseMove = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
      };
      // Add listener to parent element instead of canvas
      window.addEventListener('mousemove', handleCanvasMouseMove);

      // Animation loop
      const animate = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update and draw particles
        particles.forEach((particle, i) => {
          // Mouse interaction - reduced force multiplier from 0.2 to 0.08
          const dx = mouse.x - particle.x;
          const dy = mouse.y - particle.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < mouseInfluence) {
            const force = (mouseInfluence - distance) / mouseInfluence;
            particle.vx += (dx / distance) * force * 0.15;
            particle.vy += (dy / distance) * force * 0.15;
          }

          // Update position
          particle.x += particle.vx;
          particle.y += particle.vy;

          // Damping
          particle.vx *= 0.99;
          particle.vy *= 0.99;

          // Add small constant drift to prevent complete stop
          const minSpeed = 0.1;
          const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
          if (speed < minSpeed && speed > 0) {
            const scale = minSpeed / speed;
            particle.vx *= scale;
            particle.vy *= scale;
          } else if (speed === 0) {
            // If completely stopped, give it a random nudge
            particle.vx = (Math.random() - 0.5) * 0.2;
            particle.vy = (Math.random() - 0.5) * 0.2;
          }

          // Boundary bounce
          if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
          if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;
          particle.x = Math.max(0, Math.min(canvas.width, particle.x));
          particle.y = Math.max(0, Math.min(canvas.height, particle.y));

          // Draw particle with glow
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(99, 102, 241, 0.8)';
          ctx.fill();
          
          // Add subtle glow
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.radius + 1, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
          ctx.fill();

          // Draw connections
          particles.slice(i + 1).forEach((otherParticle) => {
            const dx = particle.x - otherParticle.x;
            const dy = particle.y - otherParticle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < maxDistance) {
              ctx.beginPath();
              ctx.moveTo(particle.x, particle.y);
              ctx.lineTo(otherParticle.x, otherParticle.y);
              const opacity = (1 - distance / maxDistance) * 0.4;
              ctx.strokeStyle = `rgba(99, 102, 241, ${opacity})`;
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
          });
        });

        animationId = requestAnimationFrame(animate);
      };
      animate();
    }, 100);

    window.addEventListener('resize', updateSize);

    // Cleanup
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateSize);
      if (handleCanvasMouseMove) {
        window.removeEventListener('mousemove', handleCanvasMouseMove);
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

        <p className="hint">
          Demo için backend&apos;de tanımlı e-posta adreslerini ve
          <code> password123 </code>
          şifresini kullanabilirsiniz.
        </p>
      </div>
    </div>
  );
};

