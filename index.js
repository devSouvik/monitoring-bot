require("dotenv").config();
const puppeteer = require("puppeteer");
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const PRODUCT_URL = "https://shop.amul.com/en/product/amul-high-protein-buttermilk-200-ml-or-pack-of-30";

const bot = new TelegramBot(BOT_TOKEN);
async function checkStock () {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        console.log("🔄 Opening product page...");
        await page.goto(PRODUCT_URL, { waitUntil: "networkidle2" });

        await page.waitForSelector('#locationWidgetModal input#search', { timeout: 10000 });
        console.log("⌨️ Entering pincode...");
        await page.type('#locationWidgetModal input#search', '302017', { delay: 100 });

        await page.waitForFunction(() => {
            return document.querySelectorAll('#automatic .list-group-item').length >= 2;
        }, { timeout: 10000 });

        console.log("✅ Clicking the second suggestion...");

        // Click the second suggestion using Puppeteer's mouse
        const secondOption = await page.$('#automatic .list-group-item:nth-child(2)');

        if (secondOption) {
            const box = await secondOption.boundingBox();
            if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            }
        }

        // ✅ Wait for pincode modal to disappear
        console.log("⏳ Waiting for modal to close...");
        await page.waitForSelector('#locationWidgetModal', { hidden: true, timeout: 15000 });

        // ✅ Wait for product content
        console.log("⏳ Waiting for product content...");
        await page.waitForSelector('.product-enquiry-wrap, .alert.alert-danger.mt-3', { timeout: 15000 });

        // Screenshot for debug
        // await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });

        // DOM check
        const { soldOutExists, notifyMeExists } = await page.evaluate(() => {
            return {
                soldOutExists: !!document.querySelector('div.alert.alert-danger.mt-3'),
                notifyMeExists: !!document.querySelector('div.product-enquiry-wrap')
            };
        });

        if (!soldOutExists || !notifyMeExists) {
            console.log("✅ Item is available now. Sending Telegram message...");
            await bot.sendMessage(CHAT_ID, "item is available now");
        } else {
            console.log("❌ Item is still out of stock.");
            await bot.sendMessage(CHAT_ID, "item still not available");
        }

        await browser.close();

    } catch (error) {
        console.error("❌ Error checking stock:", error.message);
    }
}


// Run every 5 minutes
setInterval(checkStock, 2 * 60 * 1000);
checkStock();

// UptimeRobot ping server
app.get("/", (req, res) => res.send("✅ Bot is running"));
app.listen(PORT, () => console.log(`Ping server running on port ${PORT}`));
