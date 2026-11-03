const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cors = require('cors');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Obtener IPs locales de la máquina para facilitar la conexión en red escolar
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Filtrar IPv4 internas (no loopback 127.0.0.1)
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ name, address: net.address });
      }
    }
  }
  return addresses;
}

// Health check para Render y monitores de servicio
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'sekkan-screen-monitor-backend',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});
app.get('/api/network-info', (req, res) => {
  const ips = getLocalIpAddresses();
  const port = process.env.PORT || 3000;
  const protocol = req.protocol;
  const primaryIp = ips.length > 0 ? ips[0].address : 'localhost';
  res.json({
    protocol,
    port,
    ips,
    suggestedUrl: `${protocol}://${primaryIp}:${port}`
  });
});

// Endpoint para generar Código QR en base64 de cualquier URL
app.get('/api/qrcode', async (req, res) => {
  try {
    const text = req.query.url;
    if (!text) {
      return res.status(400).json({ error: 'Falta el parámetro url' });
    }
    const qrDataUrl = await QRCode.toDataURL(text, {
      width: 400,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      }
    });
    res.json({ dataUrl: qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Error generando código QR' });
  }
});

// Rutas amigables
app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

app.get('/student', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

app.get('/join', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

// Crear servidor HTTP o HTTPS
const PORT = process.env.PORT || 3000;
let server;
const certPath = path.join(__dirname, 'certs', 'cert.pem');
const keyPath = path.join(__dirname, 'certs', 'key.pem');

// En Render o entornos de nube, el proxy inverso de Render ya maneja HTTPS externamente.
const isCloudDeploy = !!(process.env.RENDER || process.env.NODE_ENV === 'production' || (process.env.PORT && process.env.PORT !== '3000'));

let isHttps = false;
if (!isCloudDeploy && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
  server = https.createServer(options, app);
  isHttps = true;
  console.log('🔒 Certificados SSL detectados en /certs. Iniciando en modo HTTPS local.');
} else {
  server = http.createServer(app);
  if (isCloudDeploy) {
    console.log('☁️ Entorno de nube detectado (Render/Producción). Iniciando en modo HTTP detrás de proxy.');
  }
}

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Estructura de almacenamiento en memoria de las salas
// rooms: { [roomId]: { teacherSocketId: string, students: { [socketId]: { name: string, status: string, joinedAt: number } } } }
const rooms = new Map();

io.on('connection', (socket) => {
  let userRoom = null;
  let userRole = null;
  let userName = null;

  // Unirse a una sala
  socket.on('join-room', ({ roomId, role, name }) => {
    userRoom = (roomId || '').trim().toUpperCase();
    userRole = role; // 'teacher' | 'student'
    userName = (name || 'Alumno').trim();

    if (!userRoom) {
      socket.emit('error-msg', { message: 'El código de sala es requerido.' });
      return;
    }

    socket.join(userRoom);

    if (!rooms.has(userRoom)) {
      rooms.set(userRoom, {
        teacherSocketId: null,
        students: new Map()
      });
    }

    const currentRoom = rooms.get(userRoom);

    if (role === 'teacher') {
      currentRoom.teacherSocketId = socket.id;
      console.log(`👨‍🏫 Profesor conectado a la sala [${userRoom}] (ID: ${socket.id})`);
      
      // Enviar al profesor la lista de alumnos ya conectados si existían
      const activeStudents = [];
      for (const [id, info] of currentRoom.students.entries()) {
        activeStudents.push({ socketId: id, name: info.name, status: info.status, joinedAt: info.joinedAt });
      }
      socket.emit('room-ready', { roomId: userRoom, students: activeStudents });
    } else {
      // Es alumno
      currentRoom.students.set(socket.id, {
        name: userName,
        status: 'joined',
        joinedAt: Date.now()
      });

      console.log(`🧑‍🎓 Alumno '${userName}' se unió a la sala [${userRoom}] (ID: ${socket.id})`);

      // Notificar al profesor de la sala si está presente
      if (currentRoom.teacherSocketId) {
        io.to(currentRoom.teacherSocketId).emit('student-joined', {
          socketId: socket.id,
          name: userName,
          status: 'joined',
          timestamp: Date.now()
        });
      }

      socket.emit('room-joined', {
        roomId: userRoom,
        name: userName,
        teacherConnected: !!currentRoom.teacherSocketId
      });
    }
  });

  // Reenvío de señalización WebRTC (SDP offer/answer y candidatos ICE)
  socket.on('signal', ({ targetSocketId, data }) => {
    let target = targetSocketId;
    if (target === 'teacher' && userRoom && rooms.has(userRoom)) {
      target = rooms.get(userRoom).teacherSocketId;
    }
    if (target) {
      io.to(target).emit('signal', {
        senderSocketId: socket.id,
        data
      });
    }
  });

  // Profesor solicita retransmisión (ej: tras recargar su página)
  socket.on('teacher-request-streams', () => {
    if (userRole === 'teacher' && userRoom) {
      socket.to(userRoom).emit('request-stream-resend');
    }
  });

  // Notificación de estado de pantalla del alumno ('sharing', 'paused', 'resumed', 'screen_ended')
  socket.on('student-status', ({ status, details }) => {
    if (!userRoom) return;
    const currentRoom = rooms.get(userRoom);
    if (!currentRoom) return;

    if (currentRoom.students.has(socket.id)) {
      const studentInfo = currentRoom.students.get(socket.id);
      studentInfo.status = status;
      if (currentRoom.teacherSocketId) {
        io.to(currentRoom.teacherSocketId).emit('student-status-changed', {
          socketId: socket.id,
          name: studentInfo.name,
          status,
          details,
          timestamp: Date.now()
        });
      }
    }
  });

  // Profesor envía advertencia / mensaje de atención a un alumno específico o al grupo
  socket.on('teacher-warning', ({ targetSocketId, message, type }) => {
    if (userRole !== 'teacher' || !userRoom) return;
    const currentRoom = rooms.get(userRoom);
    if (!currentRoom) return;

    const payload = {
      message: message || 'Por favor regresa a la actividad escolar.',
      type: type || 'warning', // 'warning', 'info', 'alert'
      timestamp: Date.now()
    };

    if (targetSocketId && targetSocketId !== 'all') {
      io.to(targetSocketId).emit('receive-warning', payload);
      console.log(`⚠️ Alerta enviada a alumno ${targetSocketId}: "${payload.message}"`);
    } else {
      // Enviar a todos los alumnos de la sala
      socket.to(userRoom).emit('receive-warning', payload);
      console.log(`⚠️ Alerta global enviada a la sala [${userRoom}]: "${payload.message}"`);
    }
  });

  // Alumno confirma recepción de advertencia
  socket.on('acknowledge-warning', () => {
    if (!userRoom) return;
    const currentRoom = rooms.get(userRoom);
    if (currentRoom && currentRoom.teacherSocketId) {
      io.to(currentRoom.teacherSocketId).emit('warning-acknowledged', {
        socketId: socket.id,
        name: userName,
        timestamp: Date.now()
      });
    }
  });

  // Desconexión
  socket.on('disconnect', () => {
    if (!userRoom || !rooms.has(userRoom)) return;
    const currentRoom = rooms.get(userRoom);

    if (userRole === 'teacher' && currentRoom.teacherSocketId === socket.id) {
      console.log(`👨‍🏫 Profesor abandonó la sala [${userRoom}]`);
      currentRoom.teacherSocketId = null;
      socket.to(userRoom).emit('teacher-left');
    } else if (userRole === 'student' && currentRoom.students.has(socket.id)) {
      const studentInfo = currentRoom.students.get(socket.id);
      console.log(`🧑‍🎓 Alumno '${studentInfo.name}' desconectado de la sala [${userRoom}]`);
      currentRoom.students.delete(socket.id);

      if (currentRoom.teacherSocketId) {
        io.to(currentRoom.teacherSocketId).emit('student-left', {
          socketId: socket.id,
          name: studentInfo.name,
          timestamp: Date.now()
        });
      }
    }

    // Limpiar sala vacía después de un tiempo
    if (!currentRoom.teacherSocketId && currentRoom.students.size === 0) {
      rooms.delete(userRoom);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  const proto = isHttps ? 'https' : 'http';
  console.log(`\n======================================================`);
  console.log(`🚀 Sekkan Screen Monitor Server corriendo en el puerto ${PORT} (${proto.toUpperCase()})`);
  console.log(`💻 Acceso local:     ${proto}://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`📶 Red Wi-Fi / LAN:  ${proto}://${ip.address}:${PORT}`);
  });
  if (isHttps) {
    console.log(`\n💡 Nota para red local HTTPS: En Chrome/Safari presiona`);
    console.log(`   "Avanzado" -> "Continuar a este sitio" al abrir por primera vez.`);
  }
  console.log(`======================================================\n`);
});
