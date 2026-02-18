import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: url });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const badgeDefinitions = [
  // Soru sayısı rozetleri
  {
    code: 'Q_10',
    title: 'İlk 10 Soru',
    description: 'Toplamda 10 soru çözdüğünde kazanılır.',
    category: 'questions_solved',
    targetValue: 10,
    metricKey: 'total_questions_all_time',
    icon: 'sparkles',
    color: 'emerald',
    orderIndex: 5,
  },
  {
    code: 'Q_50',
    title: '50 Soru Isınma',
    description: 'Toplamda 50 soru çözdüğünde kazanılır.',
    category: 'questions_solved',
    targetValue: 50,
    metricKey: 'total_questions_all_time',
    icon: 'flame',
    color: 'emerald',
    orderIndex: 8,
  },
  {
    code: 'Q_100',
    title: '100 Soru Başlangıcı',
    description: 'Toplamda 100 soru çözdüğünde kazanılır.',
    category: 'questions_solved',
    targetValue: 100,
    metricKey: 'total_questions_all_time',
    icon: 'star',
    color: 'emerald',
    orderIndex: 10,
  },
  {
    code: 'Q_500',
    title: '500 Soru Ustası',
    description: 'Toplamda 500 soru çözdüğünde kazanılır.',
    category: 'questions_solved',
    targetValue: 500,
    metricKey: 'total_questions_all_time',
    icon: 'medal',
    color: 'indigo',
    orderIndex: 11,
  },
  {
    code: 'Q_1000',
    title: '1000 Soru Efsanesi',
    description: 'Toplamda 1000 soru çözdüğünde kazanılır.',
    category: 'questions_solved',
    targetValue: 1000,
    metricKey: 'total_questions_all_time',
    icon: 'trophy',
    color: 'amber',
    orderIndex: 12,
  },

  // Test rozetleri
  {
    code: 'TEST_3',
    title: '3 Test Tamamlandı',
    description: 'Toplamda 3 testi tamamladığında kazanılır.',
    category: 'tests_completed',
    targetValue: 3,
    metricKey: 'tests_completed_all_time',
    icon: 'check-circle',
    color: 'indigo',
    orderIndex: 18,
  },
  {
    code: 'TEST_10',
    title: '10 Test Tamamlandı',
    description: 'Toplamda 10 testi tamamladığında kazanılır.',
    category: 'tests_completed',
    targetValue: 10,
    metricKey: 'tests_completed_all_time',
    icon: 'check-circle',
    color: 'indigo',
    orderIndex: 20,
  },
  {
    code: 'TEST_25',
    title: '25 Test Şampiyonu',
    description: 'Toplamda 25 testi tamamladığında kazanılır.',
    category: 'tests_completed',
    targetValue: 25,
    metricKey: 'tests_completed_all_time',
    icon: 'crown',
    color: 'purple',
    orderIndex: 21,
  },

  // Ödev rozetleri
  {
    code: 'HW_3',
    title: '3 Ödev Tamamlandı',
    description: 'Toplamda 3 ödevi tamamladığında kazanılır.',
    category: 'assignments_completed',
    targetValue: 3,
    metricKey: 'assignments_completed_all_time',
    icon: 'clipboard-check',
    color: 'emerald',
    orderIndex: 28,
  },
  {
    code: 'HW_10',
    title: '10 Ödev Tamamlandı',
    description: 'Toplamda 10 ödevi tamamladığında kazanılır.',
    category: 'assignments_completed',
    targetValue: 10,
    metricKey: 'assignments_completed_all_time',
    icon: 'clipboard-check',
    color: 'emerald',
    orderIndex: 30,
  },

  // İçerik rozetleri
  {
    code: 'CONTENT_5',
    title: '5 İçerik Tamamlandı',
    description: 'Toplamda 5 dersi / içeriği tamamladığında kazanılır.',
    category: 'content_watched',
    targetValue: 5,
    metricKey: 'content_completed_all_time',
    icon: 'play-circle',
    color: 'cyan',
    orderIndex: 38,
  },
  {
    code: 'CONTENT_20',
    title: '20 İçerik Tamamlandı',
    description: 'Toplamda 20 dersi / içeriği tamamladığında kazanılır.',
    category: 'content_watched',
    targetValue: 20,
    metricKey: 'content_completed_all_time',
    icon: 'play-circle',
    color: 'cyan',
    orderIndex: 40,
  },

  // “JSON örneği” rozetleri
  {
    code: 'q_bronze',
    title: 'Bronz Soru Çözücü',
    description: '50 soru çözerek ilk ciddi adımı attın!',
    category: 'questions_solved',
    targetValue: 50,
    metricKey: 'total_questions_all_time',
    icon: 'medal',
    color: 'bronze',
    orderIndex: 50,
  },
  {
    code: 'q_silver',
    title: 'Gümüş Soru Çözücü',
    description: 'Toplam 100 soru çözerek temel yetkinliğini kanıtladın!',
    category: 'questions_solved',
    targetValue: 100,
    metricKey: 'total_questions_all_time',
    icon: 'medal',
    color: 'silver',
    orderIndex: 51,
  },
  {
    code: 'q_gold',
    title: 'Altın Soru Çözücü',
    description: '500 soru! Sen artık bir problem çözme ustasısın.',
    category: 'questions_solved',
    targetValue: 500,
    metricKey: 'total_questions_all_time',
    icon: 'trophy',
    color: 'gold',
    orderIndex: 52,
  },
  {
    code: 'streak_7',
    title: 'Haftalık Savaşçı',
    description: '7 gün boyunca hiç ara vermeden sistemi kullandın.',
    category: 'streak',
    targetValue: 7,
    metricKey: 'longest_active_streak_days',
    icon: 'flame',
    color: 'gold',
    orderIndex: 60,
  },

  // Focus Zone rozetleri
  {
    code: 'focus_bronze',
    title: 'Bronz Odak Ustası',
    description: "Focus Zone'da 50 XP kazan (1 tam 25 dk seans).",
    category: 'mixed',
    targetValue: 50,
    metricKey: 'focus_xp_total',
    icon: 'target',
    color: 'bronze',
    orderIndex: 70,
  },
  {
    code: 'focus_silver',
    title: 'Gümüş Odak Ustası',
    description: "Focus Zone'da 200 XP kazan (4 tam 25 dk seans).",
    category: 'mixed',
    targetValue: 200,
    metricKey: 'focus_xp_total',
    icon: 'target',
    color: 'silver',
    orderIndex: 71,
  },
  {
    code: 'focus_gold',
    title: 'Altın Odak Ustası',
    description: "Focus Zone'da 500 XP kazan (10 tam 25 dk seans).",
    category: 'mixed',
    targetValue: 500,
    metricKey: 'focus_xp_total',
    icon: 'target',
    color: 'gold',
    orderIndex: 72,
  },
] as const;

async function main() {
  const client = prisma as any;
  if (!client.badgeDefinition) {
    throw new Error('Prisma model badgeDefinition not found. Did you run migrations + prisma generate?');
  }

  const existingCount = await client.badgeDefinition.count().catch(() => 0);
  if (existingCount > 0) {
    console.log(`BadgeDefinition zaten var (${existingCount} kayıt). Atlanıyor.`);
    return;
  }

  console.log(`BadgeDefinition ekleniyor... (${badgeDefinitions.length} adet)`);
  await client.badgeDefinition.createMany({
    data: badgeDefinitions.map((d) => ({
      code: d.code,
      title: d.title,
      description: d.description,
      category: d.category,
      targetValue: d.targetValue,
      metricKey: d.metricKey,
      icon: d.icon,
      color: d.color,
      orderIndex: d.orderIndex,
    })),
    skipDuplicates: true,
  });

  const newCount = await client.badgeDefinition.count().catch(() => null);
  console.log(`BadgeDefinition tamamlandı. Toplam: ${newCount ?? 'bilinmiyor'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end().catch(() => {});
  });

