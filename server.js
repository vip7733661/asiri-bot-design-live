const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname)));

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', uptime: process.uptime(), time: new Date().toISOString() });
});

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'pp9Wp8ypugygYEp6YFkEssQIUjs90Wu8';
const SYMBOLS = ['SNAP', 'MVIS', 'SG', 'RKLB', 'CHPT', 'BLNK', 'HUMA', 'AGEN', 'ENSC', 'TMCI', 'AMPL', 'RDW', 'INO', 'LASE', 'PLUG', 'CRDL', 'ADMA', 'OPTT', 'INLF'];

let marketCache = {};

async function fetchRealMarketData() {
    try {
        const fetch = (await import('node-fetch')).default;
        for (const sym of SYMBOLS) {
            try {
                const url = `https://api.polygon.io/v1/open-close/${sym}/2026-08-14?adjusted=true&apiKey=${POLYGON_API_KEY}`;
                const resp = await fetch(url);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && data.close) {
                        marketCache[sym] = {
                            price: data.close,
                            high: data.high || data.close,
                            low: data.low || data.close,
                            volume: data.volume || 0,
                            status: 'OPEN',
                            updatedAt: new Date().toISOString()
                        };
                    }
                }
            } catch (err) {
                console.error(`Error polling ${sym}:`, err.message);
            }
            await new Promise(r => setTimeout(r, 600));
        }
        broadcast({ type: 'MARKET_DATA_UPDATE', data: marketCache });
    } catch (e) {
        console.error('Market fetch cycle error:', e.message);
    }
}

function broadcast(payload) {
    const dataStr = JSON.stringify(payload);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(dataStr);
        }
    });
}

wss.on('connection', (ws) => {
    console.log('[WebSocket] New client connected');
    ws.send(JSON.stringify({ type: 'WELCOME', data: marketCache }));

    ws.on('close', () => {
        console.log('[WebSocket] Client disconnected');
    });
});

// تحديث دوري كل دقيقة
setInterval(fetchRealMarketData, 60000);
setTimeout(fetchRealMarketData, 1500);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[Server] Asiri Capital Production Server running on port ${PORT}`);
});
