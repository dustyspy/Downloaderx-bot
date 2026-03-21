// src/handler.js

/* 
===========================================
BOT NAME : MAINUL - X DOWNLOADER BOT
AUTHOR  : Md. Mainul Islam
OWNER   : MAINUL - X
TELEGRAM: @mdmainulislaminfo
WHATSAPP: +8801308850528
GITHUB  : https://github.com/M41NUL
VERSION : 3.0.0
===========================================
*/

import fs from 'fs';
import path from 'path';
import { userState } from './userState.js';
import { handleYouTubeDownloader } from './features/youtube.js';
import { handleFacebookDownloader } from './features/facebook.js';
import { handleInstagramDownloader } from './features/instagram.js';
import { handleTikTokDownloader } from './features/tiktok.js';
import { validateUrl } from './utils/validateUrl.js';

const menuImagePath = path.join(process.cwd(), 'src/assets/menu.jpg');

// ========== MESSAGES ==========
const WELCOME_MSG = `👋 Welcome to *MAINUL - X DOWNLOADER BOT*

Send a video link directly or press Start.

📥 *Supported Platforms*
• YouTube
• Facebook
• Instagram
• TikTok

⚡ *Commands*
/dev - Developer info
/admin - Admin panel access
/menu - Show menu
/help - Help & commands

💎 *Powered by MAINUL - X TEAM*`;

const HELP_MSG = `📖 *HELP & COMMANDS*

┌─────────────────────────────────┐
│  🤖 *MAINUL - X DOWNLOADER BOT* │
└─────────────────────────────────┘

📌 *How to use:*
1️⃣ Send a video link (YouTube, Facebook, Instagram, TikTok)
2️⃣ Bot will auto-detect the platform
3️⃣ Select quality and download

📋 *Commands*
├─ /start - Start the bot
├─ /menu - Show main menu
├─ /dev - Developer info
├─ /admin - Admin panel
└─ /help - This help message

💡 *Tips*
• Send any supported link directly
• Bot auto-detects platform
• No need to type platform name

© 2026 MAINUL - X | All Rights Reserved`;

const DEV_INFO = `👨‍💻 *DEVELOPER INFO*

┌─────────────────────────────────┐
│  ✨ *MAINUL - X*                │
│  💻 Full Stack Developer        │
│  🤖 WhatsApp Bot Creator        │
└─────────────────────────────────┘

📱 *Contact*
├─ 📧 Email: githubmainul@gmail.com
├─ 📱 WhatsApp: +8801308850528
├─ 💬 Telegram: @mdmainulislaminfo
└─ 🐙 GitHub: https://github.com/M41NUL

⚡ *Skills*
├─ JavaScript/Node.js
├─ Python/Flask
├─ React/Vue.js
└─ Bot Development

💎 *Support*
Buy me a coffee? Support my work!

© 2026 MAINUL - X | All Rights Reserved`;

const ADMIN_INFO = `👑 *ADMIN PANEL*

┌─────────────────────────────────┐
│  🔐 Admin Access Required       │
└─────────────────────────────────┘

📊 *System Stats*
├─ 🤖 Bot Status: ONLINE
├─ 👥 Total Users: --
├─ 📥 Total Downloads: --
└─ ⏱ Uptime: --

💡 *Admin Commands*
├─ /users - List all users
├─ /stats - System statistics
├─ /broadcast - Send message to all
└─ /restart - Restart bot

⚠️ *Note*
This panel is for authorized admins only.
Contact @mdmainulislaminfo for access.

© 2026 MAINUL - X TEAM`;

// ========== AUTO DETECT PLATFORM FUNCTION ==========
function detectPlatform(url) {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
        return 'youtube';
    }
    if (urlLower.includes('facebook.com') || urlLower.includes('fb.com') || urlLower.includes('fb.watch')) {
        return 'facebook';
    }
    if (urlLower.includes('instagram.com') || urlLower.includes('instagr.am')) {
        return 'instagram';
    }
    if (urlLower.includes('tiktok.com') || urlLower.includes('vt.tiktok.com')) {
        return 'tiktok';
    }
    return null;
}

// ========== MAIN HANDLER ==========
export async function handler(sock, msg) {
    if (!msg?.message) return;

    const from = msg.key.remoteJid;
    const state = userState.get(from) || { step: 'start' };

    const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption;

    // ========== COMMAND HANDLER ==========
    if (text) {
        const lowerText = text.toLowerCase().trim();
        
        // /start command
        if (lowerText === '/start' || lowerText === 'start') {
            await sock.sendMessage(from, { text: WELCOME_MSG });
            await sendDownloaderMenu(sock, from);
            userState.set(from, { step: 'menuMain' });
            return;
        }
        
        // /menu command
        if (lowerText === '/menu' || lowerText === 'menu') {
            await sendDownloaderMenu(sock, from);
            userState.set(from, { step: 'menuMain' });
            return;
        }
        
        // /help command
        if (lowerText === '/help' || lowerText === 'help') {
            await sock.sendMessage(from, { text: HELP_MSG });
            return;
        }
        
        // /dev command
        if (lowerText === '/dev' || lowerText === 'dev' || lowerText === '!dev') {
            await sock.sendMessage(from, { text: DEV_INFO });
            return;
        }
        
        // /admin command
        if (lowerText === '/admin' || lowerText === 'admin' || lowerText === '!admin') {
            await sock.sendMessage(from, { text: ADMIN_INFO });
            return;
        }
        
        // ========== AUTO DETECT URL ==========
        const platform = detectPlatform(text);
        
        if (platform) {
            await sock.sendPresenceUpdate('composing', from);
            
            switch (platform) {
                case 'youtube':
                    if (validateUrl(text, 'youtube')) {
                        await handleYouTubeDownloader(sock, from, text);
                    } else {
                        await sock.sendMessage(from, { 
                            text: '❌ Invalid YouTube URL. Please send a valid YouTube link.'
                        });
                    }
                    break;
                    
                case 'facebook':
                    if (validateUrl(text, 'facebook')) {
                        await handleFacebookDownloader(sock, from, text);
                    } else {
                        await sock.sendMessage(from, { 
                            text: '❌ Invalid Facebook URL. Please send a valid Facebook video link.'
                        });
                    }
                    break;
                    
                case 'instagram':
                    if (validateUrl(text, 'instagram')) {
                        await handleInstagramDownloader(sock, from, text);
                    } else {
                        await sock.sendMessage(from, { 
                            text: '❌ Invalid Instagram URL. Please send a valid Instagram video link.'
                        });
                    }
                    break;
                    
                case 'tiktok':
                    if (validateUrl(text, 'tiktok')) {
                        await handleTikTokDownloader(sock, from, text);
                    } else {
                        await sock.sendMessage(from, { 
                            text: '❌ Invalid TikTok URL. Please send a valid TikTok video link.'
                        });
                    }
                    break;
            }
            
            await sock.sendPresenceUpdate('paused', from);
            return;
        }
    }

    // ========== INTERACTIVE BUTTON HANDLER ==========
    let rowId;
    try {
        if (msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage) {
            rowId = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id;
        } else if (msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
            rowId = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        }
    } catch (err) {
        console.error('[DEBUG] Failed to parse rowId:', err);
    }

    const btnId = msg.message?.buttonsResponseMessage?.selectedButtonId;
    
    if (btnId === 'back_to_menu') {
        await sock.sendPresenceUpdate('composing', from);
        await new Promise(r => setTimeout(r, 800));
        await sendDownloaderMenu(sock, from);
        await sock.sendPresenceUpdate('paused', from);
        userState.set(from, { step: 'menuMain' });
        return;
    }

    if (rowId) {
        switch (rowId) {
            case 'yt_downloader':
                userState.set(from, { step: 'yt_wait_url' });
                await sock.sendMessage(from, { text: '📌 Send the *YouTube* link you want to download:' });
                break;
            case 'fb_downloader':
                userState.set(from, { step: 'fb_wait_url' });
                await sock.sendMessage(from, { text: '📌 Send the *Facebook* video link:' });
                break;
            case 'ig_downloader':
                userState.set(from, { step: 'ig_wait_url' });
                await sock.sendMessage(from, { text: '📌 Send the *Instagram* video link:' });
                break;
            case 'tt_downloader':
                userState.set(from, { step: 'tt_wait_url' });
                await sock.sendMessage(from, { text: '📌 Send the *TikTok* video link:' });
                break;
            default:
                break;
        }
        return;
    }

    // ========== STEP BASED URL HANDLER ==========
    if (text) {
        switch (state.step) {
            case 'yt_wait_url':
                if (!validateUrl(text, 'youtube')) {
                    await sock.sendMessage(from, { 
                        text: '❌ Invalid URL. Please send a valid YouTube link.',
                        buttons: [{ buttonId: 'back_to_menu', buttonText: { displayText: 'Back to Menu' }, type: 1 }]
                    });
                    return;
                }
                await handleYouTubeDownloader(sock, from, text);
                break;

            case 'fb_wait_url':
                if (!validateUrl(text, 'facebook')) {
                    await sock.sendMessage(from, { 
                        text: '❌ Invalid URL. Please send a valid Facebook link.',
                        buttons: [{ buttonId: 'back_to_menu', buttonText: { displayText: 'Back to Menu' }, type: 1 }]
                    });
                    return;
                }
                await handleFacebookDownloader(sock, from, text);
                break;

            case 'ig_wait_url':
                if (!validateUrl(text, 'instagram')) {
                    await sock.sendMessage(from, { 
                        text: '❌ Invalid URL. Please send a valid Instagram link.',
                        buttons: [{ buttonId: 'back_to_menu', buttonText: { displayText: 'Back to Menu' }, type: 1 }]
                    });
                    return;
                }
                await handleInstagramDownloader(sock, from, text);
                break;

            case 'tt_wait_url':
                if (!validateUrl(text, 'tiktok')) {
                    await sock.sendMessage(from, { 
                        text: '❌ Invalid URL. Please send a valid TikTok link.',
                        buttons: [{ buttonId: 'back_to_menu', buttonText: { displayText: 'Back to Menu' }, type: 1 }]
                    });
                    return;
                }
                await handleTikTokDownloader(sock, from, text);
                break;

            default:
                await sendDownloaderMenu(sock, from);
                break;
        }

        userState.set(from, { step: 'menuMain' });
        return;
    }

    if (state.step === 'start' || state.step === 'menuMain') {
        await sendDownloaderMenu(sock, from);
        userState.set(from, { step: 'menuMain' });
    }
}

// ========== SEND MENU FUNCTION ==========
export async function sendDownloaderMenu(sock, from) {
    await sock.sendMessage(from, { text: WELCOME_MSG });
    
    await sock.sendMessage(from, {
        image: fs.readFileSync(menuImagePath),
        caption: '📱 *MAINUL - X DOWNLOADER BOT*\n\nChoose a platform to download videos:',
        footer: '© 2026 MAINUL - X | All Rights Reserved',
        interactiveButtons: [
            {
                name: 'single_select',
                buttonParamsJson: JSON.stringify({
                    title: '🎬 Video Downloader',
                    sections: [
                        {
                            title: '📺 Select Platform',
                            rows: [
                                { title: '▶️ YouTube Downloader', description: 'Download videos from YouTube', id: 'yt_downloader' },
                                { title: '📘 Facebook Downloader', description: 'Download videos from Facebook', id: 'fb_downloader' },
                                { title: '📸 Instagram Downloader', description: 'Download videos from Instagram', id: 'ig_downloader' },
                                { title: '🎵 TikTok Downloader', description: 'Download videos from TikTok', id: 'tt_downloader' },
                            ],
                        },
                    ],
                }),
            },
        ],
    });
}
