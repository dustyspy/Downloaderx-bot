// src/features/tiktok.js

/* 
===========================================
BOT NAME : MAINUL - X DOWNLOADER BOT
AUTHOR  : Md. Mainul Islam
OWNER   : MAINUL - X
FEATURE : TikTok Video Downloader (No Watermark)
===========================================
*/

import fs from "fs";
import axios from "axios";
import { dirname } from "path";
import { fileURLToPath } from "url";
import ytdlpExec from "yt-dlp-exec";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function resolveTikTokUrl(url) {
    try {
        const response = await axios.get(url, {
            maxRedirects: 5,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            timeout: 10000
        });
        return response.request.res.responseUrl || url;
    } catch (err) {
        console.error("❌ Failed to resolve TikTok URL:", err.message);
        return url;
    }
}

export async function handleTikTokDownloader(sock, from, url) {
    if (!url.startsWith("http")) {
        await sock.sendMessage(from, { text: "❌ Invalid URL. Please send a valid TikTok video link." });
        return;
    }

    // Send processing message
    await sock.sendMessage(from, { 
        text: "🔍 *MAINUL - X Downloader*\n\n📥 Processing TikTok video...\n🎵 Removing watermark...\n⏳ Please wait, this may take a few moments." 
    });

    const tempFile = `${__dirname}/tmp_tt_${Date.now()}.mp4`;

    try {
        const resolvedUrl = await resolveTikTokUrl(url);
        
        await ytdlpExec(resolvedUrl, {
            output: tempFile,
            format: "bv*[height<=1080]+ba/bv*+ba/best",
            quiet: true,
            noWarnings: true,
            preferFreeFormats: true,
            noCheckCertificate: true
        });

        // Check if file exists and has content
        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
            // Send video
            await sock.sendMessage(from, {
                video: fs.readFileSync(tempFile),
                mimetype: "video/mp4",
                caption: "🎵 *TikTok Video*\n\n✅ No Watermark\n✅ Downloaded by *MAINUL - X Bot*\n💎 Enjoy your video!\n\n© MAINUL - X TEAM"
            });
            
            // Clean up temp file
            fs.unlinkSync(tempFile);
        } else {
            throw new Error("Downloaded file is empty or corrupted");
        }

    } catch (err) {
        console.error("❌ TikTok download error:", err);
        
        // Clean up temp file if exists
        if (fs.existsSync(tempFile)) {
            try {
                fs.unlinkSync(tempFile);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        
        await sock.sendMessage(from, { 
            text: "❌ *Download Failed*\n\nSorry, we couldn't download the TikTok video.\n\nPossible reasons:\n• Private video\n• Video not available\n• Invalid link\n• No watermark removal failed\n\nPlease try another link." 
        });
    }
}
