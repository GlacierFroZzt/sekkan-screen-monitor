/**
 * Sekkan Screen Monitor - Lógica del Portal del Alumno
 * Captura de pantalla WebRTC y recepción de avisos del profesor
 */

document.addEventListener('DOMContentLoaded', () => {
  // Inicializar contexto de audio con clic
  document.addEventListener('click', () => window.audioSynth.init(), { once: true });

  const urlParams = new URLSearchParams(window.location.search);
  let roomId = (urlParams.get('room') || '').toUpperCase().trim();
  let studentName = (urlParams.get('name') || '').trim();

  // Elementos DOM
  const joinFormCard = document.getElementById('joinFormCard');
  const shareCard = document.getElementById('shareCard');
  const inputStudentName = document.getElementById('inputStudentName');
  const inputRoomCode = document.getElementById('inputRoomCode');
  const btnJoinSubmit = document.getElementById('btnJoinSubmit');

  const displayStudentName = document.getElementById('displayStudentName');
  const displayStudentRoom = document.getElementById('displayStudentRoom');
  const connectionBadge = document.getElementById('connectionBadge');
  const liveStatusBadge = document.getElementById('liveStatusBadge');
  const liveStatusText = document.getElementById('liveStatusText');
  const mobileWarningNotice = document.getElementById('mobileWarningNotice');

  const localPreviewVideo = document.getElementById('localPreviewVideo');
  const previewPlaceholder = document.getElementById('previewPlaceholder');
  const btnStartShare = document.getElementById('btnStartShare');
  const btnStopShare = document.getElementById('btnStopShare');

  // Modal de advertencia del profesor
  const alertWarningModal = document.getElementById('alertWarningModal');
  const teacherWarningMessage = document.getElementById('teacherWarningMessage');
  const btnAckWarning = document.getElementById('btnAckWarning');

  // Variables WebRTC
  let socket = null;
  let localStream = null;
  let peerConnection = null;

  // Comprobar si es un dispositivo móvil y mostrar aviso preventivo
  if (window.DeviceHelper.isMobile()) {
    mobileWarningNotice.style.display = 'block';
  }

  // Verificar si tenemos datos completos de aula y alumno
  if (!roomId || !studentName) {
    joinFormCard.style.display = 'block';
    shareCard.style.display = 'none';

    if (roomId) inputRoomCode.value = roomId;
    if (studentName) inputStudentName.value = studentName;

    btnJoinSubmit.addEventListener('click', () => {
      const name = inputStudentName.value.trim();
      const room = inputRoomCode.value.trim().toUpperCase();

      if (!name) {
        alert('Por favor ingresa tu nombre completo.');
        inputStudentName.focus();
        return;
      }
      if (!room) {
        alert('Por favor ingresa el código del aula.');
        inputRoomCode.focus();
        return;
      }

      const newUrl = `${window.location.pathname}?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`;
      window.location.href = newUrl;
    });

    return;
  }

  // Si tenemos datos, mostrar pantalla de compartir
  joinFormCard.style.display = 'none';
  shareCard.style.display = 'block';

  displayStudentName.textContent = studentName;
  displayStudentRoom.textContent = `Aula: ${roomId}`;

  // Inicializar Socket.io
  initSocketConnection();

  function initSocketConnection() {
    const backendUrl = window.BACKEND_CONFIG ? window.BACKEND_CONFIG.getBackendUrl() : window.location.origin;
    console.log(`📡 Conectando al backend en: ${backendUrl}`);

    socket = io(backendUrl, {
      transports: ['websocket', 'polling']
    });

    socket.on('connect_error', (err) => {
      console.error('Error de conexión con el backend:', err);
      connectionBadge.textContent = '⚠️ Sin conexión con servidor';
      connectionBadge.style.color = 'var(--accent-yellow)';
    });

    socket.on('connect', () => {
      connectionBadge.textContent = '🟢 Conectado al aula';
      connectionBadge.style.color = 'var(--accent-green)';
      console.log(`Conectado al servidor como alumno. ID: ${socket.id}`);

      socket.emit('join-room', {
        roomId,
        role: 'student',
        name: studentName
      });
    });

    socket.on('room-joined', (info) => {
      console.log('Unido exitosamente a la sala:', info);
      window.toastNotifier.show(`Conectado a la clase ${roomId}`, 'success');
      if (!info.teacherConnected) {
        window.toastNotifier.show('El profesor aún no ha entrado al panel, pero puedes empezar a compartir', 'info', 5000);
      }
    });

    socket.on('disconnect', () => {
      connectionBadge.textContent = '🔴 Desconectado';
      connectionBadge.style.color = 'var(--accent-red)';
    });

    // Profesor solicita retransmisión (ej: tras recargar su página)
    socket.on('request-stream-resend', async () => {
      console.log('Profesor solicitó retransmitir stream.');
      if (localStream) {
        await initiateWebRTCOffer();
      }
    });

    let studentPendingCandidates = [];

    // Respuestas de señalización WebRTC del profesor
    socket.on('signal', async ({ data }) => {
      if (!peerConnection) return;

      if (data.sdp && data.sdp.type === 'answer') {
        console.log('Respuesta SDP del profesor recibida');
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));

          // Drenar candidatos en cola
          if (studentPendingCandidates.length > 0) {
            console.log(`Drenando ${studentPendingCandidates.length} candidatos ICE del profesor`);
            for (const cand of studentPendingCandidates) {
              try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.warn('Error drenando candidato ICE:', e);
              }
            }
            studentPendingCandidates = [];
          }
        } catch (e) {
          console.error('Error al aplicar SDP answer:', e);
        }
      } else if (data.candidate) {
        if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.error('Error al agregar ICE candidate:', e);
          }
        } else {
          studentPendingCandidates.push(data.candidate);
        }
      }
    });

    // Recepción de advertencia / llamada de atención del profesor
    socket.on('receive-warning', ({ message }) => {
      console.log('Llamada de atención recibida:', message);

      // Reproducir sonido urgente
      window.audioSynth.playWarningAlert();

      // Vibrar si el dispositivo lo soporta
      if (navigator.vibrate) {
        try { navigator.vibrate([300, 150, 300, 150, 300]); } catch (e) {}
      }

      teacherWarningMessage.textContent = message;
      alertWarningModal.classList.add('active');
    });

    socket.on('teacher-left', () => {
      window.toastNotifier.show('El profesor ha cerrado temporalmente el panel del aula', 'warning');
    });
  }

  // Confirmar recepción de advertencia
  btnAckWarning.addEventListener('click', () => {
    alertWarningModal.classList.remove('active');
    if (socket) {
      socket.emit('acknowledge-warning');
    }
  });

  // =========================================================================
  // CAPTURA DE PANTALLA WEBRTC (getDisplayMedia)
  // =========================================================================

  btnStartShare.addEventListener('click', async () => {
    window.audioSynth.init();

    if (!window.DeviceHelper.supportsDisplayMedia()) {
      alert('Tu navegador no soporta la captura de pantalla por web. Por favor usa Google Chrome, Apple Safari (macOS), Microsoft Edge o Firefox en una computadora.');
      return;
    }

    try {
      // Solicitar captura de pantalla del alumno
      localStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          frameRate: { ideal: 15, max: 25 },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 }
        },
        audio: false
      });

      console.log('Pantalla capturada correctamente.');
      localPreviewVideo.srcObject = localStream;
      previewPlaceholder.style.display = 'none';

      // Detectar si el alumno presiona el botón nativo de "Dejar de compartir" del navegador
      const videoTrack = localStream.getVideoTracks()[0];
      videoTrack.onended = () => {
        handleScreenEnded();
      };

      // Actualizar UI
      setSharingUIState(true);

      // Iniciar negociación WebRTC hacia el profesor
      await initiateWebRTCOffer();

      window.toastNotifier.show('🟢 Transmitiendo pantalla al profesor', 'success');

    } catch (err) {
      console.error('Error al capturar pantalla:', err);
      if (err.name === 'NotAllowedError') {
        window.toastNotifier.show('Permiso de captura cancelado por el usuario', 'warning');
      } else {
        alert(`No se pudo iniciar la transmisión: ${err.message}`);
      }
    }
  });

  // Detener compartir voluntariamente
  btnStopShare.addEventListener('click', () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    handleScreenEnded();
  });

  function handleScreenEnded() {
    console.log('Transmisión de pantalla detenida.');
    setSharingUIState(false);

    if (localPreviewVideo.srcObject) {
      localPreviewVideo.srcObject = null;
    }
    previewPlaceholder.style.display = 'block';

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    localStream = null;

    if (socket) {
      socket.emit('student-status', { status: 'screen_ended' });
    }

    window.toastNotifier.show('⚠️ Has dejado de transmitir tu pantalla', 'warning', 6000);
  }

  function setSharingUIState(isSharing) {
    if (isSharing) {
      liveStatusBadge.className = 'student-status-badge live';
      liveStatusBadge.querySelector('.status-dot').className = 'status-dot';
      liveStatusText.textContent = 'Transmitiendo en vivo';
      btnStartShare.style.display = 'none';
      btnStopShare.style.display = 'inline-flex';
    } else {
      liveStatusBadge.className = 'student-status-badge stopped';
      liveStatusBadge.querySelector('.status-dot').className = 'status-dot disconnected';
      liveStatusText.textContent = 'Transmisión detenida';
      btnStartShare.style.display = 'inline-flex';
      btnStopShare.style.display = 'none';
    }
  }

  async function initiateWebRTCOffer() {
    if (!localStream || !socket) return;

    if (peerConnection) {
      try { peerConnection.close(); } catch (e) {}
    }

    peerConnection = new RTCPeerConnection(window.RTC_CONFIG);

    // Añadir pistas de video
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', {
          targetSocketId: 'teacher',
          data: { candidate: event.candidate }
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log(`Estado WebRTC del alumno: ${peerConnection.connectionState}`);
    };

    // Crear oferta SDP
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Enviar oferta al profesor
    socket.emit('signal', {
      targetSocketId: 'teacher',
      data: { sdp: peerConnection.localDescription }
    });

    // Notificar al profesor que estamos transmitiendo
    socket.emit('student-status', { status: 'sharing' });
    console.log('Oferta SDP enviada al profesor.');
  }
});
