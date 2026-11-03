# Sekkan Screen Monitor 📺👨‍🏫

Sistema web en tiempo real para profesores que permite supervisar de **1 a N pantallas de alumnos** simultáneamente en un mosaico dinámico para saber si están trabajando o distraídos.

Diseñado con **WebRTC nativo de ultra baja latencia** (<200ms), compatible con **Google Chrome, Apple Safari (macOS), Microsoft Edge y Firefox**.

---

## 🚀 Inicio Rápido

### 1. Iniciar el Servidor
En la terminal del proyecto ejecuta:
```bash
npm start
```

Verás una salida similar a:
```
🔒 Certificados SSL detectados en /certs. Iniciando en modo HTTPS.
======================================================
🚀 Sekkan Screen Monitor Server corriendo en el puerto 3000 (HTTPS)
💻 Acceso local:     https://localhost:3000
📶 Red Wi-Fi / LAN:  https://192.168.5.243:3000
======================================================
```

> **Nota sobre el certificado local:** Al abrir por primera vez en Chrome o Safari una IP local con certificado autofirmado, haz clic en **"Configuración avanzada"** -> **"Continuar a este sitio"**.

---

## 👨‍🏫 Cómo Funciona en el Aula

### Para el Profesor:
1. Abre en tu navegador `https://localhost:3000` (o la IP local `https://192.168.X.X:3000`).
2. Selecciona **"Soy Profesor"** e ingresa un código para el aula (ej: `AULA-101`) o usa el sugerido.
3. Haz clic en **"Proyectar Código QR"** en la pantalla del salón para que los alumnos lo escaneen o copia el enlace directo.
4. Conforme los alumnos compartan su pantalla, aparecerán automáticamente en tu **mosaico en vivo**.

### Para los Alumnos:
1. Escanean el código QR o abren el enlace proporcionado por el profesor.
2. Ingresan su nombre completo.
3. Presionan el botón **"🟢 Compartir Mi Pantalla Ahora"** y seleccionan la pantalla completa o la ventana de trabajo.
4. ¡Listo! Ya están transmitiendo directamente al panel del profesor.

---

## ✨ Características Principales

- **Mosaico Dinámico (Grid 1 a N):** Se adapta de 1 hasta 30 pantallas de forma fluida.
- **Zoom HD en Pantalla Completa:** Haz clic en la pantalla de cualquier alumno para observarla en alta definición con todo detalle.
- **Captura de Evidencia Fotográfica (Snapshot):** Botón para tomar una captura de pantalla instantánea con marca de agua (nombre del alumno, aula y fecha/hora exacta).
- **Llamadas de Atención Remotas:** Envía advertencias sonoras y visuales directas a la pantalla de un alumno (ej: *"Por favor regresa a tu actividad escolar"* o *"Cierra la ventana de juegos"*) o a todo el salón a la vez.
- **Alertas de Interrupción de Pantalla:** Si un alumno hace clic en *"Dejar de compartir"* o se desconecta, su tarjeta en el panel del profesor parpadea en rojo con un sonido de aviso inmediato.
- **Audio Synthesizer Integrado:** Efectos sonoros y llamadas de atención generadas directamente con la Web Audio API nativa sin requerir archivos de audio externos.
- **PWA Instalable:** Compatible con la función "Instalar como aplicación" de Chrome y Safari.

---

## 📱 Compatibilidad de Dispositivos y Navegadores

| Dispositivo / Sistema | Navegadores Soportados | Compartir Pantalla | Monitorear como Profesor |
| :--- | :--- | :---: | :---: |
| **PC / Laptop (Windows, Linux)** | Chrome, Edge, Firefox, Brave | ✅ Sí | ✅ Sí |
| **MacBook / Mac (macOS)** | Safari, Chrome, Edge, Firefox | ✅ Sí | ✅ Sí |
| **Chromebooks** | ChromeOS nativo | ✅ Sí | ✅ Sí |
| **iPhone / iPad (iOS)** | Safari, Chrome | ℹ️ *Aviso explicativo* | ✅ Sí (El profesor puede monitorear desde su iPad) |
| **Celulares Android** | Chrome, Firefox | ℹ️ *Aviso explicativo* | ✅ Sí |

> **Aviso de Privacidad Móvil (iOS / Android):** Apple y Google bloquean por políticas de seguridad que los navegadores web móviles capturen aplicaciones externas del sistema operativo. Por tanto, para que los alumnos puedan compartir aplicaciones y juegos externos, deben conectarse desde sus computadoras (Windows, Mac o Chromebook). El profesor sí puede supervisar desde cualquier dispositivo (incluido su iPad o celular).

---

## 🛠️ Comandos Disponibles

- `npm start`: Inicia el servidor en modo producción (HTTP o HTTPS según existan certificados).
- `npm run dev`: Inicia el servidor con recarga automática en cambios (`--watch`).
- `npm run generate-cert`: Regenera certificados SSL para la IP actual de la red Wi-Fi escolar.
- `npm test`: Ejecuta la suite de pruebas automatizadas (endpoints y señalización WebRTC).

---

## ☁️ Despliegue en la Nube (Opcional)

Si deseas usarlo fuera del Wi-Fi local de la escuela:
1. Puedes desplegar este repositorio directamente en [Render](https://render.com), [Railway](https://railway.app) o cualquier VPS.
2. Al estar en la nube con un dominio con HTTPS público gratuito (ej: `https://mi-aula.onrender.com`), funcionará tanto dentro como fuera de la escuela sin necesidad de configurar certificados locales.
