/**
 * Sekkan Screen Monitor - Configuración del Backend
 * Permite que el frontend en Vercel se comunique con el backend en Render
 */

const BACKEND_CONFIG = {
  // Reemplaza esta URL con la URL de tu servicio Web en Render cuando lo crees
  // Ejemplo: 'https://sekkan-backend.onrender.com'
  DEFAULT_RENDER_URL: '',

  /**
   * Obtiene la URL activa del servidor backend (Render o Local)
   */
  getBackendUrl() {
    // 1. Si el usuario configuró una URL manual en la interfaz
    const saved = localStorage.getItem('SEKKAN_BACKEND_URL');
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/$/, '');
    }

    // 2. Si estamos en desarrollo local (localhost o red Wi-Fi local)
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.');
    if (isLocal) {
      // Si el frontend se sirve desde el mismo servidor Node (puerto 3000)
      if (window.location.port === '3000') {
        return window.location.origin;
      }
      // Si el frontend se ejecuta en otro puerto local (ej: Vite o LiveServer)
      return `${window.location.protocol}//${host}:3000`;
    }

    // 3. Si se definió una URL de Render por defecto en este archivo
    if (this.DEFAULT_RENDER_URL && this.DEFAULT_RENDER_URL.trim()) {
      return this.DEFAULT_RENDER_URL.trim().replace(/\/$/, '');
    }

    // 4. Si está en Vercel y aún no tiene URL configurada, usar el origen por defecto
    return window.location.origin;
  },

  /**
   * Guarda una nueva URL de backend en localStorage
   */
  setBackendUrl(url) {
    if (!url || !url.trim()) {
      localStorage.removeItem('SEKKAN_BACKEND_URL');
    } else {
      localStorage.setItem('SEKKAN_BACKEND_URL', url.trim().replace(/\/$/, ''));
    }
  },

  /**
   * Modal amigable para configurar la URL de Render desde la interfaz
   */
  promptConfig() {
    const current = this.getBackendUrl();
    const input = prompt(
      'Configura la URL de tu backend en Render:\n(Ejemplo: https://tu-servicio.onrender.com)',
      current === window.location.origin ? '' : current
    );

    if (input !== null) {
      this.setBackendUrl(input);
      alert('URL del servidor actualizada. La página se recargará.');
      window.location.reload();
    }
  }
};

window.BACKEND_CONFIG = BACKEND_CONFIG;
