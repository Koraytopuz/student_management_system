import 'dotenv/config';
import { PrismaClient, ExamType, PriorityLevel, StreamType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: url });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = 'sky123';

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
      {
        lesson_name: 'Din Kültürü ve Ahlak Bilgisi',
        topics: ['Günlük Hayattaki Dini İfadeler', 'İslamı Tanıyalım', 'Hz. Muhammed', 'Kur’an-ı Kerim'],
      },
      {
        lesson_name: 'İngilizce',
        topics: ['Classroom Rules', 'Nationality', 'Cartoon Characters', 'Free Time', 'My Day', 'Fun with Science'],
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
      {
        lesson_name: 'Türkçe',
        topics: ['Birey ve Toplum', 'Milli Mücadele ve Atatürk', 'Erdemler', 'Bilim ve Teknoloji', 'Sanat', 'Vatandaşlık'],
      },
      {
        lesson_name: 'Din Kültürü ve Ahlak Bilgisi',
        topics: ['Allah İnancı', 'Ramazan ve Oruç', 'Adap ve Nezaket', 'Hz. Muhammed ve Aile Hayatı', 'Çevremizdeki Dini İzler'],
      },
      {
        lesson_name: 'İngilizce',
        topics: ['Hello', 'My Town', 'Games and Hobbies', 'My Daily Routine', 'Health', 'Movies', 'Party Time', 'Fitness', 'Animal Shelter', 'Festivals'],
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
      {
        lesson_name: 'Türkçe',
        topics: ['Duygular', 'Milli Kültürümüz', 'Doğa ve Evren', 'Kişisel Gelişim', 'Bilim ve Teknoloji'],
      },
      {
        lesson_name: 'Din Kültürü ve Ahlak Bilgisi',
        topics: ['Peygamber ve İlahi Kitap İnancı', 'Namaz', 'Zararlı Alışkanlıklar', 'Hz. Muhammed’in Hayatı', 'Temel Değerlerimiz'],
      },
      {
        lesson_name: 'İngilizce',
        topics: ['Life', 'Yummy Breakfast', 'Downtown', 'Weather and Emotions', 'At the Fair', 'Vacation', 'Occupations', 'Detectives', 'Saving the Planet', 'Democracy'],
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
      {
        lesson_name: 'Türkçe',
        topics: ['Erdemler', 'Milli Mücadele ve Atatürk', 'Duygular', 'Sanat', 'Kişisel Gelişim', 'Zaman ve Mekan'],
      },
      {
        lesson_name: 'Din Kültürü ve Ahlak Bilgisi',
        topics: ['Melek ve Ahiret İnancı', 'Hac ve Kurban', 'Ahlaki Davranışlar', 'Allah’ın Kulu ve Elçisi: Hz. Muhammed', 'İslam Düşüncesinde Yorumlar'],
      },
      {
        lesson_name: 'İngilizce',
        topics: ['Appearance and Personality', 'Sports', 'Biographies', 'Wild Animals', 'Television', 'Celebrations', 'Dreams', 'Public Buildings', 'Environment', 'Planets'],
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
      {
        lesson_name: 'Din Kültürü ve Ahlak Bilgisi',
        topics: ['Kader İnancı', 'Zekat ve Sadaka', 'Din ve Hayat', 'Hz. Muhammed’in Örnekliği', 'Kur’an-ı Kerim ve Özellikleri'],
      },
      {
        lesson_name: 'İngilizce',
        topics: ['Friendship', 'Teen Life', 'In the Kitchen', 'On the Phone', 'The Internet', 'Adventures', 'Tourism', 'Chores', 'Science', 'Natural Forces'],
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
      {
        lesson_name: 'İngilizce',
        topics: ['Studying Abroad', 'My Environment', 'Movies', 'Human in Nature', 'Inspirational People', 'Bridging Cultures', 'World Heritage', 'Emergency and Health Problems', 'Invitations and Celebrations', 'Television and Social Media'],
      },
      {
        lesson_name: 'Din Kültürü ve Ahlak Bilgisi',
        topics: ['Bilgi ve İnanç', 'Din ve İslam', 'İslam ve İbadet', 'Hz. Muhammed’in Hayatı', 'Kur’an-ı Kerim’den Öğütler'],
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
      {
        lesson_name: 'Tarih',
        topics: [
          'Yerleşme ve Devletleşme Sürecinde Selçuklu Türkiyesi',
          'Beylikten Devlete Osmanlı Siyaseti',
          'Devletleşme Sürecinde Savaşçılar ve Askerler',
          'Beylikten Devlete Osmanlı Medeniyeti',
          'Dünya Gücü Osmanlı',
          'Sultan ve Osmanlı Merkez Teşkilatı',
          'Klasik Çağda Osmanlı Toplum Düzeni',
        ],
      },
      {
        lesson_name: 'Coğrafya',
        topics: [
          'Doğal Sistemler (Kayaçlar, Topraklar, Sular)',
          'Beşeri Sistemler (Nüfus ve Göç)',
          'Küresel Ortam: Bölgeler ve Ülkeler (Ulaşım)',
          'Çevre ve Toplum (Afetler)',
        ],
      },
      {
        lesson_name: 'Felsefe',
        topics: [
          'Felsefeyi Tanıma',
          'Felsefe ile Düşünme',
          'Varlık Felsefesi',
          'Bilgi Felsefesi',
          'Bilim Felsefesi',
          'Ahlak Felsefesi',
          'Din Felsefesi',
          'Siyaset Felsefesi',
          'Sanat Felsefesi',
        ],
      },
      {
        lesson_name: 'İngilizce',
        topics: ['School Life', 'Plans', 'Legendary Figures', 'Traditions', 'Travel', 'Helpful Tips', 'Food and Festivals', 'Digital Era', 'Modern Heroes', 'Shopping'],
      },
      {
        lesson_name: 'Din Kültürü ve Ahlak Bilgisi',
        topics: ['Allah İnsan İlişkisi', 'Hz. Muhammed ve Gençlik', 'Din ve Hayat', 'Ahlaki Tutum ve Davranışlar', 'İslam Düşüncesinde İtikadi, Siyasi ve Fıkhi Yorumlar'],
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
      {
        lesson_name: 'Tarih',
        topics: [
          'Değişim Çağında Avrupa ve Osmanlı',
          'Uluslararası İlişkilerde Denge Stratejisi (1774-1914)',
          'Devrimler Çağında Değişen Devlet-Toplum İlişkileri',
          'Sermaye ve Emek',
          'XIX. ve XX. Yüzyılda Değişen Gündelik Hayat',
        ],
      },
      {
        lesson_name: 'Coğrafya',
        topics: [
          'Doğal Sistemler (Biyoçeşitlilik, Madde Döngüleri)',
          'Beşeri Sistemler (Yerleşme Dokuları, Şehirlerin Etki Alanları)',
          'Türkiye’de Arazi Kullanımı',
          'Türkiye Ekonomisi (Tarım, Hayvancılık, Madenler, Enerji, Sanayi)',
          'Kültür Bölgeleri',
        ],
      },
      {
        lesson_name: 'Felsefe',
        topics: [
          'MÖ 6. Yüzyıl - MS 2. Yüzyıl Felsefesi',
          'MS 2. Yüzyıl - MS 15. Yüzyıl Felsefesi',
          '15. Yüzyıl - 17. Yüzyıl Felsefesi',
          '18. Yüzyıl - 19. Yüzyıl Felsefesi',
          '20. Yüzyıl Felsefesi',
        ],
      },
      {
        lesson_name: 'İngilizce',
        topics: ['Future Jobs', 'Hobbies and Skills', 'Hard Times', 'What a Life', 'Back to the Past', 'Open Your Heart', 'Facts about Turkey', 'Sports', 'My Friends', 'Values and Norms'],
      },
      {
        lesson_name: 'Din Kültürü ve Ahlak Bilgisi',
        topics: ['Dünya ve Ahiret', 'Kuran’a Göre Hz. Muhammed', 'Kuran’da Bazı Kavramlar', 'İnançla İlgili Meseleler', 'Yahudilik ve Hristiyanlık'],
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
      {
        lesson_name: 'Coğrafya',
        topics: [
          'Doğal Sistemler (Ekstrem Doğa Olayları, İklim Değişimi)',
          'Beşeri Sistemler (Şehirleşme, Göç, Geleceğin Şehirleri)',
          'Türkiye’de Bölgesel Kalkınma Projeleri',
          'Hizmet Sektörü, Ulaşım, Turizm, Ticaret',
          'Jeopolitik Konum',
          'Çevre Sorunları ve Sürdürülebilirlik',
        ],
      },
      {
        lesson_name: 'İngilizce',
        topics: ['Music', 'Friendship', 'Human Rights', 'Coming Soon', 'Psychology', 'Favours', 'News Stories', 'Alternative Energy', 'Technology', 'Manners'],
      },
      {
        lesson_name: 'Din Kültürü ve Ahlak Bilgisi',
        topics: ['İslam ve Bilim', 'Anadolu’da İslam', 'İslam Düşüncesinde Tasavvufi Yorumlar', 'Güncel Dini Meseleler', 'Hint ve Çin Dinleri'],
      },
    ],
  },
  {
    grade_level: 'TYT',
    grade_name: 'TYT',
    lessons: [
      {
        lesson_name: 'Türkçe',
        topics: [
          'Sözcükte Anlam',
          'Cümlede Anlam',
          'Paragrafta Anlam',
          'Ses Bilgisi',
          'Yazım Kuralları',
          'Noktalama İşaretleri',
          'Sözcük Türleri (İsim, Sıfat, Zamir, Zarf, Edat, Bağlaç, Ünlem)',
          'Fiiller (Eylem)',
          'Ekler ve Sözcükte Yapı',
          'Cümlenin Ögeleri',
          'Fiil Çatısı',
          'Cümle Türleri',
          'Anlatım Bozuklukları',
        ],
      },
      {
        lesson_name: 'Matematik',
        topics: [
          'Temel Kavramlar',
          'Sayı Basamakları',
          'Bölme ve Bölünebilme',
          'EBOB-EKOK',
          'Rasyonel Sayılar',
          'Basit Eşitsizlikler',
          'Mutlak Değer',
          'Üslü Sayılar',
          'Köklü Sayılar',
          'Çarpanlara Ayırma',
          'Oran-Orantı',
          'Problemler (Sayı, Kesir, Yaş, İşçi, Hız, Yüzde)',
          'Kümeler',
          'Fonksiyonlar',
          'Polinomlar',
          'İkinci Dereceden Denklemler',
          'Karmaşık Sayılar',
          'Permütasyon-Kombinasyon-Binom-Olasılık',
        ],
      },
      {
        lesson_name: 'Geometri',
        topics: [
          'Doğruda ve Üçgende Açılar',
          'Özel Üçgenler (Dik, İkizkenar, Eşkenar)',
          'Üçgende Alan ve Benzerlik',
          'Açıortay ve Kenarortay',
          'Çokgenler ve Dörtgenler',
          'Çember ve Daire',
          'Katı Cisimler',
          'Analitik Geometri',
        ],
      },
      {
        lesson_name: 'Fizik',
        topics: [
          'Fizik Bilimine Giriş',
          'Madde ve Özellikleri',
          'Hareket ve Kuvvet',
          'İş, Güç ve Enerji',
          'Isı, Sıcaklık ve Genleşme',
          'Elektrostatik',
          'Elektrik Akımı ve Devreler',
          'Optik (Aydınlanma, Gölge, Yansıma, Aynalar, Kırılma, Mercekler, Renk)',
          'Dalgalar',
        ],
      },
      {
        lesson_name: 'Kimya',
        topics: [
          'Kimya Bilimi',
          'Atom ve Periyodik Sistem',
          'Kimyasal Türler Arası Etkileşimler',
          'Maddenin Halleri',
          'Doğa ve Kimya',
          'Kimyanın Temel Kanunları',
          'Karışımlar',
          'Asitler, Bazlar ve Tuzlar',
          'Kimya Her Yerde',
        ],
      },
      {
        lesson_name: 'Biyoloji',
        topics: [
          'Yaşam Bilimi Biyoloji',
          'Canlıların Ortak Özellikleri',
          'Temel Bileşenler',
          'Hücre',
          'Canlıların Sınıflandırılması',
          'Mitoz ve Eşeysiz Üreme',
          'Mayoz ve Eşeyli Üreme',
          'Kalıtım',
          'Ekosistem Ekolojisi',
        ],
      },
      {
        lesson_name: 'Tarih',
        topics: [
          'Tarih Bilimine Giriş',
          'İlk Çağ Uygarlıkları',
          'İslamiyet Öncesi Türk Tarihi',
          'İslam Tarihi ve Uygarlığı',
          'Türk-İslam Devletleri',
          'Türkiye Tarihi (Anadolu Selçuklu)',
          'Beylikten Devlete Osmanlı',
          'Dünya Gücü Osmanlı',
          'Osmanlı Duraklama ve Gerileme',
          'Osmanlı Dağılma Dönemi',
          'Milli Mücadele Dönemi',
          'Atatürk İlke ve İnkılapları',
        ],
      },
      {
        lesson_name: 'Coğrafya',
        topics: [
          'Doğa ve İnsan',
          'Dünya’nın Şekli ve Hareketleri',
          'Harita Bilgisi',
          'Atmosfer ve İklim',
          'Türkiye’nin İklimi',
          'İç ve Dış Kuvvetler',
          'Nüfus ve Göç',
          'Yerleşme',
          'Bölgeler ve Ülkeler',
          'Doğal Afetler',
        ],
      },
      {
        lesson_name: 'Felsefe',
        topics: [
          'Felsefeyle Tanışma',
          'Bilgi Felsefesi',
          'Varlık Felsefesi',
          'Ahlak Felsefesi',
          'Sanat Felsefesi',
          'Din Felsefesi',
          'Siyaset Felsefesi',
          'Bilim Felsefesi',
        ],
      },
      {
        lesson_name: 'Din Kültürü ve Ahlak Bilgisi',
        topics: [
          'Bilgi ve İnanç',
          'Din ve İslam',
          'İslam ve İbadet',
          'Hz. Muhammed',
          'Vahiy ve Akıl',
          'Anadolu’da İslam',
          'İslam Düşüncesinde Yorumlar',
          'Din ve Hayat',
        ],
      },
    ],
  },
  {
    grade_level: 'AYT',
    grade_name: 'AYT',
    lessons: [
      {
        lesson_name: 'Türk Dili ve Edebiyatı',
        topics: [
          'Güzel Sanatlar ve Edebiyat',
          'Coşku ve Heyecanı Dile Getiren Metinler (Şiir)',
          'Olay Çevresinde Oluşan Edebi Metinler',
          'Öğretici Metinler',
          'İslamiyet Öncesi Türk Edebiyatı',
          'İslami Dönem Türk Edebiyatı (Halk ve Divan)',
          'Batı Etkisindeki Türk Edebiyatı (Tanzimat)',
          'Servet-i Fünun ve Fecr-i Ati Edebiyatı',
          'Milli Edebiyat Dönemi',
          'Cumhuriyet Dönemi Türk Edebiyatı',
          'Edebi Akımlar',
        ],
      },
      {
        lesson_name: 'Matematik (İleri)',
        topics: [
          'Polinomlar',
          'İkinci Dereceden Denklemler, Eşitsizlikler ve Fonksiyonlar',
          'Trigonometri',
          'Logaritma',
          'Diziler',
          'Limit ve Süreklilik',
          'Türev ve Uygulamaları',
          'İntegral ve Uygulamaları',
          'Olasılık',
        ],
      },
      {
        lesson_name: 'Fizik',
        topics: [
          'Kuvvet ve Hareket (Vektör, Tork, Denge, Atışlar)',
          'Enerji ve Hareket',
          'İtme ve Momentum',
          'Elektrik ve Manyetizma (Elektriksel Kuvvet, Alan, Potansiyel, Sığaçlar)',
          'Manyetizma ve Elektromanyetik İndüklenme',
          'Alternatif Akım ve Transformatörler',
          'Çembersel Hareket',
          'Basit Harmonik Hareket',
          'Dalga Mekaniği',
          'Atom Fiziği ve Radyoaktivite',
          'Modern Fizik',
        ],
      },
      {
        lesson_name: 'Kimya',
        topics: [
          'Modern Atom Teorisi',
          'Gazlar',
          'Sıvı Çözeltiler',
          'Kimyasal Tepkimelerde Enerji',
          'Kimyasal Tepkimelerde Hız',
          'Kimyasal Tepkimelerde Denge',
          'Asit-Baz Dengesi',
          'Çözünürlük Dengesi',
          'Kimya ve Elektrik',
          'Karbon Kimyasına Giriş',
          'Organik Kimya',
          'Enerji Kaynakları',
        ],
      },
      {
        lesson_name: 'Biyoloji',
        topics: [
          'Sinir Sistemi',
          'Endokrin Sistem',
          'Duyu Organları',
          'Destek ve Hareket Sistemi',
          'Sindirim Sistemi',
          'Dolaşım Sistemi',
          'Solunum Sistemi',
          'Üriner Sistem',
          'Üreme Sistemi ve Embriyonik Gelişim',
          'Komünite ve Popülasyon Ekolojisi',
          'Genden Proteine',
          'Canlılarda Enerji Dönüşümleri (Fotosentez, Kemosentez, Solunum)',
          'Bitki Biyolojisi',
          'Canlılar ve Çevre',
        ],
      },
      {
        lesson_name: 'Tarih',
        topics: [
          'Tarih Bilimi',
          'İlk Çağ Medeniyetleri',
          'İslamiyet Öncesi Türk Tarihi',
          'İslam Tarihi',
          'İlk Türk-İslam Devletleri',
          'Türkiye Tarihi (Anadolu)',
          'Osmanlı Devleti (Kuruluş, Yükselme, Duraklama, Gerileme, Dağılma)',
          'Milli Mücadele',
          'Atatürkçülük ve Türk İnkılabı',
          'Atatürk Dönemi Dış Politika',
          'Çağdaş Türk ve Dünya Tarihi',
        ],
      },
      {
        lesson_name: 'Coğrafya',
        topics: [
          'Ekosistem ve Madde Döngüsü',
          'Nüfus Politikaları',
          'Yerleşmeler ve Şehirler',
          'Ekonomik Faaliyetler ve Doğal Kaynaklar',
          'Türkiye Ekonomisi',
          'Türkiye’nin Bölgeleri ve Kalkınma Projeleri',
          'Ulaşım ve Ticaret',
          'Turizm',
          'Doğal Afetler',
          'Çevre ve Toplum',
        ],
      },
      {
        lesson_name: 'Felsefe',
        topics: [
          'Felsefenin Alanı',
          'Bilgi Felsefesi (Epistemoloji)',
          'Varlık Felsefesi (Ontoloji)',
          'Ahlak Felsefesi (Etik)',
          'Sanat Felsefesi (Estetik)',
          'Din Felsefesi',
          'Siyaset Felsefesi',
          'Bilim Felsefesi',
        ],
      },
      {
        lesson_name: 'Psikoloji',
        topics: [
          'Psikoloji Bilimini Tanıyalım',
          'Psikolojinin Temel Süreçleri',
          'Öğrenme, Bellek, Düşünme',
          'Ruh Sağlığının Temelleri',
        ],
      },
      {
        lesson_name: 'Sosyoloji',
        topics: [
          'Sosyolojiye Giriş',
          'Birey ve Toplum',
          'Toplumsal Yapı',
          'Toplumsal Değişme ve Gelişme',
          'Toplum ve Kültür',
          'Toplumsal Kurumlar',
        ],
      },
      {
        lesson_name: 'Mantık',
        topics: [
          'Mantığa Giriş',
          'Klasik Mantık',
          'Mantık ve Dil',
          'Sembolik Mantık',
        ],
      },
      {
        lesson_name: 'Din Kültürü ve Ahlak Bilgisi',
        topics: ['İnanç', 'İbadet', 'Ahlak', 'Hz. Muhammed', 'Vahiy ve Akıl', 'Din ve Laiklik', 'Dinler Tarihi'],
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
  'İngilizce': 'sub_ingilizce',
  'Felsefe': 'sub_felsefe',
  'Din Kültürü ve Ahlak Bilgisi': 'sub_din',
  'Almanca': 'sub_almanca',
  'Geometri': 'sub_geometri',
  'Psikoloji': 'sub_psikoloji',
  'Sosyoloji': 'sub_sosyoloji',
  'Mantık': 'sub_mantik',
};

// Sınıf tanımları: 4-10, 11/12 Sayısal/EA/Sözel, Mezun
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
  { id: 'c_mezun', name: 'Mezun', gradeLevel: 'MEZUN' },
];

const STUDENT_NAMES = ['Ali', 'Zeynep', 'Mehmet', 'Aylin', 'Burak', 'Elif', 'Can', 'Selin', 'Emre', 'Deniz'];

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomQuestionStats(totalQuestions: number) {
  const correct = getRandomInt(5, totalQuestions); // En az 5 doğru olsun
  const remaining = totalQuestions - correct;
  const wrong = getRandomInt(0, remaining);
  const empty = remaining - wrong;
  const net = correct - wrong * 0.25;

  return {
    correct,
    wrong,
    empty,
    net,
    total: totalQuestions,
  };
}

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
    update: { passwordHash },
  });

  // Parent (veli - örnek veriler için)
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
    { id: 'sub_psikoloji', name: 'Psikoloji' },
    { id: 'sub_sosyoloji', name: 'Sosyoloji' },
    { id: 'sub_mantik', name: 'Mantık' },
  ];

  for (const sub of allSubjects) {
    await prisma.subject.upsert({
      where: { id: sub.id },
      create: { id: sub.id, name: sub.name },
      update: { name: sub.name },
    });
  }

  // Her branş (Subject) için 1 öğretmen oluştur
  const branchTeachers: Record<string, string> = {};

  for (const sub of allSubjects) {
    const branchKey = sub.id.replace(/^sub_/, '');
    const email = `${branchKey}.teacher@example.com`;

    const branchTeacher = await prisma.user.upsert({
      where: { email_role: { email, role: 'teacher' } },
      create: {
        name: `${sub.name} Öğretmeni`,
        email,
        role: 'teacher',
        passwordHash,
        subjectAreas: [sub.name],
        teacherGrades: ['4', '5', '6', '7', '8', '9', '10', '11', '12', 'MEZUN'],
      },
      update: {
        subjectAreas: [sub.name],
      },
    });

    branchTeachers[sub.id] = branchTeacher.id;
  }

  const matematikTeacherId = branchTeachers['sub_matematik'];

  // Sınıfları oluştur ve her sınıfa 5 öğrenci ekle
  const classGroupsMap: Record<string, { classGroup: any; students: any[] }> = {};

  for (const cls of CLASS_DEFINITIONS) {
    const students: any[] = [];

    for (let i = 1; i <= 5; i++) {
      const email = `ogr_${cls.id}_${i}.student@example.com`;
      const nameIdx = ((cls.id.charCodeAt(0) + i) % STUDENT_NAMES.length);
      const name = `${STUDENT_NAMES[nameIdx]} ${cls.name} ${i}`;

      const student = await prisma.user.upsert({
        where: { email_role: { email, role: 'student' } },
        create: {
          name,
          email,
          role: 'student',
          passwordHash,
          gradeLevel: cls.gradeLevel,
        },
        update: { gradeLevel: cls.gradeLevel },
      });
      students.push(student);
    }

    const classGroup = await prisma.classGroup.upsert({
      where: { id: cls.id },
      create: {
        id: cls.id,
        name: cls.name,
        gradeLevel: cls.gradeLevel,
        stream: cls.stream ?? null,
        teacherId: matematikTeacherId,
        students: {
          create: students.map((s) => ({ studentId: s.id })),
        },
      },
      update: { stream: cls.stream ?? undefined },
    });

    await prisma.user.updateMany({
      where: { id: { in: students.map((s) => s.id) } },
      data: { classId: classGroup.id },
    });

    classGroupsMap[cls.id] = { classGroup, students };
  }

  // Parent-Student links (9. sınıfın ilk 2 öğrencisi)
  const nineClassStudents = classGroupsMap['c_9']!.students;
  for (let i = 0; i < Math.min(2, nineClassStudents.length); i++) {
    await prisma.parentStudent.upsert({
      where: { parentId_studentId: { parentId: parent.id, studentId: nineClassStudents[i].id } },
      create: { parentId: parent.id, studentId: nineClassStudents[i].id },
      update: {},
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

  // Konu kaydı (Topic) – örnek: Üslü Sayılar
  const usluSayilarTopic = await prisma.topic.upsert({
    where: { id: 'topic_uslu_sayilar' },
    create: { id: 'topic_uslu_sayilar', name: 'Üslü Sayılar' },
    update: { name: 'Üslü Sayılar' },
  });

  // Her sınıf için 1 sınav oluştur ve öğrencilere random sonuç ata
  let examIdCounter = 1;

  for (const cls of CLASS_DEFINITIONS) {
    const { classGroup, students } = classGroupsMap[cls.id]!;
    const questionCount = 20;

    const exam = await prisma.exam.upsert({
      where: { id: examIdCounter },
      create: {
        id: examIdCounter,
        name: `${cls.name} Deneme 1`,
        type: cls.gradeLevel === 'MEZUN' ? ExamType.TYT : ExamType.ARA_SINIF,
        date: new Date(Date.now() - getRandomInt(1, 30) * 24 * 60 * 60 * 1000),
        questionCount,
        description: `${cls.name} için örnek deneme`,
      },
      update: {},
    });
    examIdCounter++;

    await prisma.examAssignment.upsert({
      where: { examId_classGroupId: { examId: exam.id, classGroupId: classGroup.id } },
      create: { examId: exam.id, classGroupId: classGroup.id },
      update: {},
    });

    for (let idx = 0; idx < students.length; idx++) {
      const student = students[idx];
      const stats = generateRandomQuestionStats(questionCount);
      const score = 100 + stats.net * 3;
      const percentile = Math.max(1, Math.min(99, 85 - idx * 5 + getRandomInt(-5, 5)));

      await prisma.examResult.upsert({
        where: { studentId_examId: { studentId: student.id, examId: exam.id } },
        create: {
          studentId: student.id,
          examId: exam.id,
          totalNet: stats.net,
          score,
          percentile,
          details: {
            create: [
              {
                lessonId: subject1.id,
                lessonName: subject1.name,
                correct: stats.correct,
                wrong: stats.wrong,
                empty: stats.empty,
                net: stats.net,
                topicAnalyses: {
                  create: [
                    {
                      topicId: usluSayilarTopic.id,
                      topicName: usluSayilarTopic.name,
                      totalQuestion: stats.total,
                      correct: stats.correct,
                      wrong: stats.wrong,
                      empty: stats.empty,
                      net: stats.net,
                      priorityLevel:
                        stats.correct / (stats.total || 1) < 0.3
                          ? PriorityLevel.ONE
                          : stats.correct / (stats.total || 1) < 0.6
                            ? PriorityLevel.TWO
                            : PriorityLevel.THREE,
                      lostPoints: (stats.wrong + stats.empty) * 1,
                    },
                  ],
                },
              },
            ],
          },
        },
        update: { totalNet: stats.net, score, percentile },
      });
    }
  }

  const classGroup = classGroupsMap['c_9']!.classGroup;
  const student1 = classGroupsMap['c_9']!.students[0];
  const student2 = classGroupsMap['c_9']!.students[1];
  const teacher = { id: matematikTeacherId };

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

  // Assignment (9. sınıf - tüm 5 öğrenci)
  const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const assignment = await prisma.assignment.upsert({
    where: { id: 'a1' },
    create: {
      id: 'a1',
      title: 'Denklemler Konusundan Test Görevi',
      description: 'Denklemler konusunu pekiştirmek için test görevi',
      testId: test.id,
      contentId: content1.id,
      classId: classGroup.id,
      dueDate,
      points: 100,
      createdByTeacherId: teacher.id,
      students: {
        create: nineClassStudents.map((s) => ({ studentId: s.id })),
      },
    },
    update: {},
  });

  // AssignmentStudent - eksik öğrencileri ekle (assignment zaten varsa)
  for (const s of nineClassStudents) {
    await prisma.assignmentStudent.upsert({
      where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: s.id } },
      create: { assignmentId: assignment.id, studentId: s.id },
      update: {},
    });
  }

  // Her öğrenci için Test sonucu (random doğru/yanlış/boş)
  const questions = [{ id: 'q1', correct: 'x = 2' }, { id: 'q2', correct: '15' }, { id: 'q3', correct: 'true' }];
  const wrongAnswers: Record<string, string[]> = {
    q1: ['x = 1', 'x = 3', 'x = 4'],
    q2: ['10', '5', '20'],
    q3: ['false'],
  };

  for (let i = 0; i < nineClassStudents.length; i++) {
    const student = nineClassStudents[i];
    const correctCount = getRandomInt(1, 3);
    const incorrectCount = getRandomInt(0, 2);
    const blankCount = 3 - correctCount - incorrectCount;
    const scorePercent = Math.round((correctCount / 3) * 100);
    const trId = i === 0 ? 'tr1' : `tr_9_${i + 1}`;

    const answers: { questionId: string; answer: string; isCorrect: boolean }[] = [];
    let c = 0,
      w = 0,
      b = 0;
    for (const q of questions) {
      if (c < correctCount && (w >= incorrectCount || getRandomInt(0, 1) === 0)) {
        answers.push({ questionId: q.id, answer: q.correct, isCorrect: true });
        c++;
      } else if (w < incorrectCount) {
        const wrong = wrongAnswers[q.id][getRandomInt(0, wrongAnswers[q.id].length - 1)];
        answers.push({ questionId: q.id, answer: wrong, isCorrect: false });
        w++;
      } else {
        answers.push({ questionId: q.id, answer: '', isCorrect: false });
        b++;
      }
    }

    await prisma.testResult.upsert({
      where: { id: trId },
      create: {
        id: trId,
        assignmentId: assignment.id,
        studentId: student.id,
        testId: test.id,
        correctCount: c,
        incorrectCount: w,
        blankCount: b,
        scorePercent: Math.round((c / 3) * 100),
        durationSeconds: getRandomInt(180, 600),
        completedAt: new Date(Date.now() - getRandomInt(1, 14) * 24 * 60 * 60 * 1000),
        answers: { create: answers },
      },
      update: { correctCount: c, incorrectCount: w, blankCount: b, scorePercent: Math.round((c / 3) * 100) },
    });
  }

  // İkinci test (Fizik - 10. sınıf için)
  const test2 = await prisma.test.upsert({
    where: { id: 'test2' },
    create: {
      id: 'test2',
      title: 'Hareket ve Kuvvet – Test 1',
      subjectId: subject2.id,
      topic: 'Hareket',
      createdByTeacherId: branchTeachers['sub_fizik'],
      questions: {
        create: [
          {
            id: 't2q1',
            text: 'Sabit süratle hareket eden bir cisim için ne söylenebilir?',
            type: 'multiple_choice',
            choices: ['İvmesi sıfırdır', 'Hızı artmaktadır', 'Konumu değişmez', 'Kütlesi azalır'],
            correctAnswer: 'İvmesi sıfırdır',
            topic: 'Hareket',
            difficulty: 'medium',
          },
          {
            id: 't2q2',
            text: 'Newton’un 1. yasası eylemsizlik ile ilgilidir.',
            type: 'true_false',
            correctAnswer: 'true',
            topic: 'Hareket',
            difficulty: 'easy',
          },
          {
            id: 't2q3',
            text: 'F = m.a formülünde F neyi ifade eder?',
            type: 'multiple_choice',
            choices: ['Kütle', 'İvme', 'Kuvvet', 'Hız'],
            correctAnswer: 'Kuvvet',
            topic: 'Hareket',
            difficulty: 'easy',
          },
        ],
      },
    },
    update: {},
  });

  const class10 = classGroupsMap['c_10']!;
  const assignment2 = await prisma.assignment.upsert({
    where: { id: 'a2' },
    create: {
      id: 'a2',
      title: 'Hareket ve Kuvvet Test Görevi',
      description: '10. sınıf fizik testi',
      testId: test2.id,
      classId: class10.classGroup.id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      points: 100,
      createdByTeacherId: branchTeachers['sub_fizik'],
      students: {
        create: class10.students.map((s) => ({ studentId: s.id })),
      },
    },
    update: {},
  });

  for (const s of class10.students) {
    await prisma.assignmentStudent.upsert({
      where: { assignmentId_studentId: { assignmentId: assignment2.id, studentId: s.id } },
      create: { assignmentId: assignment2.id, studentId: s.id },
      update: {},
    });
  }

  const t2Questions = [
    { id: 't2q1', correct: 'İvmesi sıfırdır', wrong: ['Hızı artmaktadır', 'Konumu değişmez', 'Kütlesi azalır'] },
    { id: 't2q2', correct: 'true', wrong: ['false'] },
    { id: 't2q3', correct: 'Kuvvet', wrong: ['Kütle', 'İvme', 'Hız'] },
  ];

  for (let i = 0; i < class10.students.length; i++) {
    const student = class10.students[i];
    const c = getRandomInt(1, 3);
    const w = getRandomInt(0, 2);
    const b = 3 - c - w;
    const trId = `tr_10_${i + 1}`;

    const answers: { questionId: string; answer: string; isCorrect: boolean }[] = [];
    let ci = 0,
      wi = 0;
    for (const q of t2Questions) {
      if (ci < c && (wi >= w || Math.random() > 0.5)) {
        answers.push({ questionId: q.id, answer: q.correct, isCorrect: true });
        ci++;
      } else if (wi < w) {
        answers.push({
          questionId: q.id,
          answer: q.wrong[getRandomInt(0, q.wrong.length - 1)],
          isCorrect: false,
        });
        wi++;
      } else {
        answers.push({ questionId: q.id, answer: '', isCorrect: false });
      }
    }

    await prisma.testResult.upsert({
      where: { id: trId },
      create: {
        id: trId,
        assignmentId: assignment2.id,
        studentId: student.id,
        testId: test2.id,
        correctCount: ci,
        incorrectCount: wi,
        blankCount: 3 - ci - wi,
        scorePercent: Math.round((ci / 3) * 100),
        durationSeconds: getRandomInt(200, 500),
        completedAt: new Date(Date.now() - getRandomInt(1, 10) * 24 * 60 * 60 * 1000),
        answers: { create: answers },
      },
      update: {},
    });
  }

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
    // Focus Zone rozetleri (Focus Zone'da 25 dk tamamlayarak XP kazan)
    {
      code: 'focus_bronze',
      title: 'Bronz Odak Ustası',
      description: 'Focus Zone\'da 50 XP kazan (1 tam 25 dk seans).',
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
      description: 'Focus Zone\'da 200 XP kazan (4 tam 25 dk seans).',
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
      description: 'Focus Zone\'da 500 XP kazan (10 tam 25 dk seans).',
      category: 'mixed',
      targetValue: 500,
      metricKey: 'focus_xp_total',
      icon: 'target',
      color: 'gold',
      orderIndex: 72,
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

  // Ranking Scales (Sıralama Ölçekleri) - 2024 ve 2025 verileri
  console.log('Ranking scales oluşturuluyor...');
  const rankingScalesData = [
    // 2024 TYT
    { year: 2024, examType: 'TYT', scoreRangeMin: 450, scoreRangeMax: 500, estimatedRank: 1000 },
    { year: 2024, examType: 'TYT', scoreRangeMin: 400, scoreRangeMax: 450, estimatedRank: 10000 },
    { year: 2024, examType: 'TYT', scoreRangeMin: 350, scoreRangeMax: 400, estimatedRank: 50000 },
    { year: 2024, examType: 'TYT', scoreRangeMin: 300, scoreRangeMax: 350, estimatedRank: 150000 },
    { year: 2024, examType: 'TYT', scoreRangeMin: 250, scoreRangeMax: 300, estimatedRank: 350000 },
    { year: 2024, examType: 'TYT', scoreRangeMin: 200, scoreRangeMax: 250, estimatedRank: 600000 },
    { year: 2024, examType: 'TYT', scoreRangeMin: 150, scoreRangeMax: 200, estimatedRank: 900000 },
    { year: 2024, examType: 'TYT', scoreRangeMin: 100, scoreRangeMax: 150, estimatedRank: 1200000 },

    // 2025 TYT (biraz daha zor)
    { year: 2025, examType: 'TYT', scoreRangeMin: 450, scoreRangeMax: 500, estimatedRank: 800 },
    { year: 2025, examType: 'TYT', scoreRangeMin: 400, scoreRangeMax: 450, estimatedRank: 8000 },
    { year: 2025, examType: 'TYT', scoreRangeMin: 350, scoreRangeMax: 400, estimatedRank: 45000 },
    { year: 2025, examType: 'TYT', scoreRangeMin: 300, scoreRangeMax: 350, estimatedRank: 140000 },
    { year: 2025, examType: 'TYT', scoreRangeMin: 250, scoreRangeMax: 300, estimatedRank: 340000 },
    { year: 2025, examType: 'TYT', scoreRangeMin: 200, scoreRangeMax: 250, estimatedRank: 590000 },
    { year: 2025, examType: 'TYT', scoreRangeMin: 150, scoreRangeMax: 200, estimatedRank: 890000 },
    { year: 2025, examType: 'TYT', scoreRangeMin: 100, scoreRangeMax: 150, estimatedRank: 1190000 },

    // 2024 AYT_SAY
    { year: 2024, examType: 'AYT_SAY', scoreRangeMin: 450, scoreRangeMax: 500, estimatedRank: 500 },
    { year: 2024, examType: 'AYT_SAY', scoreRangeMin: 400, scoreRangeMax: 450, estimatedRank: 5000 },
    { year: 2024, examType: 'AYT_SAY', scoreRangeMin: 350, scoreRangeMax: 400, estimatedRank: 25000 },
    { year: 2024, examType: 'AYT_SAY', scoreRangeMin: 300, scoreRangeMax: 350, estimatedRank: 80000 },
    { year: 2024, examType: 'AYT_SAY', scoreRangeMin: 250, scoreRangeMax: 300, estimatedRank: 180000 },
    { year: 2024, examType: 'AYT_SAY', scoreRangeMin: 200, scoreRangeMax: 250, estimatedRank: 320000 },

    // 2025 AYT_SAY
    { year: 2025, examType: 'AYT_SAY', scoreRangeMin: 450, scoreRangeMax: 500, estimatedRank: 400 },
    { year: 2025, examType: 'AYT_SAY', scoreRangeMin: 400, scoreRangeMax: 450, estimatedRank: 4500 },
    { year: 2025, examType: 'AYT_SAY', scoreRangeMin: 350, scoreRangeMax: 400, estimatedRank: 23000 },
    { year: 2025, examType: 'AYT_SAY', scoreRangeMin: 300, scoreRangeMax: 350, estimatedRank: 78000 },
    { year: 2025, examType: 'AYT_SAY', scoreRangeMin: 250, scoreRangeMax: 300, estimatedRank: 175000 },
    { year: 2025, examType: 'AYT_SAY', scoreRangeMin: 200, scoreRangeMax: 250, estimatedRank: 315000 },
  ];

  for (const scale of rankingScalesData) {
    await prisma.rankingScale.upsert({
      where: {
        year_examType_scoreRangeMin_scoreRangeMax: {
          year: scale.year,
          // @ts-ignore
          examType: scale.examType,
          scoreRangeMin: scale.scoreRangeMin,
          scoreRangeMax: scale.scoreRangeMax,
        },
      },
      update: {},
      create: {
        year: scale.year,
        // @ts-ignore
        examType: scale.examType,
        scoreRangeMin: scale.scoreRangeMin,
        scoreRangeMax: scale.scoreRangeMax,
        estimatedRank: scale.estimatedRank,
      },
    });
  }

  console.log('Seed tamamlandı. Tüm kullanıcılar için şifre: ' + DEMO_PASSWORD);
  console.log('  Admin: admin@example.com');
  console.log('  Branş öğretmenleri: matematik.teacher@example.com, fizik.teacher@example.com, kimya.teacher@example.com, ...');
  console.log('  Sınıflar: 4-10, 11 Sayısal/EA/Sözel, 12 Sayısal/EA/Sözel, Mezun (her sınıfta 5 öğrenci)');
  console.log('  Örnek öğrenci: ogr_c_9_1.student@example.com');
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
