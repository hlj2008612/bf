import { WORLD_W, WORLD_H } from './config.js';

// ================================================================
//  原生照片墙全局状态
//  【维护提示】：scrollX / velocityX 更新极频繁，
//  不要改成 Vue 的 ref / reactive，否则会造成严重性能问题
// ================================================================

export const state = {
    viewW: window.innerWidth,
    viewH: window.innerHeight,
    scrollX: WORLD_W / 2 - window.innerWidth / 2,
    scrollY: WORLD_H / 2 - window.innerHeight / 2,
    
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    lastMoveTime: 0,
    
    velocityX: 0,
    velocityY: 0,
    inertiaActive: false,
    
    moveDxHistory: [],
    moveDyHistory: [],
    
    needsUpdate: true,
    rafId: null,
    canvas: null,
};

export function setCanvas(el) {
    state.canvas = el;
}