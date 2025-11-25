const axios = require('axios');
const crypto = require('crypto');

const SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const API_KEY = process.env.YOOKASSA_API_KEY;

function generateIdempotenceKey() {
  return crypto.randomUUID();
}

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
      'basic': 500,
      'standard': 750,
      'premium': 1000
    };

    const amount = TARIFFS[planKey] * deliveries.length;
    
    console.log(`Сумма: ${amount} руб.`);

    // ===== ДОБАВЬТЕ ВОТ ЭТО =====
    // Данные чека (receipt) - ОБЯЗАТЕЛЬНО!
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
          vat_code: 1  // 1 = 18% НДС (или 0 если нет НДС)
        }
      ],
      tax_system_code: 1  // Код системы налогообложения (1 = общая система)
    };
    // ============================

    const paymentData = {
      amount: {
        value: amount.toFixed(2),
        currency: 'RUB'
      },
      confirmation: {
        type: 'redirect',
        return_url: 'https://your-site.ru/success'
      },
      capture: true,
      description: `Подписка на цветы - ${deliveries.length} доставок`,
      metadata: {
        order_id: orderId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        plan: planKey,
        deliveries: JSON.stringify(deliveries)
      },
      receipt: receipt  // ===== И ДОБАВЬТЕ СЮДА =====
    };

    const auth = Buffer.from(`${SHOP_ID}:${API_KEY}`).toString('base64');
    const idempotenceKey = generateIdempotenceKey();

    console.log('Отправка платежа в ЮKassa...');

    const response = await axios.post(
      'https://api.yookassa.ru/v3/payments',
      paymentData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
          'Idempotence-Key': idempotenceKey
        }
      }
    );

    const payment = response.data;

    console.log('Платёж создан:', payment.id);
    console.log('Статус:', payment.status);
    console.log('Ссылка оплаты:', payment.confirmation.confirmation_url);

    res.json({
      success: true,
      orderId: orderId,
      paymentId: payment.id,
      paymentUrl: payment.confirmation.confirmation_url,
      amount: amount,
      currency: 'RUB'
    });

  } catch (error) {
    console.error('Ошибка создания платежа:', error.response?.data || error.message);
    
    res.status(500).json({
      success: false,
      error: error.response?.data?.description || error.message
    });
  }
};
