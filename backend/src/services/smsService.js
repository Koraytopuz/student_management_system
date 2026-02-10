const axios = require('axios');

const IMS_API_URL_JSON = 'https://api.iletimerkezi.com/v1/send-sms/json';
const IMS_API_URL_GET = 'https://api.iletimerkezi.com/v1/send-sms/get';

/**
 * İletiMerkezi GET API ile SMS gönderimi (key/hash ile).
 * JSON endpoint 401 dönerse geri dönüş (fallback) olarak kullanılır.
 */
async function sendSmsViaGet(numbers, text, username, password, sender) {
  try {
    const params = new URLSearchParams({
      key: String(username).trim(),
      hash: String(password).trim(),
      text,
      receipents: numbers.join(','), // evet, dokümanda yazım hatasıyla "receipents"
      sender: String(sender).trim(),
    });

    const url = `${IMS_API_URL_GET}/?${params.toString()}`;
    const response = await axios.get(url, {
      timeout: 10000,
    });

    const httpOk = response.status >= 200 && response.status < 300;
    const imsStatusCode =
      response.data &&
      response.data.response &&
      response.data.response.status &&
      String(response.data.response.status.code);

    if (httpOk && (!imsStatusCode || imsStatusCode === '200')) {
      return true;
    }

    console.error('[smsService] GET API ile SMS gönderimi başarısız. Cevap:', response.data);
    return false;
  } catch (error) {
    if (error.response) {
      console.error('[smsService] GET API SMS hatası (response):', {
        status: error.response.status,
        data: error.response.data,
      });
    } else if (error.request) {
      console.error('[smsService] GET API SMS hatası (request yok):', error.message);
    } else {
      console.error('[smsService] GET API SMS hatası:', error.message);
    }
    return false;
  }
}

/**
 * Tek bir numarayı normalize eder.
 * - Boşluk, +, 90, 0 vb. karakterleri temizler
 * - Sadece son 10 haneyi bırakır
 * - 10 haneli ve 5 ile başlayan (mobil) numaraları kabul eder
 */
function normalizePhoneNumber(rawNumber) {
  if (!rawNumber) return null;

  // String'e çevir ve tüm rakam dışı karakterleri sil
  let digits = String(rawNumber).trim().replace(/\D+/g, '');

  // Uzunsa son 10 haneyi al (ör: 9053..., 0090..., vs.)
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }

  // 0XXXXXXXXXX formatı geldiyse baştaki 0'ı at
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Artık 10 haneli ve 5 ile başlamalı (Türkiye mobil numaraları)
  if (digits.length !== 10) return null;
  if (!digits.startsWith('5')) return null;

  return digits;
}

/**
 * phoneNumbers parametresini diziye çevirip temizler.
 */
function normalizePhoneNumbers(phoneNumbers) {
  if (!phoneNumbers) return [];

  const list = Array.isArray(phoneNumbers) ? phoneNumbers : [phoneNumbers];

  const cleaned = list
    .map((n) => normalizePhoneNumber(n))
    .filter(Boolean);

  // Aynı numarayı tekrarlamamak için uniq yap
  return Array.from(new Set(cleaned));
}

/**
 * İletiMerkezi üzerinden SMS gönderir.
 *
 * @param {string|string[]} phoneNumbers - Tek numara veya numara dizisi
 * @param {string} text - Mesaj içeriği
 * @returns {Promise<boolean>} - Başarılı ise true, hata durumda false
 */
async function sendSMS(phoneNumbers, text) {
  const username = process.env.IMS_USERNAME;
  const password = process.env.IMS_PASSWORD;
  const sender = process.env.IMS_HEADER;
  const isTestMode =
    typeof process.env.IMS_TEST_MODE === 'string' &&
    process.env.IMS_TEST_MODE.toLowerCase() === 'true';

  if (!username || !password || !sender) {
    console.error(
      '[smsService] IMS_USERNAME, IMS_PASSWORD veya IMS_HEADER environment değişkenleri eksik.',
    );
    return false;
  }

  const numbers = normalizePhoneNumbers(phoneNumbers);

  if (!numbers.length) {
    console.error('[smsService] Gönderilebilecek geçerli telefon numarası yok.');
    return false;
  }

  const messageText = typeof text === 'string' ? text.trim() : '';
  if (!messageText) {
    console.error('[smsService] Mesaj içeriği boş olamaz.');
    return false;
  }

  if (isTestMode) {
    // Gerçek API çağrısı yapmadan, entegrasyonu uçtan uca test edebilmek için.
    console.log('[smsService] TEST MODU: SMS gönderimi simüle edildi.', {
      numbers,
      text: messageText,
      sender,
    });
    return true;
  }

  try {
    const payload = {
      request: {
        authentication: {
          username,
          password,
        },
        order: {
          sender,
          sendDateTime: [],
          message: {
            text: messageText,
            receivers: {
              number: numbers,
            },
          },
        },
      },
    };

    const response = await axios.post(IMS_API_URL_JSON, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    // İletiMerkezi genelde hem HTTP 200 hem de body içinde status code döndürür.
    const httpOk = response.status >= 200 && response.status < 300;
    const imsStatusCode =
      response.data &&
      response.data.response &&
      response.data.response.status &&
      String(response.data.response.status.code);

    if (httpOk && (!imsStatusCode || imsStatusCode === '200')) {
      return true;
    }

    console.error('[smsService] JSON API ile SMS gönderimi başarısız. Cevap:', response.data);
    return false;
  } catch (error) {
    // JSON endpoint 401 (yetkisiz) dönerse, aynı key/hash ile GET API'yi dene.
    if (error.response && error.response.status === 401) {
      console.error(
        '[smsService] JSON API 401 döndürdü, GET API ile tekrar denenecek. Detay:',
        {
          status: error.response.status,
          data: error.response.data,
        },
      );
      return await sendSmsViaGet(numbers, messageText, username, password, sender);
    }

    if (error.response) {
      console.error('[smsService] SMS gönderim hatası (response):', {
        status: error.response.status,
        data: error.response.data,
      });
    } else if (error.request) {
      console.error('[smsService] SMS gönderim hatası (request yok):', error.message);
    } else {
      console.error('[smsService] SMS gönderim hatası:', error.message);
    }

    return false;
  }
}

module.exports = {
  sendSMS,
};

