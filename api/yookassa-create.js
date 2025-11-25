const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY;
const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';

module.exports = async (req, res) => {
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

    if (!orderId || !customerName || !planKey || !deliveries || deliveries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствуют обязательные параметры'
      });
    }

    const TARIFFS = {
      'basic': 1,
      'standard': 11000,
      'premium': 14000
    };

    const amount = TARIFFS[planKey] * deliveries.length;
    const idempotenceKey = uuidv4();

    console.log(`Сумма: ${amount} руб.`);

    // === ЧЕК С payment_subject И payment_mode ===
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
          vat_code: 1,
          payment_subject: 'service',
          payment_mode: 'full_payment'  // ← ДОБАВЛЕН!
        }
      ],
      tax_system_code: 1
    };
    // =======================================

    const paymentData = {
      amount: {
        value: amount.toFixed(2),
        currency: 'RUB'
      },
      confirmation: {
        type: 'redirect',
        return_url: 'https://wet-flowers.ru/success'
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
      receipt: receipt
    };

    console.log('📤 Отправка платежа в ЮKassa...');

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
