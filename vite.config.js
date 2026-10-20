import { defineConfig } from 'vite';
import backendApp from './server.js';

export default defineConfig({
  plugins: [
    {
      name: 'minerva-backend-api',
      configureServer(server) {
        // Mount Express REST API directly onto Vite dev server middleware pipeline
        server.middlewares.use(backendApp);
      }
    }
  ],
  server: {
    port: 3000,
    host: true
  }
});
