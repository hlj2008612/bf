<template>
  <nav class="glass-nav" @mousedown.stop @wheel.stop>
    <div class="nav-left">
      <span class="logo">✦ 美琴子 ✦</span>
      <div class="nav-items">
        <!-- 半透明高亮胶囊，根据 active 元素动态计算位置 -->
        <div class="active-pill" :style="pillStyle"></div>
        <a v-for="item in navItems" :key="item.path"
           ref="linkRefs"
           href="#"
           class="nav-link"
           :class="{ active: currentPath === item.path }"
           :aria-current="currentPath === item.path ? 'page' : undefined"
           :aria-label="item.name"
           @click.prevent="handleNavigate(item)">
          {{ item.name }}
        </a>
      </div>
    </div>
    <div class="nav-right">
      <a href="#" @click.prevent="logout" class="logout-btn">
        <span class="icon">⏻</span> 退出
      </a>
    </div>
  </nav>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const emit = defineEmits(['navigate']);
const route = useRoute();
const router = useRouter();

const currentPath = ref(route.path);
const pillStyle = ref({});

// 【修复】原来用 document.querySelector('.nav-link.active') 做全局查询：
// 依赖 DOM 里恰好只有一个 .active 元素，任何同名类（比如页面里别处的 .active）
// 都会让胶囊跑到错误的元素上。改为模板 ref + 按索引取值，不再有全局查找。
const linkRefs = ref([]);

const navItems = [
  { name: '首页', path: '/', title: 'HOME', color: '#8b6ce8' },
  { name: '照片墙', path: '/wall', title: 'GALLERY', color: '#4a9eff' },
  { name: '影院', path: '/cinema', title: 'CINEMA', color: '#e4bb38' },
  { name: '音乐', path: '/music', title: 'MUSIC', color: '#eb418d' }
];

// 计算胶囊宽度和位置（v-for 里的 ref 数组顺序与 navItems 一致）
const updatePill = () => {
  const idx = navItems.findIndex((item) => item.path === currentPath.value);
  const els = linkRefs.value;
  if (idx < 0 || !els || !els.length) return;

  // 用 getBoundingClientRect 相对 .nav-items 测量，避免依赖 offsetParent 链
  const activeEl = els.find((el) => el && el.classList.contains('active')) || els[idx];
  if (!activeEl) return;

  const parent = activeEl.offsetParent || activeEl.parentElement;
  if (!parent) return;

  const rect = activeEl.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  pillStyle.value = {
    width: `${Math.round(rect.width)}px`,
    transform: `translateX(${Math.round(rect.left - parentRect.left)}px)`
  };
};

// 监听路由变化，校准 active 状态
watch(
  () => route.path,
  async (newPath) => {
    currentPath.value = newPath;
    await nextTick();
    updatePill();
  }
);

onMounted(() => {
  updatePill();
  window.addEventListener('resize', updatePill);
});

onUnmounted(() => {
  window.removeEventListener('resize', updatePill);
});

// 点击瞬间立即移动胶囊，然后才触发转场
const handleNavigate = async (item) => {
  if (currentPath.value === item.path) return;
  currentPath.value = item.path;
  await nextTick();
  updatePill();
  emit('navigate', item);
};

const logout = () => {
  sessionStorage.removeItem('photoWallLoggedIn');
  router.push('/login');
};
</script>

<style scoped>
.glass-nav {
  position: fixed; top: 20px; left: 50%;
  transform: translateX(-50%);
  width: 90%; max-width: 1200px; height: 60px;
  background: rgba(15, 15, 25, 0.6);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 30px;
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 24px; z-index: 99999;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 10px rgba(74, 158, 255, 0.2);
}
.nav-left { display: flex; align-items: center; gap: 24px; }
.logo {
  font-weight: bold; font-size: 18px; letter-spacing: 1px;
  background: linear-gradient(90deg, #4a9eff, #a855f7);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.nav-items { position: relative; display: flex; gap: 8px; }
.nav-link {
  position: relative; z-index: 2;
  color: #a0a0a0; text-decoration: none; font-size: 15px;
  padding: 8px 16px; border-radius: 20px;
  transition: color 0.18s ease, text-shadow 0.18s ease;
  cursor: pointer;
}
.nav-link.active { color: #fff; text-shadow: 0 0 10px rgba(255, 255, 255, 0.5); }
.active-pill {
  position: absolute; top: 0; left: 0; height: 100%;
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 20px;
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), width 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 1; pointer-events: none;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.nav-right { display: flex; align-items: center; }
.logout-btn {
  color: #fff; text-decoration: none; font-size: 14px; padding: 8px 16px; border-radius: 20px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  display: flex; align-items: center; gap: 6px; transition: all 0.3s;
}
.logout-btn:hover { background: rgba(255, 70, 70, 0.2); border-color: rgba(255, 70, 70, 0.5); }
</style>