const fs = require('fs');
const path = require('path');
const os = require('os');
const selfsigned = require('selfsigned');

async function main() {
  const certDir = path.join(__dirname, 'certs');
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  // Obtener todas las IPs locales para agregarlas como Subject Alternative Names (SAN)
  const interfaces = os.networkInterfaces();
  const altNames = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        altNames.push({ type: 7, ip: net.address });
      }
    }
  }

  console.log('Generando certificado SSL autofirmado para:', altNames.map(a => a.value || a.ip).join(', '));

  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = await selfsigned.generate(attrs, {
    days: 365,
    algorithm: 'sha256',
    extensions: [{
      name: 'subjectAltName',
      altNames
    }]
  });

  fs.writeFileSync(path.join(certDir, 'key.pem'), pems.private);
  fs.writeFileSync(path.join(certDir, 'cert.pem'), pems.cert);

  console.log('✅ Certificados SSL generados exitosamente en /certs:');
  console.log('  - certs/cert.pem');
  console.log('  - certs/key.pem');
  console.log('\nAhora puedes reiniciar el servidor con `npm start` para habilitar HTTPS automático.');
}

main().catch(err => {
  console.error('Error al generar certificados:', err);
  process.exit(1);
});
