import { defineConfig } from 'vite';

// 相対パスで出力し、/cards/ など任意のパスの下に配信できるようにする
export default defineConfig({ base: './', test: { include: ['**/*.test.js'], exclude: ['node_modules/**', 'tests-e2e/**'] } });
