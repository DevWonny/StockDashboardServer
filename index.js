import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import WebSocket from "ws";

dotenv.config();
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    // ! 개발단계에서는 전체 허용. 실제 배포시에는 특정 도메인만 넣어야 함!
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["*"],
    credentials: true,
  },
  path: "/socket.io/",
  transports: ["websocket", "polling"],
});

const FINNHUB_URL = `wss://ws.finnhub.io?token=${process.env.FINNHUB_TOKEN}`;
const ws = new WebSocket(FINNHUB_URL);

// Client별 구독 관리
const clientSubscribe = {};
// track 1
const latestDefaultTrades = {};

// 초기 구독할 심볼 리스트 - Header용
const cryptoSymbols = [
  "BINANCE:BTCUSDT",
  "BINANCE:ETHUSDT",
  "BINANCE:BNBUSDT",
  "BINANCE:SOLUSDT",
  "BINANCE:XRPUSDT",
  "BINANCE:ADAUSDT",
  "BINANCE:DOGEUSDT",
  "BINANCE:AVAXUSDT",
  "BINANCE:TRXUSDT",
  "BINANCE:DOTUSDT",
];

// Finnhub Connect
ws.on("open", () => {
  console.log("Connect to Finnhub WebSocket!");

  cryptoSymbols.forEach((symbol) => {
    ws.send(JSON.stringify({ type: "subscribe", symbol }));
  });
});

// Finnhub -> Data 수신 -> 가공 -> Client
ws.on("message", (msg) => {
  const data = JSON.parse(msg.toString());
  if (data.type === "trade") {
    data.data.forEach((d) => {
      const trade = {
        symbol: d.s,
        price: d.p,
        // // timestamp: dayjs(d.t).format("YYYY-MM-DD HH:mm:ss"),
        timestamp: d.t,
        volume: d.v,
        // value: d.p,
        // time: d.t,
      };

      if (cryptoSymbols.includes(trade.symbol)) {
        latestDefaultTrades[trade.symbol] = trade;
        io.emit("cryptoSymbolUpdate", latestDefaultTrades);
      }

      // 심볼 구독중인 클라이언트에게만 전달
      for (const [clientId, symbols] of Object.entries(clientSubscribe)) {
        if (symbols.has(trade.symbol)) {
          // const test = {
          //   symbol: trade.symbol,
          //   value: trade.price,
          //   time: trade.timestamp,
          // };
          io.to(clientId).emit("stockUpdate", trade);
        }
      }
    });
  }
});

// Client Connect Event
io.on("connection", (socket) => {
  console.log("Client Connect!", socket.id, socket);
  clientSubscribe[socket.id] = new Set();

  // 초기 Header 데이터
  Object.values(latestDefaultTrades).forEach((trade) => {
    io.emit("cryptoSymbolUpdate", latestDefaultTrades);
  });

  // Symbol 구독 요청
  socket.on("subscribe", (symbol) => {
    console.log(`Client ${socket.id} Subscribe to ${symbol}`);
    clientSubscribe[socket.id].add(symbol);
    ws.send(JSON.stringify({ type: "subscribe", symbol }));
  });

  // Symbol 구독 해지 요청
  socket.on("unsubscribe", (symbol) => {
    console.log(`Client ${socket.id} Unsubscribe to ${symbol}`);
    clientSubscribe[socket.id].delete(symbol);
    ws.send(JSON.stringify({ type: "unsubscribe", symbol }));
  });

  // Client Disconnect
  socket.on("disconnect", () => {
    console.log(`Client Disconnect ${socket.id}`);
    delete clientSubscribe[socket.id];
  });
});

// Express 기본 라우트 -> 추후 제거 예정
app.get("/", (req, res) => {
  res.send("Backend Server is running!");
});

// Server 실행
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
