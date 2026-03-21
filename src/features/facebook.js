// src/features/facebook.js

/* 
===========================================
BOT NAME : MAINUL - X DOWNLOADER BOT
AUTHOR  : Md. Mainul Islam
OWNER   : MAINUL - X
FEATURE : Facebook Video Downloader
===========================================
*/

import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import ytdlpExec from 'yt-dlp-exec';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function handleFacebookDownloader(sock, from, url) {
    if (!url.startsWith('http')) {
        await sock.sendMessage(from, { text: '❌ Invalid URL. Please send a valid Facebook video link.' });
        return;
    }

    // Send processing message
    await sock.sendMessage(from, { 
        text: '🔍 *MAINUL - X Downloader*\n\n📥 Processing Facebook video...\n⏳ Please wait, this may take a few moments.' 
    });

    const tempFile = `${__dirname}/tmp_fb_${Date.now()}.mp4`;

    try {
        // Download video using yt-dlp
        await ytdlpExec(url, { 
            output: tempFile, 
            format: 'mp4',
            noCheckCertificate: true,
            noWarnings: true
        });

        // Check if file exists and has content
        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
            // Send video
            await sock.sendMessage(from, { 
                video: fs.readFileSync(tempFile), 
                mimetype: 'video/mp4',
                caption: '📹 *Facebook Video*\n\n✅ Downloaded by *MAINUL - X Bot*\n💎 Enjoy your video!\n\n© MAINUL - X TEAM'
            });
            
            // Clean up temp file
            fs.unlinkSync(tempFile);
        } else {
            throw new Error('Downloaded file is empty or corrupted');
        }

    } catch (err) {
        console.error('Facebook download error:', err);
        
        // Clean up temp file if exists
        if (fs.existsSync(tempFile)) {
            try {
                fs.unlinkSync(tempFile);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        
        await sock.sendMessage(from, { 
            text: '❌ *Download Failed*\n\nSorry, we couldn\'t download the Facebook video.\n\nPossible reasons:\n• Private video\n• Video not available\n• Invalid link\n\nPlease try another link.' 
        });
    }
}
