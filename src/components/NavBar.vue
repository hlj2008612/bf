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
import { useRoute } from 'vue-router';

const emit = defineEmits(['navigate', 'logout']);
const route = useRoute();

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
  { name: '画报', path: '/pictorial', title: 'PICTORIAL', color: '#a3e635' }
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

// 点击瞬间立即移动胶囊，然后才通知父组件导航。
//
// 【为什么先动胶囊再跳】转场要等父组件拿到实例后才开始擦入（约 .28s 的擦入动画
// 加上 440ms 的最小等待），若胶囊等路由变化后再动，用户会先看到胶囊"没反应"。
// 乐观更新让点击立刻有反馈。
//
// 【幂等】同一个路径重复点击直接返回，不触发父组件的导航去重逻辑
// （父组件同样有一道 route.path === target 的短路，两处都不多余：
//  父组件要防的是程序化调用，这里防的是重复点击带来的无意义 emit）。
const handleNavigate = async (item) => {
  if (currentPath.value === item.path) return;
  currentPath.value = item.path;
  await nextTick();
  updatePill();
  emit('navigate', item);
};

// 【为什么退出要委托给父组件】清登录态这件事必须【同步、且早于路由跳转】，
// 但真正发起导航的是 App.vue（它持有 router 并统一处理导航去重与竞态）。
// 所以这里只负责清除登录态，然后把跳转委托给父组件。
//
// 【为什么清除必须留在这里而不是父组件】router/index.js 有守卫
//   if (to.path === '/login' && isLoggedIn()) return '/';
// 如果登录态留到路由跳转那一刻才清，守卫会把 /login 弹回 '/'，退出就失败了。
// 所以必须在触发任何导航之前同步清掉。
//
// 注意：真正的导航由父组件的 handleLogout 发起，它会走 PtrTransition 的
// 擦除转场（擦入盖住 -> 切路由 -> 擦出揭示），见 src/App.vue。
const logout = () => {
  try {
    sessionStorage.removeItem('photoWallLoggedIn');
  } catch (e) {
    // 隐私模式下 sessionStorage 访问会抛异常，不能让退出按钮整个失效
  }
  emit('logout');
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

/*
 * 【修复】窄屏适配。
 *
 * 原样式没有任何 @media 断点，实测 375px 视口下：
 *   .glass-nav 实测宽 388px —— 比视口还宽。原因是全局没有 box-sizing: border-box，
 *   而 .glass-nav 是 width: 90% + padding: 0 24px + 1px 边框，
 *   内容盒 337.5px + 内边距 48px + 边框 2px = 388px，横向溢出视口 13px。
 *   内部可用宽度只剩 337px，装不下 logo + 4 个导航项 + 退出按钮，
 *   于是中文被逐字折行：logo「✦ 美琴子 ✦」被压成 34x120（4 行），
 *   导航项被压成 47x76（2~3 行），整个导航条文字变成竖排。
 *
 * 桌面端（>=768px）实测 logo 100x24、导航项高 36px，一切正常，
 * 所以断点取在 768px 以下，桌面样式一个像素都不动。
 *
 * box-sizing: border-box 只写在断点内 —— 写进 .glass-nav 基础规则会让
 * 桌面端宽度从 1202px 变成 1152px（少掉内边距的 50px），那是可见的改动。
 */
@media (max-width: 767px) {
  .glass-nav {
    box-sizing: border-box;
    width: 94%; height: 54px; padding: 0 12px; border-radius: 27px;
  }
  .nav-left { gap: 10px; min-width: 0; }
  .logo { font-size: 13px; letter-spacing: 0; white-space: nowrap; }
  .nav-items { gap: 3px; flex-shrink: 0; }
  .nav-link { font-size: 12px; padding: 6px 8px; white-space: nowrap; }
  .nav-right { flex-shrink: 0; }
  .logout-btn { font-size: 12px; padding: 6px 8px; gap: 4px; white-space: nowrap; }
}

/* 400px 以下再收紧一档，保证四个导航项 + 退出按钮仍能在一行内放下。 */
@media (max-width: 400px) {
  .glass-nav { width: 96%; padding: 0 8px; }
  .nav-left { gap: 6px; }
  .logo { font-size: 12px; }
  .nav-items { gap: 2px; }
  .nav-link { font-size: 12px; padding: 6px 6px; }
  .logout-btn { padding: 6px 6px; }
}
</style>