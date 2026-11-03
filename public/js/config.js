/**
 * Sekkan Screen Monitor - Configuración del Backend
 * Permite que el frontend en Vercel se comunique con el backend en Render
 */

const BACKEND_CONFIG = {
  // URL activa de tu servicio en Render
  DEFAULT_RENDER_URL: 'https://sekkan-screen-monitor.onrender.com',

  /**
   * Obtiene la URL activa del servidor backend (Render o Local)
   */
  getBackendUrl() {
    // 0. Si viene en el parámetro de la URL (?server=https://...)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const serverParam = urlParams.get('server');
      if (serverParam && serverParam.trim().startsWith('http')) {
        const clean = serverParam.trim().replace(/\/$/, '');
        localStorage.setItem('SEKKAN_BACKEND_URL', clean);
        return clean;
      }
    } catch (e) {}

    // 1. Si el usuario configuró una URL manual en la interfaz
    const saved = localStorage.getItem('SEKKAN_BACKEND_URL');
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/$/, '');
    }

    // 2. Si estamos en desarrollo local (localhost o red Wi-Fi local)
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.');
    if (isLocal) {
      if (window.location.port === '3000') {
        return window.location.origin;
      }
      return `${window.location.protocol}//${host}:3000`;
    }

    // 3. Servidor de Render por defecto
    if (this.DEFAULT_RENDER_URL && this.DEFAULT_RENDER_URL.trim()) {
      return this.DEFAULT_RENDER_URL.trim().replace(/\/$/, '');
    }

    // 4. Fallback al origen actual
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
      'Configura la URL de tu backend en Render:\n(Ejemplo: https://sekkan-screen-monitor.onrender.com)',
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
