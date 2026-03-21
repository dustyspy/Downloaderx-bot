// src/features/youtube.js

/* 
===========================================
BOT NAME : MAINUL - X DOWNLOADER BOT
AUTHOR  : Md. Mainul Islam
OWNER   : MAINUL - X
FEATURE : YouTube Video Downloader
===========================================
*/

import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import ytdlpExec from 'yt-dlp-exec';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function handleYouTubeDownloader(sock, from, url) {
    if (!url.startsWith('http')) {
        await sock.sendMessage(from, { text: '❌ Invalid URL. Please send a valid YouTube video link.' });
        return;
    }

    // Send processing message
    await sock.sendMessage(from, { 
        text: '🔍 *MAINUL - X Downloader*\n\n📥 Processing YouTube video...\n🎬 Fetching best quality...\n⏳ Please wait, this may take a few moments.' 
    });

    const tempFile = `${__dirname}/tmp_yt_${Date.now()}.mp4`;

    try {
        // Download video using yt-dlp with best quality
        await ytdlpExec(url, { 
            output: tempFile, 
            format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            mergeOutputFormat: 'mp4',
            noCheckCertificate: true,
            noWarnings: true
        });

        // Check if file exists and has content
        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
            // Send video
            await sock.sendMessage(from, { 
                video: fs.readFileSync(tempFile), 
                mimetype: 'video/mp4',
                caption: '🎬 *YouTube Video*\n\n✅ Downloaded by *MAINUL - X Bot*\n🎥 Best Quality Available\n💎 Enjoy your video!\n\n© MAINUL - X TEAM'
            });
            
            // Clean up temp file
            fs.unlinkSync(tempFile);
        } else {
            throw new Error('Downloaded file is empty or corrupted');
        }

    } catch (err) {
        console.error('YouTube download error:', err);
        
        // Clean up temp file if exists
        if (fs.existsSync(tempFile)) {
            try {
                fs.unlinkSync(tempFile);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        
        await sock.sendMessage(from, { 
            text: '❌ *Download Failed*\n\nSorry, we couldn\'t download the YouTube video.\n\nPossible reasons:\n• Private video\n• Age restricted content\n• Video not available\n• Invalid link\n\nPlease try another link.' 
        });
    }
}
