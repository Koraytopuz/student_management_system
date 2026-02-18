import 'dotenv/config';
import { PrismaClient, StreamType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: url });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = 'sky123';

const SECTIONS = ['A', 'B', 'C', 'D', 'E'] as const;

// Sınıf tanımları: 4-10 (akışsız), 11/12 ve Mezun (Sayısal/EA/Sözel)
const CLASS_DEFINITIONS: { id: string; name: string; gradeLevel: string; stream?: StreamType }[] = [
  { id: 'c_4', name: '4. Sınıf', gradeLevel: '4' },
  { id: 'c_5', name: '5. Sınıf', gradeLevel: '5' },
  { id: 'c_6', name: '6. Sınıf', gradeLevel: '6' },
  { id: 'c_7', name: '7. Sınıf', gradeLevel: '7' },
  { id: 'c_8', name: '8. Sınıf', gradeLevel: '8' },
  { id: 'c_9', name: '9. Sınıf', gradeLevel: '9' },
  { id: 'c_10', name: '10. Sınıf', gradeLevel: '10' },
  { id: 'c_11_say', name: '11. Sınıf Sayısal', gradeLevel: '11', stream: StreamType.SAYISAL },
  { id: 'c_11_ea', name: '11. Sınıf Eşit Ağırlık', gradeLevel: '11', stream: StreamType.ESIT_AGIRLIK },
  { id: 'c_11_soz', name: '11. Sınıf Sözel', gradeLevel: '11', stream: StreamType.SOZEL },
  { id: 'c_12_say', name: '12. Sınıf Sayısal', gradeLevel: '12', stream: StreamType.SAYISAL },
  { id: 'c_12_ea', name: '12. Sınıf Eşit Ağırlık', gradeLevel: '12', stream: StreamType.ESIT_AGIRLIK },
  { id: 'c_12_soz', name: '12. Sınıf Sözel', gradeLevel: '12', stream: StreamType.SOZEL },
  { id: 'c_mezun_say', name: 'Mezun Sayısal', gradeLevel: 'MEZUN', stream: StreamType.SAYISAL },
  { id: 'c_mezun_ea', name: 'Mezun Eşit Ağırlık', gradeLevel: 'MEZUN', stream: StreamType.ESIT_AGIRLIK },
  { id: 'c_mezun_soz', name: 'Mezun Sözel', gradeLevel: 'MEZUN', stream: StreamType.SOZEL },
];

function isKoray(student: { name?: string | null; email?: string | null }) {
  const n = (student.name ?? '').toLowerCase();
  const e = (student.email ?? '').toLowerCase();
  return n.includes('koray') || e.includes('koray');
}

function isDemoSeedEmail(email: string) {
  const e = email.toLowerCase();
  // seed.ts generates: ogr_${compositeId}_${i}.student@example.com
  // we also use: demo_${classGroupId}.student@example.com
  return e.endsWith('.student@example.com') && (e.startsWith('ogr_') || e.startsWith('demo_'));
}

async function main() {
  console.log('Demo öğrenciler temizleniyor ve her sınıfa 1 öğrenci ekleniyor...');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Ensure class groups exist (some DBs may not have been seeded yet)
  const classGroupCount = await prisma.classGroup.count().catch(() => 0);
  if (classGroupCount === 0) {
    console.log('ClassGroup bulunamadı. Temel sınıf grupları oluşturuluyor...');

    // Use an existing teacher as default owner; create one if none exists.
    let teacher = await prisma.user.findFirst({
      where: { role: 'teacher' },
      select: { id: true },
    });
    if (!teacher) {
      const email = 'matematik.teacher@example.com';
      teacher = await prisma.user.upsert({
        where: { email_role: { email, role: 'teacher' } },
        create: {
          name: 'Matematik Öğretmeni',
          email,
          role: 'teacher',
          passwordHash,
          subjectAreas: ['Matematik'],
          teacherGrades: ['4', '5', '6', '7', '8', '9', '10', '11', '12', 'MEZUN'],
        },
        update: {},
        select: { id: true },
      });
    }

    const data = CLASS_DEFINITIONS.flatMap((cls) =>
      SECTIONS.map((section) => ({
        id: `${cls.id}_${section}`,
        name: `${cls.name} ${section}`,
        gradeLevel: cls.gradeLevel,
        stream: cls.stream ?? null,
        section,
        teacherId: teacher.id,
      })),
    );

    await prisma.classGroup.createMany({ data, skipDuplicates: true });
    console.log(`ClassGroup oluşturuldu: ${data.length} adet`);
  }

  const allStudents = await prisma.user.findMany({
    where: { role: 'student' },
    select: { id: true, name: true, email: true, classId: true, gradeLevel: true },
  });

  const toDelete = allStudents.filter((s) => isDemoSeedEmail(s.email) && !isKoray(s));

  console.log(`Silinecek demo öğrenci sayısı: ${toDelete.length}`);

  let deleted = 0;
  for (const s of toDelete) {
    try {
      // Admin route deletes only parent link + user; everything else is cascaded in schema.
      await prisma.parentStudent.deleteMany({ where: { studentId: s.id } });
      await prisma.user.delete({ where: { id: s.id } });
      deleted += 1;
    } catch (e) {
      console.error(`[DELETE_FAIL] ${s.email} (${s.id})`, e);
    }
  }
  console.log(`Silinen demo öğrenci: ${deleted}/${toDelete.length}`);

  // Remaining students per classGroup (Koray and any manual students remain)
  const remainingStudents = await prisma.user.findMany({
    where: { role: 'student' },
    select: { id: true, classId: true, name: true, email: true },
  });
  const hasStudentByClassId = new Set<string>(
    remainingStudents
      .map((s) => s.classId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );

  const classGroups = await prisma.classGroup.findMany({
    select: { id: true, name: true, gradeLevel: true, stream: true, section: true },
  });

  let created = 0;
  let skipped = 0;

  for (const cg of classGroups) {
    if (hasStudentByClassId.has(cg.id)) {
      skipped += 1;
      continue;
    }

    const email = `demo_${cg.id}.student@example.com`;
    const name = `Demo Öğrenci (${cg.name})`;

    const createdStudent = await prisma.user.upsert({
      where: { email_role: { email, role: 'student' } },
      create: {
        name,
        email,
        role: 'student',
        passwordHash,
        gradeLevel: cg.gradeLevel,
        classId: cg.id,
      },
      update: {
        name,
        passwordHash,
        gradeLevel: cg.gradeLevel,
        classId: cg.id,
      },
      select: { id: true },
    });

    // Keep ClassGroupStudent in sync (used by exam notifications)
    const client = prisma as any;
    if (client.classGroupStudent?.upsert) {
      await client.classGroupStudent.upsert({
        where: { classGroupId_studentId: { classGroupId: cg.id, studentId: createdStudent.id } },
        create: { classGroupId: cg.id, studentId: createdStudent.id },
        update: {},
      });
    }

    hasStudentByClassId.add(cg.id);
    created += 1;
  }

  console.log(`Sınıf grubu sayısı: ${classGroups.length}`);
  console.log(`Yeni eklenen demo öğrenci: ${created}`);
  console.log(`Zaten öğrenci vardı (Koray/manual): ${skipped}`);
  console.log(`Demo öğrenci şifresi: ${DEMO_PASSWORD}`);
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

