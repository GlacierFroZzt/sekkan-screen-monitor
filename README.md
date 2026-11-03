# Sekkan Screen Monitor 📺👨‍🏫

Sistema web en tiempo real para profesores que permite supervisar de **1 a N pantallas de alumnos** simultáneamente en un mosaico dinámico para saber si están trabajando o distraídos.

Diseñado con **WebRTC nativo de ultra baja latencia** (<200ms), compatible con **Google Chrome, Apple Safari (macOS), Microsoft Edge y Firefox**.

---

## 🌐 Guía de Despliegue: Backend en Render + Frontend en Vercel

El proyecto está preparado para dividirse limpiamente entre **Render (Backend Node.js/Socket.io)** y **Vercel (Frontend Estático WebRTC)**.

### Paso 1: Subir el Código a GitHub
Crea un repositorio en GitHub y sube tu proyecto:
```bash
git remote add origin https://github.com/TU-USUARIO/sekkan-screen-monitor.git
git branch -M main
git push -u origin main
```

---

### Paso 2: Desplegar el Backend en Render
1. Ve a [dashboard.render.com](https://dashboard.render.com) e inicia sesión.
2. Haz clic en **New +** -> **Web Service**.
3. Selecciona tu repositorio de GitHub `sekkan-screen-monitor`.
4. Configura los siguientes campos:
   - **Name:** `sekkan-backend` (o el nombre que elijas)
   - **Region:** Elige la más cercana (ej: *Ohio* o *Oregon*)
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Haz clic en **Create Web Service**.
6. Render te dará una URL HTTPS pública (ejemplo: `https://sekkan-backend.onrender.com`). Copia esa URL.

---

### Paso 3: Desplegar el Frontend en Vercel
1. Ve a [vercel.com](https://vercel.com) e inicia sesión.
2. Haz clic en **Add New...** -> **Project**.
3. Selecciona tu repositorio de GitHub `sekkan-screen-monitor`.
4. Vercel detectará automáticamente el archivo `vercel.json` (que ya tiene configurado el directorio `public`, rewrites limpios para `/teacher` y `/student`, y encabezados CORS).
5. Haz clic en **Deploy**.
6. Vercel te dará una URL HTTPS pública (ejemplo: `https://sekkan-monitor.vercel.app`).

---

### Paso 4: Vincular Frontend con Backend
Tienes dos formas sencillas de conectarlos:

- **Opción A (Desde la interfaz web sin tocar código):**
  Abre tu enlace de Vercel en el navegador, haz clic en el botón **⚙️ Servidor** en la esquina superior y pega tu URL de Render (`https://tu-backend.onrender.com`). ¡Se guardará al instante!
- **Opción B (En el código antes del push):**
  Edita el archivo `public/js/config.js` y coloca tu URL en:
  ```javascript
  DEFAULT_RENDER_URL: 'https://tu-backend.onrender.com',
  ```
  y haz `git commit` + `git push`.

---

## 💻 Ejecución Local en Red Escolar (Sin Nube)

Si prefieres usarlo 100% dentro de la red Wi-Fi de tu salón de clases:

```bash
# Iniciar servidor local
npm start
```

Verás en la consola las IPs disponibles (ej: `https://192.168.5.243:3000`).

> Para regenerar los certificados SSL locales para una nueva IP de Wi-Fi escolar:
> ```bash
> npm run generate-cert
> ```

---

## ✨ Características Principales

- **Mosaico Dinámico (Grid 1 a N):** Se adapta de 1 hasta 30 pantallas de forma fluida.
- **Zoom HD en Pantalla Completa:** Haz clic en la pantalla de cualquier alumno para observarla en alta definición con todo detalle.
- **Captura de Evidencia Fotográfica (Snapshot):** Botón para tomar una captura de pantalla instantánea con marca de agua (nombre del alumno, aula y fecha/hora exacta).
- **Llamadas de Atención Remotas:** Envía advertencias sonoras y visuales directas a la pantalla de un alumno (ej: *"Por favor regresa a tu actividad escolar"* o *"Cierra la ventana de juegos"*) o a todo el salón a la vez.
- **Alertas de Interrupción de Pantalla:** Si un alumno hace clic en *"Dejar de compartir"* o se desconecta, su tarjeta en el panel del profesor parpadea en rojo con un sonido de aviso inmediato.
- **PWA Instalable:** Compatible con la función "Instalar como aplicación" de Chrome y Safari.
- **Cliente Socket.io Independiente:** Incluye copia local en `public/js/socket.io.min.js` para garantizar que Vercel nunca falle por dependencias del backend.
