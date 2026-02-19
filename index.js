// ============================================================
// CONFIGURACIÓN INICIAL Y DEPENDENCIAS
// ============================================================
require("dotenv").config();
 
const baileys = require("@whiskeysockets/baileys");
const makeWASocket = baileys.default;
const useMultiFileAuthState = baileys.useMultiFileAuthState;
const fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
const fs = require('fs');
const axios = require('axios');
 
const qrcode = require("qrcode-terminal");
const pino = require("pino");
const http = require("http");
const nodemailer = require("nodemailer");
 
// Servidor HTTP
http.createServer((req, res) => res.end("Bot activo")).listen(process.env.PORT || 4000);
 
// Configuración de IA Gemma
const GEMMA_API_URL = "https://alejandrott24-mi-gemma-servidor.hf.space/preguntar";
 
// ============================================================
// SISTEMA DE MENSAJES PROGRAMADOS AUTOMÁTICOS
// ============================================================
 
const TARGET_GROUP_ID = "120363321342714715@g.us";
 
const SCHEDULED_TIMES = [
     { hour: 12, minute: 15 },
     { hour: 16, minute: 30 },
     { hour: 20, minute: 0 }
];
 
let messagesSentToday = new Set();
 
const SCHEDULED_MESSAGE_TEXT = `📢 *¡REGISTRA TU NEGOCIO!* 📢
 
🔹 Únete a nuestro canal de WhatsApp:
https://whatsapp.com/channel/0029Vb638WkBqbrCCtfqDl3b
 
📝 Ingresa tus datos en nuestro formulario:
https://docs.google.com/forms/d/e/1FAIpQLScs0piRlqjGgGpTjgErf4qhm1CC87ItHHLf6DvouVydrwq_mQ/viewform?usp=header
 
✅ ¡Es rápido y sin costo!`;
 
async function sendScheduledMessage(sock, scheduleTime) {
     const now = new Date();
     const todayKey = now.toDateString();
     const timeKey = `${todayKey}-${scheduleTime.hour}:${scheduleTime.minute}`;
 
     if (messagesSentToday.has(timeKey)) return;
 
     console.log(`📤 Enviando mensaje programado (${scheduleTime.hour}:${scheduleTime.minute})...`);
     
     try {
         const imagePath = './Imagenes/LogotipoEmpresa.png';
         
         if (fs.existsSync(imagePath)) {
             await sock.sendMessage(TARGET_GROUP_ID, {
                 image: fs.readFileSync(imagePath),
                 caption: SCHEDULED_MESSAGE_TEXT
             });
             console.log("✅ Mensaje con imagen enviado exitosamente");
         } else {
             console.log("⚠️ Imagen no encontrada, enviando solo texto...");
             await sock.sendMessage(TARGET_GROUP_ID, { text: SCHEDULED_MESSAGE_TEXT });
         }
 
         messagesSentToday.add(timeKey);
         console.log(`✅ Mensaje enviado a las ${now.toLocaleTimeString()}`);
         
     } catch (error) {
         console.error("❌ Error al enviar mensaje programado:", error.message);
     }
}
 
function scheduleMessages(sock) {
     setInterval(() => {
         const now = new Date();
         const currentHour = now.getHours();
         const currentMinute = now.getMinutes();
         
         SCHEDULED_TIMES.forEach(scheduleTime => {
             if (currentHour === scheduleTime.hour && currentMinute === scheduleTime.minute) {
                 sendScheduledMessage(sock, scheduleTime);
             }
         });
         
         if (currentHour === 0 && currentMinute === 1) {
             messagesSentToday.clear();
             console.log("🔄 Registro de mensajes limpiado para nuevo día");
         }
         
     }, 60000);
 
     console.log("⏰ Mensajes programados activos en los siguientes horarios:");
     SCHEDULED_TIMES.forEach(time => {
         console.log(`     📅 ${time.hour.toString().padStart(2, '0')}:${time.minute.toString().padStart(2, '0')} hrs`);
     });
}
 
// ============================================================
// SISTEMA DE ENVÍO DE CORREOS ELECTRÓNICOS
// ============================================================
 
const CONTACT_EMAIL = process.env.CONTACT_EMAIL;
const SENDER_EMAIL = process.env.EMAIL_USER;
const SENDER_PASS = process.env.EMAIL_PASS;
 
const transporter = nodemailer.createTransport({
     service: 'gmail',
     auth: {
         user: SENDER_EMAIL,
         pass: SENDER_PASS
     }
});
 
async function sendEmail(subject, body) {
     try {
         await transporter.sendMail({
             from: `"Bot de Servicio" <${SENDER_EMAIL}>`,
             to: CONTACT_EMAIL,
             subject: subject,
             text: body,
         });
         console.log("✅ Correo enviado con éxito:", subject);
         return true;
     } catch (error) {
         console.error("❌ Error al enviar correo:", error.message);
         return false;
     }
}
 
// ============================================================
// FUNCIÓN PARA CONSULTAR IA GEMMA
// ============================================================
 
async function askGemma(mensaje) {
    try {
        const response = await axios.get(GEMMA_API_URL, {
            params: { mensaje },
            timeout: 30000 // Aumentado a 30 segundos
        });
        
        return response.data.respuesta || "Lo siento, no pude procesar tu mensaje.";
    } catch (error) {
        console.error("❌ Error al consultar Gemma:", error.message);
        return "Disculpa, estoy teniendo problemas técnicos. Intenta de nuevo en un momento.";
    }
}
 
// ============================================================
// FUNCIÓN PARA ENVIAR SALUDO INICIAL COMPLETO
// ============================================================
 
async function sendWelcomeGreeting(sock, remoteJid) {
    const files = {
        image: './Imagenes/LogotipoEmpresa.png',
        audio: './Vozsaludo.ogg'
    };
    
    try {
        if (fs.existsSync(files.image)) {
            await sock.sendMessage(remoteJid, {
                image: fs.readFileSync(files.image),
                caption: SALUDO_INICIAL_IMAGEN
            });
        } else {
            console.log("⚠️ Imagen no encontrada en:", files.image);
            await sock.sendMessage(remoteJid, { text: SALUDO_INICIAL_IMAGEN });
        }

        if (fs.existsSync(files.audio)) {
            await sock.sendMessage(remoteJid, {
                audio: { url: files.audio },
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            });
        }
    } catch (error) {
        console.error("❌ Error enviando saludo inicial:", error.message);
    }
}
 
// ============================================================
// CONSTANTES GLOBALES Y CONFIGURACIÓN DEL BOT
// ============================================================
 
const chatHistory = new Map();
const processedMessages = new Set();
const cooldowns = new Map();
const userStates = new Map();
 
const MAX_HISTORY_LENGTH = 10;
const COOLDOWN_SECONDS = 3;
 
// Estados del Bot
const STATE_WELCOME = -1;
const STATE_MAIN = 0;
const STATE_SUBMENU = 1;
const STATE_GEMMA_MODE = 2;
const STATE_ASESOR_REAL = 3;
const STATE_RECADO = 30;
const STATE_CITA = 40;
 
// ============================================================
// CONSTANTES DE VALIDACIÓN Y MENSAJES
// ============================================================
 
const LEON_NUMBER_SEARCH_REGEX = /(?:\+?52)?\s*477\s*\d{7}/;
 
const ERROR_INVALID_NUMBER = "⚠️ *Número de Contacto Inválido u Obligatorio.*\n\nDebe incluir un número de teléfono con la LADA de León en el formato: `+52477XXXXXXX` en su mensaje. Por favor, vuelva a enviar la solicitud con el formato correcto o pulse *0* para volver.";
 
const ERROR_EMPTY_MESSAGE = "⚠️ Su mensaje está vacío. Por favor, escriba la información solicitada o pulse *0* para cancelar y volver.";
 
const ERROR_INVALID_SUBMENU = "⚠️ *Selección Inválida.*\n\nActualmente se encuentra dentro de un submenú. Por favor, ingrese el número *0* para volver al menú principal.";
 
const MENU_RETURN_PROMPT = "\n\n---\n↩️ Para regresar al menú principal, responda con el número *0*.";
 
const SALUDO_INICIAL_IMAGEN =
     "👋 *¡Hola! Gracias por comunicarte a Axellabottechnology*\n\n" +
     "Este es un agente digital impulsado por tecnología de punta. 🚀✨\n\n" +
     "📍 Para conocer mis funciones y ver el menú principal, solo escribe la palabra: */menu*";
 
const MENU_BIENVENIDA =
     "🤖 *¡Bienvenido a Axelsolutions!*\n\n" +
     "Somos tu aliado en Soluciones Tecnológicas. 💻✨\n\n" +
     "Selecciona una opción para comenzar:\n\n" +
     "*1.* 👤 *Prefiero hablar con un asesor real* \n" +
     "*2.* 💬 Hablar con Asistente Inteligente\n" +
     "*3.* 📋 Ver Menú de Servicios Completo\n" +
     "*4.* 🌐 Visitar nuestra página web\n" +
     "*5.* 🔄 Reenviar saludo\n" +
     "\n*✔️ (Escriba solo el número de la opción: 1-5) ✔️*";
 
const MENU_PRINCIPAL =
     "✅ *Agente de Servicio Operativo.*\n\n" +
     "Estimado cliente, gracias por contactarnos. En breve, uno de nuestros agentes especializados le atenderá.\n\n" +
     "Si lo prefiere, seleccione una opción para agilizar su atención:\n\n" +
     "*1.* 📧 Enviar Correo Electrónico (EMAIL)\n" +
     "*2.* 📞 Llamar vía WhatsApp\n" +
     "*3.* 📝 Dejar un Recado / Mensaje\n" +
     "*4.* 🗓️ Agendar una Cita o Reunión\n" +
     "*5.* 👤 Hablar con un asesor real\n " +
     "*0.* 🔙 Volver al Menú de Bienvenida\n" +
     "\n*✔️ (Escriba solo el número de la opción: 0-5) ✔️*";
 
const RECADO_PROMPT_LIST =
     "📝 *Opción 3: Dejar un Recado*\n\n" +
     "Por favor, responda con los siguientes datos:\n\n" +
     "👤 *Nombre:*\n" +
     "📞 *Número de Contacto:* (+52477XXXXXXX, Obligatorio)\n" +
     "📜 *Recado/Motivo:*\n\n" +
     "Nuestros agentes lo revisarán prioritariamente.\n\n" +
     "(Al finalizar, puede escribir *0* para volver al menú)";
 
const CITA_PROMPT_NEW =
     "🗓️ *Opción 4: Agendar Cita*\n\n" +
     "Para coordinar una reunión, por favor responda con los siguientes datos:\n\n" +
     "👤 *Nombre Completo:*\n" +
     "📞 *Número de Contacto:* (+52477XXXXXXX, Obligatorio)\n" +
     "📌 *Asunto de la reunión:*\n" +
     "📅 *Fecha sugerida:*\n" +
     "⏰ *Hora sugerida:*\n\n" +
     `Un asesor confirmará la disponibilidad a la brevedad.${MENU_RETURN_PROMPT}`;
 
// ============================================================
// ESTRUCTURA DE OPCIONES
// ============================================================
 
const WELCOME_OPTIONS = {
     1: {
         response: "👤 *Seleccionaste modo asesor personal.*\n\nEnvía tu mensaje y enseguida te responderemos...",
         newState: STATE_ASESOR_REAL
     },
     2: {
         response: "💬 *Modo Conversación Activado*\n\n" +
                   "*🤖 Ahora puedes hablar directamente con nuestro asistente inteligente personalizado. 🤖*\n\n" +
                   "Haga cualquier pregunta sobre nuestros servicios, o simplemente escriba un saludo para iniciar la conversación.",
         newState: STATE_GEMMA_MODE
     },
     3: {
         response: MENU_PRINCIPAL,
         newState: STATE_MAIN
     },
     4: {
         response: "🌐 *Visita nuestra página web:*\n\n" +
                   "https://compualextech24.github.io/innovaaxeltechweb/\n\n" +
                   "Descubre todos nuestros servicios y proyectos.\n\n" +
                   "↩️ Pulse *0* para regresar.",
         newState: STATE_SUBMENU
     },
     5: {
         response: null, // Se maneja de forma especial (reenvía saludo completo)
         newState: STATE_WELCOME
     }
};
 
const MENU_OPTIONS = {
     0: {
         response: MENU_BIENVENIDA,
         newState: STATE_WELCOME
     },
     1: {
         response: `📧 *Opción 1: Enviar Correo Electrónico*\n\n` +
                   `Para enviarnos un correo directo, haga clic en el enlace siguiente:\n\n` +
                   `mailto:${CONTACT_EMAIL}?subject=Consulta%20Servicio%20WhatsApp${MENU_RETURN_PROMPT}`,
         newState: STATE_SUBMENU
     },
     2: {
         response: "📞 *Opción 2: Llamar vía WhatsApp*\n\n" +
                   "Haga clic en el enlace para iniciar una llamada con nuestro equipo:\n\n" +
                   `wa.me/524791449771${MENU_RETURN_PROMPT}`,
         newState: STATE_SUBMENU
     },
     3: {
         response: RECADO_PROMPT_LIST,
         newState: STATE_RECADO
     },
     4: {
         response: CITA_PROMPT_NEW,
         newState: STATE_CITA
     },
     5: {
         response: "👤 *Seleccionaste modo asesor personal.*\n\nEnvía tu mensaje y enseguida te responderemos...",
         newState: STATE_ASESOR_REAL
     }
};
 
// ============================================================
// FUNCIÓN PRINCIPAL DE CONEXIÓN A WHATSAPP
// ============================================================
 
async function connectToWhatsApp() {
    console.clear();
    console.log("🚀 Iniciando Sistema Axellabottechnology...\n");
 
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const logger = pino({ level: 'fatal' }, pino.destination('./baileys_logs.log'));
    const { version } = await fetchLatestBaileysVersion();
 
    console.log("📦 Versión WhatsApp Web:", version);
 
    const sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
        syncFullHistory: false,
        browser: ['Axellabottechnology', 'Chrome', '1.0.0'],
        getMessage: async () => undefined,
        markOnlineOnConnect: false,
        emitOwnEvents: false,
        fireInitQueries: false
    });
    
    console.log("✅ Logger configurado - Logs de Baileys → ./baileys_logs.log");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
 
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
         
        if(connection) console.log("📡 Estado:", connection);
 
        if (qr) {
            console.log("\n📱 Escanea este QR en terminal:");
            qrcode.generate(qr, { small: true });
        }
 
        if (connection === "open" && sock.user?.id) {
            let cleaned = sock.user.id.replace(/:[0-9]+/, "");
            if (cleaned.startsWith("521")) cleaned = cleaned.replace("521", "52");
            console.log("\n✅ 🤖 Bot conectado como:", cleaned.split("@")[0]);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
            
            scheduleMessages(sock);
        }
 
        if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = code !== 401;
             
            if (shouldReconnect) {
                console.log("🔄 Conexión caída. Reiniciando en 5 segundos...");
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log("⚠️ Sesión cerrada (Logout). Borra 'auth_info' para re-escanear.");
            }
        }
    });
 
    sock.ev.on("creds.update", saveCreds);
 
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
         
        if (type !== "notify") return;
 
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
 
        const remoteJid = m.key.remoteJid;
        if (remoteJid.endsWith("@g.us") || remoteJid.includes("@newsletter")) return;
        if (m.message.protocolMessage || m.message.senderKeyDistributionMessage) return;
 
        if (processedMessages.has(m.key.id)) return;
        processedMessages.add(m.key.id);
        setTimeout(() => processedMessages.delete(m.key.id), 60 * 1000);
 
        let text = m.message.conversation ||
                   m.message.extendedTextMessage?.text ||
                   m.message.imageMessage?.caption ||
                   m.message.videoMessage?.caption || "";
         
        if (!text || text.trim().length === 0) return;
 
        text = text.replace(/^@\d+\s*/g, "").trim();
         
        if (cooldowns.has(remoteJid) && Date.now() < cooldowns.get(remoteJid)) return;
         
        const currentState = userStates.get(remoteJid);
        const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const remoteNumber = remoteJid.split('@')[0];
 
        // ============================================================
        // NUEVO USUARIO - ENVIAR SALUDO INICIAL
        // ============================================================
        if (currentState === undefined) {
            userStates.set(remoteJid, STATE_WELCOME);
            console.log(`👤 Nuevo usuario: ${remoteNumber}`);
            
            await sendWelcomeGreeting(sock, remoteJid);
            return;
        }

        // ============================================================
        // MENU DE BIENVENIDA (CAPA 1)
        // ============================================================
        if (currentState === STATE_WELCOME) {
            const welcomeMatch = text.trim().match(/^[1-5]$/);
            if (welcomeMatch) {
                const option = parseInt(welcomeMatch[0]);
                const selectedOption = WELCOME_OPTIONS[option];

                if (!selectedOption) return;

                // Caso especial: Opción 5 (Reenviar saludo)
                if (option === 5) {
                    console.log(`🔄 Usuario [${remoteNumber}] solicitó reenvío de saludo`);
                    await sendWelcomeGreeting(sock, remoteJid);
                    return;
                }

                userStates.set(remoteJid, selectedOption.newState);
                
                try {
                    await sock.sendMessage(remoteJid, { text: selectedOption.response });
                    return;
                } catch (err) {
                    console.error("❌ Error enviando opción bienvenida:", err);
                    return;
                }
            }
        }

        // ============================================================
        // MENU PRINCIPAL (CAPA 2)
        // ============================================================
        const optionMatch = text.trim().match(/^[0-5]$/);
        if (optionMatch) {
            const option = parseInt(optionMatch[0]);
            const selectedOption = MENU_OPTIONS[option];

            if ((currentState === STATE_SUBMENU || currentState === STATE_RECADO || currentState === STATE_CITA || currentState === STATE_ASESOR_REAL) && option !== 0) {
                await sock.sendMessage(remoteJid, { text: ERROR_INVALID_SUBMENU });
                return;
            }
            
            if (!selectedOption) return;

            userStates.set(remoteJid, selectedOption.newState);
             
            try {
                await sock.sendMessage(remoteJid, { text: selectedOption.response });
                return;
            } catch (err) {
                console.error("❌ Error enviando opción:", err);
                return;
            }
        }

        // ============================================================
        // COMANDO /MENU
        // ============================================================
        if (normalized === "/menú" || normalized === "/menu") {
            await sock.sendMessage(remoteJid, { text: MENU_BIENVENIDA });
            userStates.set(remoteJid, STATE_WELCOME);
            cooldowns.set(remoteJid, Date.now() + COOLDOWN_SECONDS * 1000);
            return;
        }

        // ============================================================
        // ESTADO: RECADO O CITA
        // ============================================================
        if (currentState === STATE_RECADO || currentState === STATE_CITA) {
            
            if (text.trim().length > 0) {
                const isRecado = currentState === STATE_RECADO;
                const subject = isRecado ? "📝 NUEVO RECADO de Cliente" : "🗓️ NUEVA CITA / REUNIÓN Solicitada";
                
                let clientContactNumber = null;
                const match = text.match(LEON_NUMBER_SEARCH_REGEX);
                
                if (match) {
                    clientContactNumber = match[0].trim();
                } else {
                    await sock.sendMessage(remoteJid, { text: ERROR_INVALID_NUMBER });
                    cooldowns.set(remoteJid, Date.now() + COOLDOWN_SECONDS * 1000);
                    return;
                }
                
                const body = `
==============================================
TIPO: ${isRecado ? 'RECADO / MENSAJE' : 'CITA / REUNIÓN'}
CONTACTO INICIADOR: ${remoteNumber}
WHATSAPP INICIADOR: wa.me/${remoteNumber}
CONTACTO DIRECTO (REQUERIDO): ${clientContactNumber}
==============================================

CONTENIDO DEL MENSAJE:
${text}
`;

                await sock.sendPresenceUpdate('composing', remoteJid);

                const success = await sendEmail(subject, body);
                
                let replyMessage;

                if (success) {
                    replyMessage = "✅ *Mensaje/Cita Enviado con Éxito.*\n\nUn agente lo revisará a la brevedad.\n\n" + MENU_RETURN_PROMPT;
                } else {
                    replyMessage = "❌ *Error de Sistema.*\n\nOcurrió un error al enviar su solicitud por correo. Por favor, verifique que la información no esté vacía o pulse *0* para volver al menú principal.\n\n" + MENU_RETURN_PROMPT;
                }
                
                userStates.set(remoteJid, STATE_MAIN);
                await sock.sendMessage(remoteJid, { text: replyMessage });
                
                cooldowns.set(remoteJid, Date.now() + COOLDOWN_SECONDS * 1000);
                await sock.sendPresenceUpdate('available', remoteJid);
                return;
            } else {
                 await sock.sendMessage(remoteJid, { text: ERROR_EMPTY_MESSAGE });
                 return;
            }
        }

        // ============================================================
        // ESTADO: ASESOR REAL (Solo espera)
        // ============================================================
        if (currentState === STATE_ASESOR_REAL) {
            // No hacer nada, solo esperar a que un humano responda
            console.log(`⏳ Usuario [${remoteNumber}] esperando asesor real: "${text}"`);
            return;
        }

        // ============================================================
        // ESTADO: SUBMENU (No hacer nada)
        // ============================================================
        if (currentState === STATE_SUBMENU) return;

        // ============================================================
        // ESTADO: MODO GEMMA (IA)
        // ============================================================
        if (currentState === STATE_GEMMA_MODE) {
            
            if (normalized === "/salir" || normalized === "/menu" || normalized === "/menú") {
                console.log(`🚪 Usuario [${remoteNumber}] SALIÓ del modo Asistente Virtual`);
                
                userStates.set(remoteJid, STATE_WELCOME);
                chatHistory.delete(remoteJid);
                
                await sock.sendMessage(remoteJid, {
                    text: "✅ Has salido del modo IA.\n\n" + MENU_BIENVENIDA
                });
                cooldowns.set(remoteJid, Date.now() + COOLDOWN_SECONDS * 1000);
                return;
            }

            console.log(`📩 Gemma procesando [${remoteNumber}]: "${text}"`);

            try {
                await sock.sendPresenceUpdate('composing', remoteJid);
                
                const reply = await askGemma(text);

                const finalReply = `${reply}\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n💡 *Recuerda:* Este solo es un asistente virtual. Si deseas terminar la conversación solo escribe */salir*`;
                
                await sock.sendMessage(remoteJid, { text: finalReply });
                
                cooldowns.set(remoteJid, Date.now() + COOLDOWN_SECONDS * 1000);
                await sock.sendPresenceUpdate('available', remoteJid);
            } catch (error) {
                console.error("❌ Error en Gemma:", error.message);
                await sock.sendMessage(remoteJid, { text: "Lo siento, tuve un problema al procesar tu mensaje. Inténtalo de nuevo." });
            }
        }
    });
}

connectToWhatsApp().catch(err => console.error("Error Crítico:", err));
