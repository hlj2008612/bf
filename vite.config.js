import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: '/', // 如果你的网站部署在子路径，改成 '/仓库名/'
});