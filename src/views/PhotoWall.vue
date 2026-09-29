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
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { initPhotoWall, destroyPhotoWall } from '../core/main.js';

const canvasRef = ref(null);
const router = useRouter();

onMounted(() => {
  // 未登录则回到登录页
  if (sessionStorage.getItem('photoWallLoggedIn') !== 'true') {
    router.push('/login');
    return;
  }
  // 初始化原生照片墙
  if (canvasRef.value) {
    initPhotoWall(canvasRef.value);
  }
});

onUnmounted(() => {
  // 组件销毁时清理事件和动画帧，防止内存泄漏
  if (canvasRef.value) {
    destroyPhotoWall(canvasRef.value);
  }
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
  outline: none;
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
.item:hover img { transform: scale(1.05); }
</style>