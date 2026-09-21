/**
 * ==========================================================
 *   VarBotGroupandchannel - WhatsApp Bot VarCodexz
 *   Pairing Code | Welcome Group + Channel | Multi Fitur
 * ==========================================================
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  delay,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");

const P = require("pino");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const gTTS = require("gtts");
const axios = require("axios");
const moment = require("moment-timezone");
const chalk = require("chalk");

// ================== KONFIGURASI ==================
const CONFIG = {
  botName: "VarBotGroupandchannel",
  communityName: "VarCodexz",
  groupLink: "https://chat.whatsapp.com/Ge6b45SbFi8383qi7ilZYz",
  owner: ["628xxxxxxxxxx"],
  prefix: ["!", ".", "#", "/"],
  welcomeMp3: path.join(__dirname, "welcome.mp3"),
  sessionDir: path.join(__dirname, "session"),
  dataDir: path.join(__dirname, "data"),
  timezone: "Asia/Jakarta",
  voiceText:
    "Welcome to VarCodexz! Thank you for joining. Don't forget to stay tuned for information and secret prizes!",
};

// ================== DATABASE ==================
const DB_FILE = path.join(CONFIG.dataDir, "database.json");
if (!fs.existsSync(CONFIG.dataDir)) fs.mkdirSync(CONFIG.dataDir, { recursive: true });

let db = {
  users: {},
  groups: {},
  premium: [],
  banned: [],
  notes: {},
  stats: { messages: 0, commands: 0, startTime: Date.now() },
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, "utf-8")) };
    }
  } catch (e) {
    console.error("Gagal load DB:", e.message);
  }
}
function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("Gagal save DB:", e.message);
  }
}
loadDB();
setInterval(saveDB, 30000);

// ================== LOGGER ==================
const logger = P({ level: "silent" });

const log = {
  info: (m) => console.log(chalk.cyan(`[INFO] ${m}`)),
  ok: (m) => console.log(chalk.green(`[OK] ${m}`)),
  warn: (m) => console.log(chalk.yellow(`[WARN] ${m}`)),
  err: (m) => console.log(chalk.red(`[ERR] ${m}`)),
  msg: (m) => console.log(chalk.magenta(`[MSG] ${m}`)),
};

// ================== TANYA NOMOR ==================
function askPhoneNumber() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    console.log(chalk.bold.cyan("\n╔══════════════════════════════════════════╗"));
    console.log(chalk.bold.cyan("║   📱 VarBotGroupandchannel - Setup       ║"));
    console.log(chalk.bold.cyan("╚══════════════════════════════════════════╝"));
    console.log(chalk.yellow("Masukkan nomor WhatsApp bot"));
    console.log(chalk.yellow("Format: 628xxxxxxxxxx (tanpa + / 0 depan)"));
    console.log(chalk.yellow("Contoh: 628123456789\n"));
    rl.question(chalk.green("➡️  Nomor HP: "), (answer) => {
      rl.close();
      resolve(answer.trim().replace(/[^0-9]/g, ""));
    });
  });
}

// ================== AUTO-GENERATE welcome.mp3 ==================
async function generateWelcomeVoice() {
  if (fs.existsSync(CONFIG.welcomeMp3)) {
    log.ok("welcome.mp3 sudah ada, skip generate.");
    return;
  }
  log.info("Generating welcome.mp3 dengan gTTS...");
  return new Promise((resolve, reject) => {
    const gtts = new gTTS(CONFIG.voiceText, "en");
    gtts.save(CONFIG.welcomeMp3, (err) => {
      if (err) {
        log.err("Gagal generate welcome.mp3: " + err.message);
        reject(err);
      } else {
        log.ok("welcome.mp3 berhasil dibuat!");
        resolve();
      }
    });
  });
}

// ================== KIRIM VN ==================
async function sendVoiceNote(sock, jid) {
  try {
    if (!fs.existsSync(CONFIG.welcomeMp3)) return;
    await sock.sendMessage(jid, {
      audio: fs.readFileSync(CONFIG.welcomeMp3),
      mimetype: "audio/mp4",
      ptt: true,
      fileName: "welcome.mp3",
    });
    log.msg(`VN terkirim ke ${jid}`);
  } catch (e) {
    log.err("Gagal kirim VN: " + e.message);
  }
}

// ================== KIRIM VN KE CHANNEL ==================
async function sendWelcomeToChannel(sock, channelJid, customText) {
  try {
    log.info(`Kirim VN ke channel: ${channelJid}`);
    if (customText) {
      await sock.sendMessage(channelJid, { text: customText });
      await delay(1000);
    }
    await sock.sendMessage(channelJid, {
      audio: fs.readFileSync(CONFIG.welcomeMp3),
      mimetype: "audio/mp4",
      ptt: true,
    });
    log.ok(`VN terkirim ke channel ${channelJid}`);
  } catch (e) {
    log.err("Gagal kirim VN ke channel: " + e.message);
  }
}

// ================== HELPER ==================
function parseCommand(text) {
  if (!text) return null;
  const prefix = CONFIG.prefix.find((p) => text.startsWith(p));
  if (!prefix) return null;
  const args = text.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();
  return { command, args, text: args.join(" "), prefix };
}

function getUser(jid) {
  if (!db.users[jid]) {
    db.users[jid] = {
      name: jid.split("@")[0],
      warnings: 0,
      xp: 0,
      level: 1,
      money: 1000,
      lastDaily: 0,
      registered: false,
      age: null,
    };
  }
  return db.users[jid];
}

function getGroup(jid) {
  if (!db.groups[jid]) {
    db.groups[jid] = {
      antilink: false,
      welcome: true,
      antispam: false,
      mute: false,
      onlyAdmin: false,
    };
  }
  return db.groups[jid];
}

function isOwner(jid) {
  return CONFIG.owner.includes(jid.split("@")[0].split(":")[0]);
}

async function isAdmin(sock, groupJid, userJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const p = meta.participants.find((x) => x.id === userJid);
    return p?.admin === "admin" || p?.admin === "superadmin";
  } catch {
    return false;
  }
}

async function getBuffer(url) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(res.data);
}

const spamCache = new Map();
// ================== MAIN BOT ==================
let sock;
let OWNER_NUMBER = null; // Diisi saat RUN

async function startBot() {
  await generateWelcomeVoice();

  // ==== TANYA NOMOR BOT SAAT RUN ====
  if (!OWNER_NUMBER) {
    OWNER_NUMBER = await askPhoneNumber();
    if (!OWNER_NUMBER || OWNER_NUMBER.length < 10) {
      log.err("Nomor tidak valid. Restart bot.");
      process.exit(1);
    }
    CONFIG.owner = [OWNER_NUMBER];
    log.ok(`Owner diset: ${OWNER_NUMBER}`);
  }

  const { state, saveCreds } = await useMultiFileAuthState(CONFIG.sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  const isRegistered = fs.existsSync(path.join(CONFIG.sessionDir, "creds.json"));

  sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: ["VarBotGroupandchannel", "Chrome", "1.0.0"],
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    getMessage: async () => ({ conversation: "" }),
  });

  // ==== PAIRING CODE ====
  if (!sock.authState.creds.registered && !isRegistered) {
    await delay(1500);
    try {
      const code = await sock.requestPairingCode(OWNER_NUMBER);
      const formatted = code?.match(/.{1,4}/g)?.join("-") || code;
      console.log(chalk.bold.green("\n╔══════════════════════════════════════════╗"));
      console.log(chalk.bold.green("║          🔑 PAIRING CODE KAMU            ║"));
      console.log(chalk.bold.green("╚══════════════════════════════════════════╝"));
      console.log(chalk.bold.yellow(`\n         ➡️  ${formatted}  ⬅️\n`));
      console.log(chalk.cyan("📲 Cara pakai:"));
      console.log(chalk.white("   1. Buka WhatsApp di HP"));
      console.log(chalk.white("   2. Settings > Linked Devices > Link a Device"));
      console.log(chalk.white("   3. Pilih 'Link with phone number instead'"));
      console.log(chalk.white("   4. Masukkan kode di atas\n"));
    } catch (e) {
      log.err("Gagal request pairing code: " + e.message);
      process.exit(1);
    }
  }

  sock.ev.on("creds.update", saveCreds);

  // ==== CONNECTION UPDATE ====
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reconnect = code !== DisconnectReason.loggedOut;
      log.warn(`Koneksi terputus (code: ${code}). ${reconnect ? "Reconnecting..." : "Logged out."}`);
      if (reconnect) startBot();
      else log.err("Bot logged out. Hapus folder session lalu RUN ulang.");
    } else if (connection === "open") {
      console.log(chalk.bold.green("\n╔══════════════════════════════════════════╗"));
      console.log(chalk.bold.green("║ ✅ VarBotGroupandchannel ONLINE!         ║"));
      console.log(chalk.bold.green("╚══════════════════════════════════════════╝"));
      console.log(chalk.cyan(`👑 Owner    : ${OWNER_NUMBER}`));
      console.log(chalk.cyan(`👥 Komunitas: ${CONFIG.communityName}`));
      console.log(chalk.cyan(`🔗 Group    : ${CONFIG.groupLink}`));
      console.log(chalk.cyan(`⏰ Waktu    : ${moment().tz(CONFIG.timezone).format("DD/MM/YYYY HH:mm:ss")}`));
      console.log(chalk.cyan(`📢 Mode     : HANYA GRUP (DM diabaikan)\n`));

      // ==== KIRIM PESAN VERIFIKASI KE OWNER ====
      try {
        const ownerJid = `${OWNER_NUMBER}@s.whatsapp.net`;
        await sock.sendMessage(ownerJid, {
          text:
            `╭━━━「 *BOT ONLINE* 」━━━╮\n\n` +
            `✅ *VarBotGroupandchannel* berhasil terhubung!\n\n` +
            `👑 Owner  : +${OWNER_NUMBER}\n` +
            `👥 Komunitas: ${CONFIG.communityName}\n` +
            `🔗 Group  : ${CONFIG.groupLink}\n` +
            `⏰ Waktu  : ${moment().tz(CONFIG.timezone).format("DD/MM/YYYY HH:mm:ss")}\n\n` +
            `📌 *INFO PENTING:*\n` +
            `• Bot ini *TIDAK membalas chat pribadi (DM)*\n` +
            `• Semua command hanya bisa dipakai di *grup*\n` +
            `• Owner & Admin grup bisa atur bot\n` +
            `• Kirim ${CONFIG.prefix[0]}menu di grup untuk lihat daftar command\n\n` +
            `╰━━━━━━━━━━━━━━━━━━━━╯`,
        });
        log.ok("Pesan verifikasi terkirim ke owner.");
      } catch (e) {
        log.warn("Gagal kirim pesan ke owner: " + e.message);
      }
    }
  });

  // ==== WELCOME GROUP ====
  sock.ev.on("group-participants.update", async (update) => {
    try {
      const { id, participants, action } = update;
      const group = getGroup(id);

      if (action === "add") {
        for (const p of participants) {
          const tag = `@${p.split("@")[0]}`;
          if (group.welcome) {
            const text =
              `╭━━━「 *WELCOME* 」━━━╮\n\n` +
              `👋 Halo ${tag}!\n\n` +
              `Selamat datang di *${CONFIG.communityName}* 🚀\n\n` +
              `📌 *Peraturan:*\n` +
              `• No spam & toxic\n` +
              `• No link sembarangan\n` +
              `• Saling menghormati\n\n` +
              `🎁 Stay tune untuk info & hadiah rahasia!\n\n` +
              `╰━━━━━━━━━━━━━━━━━━━━╯`;
            await sock.sendMessage(id, { text, mentions: [p] });
            await delay(1500);
            await sendVoiceNote(sock, id);
          }
        }
      }

      if (action === "remove") {
        for (const p of participants) {
          const tag = `@${p.split("@")[0]}`;
          await sock.sendMessage(id, {
            text: `👋 Selamat tinggal ${tag}...\nSemoga sukses di tempat lain! 🌟`,
            mentions: [p],
          });
        }
      }

      if (action === "promote") {
        for (const p of participants) {
          const tag = `@${p.split("@")[0]}`;
          await sock.sendMessage(id, {
            text: `🎉 Selamat ${tag}!\nKamu sekarang menjadi *ADMIN* di grup ini. 👑\nKamu bisa atur bot dengan ${CONFIG.prefix[0]}menu`,
            mentions: [p],
          });
        }
      }

      if (action === "demote") {
        for (const p of participants) {
          const tag = `@${p.split("@")[0]}`;
          await sock.sendMessage(id, {
            text: `⚠️ ${tag} telah diturunkan dari admin.`,
            mentions: [p],
          });
        }
      }
    } catch (e) {
      log.err("group-participants.update: " + e.message);
    }
  });

  // ==== MESSAGE HANDLER ====
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue;

        const from = msg.key.remoteJid;

        // ============================================
        // ❌ TOLAK SEMUA CHAT PRIBADI (DM)
        // ============================================
        const isGroup = from.endsWith("@g.us");
        const isNewsletter = from.endsWith("@newsletter");
        const isStatus = from === "status@broadcast";

        if (!isGroup && !isNewsletter && !isStatus) {
          // Chat pribadi — abaikan total
          log.info(`[DM DIABAIKAN] dari ${from}`);
          continue;
        }

        // Kalau newsletter atau status, skip juga (kecuali mau log)
        if (isNewsletter || isStatus) continue;

        const sender = msg.key.participant;
        const senderNumber = sender.split("@")[0].split(":")[0];

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption ||
          "";

        db.stats.messages++;

        // Anti link
        if (getGroup(from).antilink && !(await isAdmin(sock, from, sender))) {
          if (/chat\.whatsapp\.com|http:\/\/|https:\/\//i.test(text)) {
            await sock.sendMessage(from, { delete: msg.key });
            await sock.sendMessage(from, {
              text: `🚫 @${senderNumber} dilarang kirim link!`,
              mentions: [sender],
            });
            continue;
          }
        }

        // Anti spam
        if (getGroup(from).antispam && !(await isAdmin(sock, from, sender))) {
          const now = Date.now();
          const key = `${from}_${sender}`;
          const cache = spamCache.get(key) || [];
          const recent = cache.filter((t) => now - t < 5000);
          recent.push(now);
          spamCache.set(key, recent);

          if (recent.length > 5) {
            await sock.sendMessage(from, { delete: msg.key });
            const u = getUser(sender);
            u.warnings++;
            if (u.warnings >= 3) {
              await sock.sendMessage(from, {
                text: `🚫 @${senderNumber} di-kick karena spam!`,
                mentions: [sender],
              });
              await sock.groupParticipantsUpdate(from, [sender], "remove");
              u.warnings = 0;
            } else {
              await sock.sendMessage(from, {
                text: `⚠️ @${senderNumber} warning ${u.warnings}/3 (spam)`,
                mentions: [sender],
              });
            }
            continue;
          }
        }

        if (db.banned.includes(senderNumber) && !isOwner(sender)) {
          await sock.sendMessage(from, { delete: msg.key });
          continue;
        }

        const cmd = parseCommand(text);
        if (!cmd) continue;

        db.stats.commands++;
        const { command, args, text: cmdText } = cmd;
        const reply = (t, opts = {}) =>
          sock.sendMessage(from, { text: t, ...opts }, { quoted: msg });

        log.msg(`${senderNumber} → ${command} ${args.join(" ")}`);

        switch (command) {
          case "menu":
          case "help": {
            reply(`╭━━━「 *${CONFIG.botName}* 」━━━╮

📌 *GENERAL*
• ${CONFIG.prefix[0]}menu
• ${CONFIG.prefix[0]}ping
• ${CONFIG.prefix[0]}info
• ${CONFIG.prefix[0]}owner
• ${CONFIG.prefix[0]}stats

👤 *USER*
• ${CONFIG.prefix[0]}profile
• ${CONFIG.prefix[0]}daily
• ${CONFIG.prefix[0]}level
• ${CONFIG.prefix[0]}leaderboard
• ${CONFIG.prefix[0]}register <nama>.<umur>

🛠️ *TOOLS*
• ${CONFIG.prefix[0]}tts <text>
• ${CONFIG.prefix[0]}translate <lang> <text>
• ${CONFIG.prefix[0]}weather <kota>
• ${CONFIG.prefix[0]}shortlink <url>
• ${CONFIG.prefix[0]}qrcode <text>

🎮 *FUN*
• ${CONFIG.prefix[0]}quote
• ${CONFIG.prefix[0]}joke
• ${CONFIG.prefix[0]}fact
• ${CONFIG.prefix[0]}dadu
• ${CONFIG.prefix[0]}slot
• ${CONFIG.prefix[0]}8ball <tanya>

👥 *GROUP (Admin)*
• ${CONFIG.prefix[0]}tagall <pesan>
• ${CONFIG.prefix[0]}kick @user
• ${CONFIG.prefix[0]}add 628xxx
• ${CONFIG.prefix[0]}promote @user
• ${CONFIG.prefix[0]}demote @user
• ${CONFIG.prefix[0]}antilink on/off
• ${CONFIG.prefix[0]}antispam on/off
• ${CONFIG.prefix[0]}welcome on/off
• ${CONFIG.prefix[0]}linkgc

📝 *NOTES*
• ${CONFIG.prefix[0]}save <nama> <isi>
• ${CONFIG.prefix[0]}get <nama>
• ${CONFIG.prefix[0]}del <nama>
• ${CONFIG.prefix[0]}listnotes

📢 *CHANNEL* (Owner)
• ${CONFIG.prefix[0]}vnchannel <jid>
• ${CONFIG.prefix[0]}sendchannel <jid> <text>

👑 *OWNER*
• ${CONFIG.prefix[0]}broadcast <text>
• ${CONFIG.prefix[0]}ban @user
• ${CONFIG.prefix[0]}unban @user
• ${CONFIG.prefix[0]}restart

╰━━━━━━━━━━━━━━━━━━━━╯`);
            break;
          }

          case "ping": {
            const start = Date.now();
            await reply("🏓 Pinging...");
            const lat = Date.now() - start;
            reply(`🏓 Pong!\n⚡ Latency: *${lat}ms*\n⏰ ${moment().tz(CONFIG.timezone).format("HH:mm:ss")}`);
            break;
          }

          case "info": {
            reply(`╭━━━「 *BOT INFO* 」━━━╮
│ 🤖 Nama     : ${CONFIG.botName}
│ 👥 Komunitas: ${CONFIG.communityName}
│ 🔗 Group    : ${CONFIG.groupLink}
│ ⏰ Zona     : ${CONFIG.timezone}
│ 📊 Pesan    : ${db.stats.messages}
│ 🎯 Command  : ${db.stats.commands}
│ 👤 User     : ${Object.keys(db.users).length}
│ 📢 Mode     : HANYA GRUP
╰━━━━━━━━━━━━━━━━╯`);
            break;
          }

          case "owner": {
            reply(`👑 *Owner ${CONFIG.communityName}*\n\n📱 wa.me/${OWNER_NUMBER}`);
            break;
          }

          case "stats": {
            const uptime = Date.now() - db.stats.startTime;
            const h = Math.floor(uptime / 3600000);
            const m = Math.floor((uptime % 3600000) / 60000);
            reply(`📊 *BOT STATISTICS*
│ ⏱️ Uptime   : ${h}j ${m}m
│ 💬 Messages: ${db.stats.messages}
│ 🎯 Commands: ${db.stats.commands}
│ 👤 Users   : ${Object.keys(db.users).length}
│ 🏘️ Groups  : ${Object.keys(db.groups).length}
│ ⭐ Premium : ${db.premium.length}
│ 🚫 Banned  : ${db.banned.length}`);
            break;
          }

          case "profile":
          case "me": {
            const u = getUser(sender);
            reply(`╭━━━「 *PROFILE* 」━━━╮
│ 👤 Nama   : ${u.name}
│ 🎂 Umur   : ${u.age || "-"}
│ ⭐ Level  : ${u.level}
│ ✨ XP     : ${u.xp}
│ 💰 Money  : ${u.money}
│ ⚠️ Warning: ${u.warnings}/3
╰━━━━━━━━━━━━━━━━╯`);
            break;
          }

          case "register": {
            const u = getUser(sender);
            if (u.registered) return reply("❌ Kamu sudah terdaftar!");
            const [name, age] = cmdText.split(".");
            if (!name || !age)
              return reply(`📝 Cara: ${CONFIG.prefix[0]}register Nama.Umur\nContoh: ${CONFIG.prefix[0]}register Budi.17`);
            u.name = name.trim();
            u.age = parseInt(age);
            u.registered = true;
            reply(`✅ Berhasil daftar!\n👤 Nama: ${u.name}\n🎂 Umur: ${u.age}`);
            break;
          }

          case "daily": {
            const u = getUser(sender);
            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000;
            if (now - u.lastDaily < cooldown) {
              const sisa = cooldown - (now - u.lastDaily);
              const h = Math.floor(sisa / 3600000);
              const m = Math.floor((sisa % 3600000) / 60000);
              return reply(`⏰ Kamu sudah daily hari ini!\nTunggu ${h}j ${m}m lagi.`);
            }
            const reward = Math.floor(Math.random() * 500) + 500;
            u.money += reward;
            u.xp += 50;
            u.lastDaily = now;
            reply(`🎁 *DAILY REWARD!*\n💰 +${reward} money\n✨ +50 XP\n💵 Total: ${u.money}`);
            break;
          }

          case "level": {
            const u = getUser(sender);
            const nextLevel = u.level * 100;
            const progress = Math.floor(((u.xp % nextLevel) / nextLevel) * 10);
            const bar = "█".repeat(progress) + "░".repeat(10 - progress);
            reply(`╭━━━「 *LEVEL* 」━━━╮
│ ⭐ Level: ${u.level}
│ ✨ XP   : ${u.xp}
│ 📊 [${bar}] ${Math.floor(((u.xp % nextLevel) / nextLevel) * 100)}%
╰━━━━━━━━━━━━━━━━╯`);
            break;
          }

          case "leaderboard":
          case "lb": {
            const sorted = Object.entries(db.users)
              .sort((a, b) => b[1].money - a[1].money)
              .slice(0, 10);
            let text = "🏆 *TOP 10 RICHEST*\n\n";
            sorted.forEach(([jid, u], i) => {
              const medal = ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
              text += `${medal} ${u.name} — 💰 ${u.money}\n`;
            });
            reply(text);
            break;
          }

          case "tts": {
            if (!cmdText) return reply(`📝 Cara: ${CONFIG.prefix[0]}tts Halo semua`);
            try {
              const tmp = path.join(CONFIG.dataDir, `tts_${Date.now()}.mp3`);
              const gtts = new gTTS(cmdText, "id");
              gtts.save(tmp, async (err) => {
                if (err) return reply("❌ Gagal bikin TTS");
                await sock.sendMessage(
                  from,
                  {
                    audio: fs.readFileSync(tmp),
                    mimetype: "audio/mp4",
                    ptt: true,
                  },
                  { quoted: msg }
                );
                fs.unlinkSync(tmp);
              });
            } catch (e) {
              reply("❌ Error: " + e.message);
            }
            break;
          }

          case "translate":
          case "trt": {
            const [lang, ...rest] = args;
            const q = rest.join(" ");
            if (!lang || !q) return reply(`📝 Cara: ${CONFIG.prefix[0]}translate en Halo dunia`);
            try {
              const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(q)}`;
              const res = await axios.get(url);
              const result = res.data[0].map((x) => x[0]).join("");
              reply(`🌐 *Translate (${lang})*\n\n${result}`);
            } catch (e) {
              reply("❌ Gagal translate: " + e.message);
            }
            break;
          }

          case "weather": {
            if (!cmdText) return reply(`📝 Cara: ${CONFIG.prefix[0]}weather Jakarta`);
            try {
              const url = `https://wttr.in/${encodeURIComponent(cmdText)}?format=j1`;
              const res = await axios.get(url);
              const c = res.data.current_condition[0];
              reply(`🌤️ *CUACA ${cmdText.toUpperCase()}*\n\n🌡️ Suhu: ${c.temp_C}°C\n💧 Kelembapan: ${c.humidity}%\n💨 Angin: ${c.windspeedKmph} km/h\n☁️ Kondisi: ${c.weatherDesc[0].value}`);
            } catch {
              reply("❌ Kota tidak ditemukan");
            }
            break;
          }

          case "shortlink":
          case "short": {
            if (!cmdText) return reply(`📝 Cara: ${CONFIG.prefix[0]}shortlink https://google.com`);
            try {
              const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(cmdText)}`);
              reply(`🔗 *Short URL*\n\n${res.data}`);
            } catch {
              reply("❌ Gagal mempersingkat URL");
            }
            break;
          }

          case "qrcode":
          case "qr": {
            if (!cmdText) return reply(`📝 Cara: ${CONFIG.prefix[0]}qrcode text`);
            const url = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(cmdText)}`;
            const buf = await getBuffer(url);
            await sock.sendMessage(from, { image: buf, caption: `📱 QR: ${cmdText}` }, { quoted: msg });
            break;
          }

          case "quote": {
            try {
              const res = await axios.get("https://api.quotable.io/random");
              reply(`💬 *"${res.data.content}"*\n\n— ${res.data.author}`);
            } catch {
              reply("❌ Gagal ambil quote");
            }
            break;
          }

          case "joke": {
            try {
              const res = await axios.get("https://official-joke-api.appspot.com/random_joke");
              reply(`😂 *JOKE*\n\n${res.data.setup}\n\n👉 ${res.data.punchline}`);
            } catch {
              reply("❌ Gagal ambil joke");
            }
            break;
          }

          case "fact": {
            try {
              const res = await axios.get("https://uselessfacts.jsph.pl/api/v2/facts/random");
              reply(`🧠 *FAKTA UNIK*\n\n${res.data.text}`);
            } catch {
              reply("❌ Gagal ambil fakta");
            }
            break;
          }

          case "dadu": {
            const n = Math.floor(Math.random() * 6) + 1;
            reply(`🎲 Dadu: *${n}*`);
            break;
          }

          case "slot": {
            const emojis = ["🍒", "🍋", "🍊", "🍇", "⭐", "💎"];
            const r = () => emojis[Math.floor(Math.random() * emojis.length)];
            const a = r(), b = r(), c = r();
            const win = a === b && b === c;
            reply(`🎰 *SLOT MACHINE*\n\n[ ${a} | ${b} | ${c} ]\n\n${win ? "🎉 JACKPOT!" : "😢 Coba lagi!"}`);
            break;
          }

          case "8ball": {
            if (!cmdText) return reply(`📝 Cara: ${CONFIG.prefix[0]}8ball Apakah aku jodoh?`);
            const answers = [
              "Ya ✅", "Tidak ❌", "Mungkin 🤔", "Tentu saja! 🎉",
              "Jangan harap 😅", "Coba lagi nanti ⏰", "Pasti! 💯", "Ragu-ragu 🤷",
            ];
            const ans = answers[Math.floor(Math.random() * answers.length)];
            reply(`🎱 *Pertanyaan:* ${cmdText}\n\n*Jawaban:* ${ans}`);
            break;
          }

          case "tagall": {
            if (!(await isAdmin(sock, from, sender)) && !isOwner(sender))
              return reply("❌ Cuma admin yang bisa pakai!");
            const meta = await sock.groupMetadata(from);
            const mentions = meta.participants.map((p) => p.id);
            const list = mentions.map((m) => `@${m.split("@")[0]}`).join("\n");
            await sock.sendMessage(from, {
              text: `📢 *ANNOUNCEMENT*\n${cmdText || "Attention everyone!"}\n\n${list}`,
              mentions,
            });
            break;
          }

          case "kick": {
            if (!(await isAdmin(sock, from, sender)) && !isOwner(sender))
              return reply("❌ Cuma admin yang bisa pakai!");
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (!mentioned.length) return reply("❌ Tag user yang mau di-kick!");
            await sock.groupParticipantsUpdate(from, mentioned, "remove");
            reply(`✅ ${mentioned.length} user di-kick.`);
            break;
          }

          case "promote": {
            if (!(await isAdmin(sock, from, sender)) && !isOwner(sender))
              return reply("❌ Cuma admin yang bisa pakai!");
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (!mentioned.length) return reply("❌ Tag user yang mau di-promote!");
            await sock.groupParticipantsUpdate(from, mentioned, "promote");
            reply(`✅ ${mentioned.length} user jadi admin.`);
            break;
          }

          case "demote": {
            if (!(await isAdmin(sock, from, sender)) && !isOwner(sender))
              return reply("❌ Cuma admin yang bisa pakai!");
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (!mentioned.length) return reply("❌ Tag user yang mau di-demote!");
            await sock.groupParticipantsUpdate(from, mentioned, "demote");
            reply(`✅ ${mentioned.length} user di-demote.`);
            break;
          }

          case "add": {
            if (!(await isAdmin(sock, from, sender)) && !isOwner(sender))
              return reply("❌ Cuma admin yang bisa pakai!");
            const number = cmdText.replace(/[^0-9]/g, "");
            if (!number) return reply(`📝 Cara: ${CONFIG.prefix[0]}add 628123456789`);
            await sock.groupParticipantsUpdate(from, [`${number}@s.whatsapp.net`], "add");
            reply(`✅ Berhasil invite ${number}`);
            break;
          }

          case "antilink": {
            if (!(await isAdmin(sock, from, sender)) && !isOwner(sender))
              return reply("❌ Cuma admin yang bisa pakai!");
            const g = getGroup(from);
            const mode = args[0]?.toLowerCase();
            if (mode === "on") {
              g.antilink = true;
              reply("✅ Anti-link *AKTIF*");
            } else if (mode === "off") {
              g.antilink = false;
              reply("❌ Anti-link *MATI*");
            } else {
              reply(`📝 Cara: ${CONFIG.prefix[0]}antilink on/off`);
            }
            break;
          }

          case "antispam": {
            if (!(await isAdmin(sock, from, sender)) && !isOwner(sender))
              return reply("❌ Cuma admin yang bisa pakai!");
            const g = getGroup(from);
            const mode = args[0]?.toLowerCase();
            if (mode === "on") {
              g.antispam = true;
              reply("✅ Anti-spam *AKTIF*");
            } else if (mode === "off") {
              g.antispam = false;
              reply("❌ Anti-spam *MATI*");
            } else {
              reply(`📝 Cara: ${CONFIG.prefix[0]}antispam on/off`);
            }
            break;
          }

          case "welcome": {
            if (!(await isAdmin(sock, from, sender)) && !isOwner(sender))
              return reply("❌ Cuma admin yang bisa pakai!");
            const g = getGroup(from);
            const mode = args[0]?.toLowerCase();
            if (mode === "on") {
              g.welcome = true;
              reply("✅ Welcome *AKTIF*");
            } else if (mode === "off") {
              g.welcome = false;
              reply("❌ Welcome *MATI*");
            } else {
              reply(`📝 Cara: ${CONFIG.prefix[0]}welcome on/off`);
            }
            break;
          }

          case "linkgc":
          case "linkgrup": {
            try {
              const code = await sock.groupInviteCode(from);
              reply(`🔗 *Link Group:*\nhttps://chat.whatsapp.com/${code}`);
            } catch {
              reply("❌ Gagal ambil link. Pastikan bot admin!");
            }
            break;
          }

          case "save": {
            const [name, ...rest] = args;
            const content = rest.join(" ");
            if (!name || !content) return reply(`📝 Cara: ${CONFIG.prefix[0]}save nama isi catatan`);
            if (!db.notes[from]) db.notes[from] = {};
            db.notes[from][name.toLowerCase()] = content;
            reply(`✅ Note *${name}* disimpan!`);
            break;
          }

          case "get": {
            const name = args[0]?.toLowerCase();
            if (!name) return reply(`📝 Cara: ${CONFIG.prefix[0]}get nama`);
            const note = db.notes[from]?.[name];
            if (!note) return reply(`❌ Note *${name}* nggak ditemukan.`);
            reply(`📝 *${name}*\n\n${note}`);
            break;
          }

          case "del": {
            const name = args[0]?.toLowerCase();
            if (!name) return reply(`📝 Cara: ${CONFIG.prefix[0]}del nama`);
            if (db.notes[from]?.[name]) {
              delete db.notes[from][name];
              reply(`✅ Note *${name}* dihapus.`);
            } else {
              reply(`❌ Note *${name}* nggak ada.`);
            }
            break;
          }

          case "listnotes": {
            const notes = Object.keys(db.notes[from] || {});
            if (!notes.length) return reply("📭 Belum ada note di grup ini.");
            reply(`📝 *Daftar Notes:*\n\n${notes.map((n, i) => `${i + 1}. ${n}`).join("\n")}`);
            break;
          }

          case "vnchannel": {
            if (!isOwner(sender)) return reply("❌ Owner only!");
            const jid = args[0];
            if (!jid) return reply(`📝 Cara: ${CONFIG.prefix[0]}vnchannel xxxxx@newsletter`);
            await sendWelcomeToChannel(sock, jid);
            reply("✅ VN terkirim ke channel!");
            break;
          }

          case "sendchannel": {
            if (!isOwner(sender)) return reply("❌ Owner only!");
            const [jid, ...rest] = args;
            const content = rest.join(" ");
            if (!jid || !content) return reply(`📝 Cara: ${CONFIG.prefix[0]}sendchannel xxxxx@newsletter Halo semua`);
            try {
              await sock.sendMessage(jid, { text: content });
              reply("✅ Pesan terkirim ke channel!");
            } catch (e) {
              reply("❌ Gagal: " + e.message);
            }
            break;
          }

          case "broadcast": {
            if (!isOwner(sender)) return reply("❌ Owner only!");
            if (!cmdText) return reply(`📝 Cara: ${CONFIG.prefix[0]}broadcast Pesan`);
            const groups = Object.keys(db.groups);
            let sent = 0;
            for (const g of groups) {
              try {
                await sock.sendMessage(g, { text: `📢 *BROADCAST*\n\n${cmdText}` });
                sent++;
                await delay(1000);
              } catch {}
            }
            reply(`✅ Broadcast terkirim ke ${sent} grup.`);
            break;
          }

          case "ban": {
            if (!isOwner(sender)) return reply("❌ Owner only!");
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (!mentioned.length) return reply("❌ Tag user yang mau di-ban!");
            const num = mentioned[0].split("@")[0].split(":")[0];
            if (!db.banned.includes(num)) db.banned.push(num);
            reply(`🚫 ${num} dibanned.`);
            break;
          }

          case "unban": {
            if (!isOwner(sender)) return reply("❌ Owner only!");
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (!mentioned.length) return reply("❌ Tag user yang mau di-unban!");
            const num = mentioned[0].split("@")[0].split(":")[0];
            db.banned = db.banned.filter((b) => b !== num);
            reply(`✅ ${num} di-unban.`);
            break;
          }

          case "restart": {
            if (!isOwner(sender)) return reply("❌ Owner only!");
            reply("🔄 Restarting bot...");
            await delay(1500);
            process.exit(0);
          }

          default:
            break;
        }
      } catch (e) {
        log.err("message handler: " + e.message);
      }
    }
  });

  global.sock = sock;
  global.sendWelcomeToChannel = (jid, text) => sendWelcomeToChannel(sock, jid, text);

  return sock;
}

// ================== ERROR HANDLER ==================
process.on("uncaughtException", (err) => log.err("Uncaught: " + err.message));
process.on("unhandledRejection", (err) => log.err("Unhandled: " + (err?.message || err)));

// ================== JALANKAN ==================
console.log(chalk.bold.magenta("🚀 Memulai VarBotGroupandchannel..."));
startBot().catch((e) => {
  log.err("Gagal start bot: " + e.message);
  process.exit(1);
});
