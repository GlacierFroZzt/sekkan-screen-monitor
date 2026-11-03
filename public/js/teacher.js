/**
 * Sekkan Screen Monitor - Lógica del Panel del Profesor
 * Gestión de conexiones WebRTC 1 a N, mosaico dinámico y alertas
 */

document.addEventListener('DOMContentLoaded', () => {
  // Inicializar contexto de audio al hacer clic en cualquier parte
  document.addEventListener('click', () => window.audioSynth.init(), { once: true });

  const urlParams = new URLSearchParams(window.location.search);
  const roomId = (urlParams.get('room') || 'AULA-101').toUpperCase();

  // Elementos DOM
  const displayRoomId = document.getElementById('displayRoomId');
  const studentCount = document.getElementById('studentCount');
  const screensContainer = document.getElementById('screensContainer');
  const emptyState = document.getElementById('emptyState');
  const btnCopyLink = document.getElementById('btnCopyLink');
  const btnShowQr = document.getElementById('btnShowQr');
  const btnEmptyQr = document.getElementById('btnEmptyQr');
  const qrModal = document.getElementById('qrModal');
  const closeQrModal = document.getElementById('closeQrModal');
  const qrImage = document.getElementById('qrImage');
  const qrUrlText = document.getElementById('qrUrlText');
  const btnCopyFromModal = document.getElementById('btnCopyFromModal');

  // Elementos del Zoom HD
  const zoomModal = document.getElementById('zoomModal');
  const closeZoomModal = document.getElementById('closeZoomModal');
  const zoomVideo = document.getElementById('zoomVideo');
  const zoomStudentName = document.getElementById('zoomStudentName');
  const zoomStudentStatus = document.getElementById('zoomStudentStatus');
  const btnZoomSnapshot = document.getElementById('btnZoomSnapshot');
  const btnZoomSendWarning = document.getElementById('btnZoomSendWarning');

  // Elementos del Modal de Advertencias
  const warningModal = document.getElementById('warningModal');
  const closeWarningModal = document.getElementById('closeWarningModal');
  const warningTargetText = document.getElementById('warningTargetText');
  const customWarningInput = document.getElementById('customWarningInput');
  const btnCancelWarning = document.getElementById('btnCancelWarning');
  const btnSubmitWarning = document.getElementById('btnSubmitWarning');
  const btnGlobalAlert = document.getElementById('btnGlobalAlert');
  const presetMsgButtons = document.querySelectorAll('.preset-msg-btn');

  // Configuración de audio
  let soundEnabled = true;
  const btnSoundToggle = document.getElementById('btnSoundToggle');
  const soundIcon = document.getElementById('soundIcon');

  btnSoundToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
    window.toastNotifier.show(soundEnabled ? 'Sonidos activados' : 'Sonidos silenciados', 'info', 2000);
  });

  displayRoomId.textContent = roomId;

  // Construcción del enlace para los alumnos
  const studentUrl = `${window.location.origin}/student?room=${encodeURIComponent(roomId)}`;
  qrUrlText.textContent = studentUrl;

  const backendUrl = window.BACKEND_CONFIG ? window.BACKEND_CONFIG.getBackendUrl() : window.location.origin;
  console.log(`📡 Conectando al backend en: ${backendUrl}`);

  // Botón de configuración de servidor Render
  const btnConfigBackend = document.getElementById('btnConfigBackend');
  if (btnConfigBackend) {
    btnConfigBackend.addEventListener('click', () => window.BACKEND_CONFIG.promptConfig());
  }

  // Cargar Código QR desde el backend
  fetch(`${backendUrl}/api/qrcode?url=${encodeURIComponent(studentUrl)}`)
    .then(res => res.json())
    .then(data => {
      if (data.dataUrl) {
        qrImage.src = data.dataUrl;
      }
    })
    .catch(err => console.error('Error al cargar QR:', err));

  // Mapa de alumnos y conexiones WebRTC
  // studentsMap: socketId -> { name, status, pc, stream, cardElement, videoElement }
  const studentsMap = new Map();
  let currentZoomSocketId = null;
  let currentWarningTargetSocketId = null;

  // Conexión Socket.io
  const socket = io(backendUrl, {
    transports: ['websocket', 'polling']
  });

  socket.on('connect_error', (err) => {
    console.error('Error de conexión con el backend:', err);
    window.toastNotifier.show(`⚠️ No se pudo conectar al servidor (${backendUrl}). Haz clic en ⚙️ Servidor para verificar la URL.`, 'error', 6000);
  });

  socket.on('connect', () => {
    console.log(`Conectado al servidor como Profesor. ID: ${socket.id}`);
    socket.emit('join-room', {
      roomId,
      role: 'teacher',
      name: 'Profesor'
    });
    window.toastNotifier.show(`Aula [${roomId}] lista para recibir alumnos`, 'success', 3000);
  });

  socket.on('room-ready', ({ students }) => {
    console.log(`Sala lista. Alumnos previos detectados: ${students.length}`);
    students.forEach(st => handleStudentJoined(st));
    // Solicitar retransmisión a los alumnos ya presentes
    socket.emit('teacher-request-streams');
  });

  // Cuando un nuevo alumno se une a la sala
  socket.on('student-joined', (studentData) => {
    handleStudentJoined(studentData);
    if (soundEnabled) window.audioSynth.playConnectChime();
    window.toastNotifier.show(`🧑‍🎓 ${studentData.name} se ha unido al aula`, 'info');
  });

  // Recepción de señalización WebRTC (SDP / ICE) del alumno
  socket.on('signal', async ({ senderSocketId, data }) => {
    let student = studentsMap.get(senderSocketId);
    if (!student) {
      console.warn(`Señal recibida de alumno no registrado aún: ${senderSocketId}`);
      return;
    }

    if (data.sdp) {
      const sdp = data.sdp;
      if (sdp.type === 'offer') {
        console.log(`Recibida oferta WebRTC del alumno ${student.name}`);
        const pc = getOrCreatePeerConnection(senderSocketId);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('signal', {
          targetSocketId: senderSocketId,
          data: { sdp: pc.localDescription }
        });
        console.log(`Respuesta SDP enviada a ${student.name}`);
      }
    } else if (data.candidate) {
      const pc = getOrCreatePeerConnection(senderSocketId);
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('Error al agregar ICE candidate:', err);
      }
    }
  });

  // Cambio de estado de la pantalla del alumno (pausado, reanudado, finalizado)
  socket.on('student-status-changed', ({ socketId, name, status, details }) => {
    const student = studentsMap.get(socketId);
    if (!student) return;

    student.status = status;
    updateStudentCardState(socketId, status, details);

    if (status === 'screen_ended') {
      if (soundEnabled) window.audioSynth.playDisconnectAlert();
      window.toastNotifier.show(`⚠️ ${name} ha dejado de compartir su pantalla`, 'warning', 6000);
    } else if (status === 'paused') {
      if (soundEnabled) window.audioSynth.playDisconnectAlert();
      window.toastNotifier.show(`⚠️ ${name} pausó la transmisión de pantalla`, 'warning', 4000);
    } else if (status === 'sharing') {
      window.toastNotifier.show(`🟢 ${name} está transmitiendo en vivo`, 'success', 3000);
    }
  });

  // Alumno confirma recepción de advertencia
  socket.on('warning-acknowledged', ({ name }) => {
    window.toastNotifier.show(`✓ ${name} confirmó que recibió tu aviso`, 'info', 4000);
  });

  // Alumno abandona el aula
  socket.on('student-left', ({ socketId, name }) => {
    console.log(`Alumno desconectado: ${name} (${socketId})`);
    if (soundEnabled) window.audioSynth.playDisconnectAlert();
    window.toastNotifier.show(`🔴 ${name} ha salido de la clase`, 'error', 4000);
    removeStudent(socketId);
  });

  // =========================================================================
  // GESTIÓN DE PEER CONNECTIONS Y ELEMENTOS DEL MOSAICO
  // =========================================================================

  function getOrCreatePeerConnection(socketId) {
    let student = studentsMap.get(socketId);
    if (student && student.pc) {
      return student.pc;
    }

    const pc = new RTCPeerConnection(window.RTC_CONFIG);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', {
          targetSocketId: socketId,
          data: { candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`Stream de video recibido de: ${student ? student.name : socketId}`);
      const remoteStream = event.streams[0];
      if (student) {
        student.stream = remoteStream;
        if (student.videoElement) {
          student.videoElement.srcObject = remoteStream;
          student.videoElement.play().catch(e => console.warn('Autoplay bloqueado', e));
        }

        // Si este alumno está actualmente en la vista de Zoom HD, actualizarlo también
        if (currentZoomSocketId === socketId && zoomVideo) {
          zoomVideo.srcObject = remoteStream;
          zoomVideo.play().catch(e => console.warn(e));
        }

        const overlay = student.cardElement.querySelector('.video-overlay-msg');
        if (overlay) overlay.classList.add('hidden');
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Estado WebRTC con ${student ? student.name : socketId}: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        updateStudentCardState(socketId, 'disconnected', 'Conexión interrumpida');
      }
    };

    if (student) {
      student.pc = pc;
    }

    return pc;
  }

  function handleStudentJoined(studentData) {
    if (studentsMap.has(studentData.socketId)) return;

    // Crear la tarjeta en el mosaico
    const card = document.createElement('div');
    card.className = 'student-card';
    card.id = `card-${studentData.socketId}`;

    card.innerHTML = `
      <div class="student-header">
        <div class="student-name">
          <span class="status-dot"></span>
          <span class="name-label">${escapeHtml(studentData.name)}</span>
        </div>
        <div style="display: flex; gap: 4px;">
          <button class="btn-icon btn-card-warn" title="Enviar llamada de atención">⚠️</button>
          <button class="btn-icon btn-card-snap" title="Capturar evidencia">📸</button>
          <button class="btn-icon btn-card-zoom" title="Pantalla completa HD">🔍</button>
        </div>
      </div>

      <div class="video-wrapper">
        <video autoplay playsinline muted></video>
        <div class="video-overlay-msg">
          <div style="font-size: 2rem;">⏳</div>
          <div>Esperando que ${escapeHtml(studentData.name)} comparta su pantalla...</div>
        </div>
        <div class="video-hover-actions">
          <button class="btn btn-primary btn-zoom-hover" style="font-size: 0.8rem; padding: 4px 10px;">🔍 Ampliar</button>
        </div>
      </div>

      <div class="student-footer">
        <span class="status-text">Conectado</span>
        <span class="time-text">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    `;

    screensContainer.appendChild(card);

    const videoElement = card.querySelector('video');

    // Registrar en mapa
    studentsMap.set(studentData.socketId, {
      name: studentData.name,
      status: studentData.status || 'joined',
      pc: null,
      stream: null,
      cardElement: card,
      videoElement: videoElement
    });

    // Eventos de botones de la tarjeta
    card.querySelector('.btn-card-warn').addEventListener('click', (e) => {
      e.stopPropagation();
      openWarningModal(studentData.socketId, studentData.name);
    });

    card.querySelector('.btn-card-snap').addEventListener('click', (e) => {
      e.stopPropagation();
      takeSnapshot(studentData.socketId, studentData.name);
    });

    const openZoom = () => openZoomModal(studentData.socketId);
    card.querySelector('.btn-card-zoom').addEventListener('click', (e) => {
      e.stopPropagation();
      openZoom();
    });
    card.querySelector('.video-wrapper').addEventListener('click', openZoom);

    updateScreensGrid();
  }

  function updateStudentCardState(socketId, status, details) {
    const student = studentsMap.get(socketId);
    if (!student || !student.cardElement) return;

    const dot = student.cardElement.querySelector('.status-dot');
    const statusText = student.cardElement.querySelector('.status-text');
    const overlay = student.cardElement.querySelector('.video-overlay-msg');

    student.cardElement.classList.remove('warning-state');

    if (status === 'sharing') {
      dot.className = 'status-dot';
      statusText.textContent = 'En vivo (Transmitiendo)';
      if (overlay) overlay.classList.add('hidden');
    } else if (status === 'paused') {
      dot.className = 'status-dot paused';
      statusText.textContent = 'Pantalla en Pausa';
      student.cardElement.classList.add('warning-state');
      if (overlay) {
        overlay.classList.remove('hidden');
        overlay.innerHTML = `<div style="font-size: 2rem;">⏸️</div><div>Pantalla pausada por el alumno</div>`;
      }
    } else if (status === 'screen_ended') {
      dot.className = 'status-dot disconnected';
      statusText.textContent = 'Transmisión Detenida';
      student.cardElement.classList.add('warning-state');
      if (overlay) {
        overlay.classList.remove('hidden');
        overlay.innerHTML = `<div style="font-size: 2rem;">⚠️</div><div>El alumno detuvo la pantalla compartida</div>`;
      }
    } else if (status === 'disconnected') {
      dot.className = 'status-dot disconnected';
      statusText.textContent = 'Desconectado';
      student.cardElement.classList.add('warning-state');
      if (overlay) {
        overlay.classList.remove('hidden');
        overlay.innerHTML = `<div style="font-size: 2rem;">❌</div><div>Alumno sin conexión</div>`;
      }
    }
  }

  function removeStudent(socketId) {
    const student = studentsMap.get(socketId);
    if (!student) return;

    if (student.pc) {
      try { student.pc.close(); } catch (e) {}
    }

    if (student.cardElement) {
      student.cardElement.remove();
    }

    studentsMap.delete(socketId);

    if (currentZoomSocketId === socketId) {
      closeZoomModalView();
    }

    updateScreensGrid();
  }

  function updateScreensGrid() {
    const count = studentsMap.size;
    studentCount.textContent = count;
    screensContainer.setAttribute('data-count', count);

    if (count === 0) {
      emptyState.style.display = 'flex';
    } else {
      emptyState.style.display = 'none';
    }
  }

  // =========================================================================
  // MODALES (QR, ZOOM HD, ADVERTENCIAS)
  // =========================================================================

  // Modal QR
  function showQr() {
    qrModal.classList.add('active');
  }
  btnShowQr.addEventListener('click', showQr);
  btnEmptyQr.addEventListener('click', showQr);
  closeQrModal.addEventListener('click', () => qrModal.classList.remove('active'));

  // Copiar Enlace
  function copyRoomLink() {
    navigator.clipboard.writeText(studentUrl).then(() => {
      window.toastNotifier.show('📋 Enlace de la clase copiado al portapapeles', 'success');
    }).catch(() => {
      window.toastNotifier.show(`Enlace: ${studentUrl}`, 'info', 5000);
    });
  }
  btnCopyLink.addEventListener('click', copyRoomLink);
  btnCopyFromModal.addEventListener('click', copyRoomLink);

  // Zoom HD Modal
  function openZoomModal(socketId) {
    const student = studentsMap.get(socketId);
    if (!student) return;

    currentZoomSocketId = socketId;
    zoomStudentName.textContent = `Pantalla de: ${student.name}`;
    zoomStudentStatus.className = student.status === 'sharing' ? 'status-dot' : 'status-dot paused';

    if (student.stream) {
      zoomVideo.srcObject = student.stream;
      zoomVideo.play().catch(e => console.warn(e));
    } else {
      zoomVideo.srcObject = null;
    }

    zoomModal.classList.add('active');
  }

  function closeZoomModalView() {
    zoomModal.classList.remove('active');
    zoomVideo.srcObject = null;
    currentZoomSocketId = null;
  }
  closeZoomModal.addEventListener('click', closeZoomModalView);

  btnZoomSnapshot.addEventListener('click', () => {
    if (currentZoomSocketId) {
      const student = studentsMap.get(currentZoomSocketId);
      if (student) takeSnapshot(currentZoomSocketId, student.name);
    }
  });

  btnZoomSendWarning.addEventListener('click', () => {
    if (currentZoomSocketId) {
      const student = studentsMap.get(currentZoomSocketId);
      if (student) openWarningModal(currentZoomSocketId, student.name);
    }
  });

  // Captura de pantalla (Evidencia)
  function takeSnapshot(socketId, studentName) {
    const student = studentsMap.get(socketId);
    if (!student || !student.videoElement || !student.videoElement.videoWidth) {
      window.toastNotifier.show('No hay señal de video activa para capturar', 'warning');
      return;
    }

    const video = student.videoElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Agregar marca de agua con nombre y fecha/hora
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    ctx.fillText(`Alumno: ${studentName} | Aula: ${roomId} | ${new Date().toLocaleString()}`, 20, canvas.height - 14);

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    const cleanName = studentName.replace(/\s+/g, '_');
    a.download = `Evidencia_${cleanName}_${Date.now()}.png`;
    a.click();

    window.toastNotifier.show(`📸 Captura de ${studentName} guardada con éxito`, 'success');
  }

  // Modal de Advertencias
  function openWarningModal(socketId, name) {
    currentWarningTargetSocketId = socketId;
    warningTargetText.textContent = socketId === 'all' 
      ? 'Destinatario: TODOS los alumnos conectados' 
      : `Destinatario: ${name}`;
    customWarningInput.value = '';
    warningModal.classList.add('active');
  }

  function closeWarning() {
    warningModal.classList.remove('active');
    currentWarningTargetSocketId = null;
  }
  closeWarningModal.addEventListener('click', closeWarning);
  btnCancelWarning.addEventListener('click', closeWarning);

  // Alerta global
  btnGlobalAlert.addEventListener('click', () => {
    openWarningModal('all', 'Todos');
  });

  // Botones de presets
  presetMsgButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      customWarningInput.value = btn.getAttribute('data-msg');
    });
  });

  // Enviar advertencia
  btnSubmitWarning.addEventListener('click', () => {
    const message = customWarningInput.value.trim() || 'Por favor regresa a tu actividad escolar.';
    if (!currentWarningTargetSocketId) return;

    socket.emit('teacher-warning', {
      targetSocketId: currentWarningTargetSocketId,
      message,
      type: 'warning'
    });

    window.toastNotifier.show('⚠️ Advertencia enviada al alumno', 'warning');
    closeWarning();
  });

  // Cerrar modales con tecla Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      qrModal.classList.remove('active');
      closeZoomModalView();
      closeWarning();
    }
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
