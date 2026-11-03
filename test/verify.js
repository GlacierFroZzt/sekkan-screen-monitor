const http = require('http');
const https = require('https');
const ioClient = require('socket.io-client');
const assert = require('assert');

// Ignorar advertencias de certificados autofirmados durante pruebas locales
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const PORT = 3000;
const URL = `https://localhost:${PORT}`;

async function runTests() {
  console.log('🧪 Iniciando pruebas automatizadas de Sekkan Screen Monitor...\n');

  // 1. Probar endpoints HTTP(S)
  console.log('1️⃣ Probando endpoints y rutas web...');
  
  const get = (path) => new Promise((resolve, reject) => {
    https.get(`${URL}${path}`, { rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });

  const resIndex = await get('/');
  assert.strictEqual(resIndex.status, 200, 'Index debe responder 200');
  assert(resIndex.data.includes('Sekkan'), 'Index debe contener "Sekkan"');
  console.log('  ✅ GET / (Portada) -> 200 OK');

  const resTeacher = await get('/teacher');
  assert.strictEqual(resTeacher.status, 200, 'Teacher debe responder 200');
  assert(resTeacher.data.includes('Panel del Profesor'), 'Teacher debe contener "Panel del Profesor"');
  console.log('  ✅ GET /teacher -> 200 OK');

  const resStudent = await get('/student');
  assert.strictEqual(resStudent.status, 200, 'Student debe responder 200');
  assert(resStudent.data.includes('Portal del Alumno'), 'Student debe contener "Portal del Alumno"');
  console.log('  ✅ GET /student -> 200 OK');

  const resQr = await get('/api/qrcode?url=https://sekkan.test');
  assert.strictEqual(resQr.status, 200, 'QR debe responder 200');
  const qrJson = JSON.parse(resQr.data);
  assert(qrJson.dataUrl && qrJson.dataUrl.startsWith('data:image/png;base64,'), 'Debe retornar dataUrl PNG');
  console.log('  ✅ GET /api/qrcode -> 200 OK (DataURL PNG generado)');

  // 2. Probar señalización Socket.io y lógica 1 a N
  console.log('\n2️⃣ Probando señalización WebRTC y Socket.io...');
  const roomId = 'SALA-TEST-AUTO';

  // Conectar Profesor
  const teacherSocket = ioClient(URL, { rejectUnauthorized: false });
  await new Promise(resolve => teacherSocket.on('connect', resolve));
  console.log('  ✅ Profesor conectado a Socket.io');

  teacherSocket.emit('join-room', { roomId, role: 'teacher', name: 'Prof. García' });

  // Conectar Alumno 1
  const studentSocket = ioClient(URL, { rejectUnauthorized: false });
  await new Promise(resolve => studentSocket.on('connect', resolve));
  console.log('  ✅ Alumno conectado a Socket.io');

  // Verificar que el profesor recibe evento student-joined
  const studentJoinedPromise = new Promise(resolve => {
    teacherSocket.on('student-joined', (data) => {
      assert.strictEqual(data.name, 'Estudiante Demo');
      resolve(data);
    });
  });

  studentSocket.emit('join-room', { roomId, role: 'student', name: 'Estudiante Demo' });
  const joinedData = await studentJoinedPromise;
  console.log(`  ✅ Evento 'student-joined' recibido por profesor: Alumno '${joinedData.name}'`);

  // Verificar intercambio de señales WebRTC (SDP offer)
  const signalPromise = new Promise(resolve => {
    teacherSocket.on('signal', ({ senderSocketId, data }) => {
      assert.strictEqual(data.sdp.type, 'offer');
      assert.strictEqual(data.sdp.sdp, 'v=0...fake-sdp-offer');
      resolve();
    });
  });

  studentSocket.emit('signal', {
    targetSocketId: 'teacher',
    data: { sdp: { type: 'offer', sdp: 'v=0...fake-sdp-offer' } }
  });
  await signalPromise;
  console.log('  ✅ Enrutamiento de señalización WebRTC (SDP Offer Alumno -> Profesor) exitoso');

  // Verificar llamada de atención del profesor al alumno
  const warningPromise = new Promise(resolve => {
    studentSocket.on('receive-warning', (payload) => {
      assert.strictEqual(payload.message, '¡Atención: vuelve a tu actividad!');
      resolve();
    });
  });

  teacherSocket.emit('teacher-warning', {
    targetSocketId: studentSocket.id,
    message: '¡Atención: vuelve a tu actividad!'
  });
  await warningPromise;
  console.log('  ✅ Alerta directa enviada por el profesor y recibida por el alumno');

  // Desconexión limpia
  studentSocket.disconnect();
  teacherSocket.disconnect();

  console.log('\n🎉 ¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ ERROR EN LAS PRUEBAS:', err);
  process.exit(1);
});
