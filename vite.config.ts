import http from 'node:http';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => ({
  base: '/app/',
  define: {
    'import.meta.env.VITE_LOGIN_BASE_URL': JSON.stringify(process.env.VITE_LOGIN_BASE_URL || (mode === 'development' ? 'http://localhost:5174' : ''))
  },
  plugins: [vue()],
  server: {
    proxy: {
      '/micro': {
        target: 'http://localhost:5175',
        ws: true
      },
      // IAM 子应用 entry（DB 配 /app/iam/index.html）代理到 admin dev，避免打回门户自身导致 qiankun 白屏
      '/app/iam': {
        target: 'http://localhost:5175',
        ws: true
      },
      // 禁用 keep-alive：后端/nginx 重启后 proxy 不复用死连接（否则窗口期全 502）
      '/iam': { target: 'http://localhost:8179', agent: new http.Agent({ keepAlive: false }) },
      '/oauth2': { target: 'http://localhost:8179', agent: new http.Agent({ keepAlive: false }) }
    }
  },
  // preview 不继承 server.proxy（否则 dev 专用 /app/iam→5175 代理把生产 e2e 的门户入口打成 500）
  preview: {
    proxy: {
      '/iam': { target: 'http://localhost:8179', agent: new http.Agent({ keepAlive: false }) },
      '/oauth2': { target: 'http://localhost:8179', agent: new http.Agent({ keepAlive: false }) }
    }
  }
}));
