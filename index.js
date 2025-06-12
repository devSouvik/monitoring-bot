require("dotenv").config();
const puppeteer = require("puppeteer");
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const fs = require("fs");

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
            executablePath: puppeteer.executablePath(),
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }); const page = await browser.newPage();

        // Go to product page
        await page.goto(PRODUCT_URL, { waitUntil: "networkidle2" });

        // Wait for pincode input
        await page.waitForSelector('#locationWidgetModal input#search', { timeout: 10000 });

        // Type pincode
        await page.type('#locationWidgetModal input#search', '302017', { delay: 100 });

        // Wait for suggestions
        await page.waitForFunction(() => {
            return document.querySelectorAll('#automatic .list-group-item').length >= 2;
        }, { timeout: 10000 });

        // Click the second suggestion using Puppeteer's mouse
        const secondOption = await page.$('#automatic .list-group-item:nth-child(2)');

        if (secondOption) {
            const box = await secondOption.boundingBox();
            if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            }
        }

        // Wait for either "Sold Out" or "Notify Me" section to appear
        await page.waitForSelector('.product-enquiry-wrap, .alert.alert-danger.mt-3', {
            timeout: 10000
        });

        // Optional screenshot for debugging
        // await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });

        // Check live DOM for availability
        const { soldOutExists, notifyMeExists } = await page.evaluate(() => {
            return {
                soldOutExists: !!document.querySelector('div.alert.alert-danger.mt-3'),
                notifyMeExists: !!document.querySelector('div.product-enquiry-wrap')
            };
        });

        if (!soldOutExists || !notifyMeExists) {
            console.log("✅ Item is available now. Sending Telegram message...");
            await bot.sendMessage(CHAT_ID, `item is available now, buy here: ${PRODUCT_URL}`);
        } else {
            console.log("❌ Item is still out of stock.");
        }

        await browser.close();

    } catch (error) {
        console.error("❌ Error checking stock:", error.message);
    }
}

// Run every 5 minutes
setInterval(checkStock, 5 * 60 * 1000);
checkStock();

// UptimeRobot ping server
app.get("/", (req, res) => res.send("✅ Bot is running"));
app.listen(PORT, () => console.log(`Ping server running on port ${PORT}`));
