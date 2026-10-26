import { defineConfig } from 'vite';
import backendApp from './server.js';

// Vite serves the project folder, which also holds .env, the CA certificate, server
// code and import scripts. Only these paths reach the browser; everything else is a 404.
const PUBLIC_PATHS = [
  /^\/$/,
  /^\/(index|database|reports)\.html$/,
  /^\/(app|apiService)\.js$/,
  /^\/styles\.css$/,
  /^\/minerva-logo\.(png|svg)$/,
  /^\/api\//,
  /^\/@vite\/(client|env)$/,
  /^\/node_modules\/vite\/dist\/client\/[\w.-]+\.m?js$/,
  /^\/node_modules\/\.vite\/deps\/[\w.-]+$/,
];

export default defineConfig({
  plugins: [
    {
      name: 'minerva-public-paths',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const path = decodeURIComponent((req.url || '/').split('?')[0]);
          if (PUBLIC_PATHS.some((re) => re.test(path)) && !path.includes('..')) return next();
          res.statusCode = 404;
          res.end('Not found');
        });
      },
    },
    {
      name: 'minerva-backend-api',
      configureServer(server) {
        // Mount Express REST API directly onto Vite dev server middleware pipeline
        server.middlewares.use(backendApp);
      },
    },
  ],
  server: {
    port: 3000,
    // Local machine only. Use `npm run dev -- --host` to expose it on the network.
    host: 'localhost',
  },
});
