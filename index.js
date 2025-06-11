require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const PRODUCT_URL = "https://shop.amul.com/en/product/amul-high-protein-buttermilk-200-ml-or-pack-of-30";

const bot = new TelegramBot(BOT_TOKEN);

let isNotified = false;

async function checkStock () {
    try {
        const response = await axios.get(PRODUCT_URL);
        const $ = cheerio.load(response.data);

        const availability = $('link[itemprop="availability"]').attr("href");

        if (availability && availability.includes("InStock")) {
            if (!isNotified) {
                bot.sendMessage(CHAT_ID, `🟢 Product is BACK IN STOCK!\n${PRODUCT_URL}`);
                console.log("Stock is available! Telegram sent.");
                isNotified = true;
            }
        } else {
            console.log("Out of stock:", new Date().toLocaleString());
            isNotified = false;
        }
    } catch (error) {
        console.error("Error fetching stock status:", error.message);
    }
}

// Run every 5 minutes
setInterval(checkStock, 5 * 60 * 1000);
checkStock();

// Express ping route for UptimeRobot
app.get("/", (req, res) => res.send("Bot is running ✅"));
app.listen(PORT, () => console.log(`Ping server on http://localhost:${PORT}`));
