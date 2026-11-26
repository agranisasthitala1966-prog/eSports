import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

function computeDevSourceVersion(rootDir: string): string {
  const targets = [
    path.join(rootDir, 'index.html'),
    path.join(rootDir, 'public', 'sw.js'),
    path.join(rootDir, 'public', 'manifest.json'),
    path.join(rootDir, 'src'),
  ];
  let maxMtime = 0;
  const scan = (targetPath: string) => {
    try {
      const st = fs.statSync(targetPath);
      if (st.isDirectory()) {
        for (const entry of fs.readdirSync(targetPath)) {
          scan(path.join(targetPath, entry));
        }
      } else if (st.mtimeMs > maxMtime) {
        maxMtime = st.mtimeMs;
      }
    } catch {
      // ignore
    }
  };
  targets.forEach(scan);
  return `dev-${Math.round(maxMtime) || Date.now()}`;
}

function esportsVersionPlugin(): Plugin {
  const prodBuildVersion = `build-${Date.now()}`;
  let isBuildCommand = false;
  let rootDir = process.cwd();

  return {
    name: 'esports-app-version',
    configResolved(config) {
      isBuildCommand = config.command === 'build';
      rootDir = config.root || process.cwd();
    },
    transformIndexHtml(html) {
      const version = isBuildCommand ? prodBuildVersion : computeDevSourceVersion(rootDir);
      const cleanHtml = html.replace(/<meta\s+name="esports-app-version"[^>]*>\s*/gi, '');
      return cleanHtml.replace(
        '</head>',
        `    <meta name="esports-app-version" content="${version}" />\n  </head>`,
      );
    },
    closeBundle() {
      if (!isBuildCommand) return;
      try {
        const distDir = path.join(rootDir, 'dist');
        if (fs.existsSync(distDir)) {
          fs.writeFileSync(
            path.join(distDir, 'app-version.json'),
            JSON.stringify({ version: prodBuildVersion, builtAt: new Date().toISOString() }, null, 2),
            'utf8',
          );
        }
      } catch {
        // ignore
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), esportsVersionPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      rolldownOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/firebase/')) {
              return 'vendor-firebase';
            }
            if (id.includes('node_modules/xlsx/')) {
              return 'vendor-xlsx';
            }
            if (id.includes('node_modules/lucide-react/')) {
              return 'vendor-icons';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
