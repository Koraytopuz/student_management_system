import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: url });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = 'password123';

// MEB müfredatına göre sınıf/ders/konu yapısı (özet)
const CURRICULUM_SEED_DATA = [
  {
    grade_level: 4,
    grade_name: '4. Sınıf',
    lessons: [
      {
        lesson_name: 'Matematik',
        topics: [
          'Doğal Sayılar',
          'Doğal Sayılarla Toplama ve Çıkarma İşlemi',
          'Doğal Sayılarla Çarpma ve Bölme İşlemi',
          'Kesirler',
          'Zaman Ölçme',
          'Veri Toplama ve Değerlendirme',
          'Geometrik Cisimler ve Şekiller',
          'Geometride Temel Kavramlar',
          'Uzunluk ve Çevre Ölçme',
          'Alan Ölçme',
          'Tartma ve Sıvı Ölçme',
        ],
      },
      {
        lesson_name: 'Fen Bilimleri',
        topics: [
          'Yer Kabuğu ve Dünya’mızın Hareketleri',
          'Besinlerimiz',
          'Kuvvetin Etkileri',
          'Maddenin Özellikleri',
          'Aydınlatma ve Ses Teknolojileri',
          'İnsan ve Çevre',
          'Basit Elektrik Devreleri',
        ],
      },
      {
        lesson_name: 'Sosyal Bilgiler',
        topics: [
          'Herkesin Bir Kimliği Var',
          'Geçmişimi Öğreniyorum',
          'Yaşadığımız Yer',
          'Üretimden Tüketime',
          'İyi ki Var',
          'Haklarımı Biliyorum',
          'Küresel Bağlantılar',
        ],
      },
      {
        lesson_name: 'Türkçe',
        topics: [
          'Okuma Kültürü',
          'Milli Mücadele ve Atatürk',
          'Erdemler',
          'Bilim ve Teknoloji',
          'Doğa ve Evren',
          'Sanat',
          'Birey ve Toplum',
          'Sağlık ve Spor',
        ],
      },
    ],
  },
  {
    grade_level: 5,
    grade_name: '5. Sınıf',
    lessons: [
      {
        lesson_name: 'Matematik',
        topics: [
          'Doğal Sayılar ve İşlemler',
          'Kesirler ve Kesirlerle İşlemler',
          'Ondalık Gösterim',
          'Yüzdeler',
          'Temel Geometrik Kavramlar ve Çizimler',
          'Üçgen ve Dörtgenler',
          'Veri Toplama ve Değerlendirme',
          'Uzunluk ve Zaman Ölçme',
          'Alan Ölçme',
          'Geometrik Cisimler',
        ],
      },
      {
        lesson_name: 'Fen Bilimleri',
        topics: [
          'Güneş, Dünya ve Ay',
          'Canlılar Dünyası',
          'Kuvvetin Ölçülmesi ve Sürtünme',
          'Madde ve Değişim',
          'Işığın Yayılması',
          'İnsan ve Çevre',
          'Elektrik Devre Elemanları',
        ],
      },
      {
        lesson_name: 'Sosyal Bilgiler',
        topics: [
          'Birey ve Toplum',
          'Kültür ve Miras',
          'İnsanlar, Yerler ve Çevreler',
          'Bilim, Teknoloji ve Toplum',
          'Üretim, Dağıtım ve Tüketim',
          'Etkin Vatandaşlık',
          'Küresel Bağlantılar',
        ],
      },
    ],
  },
  {
    grade_level: 6,
    grade_name: '6. Sınıf',
    lessons: [
      {
        lesson_name: 'Matematik',
        topics: [
          'Doğal Sayılarla İşlemler (Üslü ifadeler, İşlem önceliği)',
          'Çarpanlar ve Katlar (Bölünebilme)',
          'Kümeler',
          'Tam Sayılar',
          'Kesirlerle İşlemler',
          'Ondalık Gösterim',
          'Oran',
          'Cebirsel İfadeler',
          'Veri Toplama ve Değerlendirme',
          'Veri Analizi',
          'Açılar',
          'Alan Ölçme',
          'Çember',
          'Geometrik Cisimler (Hacim)',
          'Sıvı Ölçme',
        ],
      },
      {
        lesson_name: 'Fen Bilimleri',
        topics: [
          'Güneş Sistemi ve Tutulmalar',
          'Vücudumuzdaki Sistemler (Destek, Hareket, Sindirim, Dolaşım, Solunum, Boşaltım)',
          'Kuvvet ve Hareket (Bileşke Kuvvet, Sabit Sürat)',
          'Madde ve Isı (Yakıtlar)',
          'Ses ve Özellikleri',
          'Vücudumuzdaki Sistemler ve Sağlığı (Denetleyici Sistemler, Duyu Organları)',
          'Elektriğin İletimi',
        ],
      },
      {
        lesson_name: 'Sosyal Bilgiler',
        topics: [
          'Biz ve Değerlerimiz',
          'Tarihe Yolculuk (Orta Asya, İslamiyet, Anadolu)',
          'Yeryüzünde Yaşam (Coğrafi Konum, İklimler)',
          'Bilim ve Teknoloji Hayatımızda',
          'Üretiyorum, Tüketiyorum, Bilinçliyim',
          'Yönetime Katılıyorum',
          'Uluslararası İlişkilerimiz',
        ],
      },
    ],
  },
  {
    grade_level: 7,
    grade_name: '7. Sınıf',
    lessons: [
      {
        lesson_name: 'Matematik',
        topics: [
          'Tam Sayılarla İşlemler',
          'Rasyonel Sayılar ve İşlemler',
          'Cebirsel İfadeler',
          'Eşitlik ve Denklem',
          'Oran ve Orantı',
          'Yüzdeler',
          'Doğrular ve Açılar',
          'Çokgenler',
          'Çember ve Daire',
          'Veri Analizi',
          'Cisimlerin Görünümleri',
        ],
      },
      {
        lesson_name: 'Fen Bilimleri',
        topics: [
          'Güneş Sistemi ve Ötesi',
          'Hücre ve Bölünmeler (Mitoz, Mayoz)',
          'Kuvvet ve Enerji',
          'Saf Madde ve Karışımlar',
          'Işığın Madde ile Etkileşimi (Aynalar, Mercekler)',
          'Canlılarda Üreme, Büyüme ve Gelişme',
          'Elektrik Devreleri',
        ],
      },
      {
        lesson_name: 'Sosyal Bilgiler',
        topics: [
          'İletişim ve İnsan İlişkileri',
          'Türk Tarihinde Yolculuk (Osmanlı Kuruluş ve Yükseliş)',
          'Ülkemizde Nüfus',
          'Zaman İçinde Bilim',
          'Ekonomi ve Sosyal Hayat',
          'Yaşayan Demokrasi',
          'Ülkeler Arası Köprüler',
        ],
      },
    ],
  },
  {
    grade_level: 8,
    grade_name: '8. Sınıf (LGS)',
    lessons: [
      {
        lesson_name: 'Matematik',
        topics: [
          'Çarpanlar ve Katlar',
          'Üslü İfadeler',
          'Kareköklü İfadeler',
          'Veri Analizi',
          'Basit Olayların Olma Olasılığı',
          'Cebirsel İfadeler ve Özdeşlikler',
          'Doğrusal Denklemler',
          'Eşitsizlikler',
          'Üçgenler',
          'Eşlik ve Benzerlik',
          'Dönüşüm Geometrisi',
          'Geometrik Cisimler',
        ],
      },
      {
        lesson_name: 'Fen Bilimleri',
        topics: [
          'Mevsimler ve İklim',
          'DNA ve Genetik Kod',
          'Basınç',
          'Madde ve Endüstri (Periyodik Sistem, Asit-Baz, Kimyasal Tepkimeler)',
          'Basit Makineler',
          'Enerji Dönüşümleri ve Çevre Bilimi',
          'Elektrik Yükleri ve Elektrik Enerjisi',
        ],
      },
      {
        lesson_name: 'T.C. İnkılap Tarihi',
        topics: [
          'Bir Kahraman Doğuyor',
          'Milli Uyanış: Bağımsızlık Yolunda Atılan Adımlar',
          'Milli Bir Destan: Ya İstiklal Ya Ölüm',
          'Atatürkçülük ve Çağdaşlaşan Türkiye',
          'Demokratikleşme Çabaları',
          'Atatürk Dönemi Türk Dış Politikası',
          "Atatürk'ün Ölümü ve Sonrası",
        ],
      },
      {
        lesson_name: 'Türkçe',
        topics: [
          'Sözcükte ve Cümlede Anlam',
          'Paragrafta Anlam ve Yapı',
          'Sözel Mantık / Görsel Okuma',
          'Fiilimsiler',
          'Cümlenin Öğeleri',
          'Fiilde Çatı',
          'Cümle Türleri',
          'Yazım ve Noktalama',
          'Metin Türleri ve Söz Sanatları',
        ],
      },
    ],
  },
  {
    grade_level: 9,
    grade_name: '9. Sınıf',
    lessons: [
      {
        lesson_name: 'Matematik',
        topics: ['Mantık (Önermeler)', 'Kümeler', 'Denklem ve Eşitsizlikler (Sayı Kümeleri, Bölünebilme)', 'Üçgenler', 'Veri'],
      },
      {
        lesson_name: 'Türk Dili ve Edebiyatı',
        topics: [
          'Giriş (Edebiyat Nedir?, İletişim, Dil Bilgisi)',
          'Hikaye',
          'Şiir',
          'Masal / Fabl',
          'Roman',
          'Tiyatro',
          'Biyografi / Otobiyografi',
          'Mektup / E-Posta',
          'Günlük / Blog',
        ],
      },
      {
        lesson_name: 'Fizik',
        topics: ['Fizik Bilimine Giriş', 'Madde ve Özellikleri', 'Hareket ve Kuvvet', 'Enerji', 'Isı ve Sıcaklık', 'Elektrostatik'],
      },
      {
        lesson_name: 'Kimya',
        topics: ['Kimya Bilimi', 'Atom ve Periyodik Sistem', 'Kimyasal Türler Arası Etkileşimler', 'Maddenin Halleri', 'Doğa ve Kimya'],
      },
      {
        lesson_name: 'Biyoloji',
        topics: [
          'Yaşam Bilimi Biyoloji',
          'Canlıların Ortak Özellikleri',
          'Canlıların Yapısında Bulunan Temel Bileşenler',
          'Hücre',
          'Canlılar Dünyası (Sınıflandırma)',
        ],
      },
      {
        lesson_name: 'Tarih',
        topics: [
          'Tarih ve Zaman',
          'İnsanlığın İlk Dönemleri',
          'Orta Çağ’da Dünya',
          'İlk ve Orta Çağlarda Türk Dünyası',
          'İslam Medeniyetinin Doğuşu',
          'Türklerin İslamiyet’i Kabulü ve İlk Türk İslam Devletleri',
        ],
      },
      {
        lesson_name: 'Coğrafya',
        topics: [
          'Doğal Sistemler (Doğa ve İnsan, Harita Bilgisi, Atmosfer ve İklim)',
          'Beşeri Sistemler (Yerleşme)',
          'Bölgeler ve Ülkeler',
          'Çevre ve Toplum',
        ],
      },
    ],
  },
  {
    grade_level: 10,
    grade_name: '10. Sınıf',
    lessons: [
      {
        lesson_name: 'Matematik',
        topics: [
          'Sayma ve Olasılık (Permütasyon, Kombinasyon, Binom)',
          'Fonksiyonlar',
          'Polinomlar',
          'İkinci Dereceden Denklemler',
          'Dörtgenler ve Çokgenler',
          'Katı Cisimler',
        ],
      },
      {
        lesson_name: 'Fizik',
        topics: ['Elektrik ve Manyetizma (Elektrik Devreleri)', 'Basınç ve Kaldırma Kuvveti', 'Dalgalar', 'Optik'],
      },
      {
        lesson_name: 'Kimya',
        topics: [
          'Kimyanın Temel Kanunları ve Kimyasal Hesaplamalar (Mol)',
          'Karışımlar',
          'Asitler, Bazlar ve Tuzlar',
          'Kimya Her Yerde',
        ],
      },
      {
        lesson_name: 'Biyoloji',
        topics: ['Hücre Bölünmeleri (Mitoz, Mayoz)', 'Kalıtımın Genel İlkeleri', 'Ekosistem Ekolojisi ve Güncel Çevre Sorunları'],
      },
      {
        lesson_name: 'Türk Dili ve Edebiyatı',
        topics: [
          'Giriş (Edebiyat Tarihi)',
          'Hikaye (Dede Korkut, Halk Hikayeleri)',
          'Şiir (İslamiyet Öncesi, Geçiş Dönemi, Halk ve Divan Şiiri)',
          'Destan / Efsane',
          'Roman (Tanzimat, Servetifünun, Milli Edebiyat)',
          'Tiyatro (Geleneksel Türk Tiyatrosu)',
          'Anı (Hatıra)',
          'Haber Metni',
          'Gezi Yazısı',
        ],
      },
    ],
  },
  {
    grade_level: 11,
    grade_name: '11. Sınıf',
    lessons: [
      {
        lesson_name: 'Matematik (İleri)',
        topics: [
          'Trigonometri',
          'Analitik Geometri',
          'Fonksiyonlarda Uygulamalar',
          'Denklem ve Eşitsizlik Sistemleri',
          'Çember ve Daire',
          'Katı Cisimler',
          'Olasılık (Koşullu Olasılık)',
        ],
      },
      {
        lesson_name: 'Fizik',
        topics: [
          "Kuvvet ve Hareket (Vektörler, Bağıl Hareket, Newton'un Yasaları, Atışlar, İş-Güç-Enerji)",
          'Elektrik ve Manyetizma (Elektriksel Kuvvet, Alan, Potansiyel, Manyetizma, İndüksiyon, Alternatif Akım)',
        ],
      },
      {
        lesson_name: 'Kimya',
        topics: [
          'Modern Atom Teorisi',
          'Gazlar',
          'Sıvı Çözeltiler ve Çözünürlük',
          'Kimyasal Tepkimelerde Enerji',
          'Kimyasal Tepkimelerde Hız',
          'Kimyasal Tepkimelerde Denge',
        ],
      },
      {
        lesson_name: 'Biyoloji',
        topics: [
          'İnsan Fizyolojisi (Denetleyici ve Düzenleyici Sistemler, Duyu Organları, Destek ve Hareket, Sindirim, Dolaşım, Solunum, Boşaltım, Üreme Sistemi)',
          'Komünite ve Popülasyon Ekolojisi',
        ],
      },
      {
        lesson_name: 'Türk Dili ve Edebiyatı',
        topics: [
          'Giriş (Edebiyat-Toplum İlişkisi)',
          'Hikaye (Cumhuriyet Dönemi 1923-1960)',
          'Şiir (Tanzimat, Servetifünun, Fecriati, Milli Edebiyat, Cumhuriyet İlk Dönem)',
          'Makale',
          'Sohbet / Fıkra',
          'Roman (Cumhuriyet Dönemi 1923-1950 ve 1950-1980)',
          'Tiyatro (Cumhuriyet Dönemi)',
          'Eleştiri',
          'Mülakat / Röportaj',
        ],
      },
    ],
  },
  {
    grade_level: 12,
    grade_name: '12. Sınıf (AYT)',
    lessons: [
      {
        lesson_name: 'Matematik (İleri)',
        topics: [
          'Üstel ve Logaritmik Fonksiyonlar',
          'Diziler',
          'Trigonometri (Toplam-Fark, İki Kat Açı)',
          'Limit ve Süreklilik',
          'Türev ve Uygulamaları',
          'İntegral ve Uygulamaları',
          'Çemberin Analitik İncelenmesi',
        ],
      },
      {
        lesson_name: 'Fizik',
        topics: [
          'Çembersel Hareket',
          'Basit Harmonik Hareket',
          'Dalga Mekaniği (Kırınım, Girişim, Doppler)',
          'Atom Fiziğine Giriş ve Radyoaktivite',
          'Modern Fizik',
          'Modern Fiziğin Teknolojideki Uygulamaları',
        ],
      },
      {
        lesson_name: 'Kimya',
        topics: [
          'Kimya ve Elektrik (Redoks, Piller, Elektroliz)',
          'Karbon Kimyasına Giriş',
          'Organik Bileşikler',
          'Enerji Kaynakları ve Bilimsel Gelişmeler',
        ],
      },
      {
        lesson_name: 'Biyoloji',
        topics: [
          'Genden Proteine (Nükleik Asitler, Genetik Şifre, Protein Sentezi)',
          'Canlılarda Enerji Dönüşümleri (Fotosentez, Kemosentez, Hücresel Solunum)',
          'Bitki Biyolojisi',
          'Canlılar ve Çevre',
        ],
      },
      {
        lesson_name: 'Türk Dili ve Edebiyatı',
        topics: [
          'Giriş (Edebiyat-Felsefe/Psikoloji)',
          'Hikaye (1960 Sonrası Cumhuriyet)',
          'Şiir (Cumhuriyet Dönemi Saf Şiir, Toplumcu, Garip, İkinci Yeni, Halk Şiiri)',
          'Roman (Cumhuriyet Dönemi 1980 Sonrası)',
          'Tiyatro (1950 Sonrası)',
          'Deneme',
          'Söylev (Nutuk)',
        ],
      },
      {
        lesson_name: 'T.C. İnkılap Tarihi',
        topics: [
          '20. Yüzyıl Başlarında Osmanlı ve Dünya',
          'Milli Mücadele',
          'Atatürkçülük ve Türk İnkılabı',
          'İki Savaş Arasındaki Dönemde Türkiye ve Dünya',
          'II. Dünya Savaşı Sürecinde Türkiye ve Dünya',
          'II. Dünya Savaşı Sonrasında Türkiye ve Dünya',
          'Toplumsal Devrim Çağında Dünya ve Türkiye',
          '21. Yüzyılın Eşiğinde Türkiye ve Dünya',
        ],
      },
    ],
  },
] as const;

// JSON'daki ders adlarını Subject id'lerine map et
const LESSON_TO_SUBJECT_ID: Record<string, string> = {
  Matematik: 'sub_matematik',
  'Matematik (İleri)': 'sub_matematik',
  'Fen Bilimleri': 'sub_fen',
  'Sosyal Bilgiler': 'sub_sosyal',
  Türkçe: 'sub_turkce',
  'Türk Dili ve Edebiyatı': 'sub_edebiyat',
  Fizik: 'sub_fizik',
  Kimya: 'sub_kimya',
  Biyoloji: 'sub_biyoloji',
  Tarih: 'sub_tarih',
  Coğrafya: 'sub_cografya',
  'T.C. İnkılap Tarihi': 'sub_tarih',
};

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Admin
  const admin = await prisma.user.upsert({
    where: { email_role: { email: 'admin@example.com', role: 'admin' } },
    create: {
      name: 'Yönetici',
      email: 'admin@example.com',
      role: 'admin',
      passwordHash,
    },
    update: {},
  });

  // Teacher
  const teacher = await prisma.user.upsert({
    where: { email_role: { email: 'ayse.teacher@example.com', role: 'teacher' } },
    create: {
      name: 'Ayşe Öğretmen',
      email: 'ayse.teacher@example.com',
      role: 'teacher',
      passwordHash,
      subjectAreas: ['Matematik', 'Geometri'],
    },
    update: {},
  });

  // Students
  const student1 = await prisma.user.upsert({
    where: { email_role: { email: 'ali.student@example.com', role: 'student' } },
    create: {
      name: 'Ali Öğrenci',
      email: 'ali.student@example.com',
      role: 'student',
      passwordHash,
      gradeLevel: '9',
      classId: '', // will set after class group
    },
    update: {},
  });

  const student2 = await prisma.user.upsert({
    where: { email_role: { email: 'zeynep.student@example.com', role: 'student' } },
    create: {
      name: 'Zeynep Öğrenci',
      email: 'zeynep.student@example.com',
      role: 'student',
      passwordHash,
      gradeLevel: '9',
      classId: '',
    },
    update: {},
  });

  // Parent
  const parent = await prisma.user.upsert({
    where: { email_role: { email: 'mehmet.parent@example.com', role: 'parent' } },
    create: {
      name: 'Mehmet Veli',
      email: 'mehmet.parent@example.com',
      role: 'parent',
      passwordHash,
    },
    update: {},
  });

  // Subjects - Tüm dershane dersleri (4-12. sınıf)
  const allSubjects = [
    // Ortak Dersler
    { id: 'sub_turkce', name: 'Türkçe' },
    { id: 'sub_matematik', name: 'Matematik' },
    { id: 'sub_fen', name: 'Fen Bilimleri' },
    { id: 'sub_sosyal', name: 'Sosyal Bilgiler' },
    { id: 'sub_ingilizce', name: 'İngilizce' },
    // Lise Dersleri
    { id: 'sub_fizik', name: 'Fizik' },
    { id: 'sub_kimya', name: 'Kimya' },
    { id: 'sub_biyoloji', name: 'Biyoloji' },
    { id: 'sub_edebiyat', name: 'Türk Dili ve Edebiyatı' },
    { id: 'sub_tarih', name: 'Tarih' },
    { id: 'sub_cografya', name: 'Coğrafya' },
    { id: 'sub_felsefe', name: 'Felsefe' },
    { id: 'sub_din', name: 'Din Kültürü ve Ahlak Bilgisi' },
    { id: 'sub_almanca', name: 'Almanca' },
    { id: 'sub_geometri', name: 'Geometri' },
  ];

  for (const sub of allSubjects) {
    await prisma.subject.upsert({
      where: { id: sub.id },
      create: { id: sub.id, name: sub.name },
      update: { name: sub.name },
    });
  }

  // Müfredat konularını CurriculumTopic tablosuna işle
  for (const grade of CURRICULUM_SEED_DATA) {
    const gradeLevelStr = String(grade.grade_level);

    for (const lesson of grade.lessons) {
      const subjectId = LESSON_TO_SUBJECT_ID[lesson.lesson_name];
      if (!subjectId) {
        // Tanımsız ders adları loglansın ama seed durmasın
        console.warn(
          `[seed] CurriculumTopic: Ders eşleştirilemedi -> grade=${gradeLevelStr}, lesson=${lesson.lesson_name}`,
        );
        continue;
      }

      let unitNumber = 1;
      let orderIndex = 1;

      for (const topic of lesson.topics) {
        const kazanimKodu = `${gradeLevelStr}.${unitNumber}.1`;

        await prisma.curriculumTopic.upsert({
          where: {
            subjectId_gradeLevel_kazanimKodu: {
              subjectId,
              gradeLevel: gradeLevelStr,
              kazanimKodu,
            },
          },
          create: {
            subjectId,
            gradeLevel: gradeLevelStr,
            unitNumber,
            topicName: topic,
            kazanimKodu,
            kazanimText: topic,
            orderIndex,
          },
          update: {
            unitNumber,
            topicName: topic,
            kazanimText: topic,
            orderIndex,
          },
        });

        unitNumber += 1;
        orderIndex += 1;
      }
    }
  }

  const subject1 = await prisma.subject.findUniqueOrThrow({ where: { id: 'sub_matematik' } });
  const subject2 = await prisma.subject.findUniqueOrThrow({ where: { id: 'sub_fizik' } });

  // Class group
  const classGroup = await prisma.classGroup.upsert({
    where: { id: 'c1' },
    create: {
      id: 'c1',
      name: '9A',
      gradeLevel: '9',
      teacherId: teacher.id,
      students: {
        create: [
          { studentId: student1.id },
          { studentId: student2.id },
        ],
      },
    },
    update: {},
  });

  // Update students with classId
  await prisma.user.updateMany({
    where: { id: { in: [student1.id, student2.id] } },
    data: { classId: classGroup.id },
  });

  // Parent-Student links
  await prisma.parentStudent.upsert({
    where: { parentId_studentId: { parentId: parent.id, studentId: student1.id } },
    create: { parentId: parent.id, studentId: student1.id },
    update: {},
  });
  await prisma.parentStudent.upsert({
    where: { parentId_studentId: { parentId: parent.id, studentId: student2.id } },
    create: { parentId: parent.id, studentId: student2.id },
    update: {},
  });

  // Content
  const content1 = await prisma.contentItem.upsert({
    where: { id: 'cnt1' },
    create: {
      id: 'cnt1',
      title: 'Denklemlere Giriş',
      description: 'Lineer denklemlere giriş videosu',
      type: 'video',
      subjectId: subject1.id,
      topic: 'Denklemler',
      gradeLevel: '9',
      durationMinutes: 20,
      tags: ['Denklemler', '9. Sınıf Matematik'],
      url: 'https://example.com/videos/denklemler-giris',
      classGroups: { create: [{ classGroupId: classGroup.id }] },
    },
    update: {},
  });

  const content2 = await prisma.contentItem.upsert({
    where: { id: 'cnt2' },
    create: {
      id: 'cnt2',
      title: 'Üslü Sayılar Konu Anlatım PDF',
      description: 'Üslü sayılar konusu için pdf konu anlatımı',
      type: 'document',
      subjectId: subject1.id,
      topic: 'Üslü Sayılar',
      gradeLevel: '9',
      tags: ['Üslü Sayılar', '9. Sınıf Matematik'],
      url: '/pdfs/matematik_pdf.pdf',
      classGroups: { create: [{ classGroupId: classGroup.id }] },
    },
    update: {},
  });

  // Test
  const test = await prisma.test.upsert({
    where: { id: 'test1' },
    create: {
      id: 'test1',
      title: 'Denklemler – Test 1',
      subjectId: subject1.id,
      topic: 'Denklemler',
      createdByTeacherId: teacher.id,
      questions: {
        create: [
          {
            id: 'q1',
            text: '2x + 3 = 7 denkleminin çözümü nedir?',
            type: 'multiple_choice',
            choices: ['x = 1', 'x = 2', 'x = 3', 'x = 4'],
            correctAnswer: 'x = 2',
            solutionExplanation: '2x + 3 = 7 ⇒ 2x = 4 ⇒ x = 2',
            topic: 'Denklemler',
            difficulty: 'easy',
          },
          {
            id: 'q2',
            text: 'x - 5 = 10 ise x kaçtır?',
            type: 'multiple_choice',
            choices: ['10', '15', '5', '20'],
            correctAnswer: '15',
            solutionExplanation: 'x - 5 = 10 ⇒ x = 15',
            topic: 'Denklemler',
            difficulty: 'easy',
          },
          {
            id: 'q3',
            text: "Doğru mu, yanlış mı? 3x = 12 ise x = 4.",
            type: 'true_false',
            correctAnswer: 'true',
            solutionExplanation: '3x = 12 ⇒ x = 4, ifade doğrudur.',
            topic: 'Denklemler',
            difficulty: 'easy',
          },
        ],
      },
    },
    update: {},
  });

  // Assignment
  const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const assignment = await prisma.assignment.upsert({
    where: { id: 'a1' },
    create: {
      id: 'a1',
      title: 'Denklemler Konusundan 2 Test Görevi',
      description: 'Denklemler konusunu pekiştirmek için test görevi',
      testId: test.id,
      contentId: content1.id,
      classId: classGroup.id,
      dueDate,
      points: 100,
      students: {
        create: [{ studentId: student1.id }, { studentId: student2.id }],
      },
    },
    update: {},
  });

  // Test result (demo)
  await prisma.testResult.upsert({
    where: { id: 'tr1' },
    create: {
      id: 'tr1',
      assignmentId: assignment.id,
      studentId: student1.id,
      testId: test.id,
      correctCount: 3,
      incorrectCount: 0,
      blankCount: 0,
      scorePercent: 100,
      durationSeconds: 480,
      completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      answers: {
        create: [
          { questionId: 'q1', answer: 'x = 2', isCorrect: true },
          { questionId: 'q2', answer: '15', isCorrect: true },
          { questionId: 'q3', answer: 'true', isCorrect: true },
        ],
      },
    },
    update: {},
  });

  // Meeting
  await prisma.meeting.upsert({
    where: { id: 'm1' },
    create: {
      id: 'm1',
      type: 'class',
      title: 'Denklemler Tekrar Dersi',
      teacherId: teacher.id,
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      durationMinutes: 45,
      meetingUrl: 'https://meet.example.com/denklemler-9a',
      students: {
        create: [{ studentId: student1.id }, { studentId: student2.id }],
      },
    },
    update: {},
  });

  // Badge definitions (rozetler)
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
    // JSON örneğine göre isimlendirilmiş rozetler
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
  ] as const;

  // Prisma client tipleri henüz güncellenmemiş olabilir; runtime'da model mevcut.
  const badgeClient = prisma as any;

  for (const def of badgeDefinitions) {
    await badgeClient.badgeDefinition.upsert({
      where: { code: def.code },
      create: {
        code: def.code,
        title: def.title,
        description: def.description,
        // @ts-ignore - Prisma enum string literal
        category: def.category,
        targetValue: def.targetValue,
        metricKey: def.metricKey,
        icon: def.icon,
        color: def.color,
        orderIndex: def.orderIndex,
      },
      update: {
        title: def.title,
        description: def.description,
        // @ts-ignore
        category: def.category,
        targetValue: def.targetValue,
        metricKey: def.metricKey,
        icon: def.icon,
        color: def.color,
        orderIndex: def.orderIndex,
      },
    });
  }

  console.log('Seed tamamlandı. Demo kullanıcılar (şifre: ' + DEMO_PASSWORD + '):');
  console.log('  Admin: admin@example.com');
  console.log('  Öğretmen: ayse.teacher@example.com');
  console.log('  Öğrenci: ali.student@example.com, zeynep.student@example.com');
  console.log('  Veli: mehmet.parent@example.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
