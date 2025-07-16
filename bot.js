
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");
const { Configuration, OpenAIApi } = require("openai");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 7777;
const URL = process.env.WEBHOOK_URL;

const bot = new TelegramBot(process.env.BOT_TOKEN);
bot.setWebHook(`${URL}/bot${process.env.BOT_TOKEN}`);

const adminId = process.env.ADMIN_ID;
const ordersFile = "orders.json";
const packagesFile = "packages.json";

let orders = fs.existsSync(ordersFile)
  ? JSON.parse(fs.readFileSync(ordersFile))
  : [];

let packages = fs.existsSync(packagesFile)
  ? JSON.parse(fs.readFileSync(packagesFile))
  : {};

const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("FF Diamond Bot with Webhook is running ✅");
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

// Telegram Bot Logic

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `🌟 স্বাগতম ${msg.from.first_name}!
এই বটের মাধ্যমে আপনি Free Fire ডায়মন্ড কিনতে পারবেন।

রুলস:
✅ সঠিক UID দিন
✅ বিকাশ বা নগদে টাকা পাঠান
✅ স্ক্রিনশট ও ট্রান্সফার আইডি দিন
✅ অপেক্ষা করুন Admin Confirm করার

আপনি যদি রাজি থাকেন, নিচের Accept বাটনে চাপ দিন।`, {
    reply_markup: {
      inline_keyboard: [[{ text: "✅ Accept", callback_data: "accept_rules" }]]
    }
  });
});

bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === "accept_rules") {
    bot.sendMessage(chatId, "আপনি কি কিনতে চান? নিচে Buy Now চাপুন:", {
      reply_markup: {
        inline_keyboard: [[{ text: "💎 Buy Now", callback_data: "buy_now" }]]
      }
    });
  }

  if (data === "buy_now") {
    let packList = Object.entries(packages).map(
      ([code, info]) => `🔹 ${code} - ${info.name} = ${info.price}৳`
    ).join("\n");

    bot.sendMessage(chatId, `ডায়মন্ড প্যাকেজ লিস্ট:\n\n${packList}\n\nযে প্যাকেজটি কিনতে চান, শুধু কোডটি লিখুন (যেমন: FX1)`);
  }

  if (data.startsWith("approve_") || data.startsWith("reject_")) {
    const [action, orderId] = data.split("_");
    const order = orders.find(o => o.id == orderId);
    if (!order) return;

    if (action === "approve") {
      order.status = "approved";
      fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
      bot.sendMessage(query.message.chat.id, "✔️ অর্ডার Approve করা হয়েছে");
      bot.sendMessage(order.username, `🎉 ধন্যবাদ ${order.username}!
আপনার ${packages[order.code].name} সফলভাবে প্রক্রিয়াজাত হয়েছে। আবার অর্ডার করতে পারেন!`);
    } else if (action === "reject") {
      order.status = "rejected";
      fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
      bot.sendMessage(query.message.chat.id, "❌ অর্ডার Reject করা হয়েছে");
      bot.sendMessage(order.username, `😞 দুঃখিত ${order.username}, আপনার অর্ডার বাতিল করা হয়েছে। অনুগ্রহ করে আবার চেক করুন।`);
    }
  }
});

bot.on("message", (msg) => {
  const code = msg.text.trim().toUpperCase();
  const chatId = msg.chat.id;

  if (packages[code]) {
    const pack = packages[code];
    bot.sendMessage(chatId, `✅ আপনি নির্বাচন করেছেন: ${pack.name} (${pack.price}৳)

📥 এখন আপনার Free Fire UID লিখুন:
উদাহরণ: 1234567890`);

    bot.once("message", (uidMsg) => {
      const uid = uidMsg.text.trim();
      const paymentText = `💳 পেমেন্ট করুন নিচের নাম্বারে:

📱 bKash: 01965064030
📱 Nagad: 01937240300

পেমেন্ট শেষে ট্রান্সফার আইডি এবং স্ক্রিনশট পাঠান।`;
      bot.sendMessage(chatId, paymentText);

      bot.once("photo", (photoMsg) => {
        const screenshot = photoMsg.photo[photoMsg.photo.length - 1].file_id;
        const caption = photoMsg.caption || "";

        const order = {
          id: Date.now(),
          uid,
          username: msg.from.username || msg.from.first_name,
          code,
          price: pack.price,
          screenshot,
          caption,
          status: "pending"
        };

        orders.push(order);
        fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));

        bot.sendMessage(chatId, "✅ অর্ডার গ্রহণ করা হয়েছে! Admin যাচাই করে রিপ্লাই করবে।");

        bot.sendPhoto(adminId, screenshot, {
          caption: `🆕 নতুন অর্ডার:
UID: ${uid}
প্যাকেজ: ${code} - ${pack.name}
মূল্য: ${pack.price}৳
From: @${order.username || "Unknown"}`,
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Approve", callback_data: `approve_${order.id}` }],
              [{ text: "❌ Reject", callback_data: `reject_${order.id}` }]
            ]
          }
        });
      });
    });
  }
});

bot.onText(/\/ask (.+)/, async (msg, match) => {
  const question = match[1];
  const chatId = msg.chat.id;

  try {
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: `বাংলায় সংক্ষিপ্তভাবে উত্তর দাও:\n${question}` }]
    });

    bot.sendMessage(chatId, `🤖 AI বলছে:\n${response.data.choices[0].message.content}`);
  } catch (e) {
    bot.sendMessage(chatId, "❌ AI সাড়া দিচ্ছে না। পরে চেষ্টা করুন।");
  }
});

