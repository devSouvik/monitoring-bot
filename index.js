require("dotenv").config();
const puppeteer = require("puppeteer");
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const fs = require("fs").promises;
const path = require("path");

// 🚀 Initialize Express Server
const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 Environment Variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID; // Default chat ID for notifications

// 🤖 Create Telegram Bot Instance
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 📦 User Tracking Object
const userSessions = {};

// 📊 Product Status History (persistent storage)
const STATUS_FILE = path.join(__dirname, 'product_status.json');

// 🗂️ Available Commands
const commands = [
    { command: '/start', description: 'Start the bot' },
    { command: '/track', description: 'Track product stock' },
    { command: '/stop', description: 'Stop tracking' },
    { command: '/status', description: 'Check current product status' }
];

// 📝 Set Bot Commands
bot.setMyCommands(commands);

// 💾 Load/Save Status Data Functions
async function loadStatusData () {
    try {
        const data = await fs.readFile(STATUS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log("📄 No existing status file found, creating new one...");
        return {};
    }
}

async function saveStatusData (data) {
    try {
        await fs.writeFile(STATUS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("💾 Error saving status data:", error.message);
    }
}

async function updateProductStatus (chatId, productUrl, pincode, status, productName) {
    const statusData = await loadStatusData();
    const productKey = `${chatId}_${productUrl}_${pincode}`;

    if (!statusData[productKey]) {
        statusData[productKey] = {
            productUrl,
            pincode,
            productName,
            trackingStarted: new Date().toISOString(),
            lastAvailable: null,
            currentStatus: 'unknown'
        };
    }

    statusData[productKey].currentStatus = status;
    statusData[productKey].lastChecked = new Date().toISOString();

    // Update last available time if product is in stock
    if (status === 'in_stock') {
        statusData[productKey].lastAvailable = new Date().toISOString();
    }

    await saveStatusData(statusData);
    return statusData[productKey];
}

async function getProductStatus (chatId, productUrl, pincode) {
    const statusData = await loadStatusData();
    const productKey = `${chatId}_${productUrl}_${pincode}`;
    return statusData[productKey] || null;
}

// 🏁 Start Command Handler
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `🛒 *Welcome to Stock Tracker Bot!*\n\nI can monitor product availability on Amul's website for you.\n\nAvailable commands:\n• /track - Start tracking a product\n• /status - Check current status\n• /stop - Stop tracking`,
        { parse_mode: "Markdown" });
});

// 📊 Status Command Handler
bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const session = userSessions[chatId];

        if (!session || !session.productUrl) {
            bot.sendMessage(chatId, "ℹ️ No active tracking session found.\n\nUse /track to start monitoring a product.");
            return;
        }

        const statusInfo = await getProductStatus(chatId, session.productUrl, session.pincode);

        if (!statusInfo) {
            bot.sendMessage(chatId, "❌ No status data available.\n\nUse /track to start monitoring a product.");
            return;
        }

        const currentStatus = statusInfo.currentStatus === 'in_stock' ? '✅ Available' : '❌ Out of Stock';
        const trackingStarted = new Date(statusInfo.trackingStarted).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const lastChecked = statusInfo.lastChecked ? new Date(statusInfo.lastChecked).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) : 'Never';

        let lastAvailableText;
        if (statusInfo.lastAvailable) {
            const lastAvailable = new Date(statusInfo.lastAvailable).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            lastAvailableText = `📅 Last Available: ${lastAvailable}`;
        } else {
            lastAvailableText = `📅 Last Available: No data available, tracking since ${trackingStarted}`;
        }

        const statusMessage = `📊 *Product Status Report*\n\n` +
            `🏷️ Product: ${statusInfo.productName || 'Unknown Product'}\n` +
            `📍 Pincode: ${statusInfo.pincode}\n` +
            `📈 Current Status: ${currentStatus}\n` +
            `🕐 Last Checked: ${lastChecked}\n` +
            `${lastAvailableText}\n` +
            `🔄 Tracking Started: ${trackingStarted}\n\n` +
            `[View Product](${statusInfo.productUrl})`;

        bot.sendMessage(chatId, statusMessage, { parse_mode: "Markdown" });

    } catch (error) {
        console.error("❌ Error getting status:", error.message);
        bot.sendMessage(chatId, "⚠️ Error retrieving status information. Please try again.");
    }
});

// 🔍 Track Command Handler
bot.onText(/\/track/, (msg) => {
    const chatId = msg.chat.id;
    userSessions[chatId] = { step: 'awaiting_url' };
    bot.sendMessage(chatId, "🌐 Please send me the product URL from shop.amul.com:");
});

// 🛑 Stop Command Handler
bot.onText(/\/stop/, (msg) => {
    const chatId = msg.chat.id;
    if (userSessions[chatId]?.intervalId) {
        clearInterval(userSessions[chatId].intervalId);
        delete userSessions[chatId];
        bot.sendMessage(chatId, "🛑 Stopped tracking your product.");
    } else {
        bot.sendMessage(chatId, "ℹ️ You don't have any active tracking sessions. Start tracking a product with /track");
    }
});

// 📩 Message Handler for User Input
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!userSessions[chatId]) return;

    switch (userSessions[chatId].step) {
        case 'awaiting_url':
            if (text.startsWith('http') && text.includes('shop.amul.com')) {
                userSessions[chatId].productUrl = text;
                userSessions[chatId].step = 'awaiting_pincode';
                bot.sendMessage(chatId, "📍 Now please send me your 6-digit pincode:");
            } else {
                bot.sendMessage(chatId, "❌ Invalid URL. Please send a valid shop.amul.com product URL.");
            }
            break;

        case 'awaiting_pincode':
            if (/^\d{6}$/.test(text)) {
                userSessions[chatId].pincode = text;
                userSessions[chatId].step = 'tracking';

                // Start tracking immediately
                await checkStock(chatId, userSessions[chatId].productUrl, userSessions[chatId].pincode);

                // Set up interval tracking (every 2 minutes)
                userSessions[chatId].intervalId = setInterval(
                    () => checkStock(chatId, userSessions[chatId].productUrl, userSessions[chatId].pincode),
                    2 * 60 * 1000
                );

                bot.sendMessage(chatId, `✅ Now tracking product at:\n${userSessions[chatId].productUrl}\nfor pincode: ${userSessions[chatId].pincode}\n\nI'll notify you when stock status changes.\n\nUse /status to check current status\nUse /stop to cancel tracking.`);
            } else {
                bot.sendMessage(chatId, "❌ Invalid pincode. Please send a valid 6-digit pincode.");
            }
            break;
    }
});

// 🔍 Stock Check Function (UPDATED VERSION)
async function checkStock (chatId, productUrl, pincode) {
    try {
        console.log(`🔍 Checking stock for ${productUrl} (${pincode})...`);

        // 🌐 Launch Puppeteer Browser
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // 🛍️ Open Product Page
        console.log("🔄 Opening product page...");
        await page.goto(productUrl, { waitUntil: "networkidle2" });

        // 📍 Enter Pincode
        console.log("⌨️ Entering pincode...");
        await page.waitForSelector('#locationWidgetModal input#search', { timeout: 10000 });
        await page.type('#locationWidgetModal input#search', pincode, { delay: 100 });

        // 📌 Select Location
        await page.waitForFunction(() => {
            return document.querySelectorAll('#automatic .list-group-item').length >= 2;
        }, { timeout: 10000 });

        console.log("✅ Selecting location...");
        const secondOption = await page.$('#automatic .list-group-item:nth-child(2)');

        if (secondOption) {
            const box = await secondOption.boundingBox();
            if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            }
        }

        // ⏳ Wait for UI Updates
        console.log("⏳ Waiting for page updates...");
        await page.waitForSelector('#locationWidgetModal', { hidden: true, timeout: 15000 });
        await page.waitForSelector('.product-details', { timeout: 15000 });

        // 🔍 Check Stock Status
        const { soldOutExists, notifyMeExists, addToCartEnabled } = await page.evaluate(() => {
            return {
                soldOutExists: !!document.querySelector('div.alert.alert-danger.mt-3'),
                notifyMeExists: !!document.querySelector('div.product-enquiry-wrap'),
                // Check for ENABLED "Add to Cart" button (disabled="0" means enabled)
                addToCartEnabled: (() => {
                    const addToCartBtn = document.querySelector('.add-to-cart');
                    if (!addToCartBtn) return false;

                    const disabledAttr = addToCartBtn.getAttribute('disabled');
                    const hasDisabledClass = addToCartBtn.classList.contains('disabled');

                    // Button is enabled if disabled="0" or no disabled attribute, and no disabled class
                    return (disabledAttr === "0" || disabledAttr === null) && !hasDisabledClass;
                })()
            };
        });

        // Get product name
        const productName = await page.evaluate(() => {
            return document.querySelector('.product-name.mb-2.fw-bold.lh-sm.text-dark.h3.mb-4')?.textContent.trim() || 'Product';
        });

        // 📊 Determine stock status
        // Item is available ONLY if:
        // 1. No sold-out message exists AND
        // 2. No notify-me button exists AND
        // 3. Add to cart button is enabled (not disabled)
        const isAvailable = !soldOutExists && !notifyMeExists && addToCartEnabled;

        console.log(`📊 Stock Status Check:
        - Sold Out Message: ${soldOutExists ? 'YES' : 'NO'}
        - Notify Me Button: ${notifyMeExists ? 'YES' : 'NO'}  
        - Add to Cart Enabled: ${addToCartEnabled ? 'YES' : 'NO'}
        - Final Status: ${isAvailable ? 'AVAILABLE' : 'OUT OF STOCK'}`);

        // 📨 Send notifications based on status change
        const currentStatus = isAvailable ? 'in_stock' : 'out_of_stock';
        const previousStatus = userSessions[chatId]?.lastStatus;

        // 💾 Update persistent status data
        await updateProductStatus(chatId, productUrl, pincode, currentStatus, productName);

        if (currentStatus !== previousStatus) {
            if (isAvailable) {
                console.log("🎉 Item is now available! Sending notification...");
                await bot.sendMessage(chatId,
                    `🛒✅ *${productName} : Available!*\n\nNow in stock for pincode ${pincode}!\n\n[Buy Now](${productUrl})`,
                    { parse_mode: "Markdown" });
            } else {
                console.log("😔 Item is now out of stock.");
                await bot.sendMessage(chatId,
                    `⏳❌ *${productName} : Out of Stock*\n\nCurrently unavailable for pincode ${pincode}.`,
                    { parse_mode: "Markdown" });
            }
        } else {
            console.log(`📝 Status unchanged: ${currentStatus}`);
        }

        // Update last known status in session
        userSessions[chatId].lastStatus = currentStatus;

        await browser.close();

    } catch (error) {
        console.error("🔥 Error checking stock:", error.message);
        await bot.sendMessage(chatId,
            `⚠️ *Error Checking Stock*\n\nFailed to check status for pincode ${pincode}:\n${error.message}`,
            { parse_mode: "Markdown" });
    }
}

// 🖥️ Uptime Monitor
app.get("/", (req, res) => res.send("🤖✅ Bot is running and healthy!"));
app.listen(PORT, () => console.log(`🚀 Ping server running on port ${PORT}`));
