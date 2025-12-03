const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
const { CronJob } = require('cron');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Railway specific environment
const isRailway = process.env.RAILWAY_ENVIRONMENT === 'production';
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN || `http://localhost:${PORT}`;

console.log('🚂 Railway Chat App Starting...');
console.log(`📍 Environment: ${isRailway ? 'Production' : 'Development'}`);
console.log(`🌐 Domain: ${DOMAIN}`);
console.log(`🔧 Port: ${PORT}`);

// Auto-ping for Railway (keeps app alive)
const keepAliveJob = new CronJob('*/5 * * * *', async () => {
  try {
    const response = await axios.get(`${DOMAIN}/health`);
    console.log(`✅ Railway Keep-Alive: ${response.status} - ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    console.log('⚠️ Keep-alive ping failed (may be starting up)');
  }
});

keepAliveJob.start();
console.log('⏰ Auto-ping system started (every 5 minutes)');

// Database setup
const dbPath = path.join(__dirname, 'chat.db');
console.log(`💾 Database path: ${dbPath}`);

// Uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`📁 Created uploads directory: ${uploadsDir}`);
}

// Simple in-memory storage (for demo)
// For production, use SQLite as shown in previous code
const rooms = new Map();
const users = new Map();
const messages = new Map();

// Generate room ID
function generateRoomId() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

// Middleware
app.use(express.static(path.join(__dirname, '/')));
app.use('/uploads', express.static(uploadsDir));
app.use(express.json());

// CORS for Railway
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// WebSocket
wss.on('connection', (ws, req) => {
  const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
  const roomId = urlParams.get('room') || generateRoomId();
  const username = urlParams.get('user') || `User_${Math.random().toString(36).substr(2, 5)}`;
  
  // Initialize room if not exists
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      users: new Set(),
      createdAt: Date.now()
    });
    messages.set(roomId, []);
  }
  
  const room = rooms.get(roomId);
  const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Store user
  users.set(ws, {
    id: userId,
    username,
    roomId,
    joinedAt: Date.now()
  });
  
  room.users.add(userId);
  
  console.log(`👤 ${username} joined room ${roomId} (${room.users.size} users)`);
  
  // Welcome message
  ws.send(JSON.stringify({
    type: 'system',
    message: `Welcome to Room ${roomId}!`,
    roomId,
    userId,
    username,
    userCount: room.users.size,
    server: 'Railway'
  }));
  
  // Notify others
  broadcastToRoom(ws, roomId, {
    type: 'user-join',
    username,
    userId,
    userCount: room.users.size,
    timestamp: Date.now()
  });
  
  // Send message history
  const roomMessages = messages.get(roomId) || [];
  ws.send(JSON.stringify({
    type: 'history',
    messages: roomMessages.slice(-50)
  }));
  
  // Handle messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      const user = users.get(ws);
      
      if (message.type === 'chat' && message.text?.trim()) {
        const chatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId: user.id,
          username: user.username,
          text: message.text.trim(),
          timestamp: Date.now(),
          roomId: user.roomId
        };
        
        // Store message
        const roomMessages = messages.get(user.roomId) || [];
        roomMessages.push(chatMessage);
        if (roomMessages.length > 1000) {
          roomMessages.shift(); // Keep only last 1000 messages
        }
        messages.set(user.roomId, roomMessages);
        
        // Broadcast
        broadcastToRoom(ws, user.roomId, {
          type: 'chat',
          ...chatMessage
        });
      }
    } catch (error) {
      console.error('Message error:', error);
    }
  });
  
  // Handle disconnect
  ws.on('close', () => {
    const user = users.get(ws);
    if (user) {
      const room = rooms.get(user.roomId);
      if (room) {
        room.users.delete(user.id);
        console.log(`👤 ${user.username} left room ${user.roomId} (${room.users.size} users)`);
        
        broadcastToRoom(ws, user.roomId, {
          type: 'user-leave',
          username: user.username,
          userId: user.id,
          userCount: room.users.size,
          timestamp: Date.now()
        });
        
        // Clean empty rooms after 1 hour
        if (room.users.size === 0) {
          setTimeout(() => {
            if (rooms.get(user.roomId)?.users.size === 0) {
              rooms.delete(user.roomId);
              messages.delete(user.roomId);
              console.log(`🧹 Cleaned empty room: ${user.roomId}`);
            }
          }, 60 * 60 * 1000);
        }
      }
      users.delete(ws);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function broadcastToRoom(sender, roomId, message) {
  users.forEach((user, client) => {
    if (client !== sender && user.roomId === roomId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// API Routes
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { roomId, userId, username } = req.body;
    
    if (!roomId || !userId || !username) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const message = {
      id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      username,
      text: '📸 Image shared',
      timestamp: Date.now(),
      roomId,
      imageUrl: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname
    };
    
    // Store message
    const roomMessages = messages.get(roomId) || [];
    roomMessages.push(message);
    messages.set(roomId, roomMessages);
    
    // Broadcast
    users.forEach((user, client) => {
      if (user.roomId === roomId && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'chat',
          ...message
        }));
      }
    });
    
    res.json({
      success: true,
      url: `/uploads/${req.file.filename}`,
      message: 'Image uploaded successfully'
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/create-room', (req, res) => {
  const username = req.query.user || 'User';
  const roomId = generateRoomId();
  
  res.json({
    success: true,
    roomId,
    yourLink: `${DOMAIN}/?room=${roomId}&user=${encodeURIComponent(username)}`,
    friendLink: `${DOMAIN}/?room=${roomId}&user=${encodeURIComponent('Friend')}`,
    message: 'Share the friend link',
    server: 'Railway'
  });
});

app.get('/api/room/:roomId/info', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (room) {
    res.json({
      exists: true,
      userCount: room.users.size,
      createdAt: room.createdAt
    });
  } else {
    res.json({ exists: false });
  }
});

// Health endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime(),
    rooms: rooms.size,
    users: users.size,
    environment: isRailway ? 'railway' : 'local',
    memory: process.memoryUsage()
  });
});

app.get('/ping', (req, res) => {
  res.json({
    pong: Date.now(),
    message: 'Railway Chat App is running!',
    domain: DOMAIN
  });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Railway specific welcome page
app.get('/railway', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Railway Chat App</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          text-align: center;
        }
        .container {
          background: rgba(255,255,255,0.1);
          padding: 30px;
          border-radius: 15px;
          backdrop-filter: blur(10px);
        }
        h1 {
          font-size: 2.5em;
          margin-bottom: 10px;
        }
        .logo {
          font-size: 4em;
          margin: 20px;
        }
        .btn {
          display: inline-block;
          background: white;
          color: #667eea;
          padding: 15px 30px;
          margin: 10px;
          border-radius: 50px;
          text-decoration: none;
          font-weight: bold;
          font-size: 1.2em;
          transition: transform 0.3s;
        }
        .btn:hover {
          transform: translateY(-3px);
        }
        .status {
          background: rgba(255,255,255,0.2);
          padding: 15px;
          border-radius: 10px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">🚂</div>
        <h1>Railway Chat App</h1>
        <p>Real-time messaging with image sharing</p>
        
        <div class="status">
          <p><strong>Status:</strong> <span style="color: #4CAF50;">●</span> Running</p>
          <p><strong>Server:</strong> ${DOMAIN}</p>
          <p><strong>Deployed on:</strong> Railway.app</p>
        </div>
        
        <a href="/" class="btn">🚀 Open Chat App</a>
        <a href="/health" class="btn">📊 Server Health</a>
        
        <div style="margin-top: 30px; font-size: 0.9em; opacity: 0.8;">
          <p>Powered by Railway • Never sleeps • Auto-scaling • Free tier</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Open: ${DOMAIN}`);
  console.log(`🔗 Health: ${DOMAIN}/health`);
  console.log(`🔗 Railway: ${DOMAIN}/railway`);
  console.log(`📡 WebSocket: ws://0.0.0.0:${PORT}`);
  console.log('🎉 Railway Chat App Ready!');
});

// Clean old files weekly
setInterval(() => {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  fs.readdir(uploadsDir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      fs.stat(filePath, (err, stats) => {
        if (!err && stats.mtimeMs < weekAgo) {
          fs.unlink(filePath, () => {
            console.log(`🗑️ Cleaned: ${file}`);
          });
        }
      });
    });
  });
}, 24 * 60 * 60 * 1000);