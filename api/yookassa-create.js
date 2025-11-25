const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY;
const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const {
      orderId,
      customerEmail,
      customerPhone,
      customerName,
      planKey,
      deliveries
    } = req.body;

    console.log('Создание платежа ЮKassa:', { orderId, customerName, planKey });

    // Валидация
    if (!orderId || !customerName || !planKey || !deliveries || deliveries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствуют обязательные параметры'
      });
    }

    // Тарифы
    const TARIFFS = {
      'basic': 500,      // ← ИСПРАВЛЕНО: было 1, теперь 500
      'standard': 750,
      'premium': 1000
    };

    const amount = TARIFFS[planKey] * deliveries.length;
    const idempotenceKey = uuidv4();

    console.log(`Сумма: ${amount} руб.`);

    // ===== ДОБАВЛЕН ЧЕК (RECEIPT) - ОБЯЗАТЕЛЬНО! =====
    // Это требуется по закону 54-ФЗ об онлайн-кассах
    const receipt = {
      customer: {
        email: customerEmail || null,
        phone: customerPhone || null
      },
      items: [
        {
          description: `Подписка на цветы - ${deliveries.length} доставок (${planKey})`,
          quantity: deliveries.length,
          amount: {
            value: amount.toFixed(2),
            currency: 'RUB'
          },
          vat_code: 1  // 1 = НДС 18% (или 0 если нет НДС - уточните у вашего бухгалтера)
        }
      ],
      tax_system_code: 1  // 1 = Упрощённая система налогообложения (УСН)
                          // 0 = Общая система (ОСН) - уточните у бухгалтера!
    };
    // ================================================

    // Создание платежа
    const paymentData = {
      amount: {
        value: amount.toFixed(2),
        currency: 'RUB'
      },
      confirmation: {
        type: 'redirect',
        return_url: 'https://wet-flowers.ru/success'  // ← ИЗМЕНИТЕ НА ВАШЕ ЗНАЧЕНИЕ
      },
      capture: true,
      description: `Подписка на цветы - ${deliveries.length} доставок`,
      metadata: {
        order_id: orderId,
        customer_name: customerName,
        customer_email: customerEmail || '',
        customer_phone: customerPhone || '',
        plan: planKey,
        deliveries: JSON.stringify(deliveries)
      },
      receipt: receipt  // ← ДОБАВЛЕН ЧЕК
    };

    console.log('📤 Отправка платежа в ЮKassa...');
    console.log('Данные платежа:', JSON.stringify(paymentData, null, 2));

    const response = await axios.post(
      `${YOOKASSA_API_URL}/payments`,
      paymentData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotence-Key': idempotenceKey
        },
        auth: {
          username: YOOKASSA_SHOP_ID,
          password: YOOKASSA_SECRET_KEY
        }
      }
    );

    console.log('✅ Платёж создан:', response.data.id);
    console.log('📊 Статус:', response.data.status);
    console.log('🔗 URL оплаты:', response.data.confirmation.confirmation_url);

    res.json({
      success: true,
      paymentId: response.data.id,
      paymentUrl: response.data.confirmation.confirmation_url,
      status: response.data.status
    });

  } catch (error) {
    console.error('❌ Ошибка создания платежа:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Message:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.response?.data?.description || error.message
    });
  }
};
