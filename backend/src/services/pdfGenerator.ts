import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import {
  getExamAnalysisForStudent,
  simulateImprovement,
  getMultiExamBranchTable,
  getTopicGroupAnalysisForExam,
} from './analysisService';
import { prisma } from '../db';

const primaryColor = '#1d4ed8';
const accentColor = '#f97316';
const softGray = '#f3f4f6';

async function getStudentName(studentId: string | number): Promise<string> {
  try {
    const user = await (prisma as any).user.findFirst({
      where: {
        OR: [{ id: String(studentId) }, { id: studentId }],
        role: 'student',
      },
    });
    return user?.name ?? 'Öğrenci';
  } catch {
    return 'Öğrenci';
  }
}

/**
 * ExamResult verisini kullanarak PDF rapor oluşturur.
 * @returns PDF buffer
 */
export async function generateAnalysisPdf(
  studentId: string | number,
  examId: string | number
): Promise<Buffer> {
  const eid = Number(examId);
  if (isNaN(eid)) throw new Error('Geçersiz examId');

  const [studentName, analysis] = await Promise.all([
    getStudentName(studentId),
    getExamAnalysisForStudent(studentId, eid),
  ]);

  if (!analysis) {
    throw new Error('Analiz verisi bulunamadı. Bu öğrenci için bu sınavda sonuç yok.');
  }

  // Çoklu sınav tablosu ve konu grubu analizi – referans PDF iskeleti için
  const [multiExam, topicGroups] = await Promise.all([
    getMultiExamBranchTable(studentId, 10),
    getTopicGroupAnalysisForExam(studentId, eid),
  ]);

  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  // Türkçe karakterler için Unicode destekli fontları (TTF) dene.
  // Ana hedef dizin: backend/assets/fonts
  // Bazı ortamlarda yanlışlıkla "assests" adıyla oluşturulmuş olabileceği için
  // her iki yolu da kontrol ediyoruz.
  const assetsFontsDir = path.join(__dirname, '..', '..', 'assets', 'fonts');
  const assestsFontsDir = path.join(__dirname, '..', '..', 'assests', 'fonts');
  const fontsDir = fs.existsSync(assetsFontsDir)
    ? assetsFontsDir
    : fs.existsSync(assestsFontsDir)
      ? assestsFontsDir
      : assetsFontsDir;
  let fontHeading = 'Helvetica-Bold';
  let fontBody = 'Helvetica';

  try {
    const regularPath = path.join(fontsDir, 'NotoSans-Regular.ttf');
    const boldPath = path.join(fontsDir, 'NotoSans-Bold.ttf');
    if (fs.existsSync(regularPath) && fs.existsSync(boldPath)) {
      doc.registerFont('Body', regularPath);
      doc.registerFont('BodyBold', boldPath);
      fontHeading = 'BodyBold';
      fontBody = 'Body';
      // eslint-disable-next-line no-console
      console.log('[pdf] NotoSans fontları yüklendi:', fontsDir);
    } else {
      // eslint-disable-next-line no-console
      console.log('[pdf] NotoSans fontları bulunamadı, Helvetica kullanılacak. Aranan dizin:', fontsDir);
    }
  } catch {
    // Eğer font dosyaları yoksa, PDFKit'in varsayılan Helvetica fontları kullanılmaya devam eder.
  }
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // ---------- SAYFA 1: KAPAK ----------
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(softGray);
  doc.fillColor(primaryColor).fontSize(28).font(fontHeading);
  doc.text('KİŞİYE ÖZEL SINAV ANALİZİ', 0, 80, { align: 'center', width: doc.page.width });
  doc.moveDown(3);
  doc.fontSize(24).fillColor('#111827').font(fontHeading);
  doc.text(studentName, 0, doc.y, { align: 'center', width: doc.page.width });
  doc.moveDown(1.5);
  doc.fontSize(14).fillColor('#374151').font(fontBody);
  doc.text(`${analysis.examName} (${analysis.examType})`, 0, doc.y, {
    align: 'center',
    width: doc.page.width,
  });
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('#6b7280');
  doc.text(
    new Date(analysis.date).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    0,
    doc.y,
    { align: 'center', width: doc.page.width }
  );

  // Dairesel süreç grafiği (donut)
  const cx = doc.page.width / 2;
  const cy = doc.page.height / 2 + 20;
  const r = 70;
  const one = analysis.priorityCounts.one;
  const two = analysis.priorityCounts.two;
  const three = analysis.priorityCounts.three;
  const total = Math.max(one + two + three, 1);
  let startAng = 0;
  const seg = (cnt: number, color: string) => {
    const ang = (cnt / total) * 360;
    doc.save();
    doc.translate(cx, cy);
    doc.rotate((startAng - 90) * (Math.PI / 180));
    doc.moveTo(0, 0);
    // PDFKit'in type tanımı arc metodunu içermiyor, runtime'da mevcut.
    (doc as any).arc(0, 0, r, 0, ang * (Math.PI / 180));
    doc.lineTo(0, 0);
    doc.fillColor(color).fill();
    doc.restore();
    startAng += ang;
  };
  seg(one, '#ef4444');
  seg(two, '#facc15');
  seg(three, '#22c55e');
  doc.fontSize(10).fillColor('#6b7280');
  doc.text('1. Öncelik', 120, doc.page.height - 100);
  doc.circle(105, doc.page.height - 97, 5).fill('#ef4444');
  doc.text('2. Öncelik', 120, doc.page.height - 85);
  doc.circle(105, doc.page.height - 82, 5).fill('#facc15');
  doc.text('3. Öncelik', 120, doc.page.height - 70);
  doc.circle(105, doc.page.height - 67, 5).fill('#22c55e');

  doc.addPage();

  // ---------- SAYFA 2: ÖNSÖZ ----------
  // Üstte mavi şerit ve "ANALİZ ÖNSÖZ" başlığı
  doc.rect(0, 0, doc.page.width, 130).fill('#0f172a');
  doc.fillColor('#ffffff').font(fontHeading).fontSize(24);
  doc.text('ANALİZ ÖNSÖZ', 40, 55, {
    width: doc.page.width - 80,
    align: 'center',
  });

  // Başlık altındaki ince gri çizgi
  let yIntro = 150;
  doc
    .moveTo(70, yIntro)
    .lineTo(doc.page.width - 70, yIntro)
    .strokeColor('#e5e7eb')
    .lineWidth(1)
    .stroke();
  yIntro += 25;

  // Hitap
  doc.font(fontHeading).fontSize(12).fillColor('#111827');
  doc.text('Değerli Öğrencimiz,', 70, yIntro);
  yIntro = doc.y + 12;

  // Önsöz metni – referans PDF'e benzer stil
  doc.font(fontBody).fontSize(11).fillColor('#374151');
  const introText =
    'Sınava hazırlık sürecinde doğru çalışma modeli ve etkili zaman yönetiminin önemi tartışılmaz bir gerçektir. ' +
    'Mevcut başarını daha ileriye taşıyabilmek için sana özel ve ihtiyaçlarına odaklı bir çalışma modeli geliştirdik. ' +
    'Katıldığın deneme sınavlarını baz alarak, MEB\'in her yıl uyguladığı sınav sistemine endeksli bir analiz sunuyoruz.\n\n' +
    'Bu analiz, şu anki durumuna dair en detaylı bilgileri içerir. Ayrıca, geçen yıl sınava girmiş olsaydın ulaşabileceğin ' +
    'yüzdelik dilim tahminini de sana sunar. Bununla birlikte, potansiyelini daha da yükseltebilmen için öncelikli olarak ' +
    'çalışman gereken konuları belirledik. Analizimiz hazırlanırken, sınav sonuçların girdiğin sınava (LGS / YKS vb.) birebir ' +
    'uygun bir değerlendirme modeliyle ele alınır ve sahip olduğun başarıya en kısa ve etkili şekilde katkı sağlamak hedeflenir. ' +
    'Sonuç olarak, sana özel olarak hazırlanmış 3 kademeli bir çalışma planı oluşturulmuştur.\n\n' +
    'Bu 3 kademeli konu listesine bağlı kalarak çalışmaya başladığında, her bölümü tamamladıkça ulaşabileceğin yeni yüzdelik dilimini ' +
    'bu analizde görebilirsin. Başarını zirveye taşımak tamamen senin elinde! Unutma, bu analiz yalnızca başarına katkıda bulunmayı ve ' +
    'hedeflerine ulaşmanı kolaylaştırmayı amaçlamaktadır. Doğru yöntemlerle düzenli ve disiplinli bir şekilde çalışarak gerçek potansiyelini ' +
    'ortaya koyabilir ve en iyi sonuçlara ulaşabilirsin.';

  doc.text(introText, 70, yIntro, {
    width: doc.page.width - 140,
    align: 'justify',
  });

  // Sayfa altındaki isim vurgusu
  doc.moveDown(2);
  doc.font(fontBody).fontSize(10).fillColor('#6b7280');
  doc.text('Bu analiz sadece,', {
    align: 'center',
  });
  doc
    .font(fontHeading)
    .fontSize(11)
    .fillColor(primaryColor)
    .text(studentName.toUpperCase(), {
      align: 'center',
    });
  doc.moveDown(0.5);
  doc
    .font(fontBody)
    .fontSize(10)
    .fillColor('#374151')
    .text(
      'için eksikleri ve ihtiyaçları dikkate alınarak hazırlanmıştır. Sınav hazırlık sürecinde kolaylıklar, ' +
        'sınavda hedefine ulaşman dileğiyle...',
      {
        align: 'center',
      }
    );

  doc.addPage();

  // ---------- SAYFA 3: ÖZET ----------
  doc.fontSize(18).fillColor(primaryColor).font(fontHeading);
  doc.text('Genel Özet', { align: 'left' });
  doc.moveDown(1.5);

  // Toplam konu tespit edildi kartı
  const totalTopics = analysis.topicPriorities.length;
  const cardTopY = doc.y;
  doc.roundedRect(40, cardTopY, 200, 70, 8).fill(softGray);
  // Başlık ve değerleri kartın içine sabitle – doc.y'nin değişmesinden etkilenmesin
  doc
    .fillColor('#6b7280')
    .font(fontBody)
    .fontSize(11)
    .text('Toplam Tespit Edilen Konu', 55, cardTopY + 12);
  doc
    .font(fontHeading)
    .fontSize(22)
    .fillColor(primaryColor)
    .text(String(totalTopics), 55, cardTopY + 34);

  // Sonraki içerikler için imleci kartın altına al
  doc.y = cardTopY + 70;

  const tableTop = doc.y + 20;
  doc.font(fontHeading).fontSize(14).fillColor('#111827').text('LGS/TYT Puan Tahmini ve Yüzdelik Dilim', 40, tableTop);
  doc.moveTo(40, tableTop + 20).lineTo(550, tableTop + 20).strokeColor(softGray).stroke();
  doc.font(fontBody).fontSize(11).fillColor('#6b7280');
  doc.text('Sınav Puanı', 50, tableTop + 30);
  doc.text('Yüzdelik Dilim', 250, tableTop + 30);
  doc.font(fontHeading).fontSize(16).fillColor(primaryColor);
  doc.text(analysis.score.toFixed(1), 50, tableTop + 48);
  doc.text('% ' + analysis.percentile.toFixed(2), 250, tableTop + 48);

  const proj = simulateImprovement(
    analysis.score,
    analysis.priorityCounts.one,
    analysis.priorityCounts.two,
    analysis.priorityCounts.three
  );
  doc.font(fontHeading).fontSize(14).fillColor(accentColor).text('Kazanım Tahmini', 40, tableTop + 90);
  doc.font(fontBody).fontSize(11).fillColor('#111827');
  doc.text(
    `1. öncelikli konularını güçlendirdiğinde puanının yaklaşık ${proj.projectedScore.toFixed(1)} seviyesine çıkması beklenmektedir.`,
    40,
    tableTop + 110,
    { width: 500 }
  );

  // ---------- SAYFA 4: NETLER VE PUANLAR (Çoklu Deneme) ----------
  if (multiExam.rows.length > 0) {
    doc.addPage();
    doc.fontSize(18).fillColor(primaryColor).font(fontHeading);
    doc.text('NETLER VE PUANLAR', 40, 60);

    const tableLeft = 40;
    const tableRight = 550;
    const examColWidth = 160;
    const branchColWidth = 55;

    // Ana başlık bandı
    let y = 90;
    doc.rect(tableLeft, y, tableRight - tableLeft, 22).fill('#b91c1c');
    doc.fillColor('#ffffff').font(fontHeading).fontSize(11);
    doc.text('NETLER – BRANŞ', tableLeft, y + 5, {
      width: tableRight - tableLeft,
      align: 'center',
    });
    y += 24;

    // Ders başlıkları satırı
    doc.rect(tableLeft, y, tableRight - tableLeft, 18).fill('#1d4ed8');
    doc.fillColor('#ffffff').font(fontBody).fontSize(9);
    doc.text('Sınav', tableLeft + 4, y + 4, { width: examColWidth - 8 });
    multiExam.lessonNames.forEach((lesson, idx) => {
      const x = tableLeft + examColWidth + idx * branchColWidth;
      doc.text(lesson, x + 2, y + 4, { width: branchColWidth - 4, align: 'center' });
    });
    y += 18;

    doc.moveTo(tableLeft, y).lineTo(tableRight, y).strokeColor('#e5e7eb').lineWidth(0.75).stroke();
    y += 6;

    doc.font(fontBody).fontSize(9).fillColor('#111827');
    for (const row of multiExam.rows) {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 90;

        // Başlıkları yeni sayfaya da çiz
        doc.rect(tableLeft, y, tableRight - tableLeft, 22).fill('#b91c1c');
        doc.fillColor('#ffffff').font(fontHeading).fontSize(11);
        doc.text('NETLER – BRANŞ', tableLeft, y + 5, {
          width: tableRight - tableLeft,
          align: 'center',
        });
        y += 24;
        doc.rect(tableLeft, y, tableRight - tableLeft, 18).fill('#1d4ed8');
        doc.fillColor('#ffffff').font(fontBody).fontSize(9);
        doc.text('Sınav', tableLeft + 4, y + 4, { width: examColWidth - 8 });
        multiExam.lessonNames.forEach((lesson, idx) => {
          const x = tableLeft + examColWidth + idx * branchColWidth;
          doc.text(lesson, x + 2, y + 4, { width: branchColWidth - 4, align: 'center' });
        });
        y += 18;
        doc.moveTo(tableLeft, y).lineTo(tableRight, y).strokeColor('#e5e7eb').stroke();
        y += 6;
        doc.font(fontBody).fontSize(9).fillColor('#111827');
      }

      const examLabel = row.examName;
      doc.fillColor('#111827');
      doc.text(examLabel, tableLeft + 4, y + 2, { width: examColWidth - 8 });

      multiExam.lessonNames.forEach((lesson, idx) => {
        const stat = row.lessons.find((l) => l.lessonName === lesson);
        const x = tableLeft + examColWidth + idx * branchColWidth;
        const text = stat && !Number.isNaN(stat.net) ? stat.net.toFixed(2) : '-';
        doc.text(text, x, y + 2, { width: branchColWidth, align: 'center' });
      });

      y += 14;
      doc.moveTo(tableLeft, y).lineTo(tableRight, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      y += 2;
    }
  }

  // ---------- SAYFA 5: KONU GRUBU ANALİZİ ----------
  if (topicGroups && topicGroups.rows.length > 0) {
    doc.addPage();
    const left = 40;
    const right = 550;

    // Başlık bandı
    let y = 90;
    doc.rect(left, y, right - left, 22).fill('#1d4ed8');
    doc.fillColor('#ffffff').font(fontHeading).fontSize(11);
    doc.text('KONU GRUBU ANALİZİ', left, y + 5, { width: right - left, align: 'center' });
    y += 24;

    // Sütun başlıkları
    doc.rect(left, y, right - left, 16).fill('#e5e7eb');
    doc.font(fontBody).fontSize(9).fillColor('#111827');
    doc.text('Ders', left + 4, y + 3);
    doc.text('Konu Grubu', left + 90, y + 3);
    doc.text('Soru', left + 260, y + 3);
    doc.text('D', left + 300, y + 3);
    doc.text('Y', left + 320, y + 3);
    doc.text('B', left + 340, y + 3);
    doc.text('Başarı %', left + 365, y + 3);
    doc.text('Kayıp Puan', left + 435, y + 3);
    y += 16;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#d1d5db').stroke();
    y += 4;

    doc.font(fontBody).fontSize(9).fillColor('#111827');
    for (const row of topicGroups.rows) {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 90;
        doc.rect(left, y, right - left, 22).fill('#1d4ed8');
        doc.fillColor('#ffffff').font(fontHeading).fontSize(11);
        doc.text('KONU GRUBU ANALİZİ', left, y + 5, { width: right - left, align: 'center' });
        y += 24;
        doc.rect(left, y, right - left, 16).fill('#e5e7eb');
        doc.font(fontBody).fontSize(9).fillColor('#111827');
        doc.text('Ders', left + 4, y + 3);
        doc.text('Konu Grubu', left + 90, y + 3);
        doc.text('Soru', left + 260, y + 3);
        doc.text('D', left + 300, y + 3);
        doc.text('Y', left + 320, y + 3);
        doc.text('B', left + 340, y + 3);
        doc.text('Başarı %', left + 365, y + 3);
        doc.text('Kayıp Puan', left + 435, y + 3);
        y += 16;
        doc.moveTo(left, y).lineTo(right, y).strokeColor('#d1d5db').stroke();
        y += 4;
        doc.font(fontBody).fontSize(9).fillColor('#111827');
      }

      const { lessonName, groupName, questionCount, correct, wrong, empty, successPercent, scoreLoss } =
        row;

      doc.text(lessonName, left + 4, y);
      doc.text(groupName, left + 90, y);
      doc.text(String(questionCount), left + 260, y);
      doc.text(String(correct), left + 300, y);
      doc.text(String(wrong), left + 320, y);
      doc.text(String(empty), left + 340, y);
      doc.text(successPercent.toFixed(1), left + 365, y);
      doc.text(scoreLoss.toFixed(2), left + 435, y);

      y += 12;
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      y += 2;
    }
  }

  doc.addPage();

  // ---------- SAYFA 6: NETLER (Ders Bazlı) ----------
  doc.fontSize(18).fillColor(primaryColor).font(fontHeading);
  doc.text('Ders Bazlı Netler ve Eksik Konular', { align: 'left' });
  doc.moveDown(1);

  // Ders bazlı toplam (net, doğru, yanlış)
  const byLesson: Record<
    string,
    { correct: number; wrong: number; empty: number; net: number; topics: typeof analysis.topicPriorities }
  > = {};
  for (const t of analysis.topicPriorities) {
    if (!byLesson[t.lessonName]) {
      byLesson[t.lessonName] = { correct: 0, wrong: 0, empty: 0, net: 0, topics: [] };
    }
    const entry = byLesson[t.lessonName]!;
    entry.correct += t.correct;
    entry.wrong += t.wrong;
    entry.empty += t.empty;
    entry.net += t.net;
    entry.topics.push(t);
  }

  const y0 = doc.y ?? 40;
  let y = y0;
  const colW = { ders: 120, dogru: 50, yanlis: 50, bos: 40, net: 50 };
  doc.font(fontBody).fontSize(10).fillColor('#6b7280');
  doc.text('Ders', 40, y);
  doc.text('Doğru', 40 + colW.ders, y);
  doc.text('Yanlış', 40 + colW.ders + colW.dogru, y);
  doc.text('Boş', 40 + colW.ders + colW.dogru + colW.yanlis, y);
  doc.text('Net', 40 + colW.ders + colW.dogru + colW.yanlis + colW.bos, y);
  y += 18;
  doc.moveTo(40, y).lineTo(550, y).strokeColor('#e5e7eb').stroke();
  y += 10;

  doc.font(fontBody).fontSize(11).fillColor('#111827');
  for (const [lesson, data] of Object.entries(byLesson)) {
    if (y > doc.page.height - 120) {
      doc.addPage();
      y = 60;
    }
    doc.text(lesson, 40, y, { width: colW.ders });
    doc.text(String(data.correct) + 'D', 40 + colW.ders, y);
    doc.text(String(data.wrong) + 'Y', 40 + colW.ders + colW.dogru, y);
    doc.text(String(data.empty) + 'B', 40 + colW.ders + colW.dogru + colW.yanlis, y);
    doc.text(data.net.toFixed(2), 40 + colW.ders + colW.dogru + colW.yanlis + colW.bos, y);
    y += 16;
  }

  doc.moveDown(1);
  doc
    .font(fontBody)
    .fontSize(11)
    .fillColor('#6b7280')
    .text('Ders Bazlı Net Ortalamaları (Bar Chart)', 40, doc.y);
  const barY = doc.y + 20;
  const maxNet = Math.max(...Object.values(byLesson).map((d) => d.net), 1);
  let barRow = 0;
  for (const [lesson, data] of Object.entries(byLesson)) {
    const barW = Math.max((data.net / maxNet) * 150, 2);
    const rowY = barY + barRow * 18;
    doc.font(fontBody).fontSize(9).fillColor('#111827').text(lesson, 40, rowY - 2, { width: 80 });
    doc.rect(130, rowY - 4, barW, 10).fill(primaryColor);
    doc.text(data.net.toFixed(1), 130 + barW + 5, rowY - 2);
    barRow++;
  }

  // Bar chart'i sabit koordinatlarla çizdiğimiz için, doc.y otomatik güncellenmez.
  // Sonraki metinlerin grafiğin üzerine binmemesi için imleci grafiğin altına taşı.
  const chartBottomY = barY + barRow * 18 + 10;
  doc.y = chartBottomY;
  doc.moveDown(1.5);

  // Eksik konular tablosu (önce 1. öncelik, sonra 2. öncelik)
  const priorityOrder = ['ONE', 'TWO', 'THREE'] as const;
  const priorityLabels: Record<string, string> = {
    ONE: '1. Öncelik (Acil)',
    TWO: '2. Öncelik (Orta)',
    THREE: '3. Öncelik (Destekleyici)',
  };

  for (const level of priorityOrder) {
    const list = analysis.topicPriorities.filter((t) => t.priorityLevel === level);
    if (list.length === 0) continue;

    if (y > doc.page.height - 100) {
      doc.addPage();
      y = 60;
    }

    doc.fontSize(12).fillColor(level === 'ONE' ? '#dc2626' : level === 'TWO' ? '#ca8a04' : '#059669');
    doc.text(priorityLabels[level] ?? level, 40, y);
    y += 18;

  doc.fontSize(9).fillColor('#6b7280');
  doc.text('Ders', 40, y);
  doc.text('Konu', 100, y);
  doc.text('Soru', 240, y);
  doc.text('D', 270, y);
  doc.text('Y', 300, y);
  doc.text('B', 330, y);
  doc.text('Net', 360, y);
  doc.text('Kayıp Puan', 400, y);
  y += 12;
  doc.moveTo(40, y).lineTo(550, y).strokeColor('#e5e7eb').stroke();
  y += 6;

  doc.fontSize(9).fillColor('#111827');
  let totalLostLevel = 0;
  for (const t of list) {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = 60;
    }
    const lostScore = (t.wrong + t.empty) * 1;
    totalLostLevel += lostScore;
    doc.text(t.lessonName, 40, y, { width: 55 });
    doc.text(t.topicName, 100, y, { width: 130 });
    doc.text(String(t.totalQuestion), 240, y);
    doc.text(String(t.correct), 270, y);
    doc.text(String(t.wrong), 300, y);
    doc.text(String(t.empty), 330, y);
    doc.text(t.net.toFixed(2), 360, y);
    doc.text(lostScore.toFixed(1), 400, y);
    y += 14;
  }
  const projLevel = simulateImprovement(
    analysis.score,
    level === 'ONE' ? list.length : 0,
    level === 'TWO' ? list.length : 0,
    level === 'THREE' ? list.length : 0
  );
  y += 8;
  doc.fontSize(10).fillColor(accentColor);
  doc.text(
    `Bu gruptaki konular güçlendirildiğinde kayıp puanın yaklaşık ${totalLostLevel.toFixed(1)} puan azaltılabileceği, ` +
      `tahmini puanının ${projLevel.projectedScore.toFixed(1)} seviyesine yaklaşabileceği öngörülmektedir.`,
    40,
    y,
    { width: 500 }
  );
  y += 20;
  }

  doc.end();
  return done;
}
