/**
 * File: src/handler.js
 * MAINUL-X Downloader Bot
 * Author: Md. Mainul Islam (MAINUL-X)
 */

import { userState } from "./userState.js"
import { handleCommands } from "./commands/commands.js"

import { handleYouTubeDownloader } from "./features/youtube.js"
import { handleFacebookDownloader } from "./features/facebook.js"
import { handleInstagramDownloader } from "./features/instagram.js"
import { handleTikTokDownloader } from "./features/tiktok.js"

import { validateUrl } from "./utils/validateUrl.js"
import { sendDownloaderMenu } from "./utils/menu.js"

/* =========================
WELCOME TRACKER
========================= */

const welcomeTracker = new Map()

function shouldSendWelcome(user){

const today = new Date().toDateString()
const last = welcomeTracker.get(user)

if(last !== today){
welcomeTracker.set(user,today)
return true
}

return false
}

/* =========================
DOWNLOAD QUEUE
========================= */

let queue = []
let processing = false

async function runQueue(){

if(processing) return
if(queue.length === 0) return

processing = true

const job = queue.shift()

try{
await job()
}catch(err){
console.log("Queue error:",err)
}

processing = false
runQueue()

}

/* =========================
TYPING EFFECT
========================= */

async function typing(sock,jid){

try{

await sock.sendPresenceUpdate("composing",jid)

await new Promise(r=>setTimeout(r,700))

await sock.sendPresenceUpdate("paused",jid)

}catch{}

}

/* =========================
MAIN HANDLER
========================= */

export async function handler(sock,msg){

if(!msg?.message) return

const from = msg.key.remoteJid

/* AUTO READ */

try{
await sock.readMessages([msg.key])
}catch{}

const state = userState.get(from) || {step:"start"}

const text =
msg.message?.conversation ||
msg.message?.extendedTextMessage?.text ||
msg.message?.imageMessage?.caption ||
msg.message?.videoMessage?.caption ||
""

const lower = text.toLowerCase().trim()

/* =========================
STEP TIMEOUT
========================= */

if(state.step && state.time){

const diff = Date.now() - state.time

if(diff > 60000){

userState.set(from,{step:"menuMain"})

await sock.sendMessage(from,{
text:"⌛ Request expired. Please send command again."
})

return

}

}

/* =========================
WELCOME MESSAGE
========================= */

if(shouldSendWelcome(from)){

await typing(sock,from)

await sock.sendMessage(from,{
text:`👋 Welcome to *MAINUL - X DOWNLOADER BOT*

Send a video link directly or press Start.

📥 Supported Platforms
• YouTube
• Facebook
• Instagram
• TikTok`,
buttons:[
{
buttonId:"start_menu",
buttonText:{displayText:"🚀 Start"},
type:1
}
],
headerType:1
})

return

}

/* =========================
START BUTTON
========================= */

if(msg.message?.buttonsResponseMessage){

const id = msg.message.buttonsResponseMessage.selectedButtonId

if(id === "start_menu"){

await typing(sock,from)
await sendDownloaderMenu(sock,from)

return

}

if(id === "cancel_download"){

userState.set(from,{step:"menuMain"})

await sock.sendMessage(from,{
text:"❌ Download cancelled."
})

return

}

}

/* =========================
START / MENU TEXT
========================= */

if(lower === "start" || lower === "menu"){

await typing(sock,from)
await sendDownloaderMenu(sock,from)

return

}

/* =========================
COMMAND SYSTEM
========================= */

try{
if(await handleCommands(sock,from,lower)) return
}catch(err){
console.log("Command error:",err)
}

/* =========================
SMART PLATFORM DETECT
========================= */

if(validateUrl(text,"youtube")){

queue.push(async()=>{

await typing(sock,from)

await sock.sendMessage(from,{
text:"🎬 Detected: YouTube Video\n⬇ Starting download..."
})

await handleYouTubeDownloader(sock,from,text)

})

runQueue()
return

}

if(validateUrl(text,"facebook")){

queue.push(async()=>{

await typing(sock,from)

await sock.sendMessage(from,{
text:"📘 Detected: Facebook Video\n⬇ Starting download..."
})

await handleFacebookDownloader(sock,from,text)

})

runQueue()
return

}

if(validateUrl(text,"instagram")){

queue.push(async()=>{

await typing(sock,from)

await sock.sendMessage(from,{
text:"📸 Detected: Instagram Video\n⬇ Starting download..."
})

await handleInstagramDownloader(sock,from,text)

})

runQueue()
return

}

if(validateUrl(text,"tiktok")){

queue.push(async()=>{

await typing(sock,from)

await sock.sendMessage(from,{
text:"🎵 Detected: TikTok Video\n⬇ Starting download..."
})

await handleTikTokDownloader(sock,from,text)

})

runQueue()
return

}

/* =========================
INTERACTIVE MENU RESPONSE
========================= */

let rowId

try{

if(msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage){

rowId = JSON.parse(
msg.message.interactiveResponseMessage
.nativeFlowResponseMessage.paramsJson
).id

}

}catch{}

/* =========================
MENU BUTTONS
========================= */

if(rowId){

switch(rowId){

case "yt_downloader":

userState.set(from,{
step:"yt_wait_url",
time:Date.now()
})

await sock.sendMessage(from,{
text:"📺 Send YouTube video link\n\n⏳ Time limit: 60 seconds",
buttons:[
{
buttonId:"cancel_download",
buttonText:{displayText:"❌ Cancel"},
type:1
}
],
headerType:1
})

return

case "fb_downloader":

userState.set(from,{
step:"fb_wait_url",
time:Date.now()
})

await sock.sendMessage(from,{
text:"📘 Send Facebook video link\n\n⏳ Time limit: 60 seconds",
buttons:[
{
buttonId:"cancel_download",
buttonText:{displayText:"❌ Cancel"},
type:1
}
],
headerType:1
})

return

case "ig_downloader":

userState.set(from,{
step:"ig_wait_url",
time:Date.now()
})

await sock.sendMessage(from,{
text:"📸 Send Instagram video link\n\n⏳ Time limit: 60 seconds",
buttons:[
{
buttonId:"cancel_download",
buttonText:{displayText:"❌ Cancel"},
type:1
}
],
headerType:1
})

return

case "tt_downloader":

userState.set(from,{
step:"tt_wait_url",
time:Date.now()
})

await sock.sendMessage(from,{
text:"🎵 Send TikTok video link\n\n⏳ Time limit: 60 seconds",
buttons:[
{
buttonId:"cancel_download",
buttonText:{displayText:"❌ Cancel"},
type:1
}
],
headerType:1
})

return

}

}

/* =========================
STEP HANDLER
========================= */

switch(state.step){

case "yt_wait_url":

if(!validateUrl(text,"youtube")){
await sock.sendMessage(from,{text:"❌ Invalid YouTube link"})
return
}

queue.push(async()=>{

await handleYouTubeDownloader(sock,from,text)

})

runQueue()

userState.set(from,{step:"menuMain"})
return


case "fb_wait_url":

if(!validateUrl(text,"facebook")){
await sock.sendMessage(from,{text:"❌ Invalid Facebook link"})
return
}

queue.push(async()=>{

await handleFacebookDownloader(sock,from,text)

})

runQueue()

userState.set(from,{step:"menuMain"})
return


case "ig_wait_url":

if(!validateUrl(text,"instagram")){
await sock.sendMessage(from,{text:"❌ Invalid Instagram link"})
return
}

queue.push(async()=>{

await handleInstagramDownloader(sock,from,text)

})

runQueue()

userState.set(from,{step:"menuMain"})
return


case "tt_wait_url":

if(!validateUrl(text,"tiktok")){
await sock.sendMessage(from,{text:"❌ Invalid TikTok link"})
return
}

queue.push(async()=>{

await handleTikTokDownloader(sock,from,text)

})

runQueue()

userState.set(from,{step:"menuMain"})
return

}

}
