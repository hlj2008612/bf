import { state, setCanvas } from './state.js';
import { WORLD_W, WORLD_H } from './config.js';
import { buildCards, updateRender } from './renderer.js';
import { bindEvents, unbindEvents } from './input.js';

// 初始化照片墙（由 PhotoWall.vue 在 onMounted 时调用）
export async function initPhotoWall(canvasEl) {
    state.viewW = window.innerWidth;
    state.viewH = window.innerHeight;
    state.scrollX = WORLD_W / 2 - state.viewW / 2;
    state.scrollY = WORLD_H / 2 - state.viewH / 2;
    setCanvas(canvasEl);
    
    await buildCards(canvasEl);
    bindEvents(canvasEl);
    updateRender();
}

// 销毁照片墙（由 PhotoWall.vue 在 onUnmounted 时调用）
export function destroyPhotoWall(canvasEl) {
    unbindEvents(canvasEl);
    if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
    }
    state.canvas = null;
}