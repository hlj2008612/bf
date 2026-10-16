<template>
  <div id="canvas" ref="canvasRef"></div>
  
  <!-- 右上角圆形关闭按钮 -->
  <button class="close-btn" @click="handleClose" aria-label="关闭">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  </button>
</template>

<script setup>
import { onMounted, onUnmounted, ref, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { initPhotoWall, destroyPhotoWall, installCanvasAPI } from '../core/main.js';

const canvasRef = ref(null);
const router = useRouter();

// 代际令牌：onMounted 触发后若组件在异步期间被卸载，
// 这一次初始化就必须作废，绝不能把事件绑到已卸载的 canvas 上。
let generation = 0;

onMounted(async () => {
  // 未登录则回到登录页
  if (sessionStorage.getItem('photoWallLoggedIn') !== 'true') {
    router.push('/login');
    return;
  }
  const canvas = canvasRef.value;
  if (!canvas) return;

  const myGen = ++generation;

  // 等一帧：确保 <transition>/keep-alive 激活结束、元素已进入文档流并拿到布局，
  // 否则 viewW/viewH 可能与最终尺寸不一致。
  await nextTick();
  if (myGen !== generation) return;   // 已被卸载，放弃

  // 【关键】initPhotoWall 现在是同步的（内部不再 await 图片加载），
  // 因此不存在"await 期间组件被卸载"的窗口期。
  installCanvasAPI();
  initPhotoWall(canvas);
});

onUnmounted(() => {
  // 作废所有在途初始化
  generation++;
  destroyPhotoWall(canvasRef.value);
});

// 关闭按钮：返回首页
const handleClose = () => {
  router.push('/');
};
</script>

<style scoped>
#canvas {
  width: 100vw; height: 100vh;
  cursor: grab; position: relative; overflow: hidden;
}
#canvas:active { cursor: grabbing; }

/* 右上角圆形关闭按钮 */
.close-btn {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 99998;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(20, 20, 25, 0.55);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #ffffff;
  cursor: pointer;
  transition: all 0.25s ease;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
  padding: 0;
}
/* 键盘用户保留可见焦点环（main.css 里已有全局 :focus-visible 规则）。
   原来这里是 outline: none，会把键盘焦点环也一起抹掉。 */
.close-btn:focus-visible {
  outline: 2px solid #4a9eff;
  outline-offset: 2px;
}
.close-btn:hover {
  background: rgba(40, 40, 50, 0.75);
  border-color: rgba(255, 255, 255, 0.25);
  transform: scale(1.08);
}
.close-btn:active {
  transform: scale(0.96);
}
</style>

<style>
/* 卡片全局样式（原生 JS 生成，不能用 scoped） */
.item {
  position: absolute; border-radius: 16px; overflow: hidden; pointer-events: none;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); transition: box-shadow 0.3s ease;
  transform-origin: center center; display: flex; align-items: center; justify-content: center;
  backface-visibility: hidden;
}
.item img {
  position: relative; width: 100%; height: 100%; object-fit: contain;
  display: block; transition: transform 0.4s ease; flex-shrink: 0;
}
/* 注意：.item 是 pointer-events:none，:hover 永远不会命中（悬停放大由 JS 的
   state.hoverIndex 驱动，见 src/core/renderer.js 的 isHovered）。这条规则是死代码，
   保留只会误导后来者，故删除。 */
</style>