/**
 * Lokal veritabanındaki TÜM verileri Render (hedef) veritabanına kopyalar.
 * Öğrenci, öğretmen, dersler, sorular, ödevler vb. tüm tablolar taşınır.
 *
 * Kullanım:
 *   SOURCE_DATABASE_URL="postgresql://..." TARGET_DATABASE_URL="postgresql://..." npx tsx scripts/migrate-local-to-render.ts
 *
 * veya .env.migrate dosyası oluştur:
 *   SOURCE_DATABASE_URL=...  (local .env'deki DATABASE_URL)
 *   TARGET_DATABASE_URL=...  (Render Dashboard → Environment'dan)
 */

import { config } from 'dotenv';
config(); // .env
config({ path: '.env.migrate', override: true }); // .env.migrate (TARGET_DATABASE_URL)
import { Pool } from 'pg';

const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;

if (!sourceUrl) {
  console.error('HATA: SOURCE_DATABASE_URL veya DATABASE_URL gerekli (lokal veritabanı)');
  process.exit(1);
}
if (!targetUrl) {
  console.error('HATA: TARGET_DATABASE_URL gerekli (Render veritabanı - Dashboard → Environment\'dan alın)');
  process.exit(1);
}

// FK sırasına göre: önce parent tablolar, sonra child
const TABLES_INSERT_ORDER = [
  'users',
  'subjects',
  'badge_definitions',
  'class_groups',
  'parent_students',
  'class_group_students',
  'contents',
  'content_class_groups',
  'content_students',
  'tests',
  'questions',
  'test_assets',
  'assignments',
  'assignment_students',
  'test_results',
  'test_result_answers',
  'watch_records',
  'help_requests',
  'help_responses',
  'complaints',
  'meetings',
  'meeting_students',
  'meeting_parents',
  'meeting_attendances',
  'messages',
  'notifications',
  'todos',
  'goals',
  'parent_goals',
  'teacher_announcements',
  'teacher_feedbacks',
  'alerts',
  'weekly_reports',
  'monthly_reports',
  'custom_reports',
  'question_bank',
  'curriculum_topics',
  'coaching_sessions',
  'coaching_goals',
  'coaching_notes',
  'study_plans',
  'student_badges',
  'student_focus_sessions',
];

async function getTableColumns(pool: Pool, table: string): Promise<string[]> {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns 
     WHERE table_schema = 'public' AND table_name = $1 
     ORDER BY ordinal_position`,
    [table],
  );
  return r.rows.map((row) => row.column_name);
}

async function copyTable(
  source: Pool,
  target: Pool,
  table: string,
): Promise<number> {
  const columns = await getTableColumns(source, table);
  if (columns.length === 0) {
    console.log(`  [${table}] Tablo yok veya boş, atlanıyor`);
    return 0;
  }

  const cols = columns.join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const selectSql = `SELECT ${cols} FROM "${table}"`;

  const result = await source.query(selectSql);
  const rows = result.rows;
  if (rows.length === 0) {
    return 0;
  }

  const insertSql = `INSERT INTO "${table}" (${cols}) VALUES (${placeholders})`;

  let inserted = 0;
  for (const row of rows) {
    const values = columns.map((col) => row[col]);
    await target.query(insertSql, values);
    inserted++;
  }
  return inserted;
}

async function truncateTarget(target: Pool) {
  console.log('\nHedef veritabanı tabloları temizleniyor (CASCADE)...');
  // Kök tablolar: CASCADE ile tüm bağımlı tablolar da temizlenir
  const rootTables = ['users', 'subjects', 'badge_definitions'];
  const tableList = rootTables.map((t) => `"${t}"`).join(', ');
  try {
    await target.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
    console.log('Tablolar temizlendi.\n');
  } catch (e: any) {
    if (e.code === '42P01') {
      console.log('Bazı tablolar henüz yok (ilk migration), devam...');
    } else {
      throw e;
    }
  }
}

async function main() {
  const source = new Pool({ connectionString: sourceUrl });
  const target = new Pool({ connectionString: targetUrl });

  console.log('Lokal veritabanı → Render veritabanı');
  console.log('SOURCE:', sourceUrl?.replace(/:[^:@]+@/, ':****@'));
  console.log('TARGET:', targetUrl?.replace(/:[^:@]+@/, ':****@'));

  try {
    await source.query('SELECT 1');
    console.log('Lokal bağlantı OK');
  } catch (e) {
    console.error('Lokal veritabanına bağlanılamadı:', (e as Error).message);
    process.exit(1);
  }

  try {
    await target.query('SELECT 1');
    console.log('Render bağlantı OK');
  } catch (e) {
    console.error('Render veritabanına bağlanılamadı:', (e as Error).message);
    process.exit(1);
  }

  await truncateTarget(target);

  let totalRows = 0;
  for (const table of TABLES_INSERT_ORDER) {
    try {
      const count = await copyTable(source, target, table);
      if (count > 0) {
        console.log(`  ${table}: ${count} satır kopyalandı`);
        totalRows += count;
      }
    } catch (e: any) {
      if (e.code === '42P01') {
        console.log(`  ${table}: Tablo mevcut değil, atlanıyor`);
      } else {
        console.error(`  ${table} HATA:`, e.message);
        throw e;
      }
    }
  }

  console.log(`\nToplam ${totalRows} satır taşındı.`);
  console.log('Render\'da lokal verileriniz artık mevcut.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
