import { state, setCanvas } from './state.js';
import { WORLD_COLS, WORLD_ROWS, TOTAL_IMAGES, STEP, EPSILON } from './config.js';
import { mod } from './utils.js';

// 卡片尺寸缓存
const sizeCache = [];

// 异步加载所有图片，获取宽高比，计算卡片尺寸
async function initSizeCache() {
    const aspectRatios = {};
    const promises = [];

    for (let i = 1; i <= TOTAL_IMAGES; i++) {
        const img = new Image();
        img.src = `/images/thumbnails/${i}.webp`;
        const promise = new Promise((resolve) => {
            img.onload = () => {
                aspectRatios[i] = img.naturalWidth / img.naturalHeight;
                resolve();
            };
            img.onerror = () => {
                aspectRatios[i] = 1;
                resolve();
            };
        });
        promises.push(promise);
    }

    await Promise.all(promises);

    for (let gx = 0; gx < WORLD_COLS; gx++) {
        sizeCache[gx] = [];
        for (let gy = 0; gy < WORLD_ROWS; gy++) {
            const imgIdx = ((gx * 47 + gy * 31) % TOTAL_IMAGES + TOTAL_IMAGES) % TOTAL_IMAGES + 1;
            const ratio = aspectRatios[imgIdx] || 1;

            const baseArea = 180 * 180;
            let w = Math.sqrt(baseArea * ratio);
            let h = Math.sqrt(baseArea / ratio);

            const min = 140; const max = 210;
            if (w > max) { w = max; h = w / ratio; }
            if (h > max) { h = max; w = h * ratio; }
            if (w < min) { w = min; h = w / ratio; }
            if (h < min) { h = min; w = h * ratio; }

            sizeCache[gx][gy] = { w: Math.round(w), h: Math.round(h) };
        }
    }
}

const allCards = [];

// 构建所有卡片 DOM
export async function buildCards(canvasEl) {
    setCanvas(canvasEl);
    await initSizeCache();

    for (let col = 0; col < WORLD_COLS; col++) {
        for (let row = 0; row < WORLD_ROWS; row++) {
            const card = document.createElement('div');
            card.className = 'item';
            const img = document.createElement('img');
            const imgIdx = ((col * 47 + row * 31) % TOTAL_IMAGES + TOTAL_IMAGES) % TOTAL_IMAGES + 1;
            img.src = `/images/thumbnails/${imgIdx}.webp`;
            img.decoding = 'async';
            img.loading = 'lazy';
            card.appendChild(img);
            canvasEl.appendChild(card);
            allCards.push({
                el: card, col, row,
                baseW: sizeCache[col][row].w,
                baseH: sizeCache[col][row].h,
                imgIdx
            });
        }
    }
}

// 核心渲染函数
export function updateRender() {
    const dynamicScale = Math.min(1.4, Math.max(0.5, Math.min(state.viewW / 1400, state.viewH / 900)));
    const currentStep = STEP * dynamicScale;
    const centerX = state.viewW / 2;
    const centerY = state.viewH / 2;
    const maxDist = Math.hypot(centerX, centerY);
    const margin = 250;

    const buffer = 2;
    const startCol = Math.floor(-state.scrollX / currentStep + EPSILON) - buffer;
    const startRow = Math.floor(-state.scrollY / currentStep + EPSILON) - buffer;
    const colsNeeded = Math.ceil(state.viewW / currentStep) + buffer * 2;
    const rowsNeeded = Math.ceil(state.viewH / currentStep) + buffer * 2;

    // 视口虚拟化：只计算可见范围
    const visibleSet = new Set();
    for (let i = 0; i < colsNeeded; i++) {
        for (let j = 0; j < rowsNeeded; j++) {
            visibleSet.add(`${mod(startCol + i, WORLD_COLS)},${mod(startRow + j, WORLD_ROWS)}`);
        }
    }

    for (const card of allCards) {
        if (!visibleSet.has(`${card.col},${card.row}`)) {
            card.el.style.display = 'none';
            continue;
        }

        // 无缝无限滚动：找距离屏幕中心最近的网格坐标
        let bestGridX = null, bestGridY = null;
        let bestDist = Infinity, bestDistY = Infinity;
        for (let k = -2; k <= 2; k++) {
            const cellX = (card.col + k * WORLD_COLS) * currentStep + state.scrollX;
            if (Math.abs(cellX + currentStep / 2 - centerX) < bestDist) { 
                bestDist = Math.abs(cellX + currentStep / 2 - centerX); 
                bestGridX = card.col + k * WORLD_COLS; 
            }
        }
        for (let k = -2; k <= 2; k++) {
            const cellY = (card.row + k * WORLD_ROWS) * currentStep + state.scrollY;
            if (Math.abs(cellY + currentStep / 2 - centerY) < bestDistY) { 
                bestDistY = Math.abs(cellY + currentStep / 2 - centerY); 
                bestGridY = card.row + k * WORLD_ROWS; 
            }
        }

        const cellX = bestGridX * currentStep + state.scrollX;
        const cellY = bestGridY * currentStep + state.scrollY;
        const scaledW = Math.round(card.baseW * dynamicScale);
        const scaledH = Math.round(card.baseH * dynamicScale);
        const posX = Math.round(cellX + (currentStep - scaledW) / 2);
        const posY = Math.round(cellY + (currentStep - scaledH) / 2);

        // 二次屏幕外剔除
        if (posX + scaledW < -margin || posX > state.viewW + margin ||
            posY + scaledH < -margin || posY > state.viewH + margin) {
            card.el.style.display = 'none';
            continue;
        }

        card.el.style.display = '';
        card.el.style.width = scaledW + 'px';
        card.el.style.height = scaledH + 'px';
        card.el.style.left = posX + 'px';
        card.el.style.top = posY + 'px';

        // 中心放大镜效果
        const dist = Math.hypot(posX + scaledW / 2 - centerX, posY + scaledH / 2 - centerY);
        const scale = 0.6 + ((maxDist - dist) / maxDist) * 1.2;
        card.el.style.transform = `scale(${scale.toFixed(3)})`;
        card.el.style.zIndex = Math.round(10000 - dist * 10);
    }
}