import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS com certificado autoassinado: exigido pela webcam quando o acesso
// vem de outra máquina da rede (http://192.168... não é "secure context").
// No notebook, aceite o aviso "Sua conexão não é particular" uma vez.
export default defineConfig({
  plugins: [basicSsl()],
  server: { host: true, port: 5173 },
  build: { target: 'esnext' }
});
