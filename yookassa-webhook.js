const axios = require('axios');

const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('Telegram не настроен');
    return;
  }
  
  try {
    console.log('Отправка уведомления в Telegram...');
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      }
    );
    console.log('Уведомление отправлено в Telegram');
  } catch (error) {
    console.error('Ошибка отправки в Telegram:', error.response?.data || error.message);
  }
}

function formatDeliveries(deliveriesStr) {
  try {
    const deliveries = JSON.parse(deliveriesStr);
    let result = '';
    deliveries.forEach((delivery, index) => {
      result += `
<b>Доставка ${index + 1}</b>
Дата: <b>${delivery.date}</b>
Событие: <b>${delivery.event}</b>
Получатель: <b>${delivery.recipientName}</b>
Телефон: <b>${delivery.recipientPhone}</b>
Адрес: <b>${delivery.recipientAddress}</b>
Пожелания: ${delivery.wishes || 'Нет'}
━━━━━━━━━━━━━━━━━━━━━━━━━`;
    });
    return result;
  } catch (e) {
    return 'Ошибка парсинга доставок';
  }
}

module.exports = async (req, res) => {
  console.log('Webhook получен от ЮKassa');
  console.log('Method:', req.method);
  console.log('Body:', req.body);

  if (req.method !== 'POST') {
    console.log('Неподдерживаемый метод:', req.method);
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { event, object } = req.body;

    if (!event || !object) {
      console.log('Неверный формат webhook');
      return res.status(400).send('Bad Request');
    }

    console.log(`Событие: ${event}, Платёж: ${object.id}`);

    // Обрабатываем только успешные платежи
    if (event === 'payment.succeeded') {
      const {
        id: paymentId,
        amount,
        status,
        metadata,
        payment_method,
        created_at
      } = object;

      const deliveriesInfo = metadata.deliveries ? formatDeliveries(metadata.deliveries) : '';
      
      const message = `<b>ПЛАТЁЖ УСПЕШНО ПРОВЕДЁН!</b>

<b>ИНФОРМАЦИЯ О ЗАКАЗЧИКЕ</b>
Имя: <b>${metadata.customer_name}</b>
Телефон: <b>${metadata.customer_phone}</b>
Email: <b>${metadata.customer_email || 'Не указан'}</b>

━━━━━━━━━━━━━━━━━━━━━━━━━

<b>ДЕТАЛИ ПЛАТЕЖА</b>
Сумма: <b>${amount.value} ${amount.currency}</b>
ID платежа: <b>${paymentId}</b>
Номер заказа: <b>${metadata.order_id}</b>
Способ оплаты: <b>${payment_method.type}</b>
Статус: <b>УСПЕШНО ОПЛАЧЕН</b>

━━━━━━━━━━━━━━━━━━━━━━━━━

<b>ГРАФИКИ ДОСТАВОК</b>${deliveriesInfo}

━━━━━━━━━━━━━━━━━━━━━━━━━

Время: <b>${new Date(created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}</b>

Заказ готов к обработке!`;

      await sendTelegramMessage(message);
    }

    if (event === 'payment.canceled') {
      const message = `<b>ПЛАТЁЖ ОТМЕНЁН</b>

Номер заказа: <b>${object.metadata.order_id}</b>
Сумма: <b>${object.amount.value} ${object.amount.currency}</b>
ID платежа: <b>${object.id}</b>

Клиент отменил платёж`;

      await sendTelegramMessage(message);
    }

    if (event === 'refund.succeeded') {
      const message = `<b>ВОЗВРАТ СРЕДСТВ ВЫПОЛНЕН</b>

ID платежа: <b>${object.payment_id}</b>
Сумма возврата: <b>${object.amount.value} ${object.amount.currency}</b>
ID возврата: <b>${object.id}</b>`;

      await sendTelegramMessage(message);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Ошибка обработки webhook:', error.message);
    res.status(500).send('Error');
  }
};
