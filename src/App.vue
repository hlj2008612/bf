<template>
  <NavBar v-if="!route.meta.hideNav" @navigate="handleNavigate" @logout="handleLogout" />
  <router-view />
  <PageTransition v-if="!route.meta.hideNav && !useNativeTransition" ref="transitionRef" />
  <!-- 原生照片墙的调试入口（window.canvasAPI），由 src/core/main.js 安装 -->
</template>

<script setup>
import { defineAsyncComponent, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import NavBar from './components/NavBar.vue';
import {
  supportsViewTransition,
  resolveDirection,
  playTransition
} from './core/pageTransition';

const route = useRoute();
const router = useRouter();
const transitionRef = ref(null);

// 【为什么要有这个开关】
// 支持 View Transitions 的浏览器走新的立方体翻转引擎；不支持的（Safari < 18、
// 部分老 Firefox）必须退回原来的 GSAP 胶片转场 —— 那是老浏览器上唯一的转场。
// 在模块作用域求值一次即可：能力在页面生命周期内不会变化，
// 且 SSR 场景下 supportsViewTransition() 内部已经做了 typeof document 保护。
const useNativeTransition = supportsViewTransition();

// 【为什么要异步】PageTransition 是 gsap 的唯一使用者（23.93 kB br），
// 而 <PageTransition v-if="..."> 只挡住"渲染"，挡不住"加载"：静态 import
// 会被构建器在构建期解析，gsap 会进初始 chunk，/login 和 /wall 首屏都白下它。
// 注意：这里用【同一个】import() 表达式取模块，再交给 defineAsyncComponent，
// 这样加载器与组件注册共用一次请求，不会产生重复 chunk。
//
// 【重要】支持 VT 时 useNativeTransition 为 true，上面的 v-if 会短路，
// 浏览器【永远不会】去加载这个动态 import —— gsap 分块因此不会下发。
// 但 PageTransition.vue 与这个 import() 都【必须保留】：老浏览器上没有它就没有转场。
const pageTransitionLoader = () => import('./components/PageTransition.vue');
const PageTransition = defineAsyncComponent(pageTransitionLoader);

let transitionChunk = null;

// 【防竞态】异步组件在首次导航时可能还没加载完，transitionRef.value 会是 null。
// 若直接 return，用户点"照片墙"会既不转场也不跳转 —— 那是比多下 24 kB 更糟的回归。
// 所以这里先 await 模块就绪（同一 promise，不会二次请求），再调用 play()。
const ensureTransitionReady = () => {
  if (!transitionChunk) transitionChunk = pageTransitionLoader();
  return transitionChunk.catch(() => null);
};

// 退出的转场主题：暗红色，与 .logout-btn:hover 的红色反馈呼应。
// 想换颜色只改这一处即可。
const LOGOUT_THEME = { title: '退出中', color: '#e0484f', path: '/login' };

/**
 * 播放一次转场并导航。
 *
 * 新引擎（支持 View Transitions）与旧引擎（GSAP）二选一：
 *   - 新引擎：playTransition() 内部已经把 router.push 包进 startViewTransition 回调，
 *     自己完成导航，调用方不需要再补 push（它的 promise 只在导航完成/降级后 resolve）。
 *   - 旧引擎：沿用原来的 play() 语义 —— 返回 false 表示上一轮转场还没播完、本次被丢弃，
 *     此时必须由调用方补一次 router.push，否则点击会被静默吞掉。
 *
 * @param {string} target 目标路径
 * @param {{title: string, color: string}} theme 旧引擎用的转场主题（新引擎不需要）
 * @param {{delayRoute?: boolean}} options 旧引擎的延迟路由开关
 */
const runTransition = async (target, theme, options = {}) => {
  if (useNativeTransition) {
    // 方向由顺序表判定；不在表里（例如 /login）或相同路径时 getDirection 返回 null，
    // resolveDirection 会回退成 next —— 与参考站 v() 的缺省处理一致，
    // 也就是"仍然播放动画"，而不是"跳过动画"。
    // 降级（reduced-motion / 页面隐藏 / 不支持）也由 playTransition 内部处理并保证 push。
    try {
      await playTransition(router, target, resolveDirection(route.path, target));
    } catch (e) {
      // playTransition 已经在自己内部兜底过 router.push，这里只是最后一道保险。
      console.warn('[App] 转场失败，降级为直接跳转：', e);
      router.push(target);
    }
    return;
  }

  // ---- 以下为不支持 View Transitions 时的 GSAP 老路径，行为与改动前一致 ----
  await ensureTransitionReady();

  // 【关键】照片墙需要延迟到转场完全结束才切换路由
  // 其他页面保持"胶片覆盖时切换路由"的原行为
  const delayRoute = target === '/wall';

  // play() 返回 false 表示上一个转场还没播完、本次被丢弃。
  // 只有 delayRoute 模式下点击才会被吞掉（非延迟模式的跳转是转场内部自己发的），
  // 所以这种情况必须自己补一次导航。也涵盖"组件实例仍未就绪（加载失败）"。
  const accepted = transitionRef.value
    ? transitionRef.value.play(theme.title, theme.color, target, { delayRoute })
    : false;

  if (!accepted) {
    router.push(target);
  }
};

/**
 * 导航（带转场）。
 *
 * 【为什么这里不再区分 delayRoute】新引擎由 startViewTransition 统一接管导航时机：
 * 它在回调里 push，并返回 800ms 兜底 Promise 让浏览器等新视图渲染完再抓快照，
 * 所以 /wall 与其它页面对它来说没有区别。delayRoute 只在 GSAP 分支里保留。
 */
const handleNavigate = async (item) => {
  await runTransition(item.path, { title: item.title, color: item.color });
};

/**
 * 退出登录（带转场）。
 *
 * 调用时 sessionStorage 里的登录标记【已经被 NavBar 清掉】了，这是必须的：
 * router/index.js:40 的守卫是 to.path === /login && isLoggedIn() 时弹回 /，
 * 若标记还在，跳 /login 会被弹回首页，退出直接失败。
 *
 * /login 不在顺序表里，所以 resolveDirection 会回退 next，立方体照常翻转。
 *
 * 【旧引擎分支为什么 delayRoute 必须为 true】/login 的 meta 是 hideNav，一旦提前跳路由，
 * App.vue 上的 <PageTransition v-if="!route.meta.hideNav"> 会立刻卸载，
 * GSAP timeline 随组件销毁，退场动画（胶片滑出、标题擦除）根本播不出来 ——
 * 观感是胶片卡在屏幕上然后突然消失。/wall 用 delayRoute 也是同一个原因。
 */
const handleLogout = async () => {
  await runTransition(LOGOUT_THEME.path, LOGOUT_THEME, { delayRoute: true });
};
</script>

<!--
  body / html 的全局样式（margin、height、背景、user-select、字体）统一由
  src/assets/main.css 负责，这里只保留 #app 自身特有的规则，避免两处真相。
-->
<style>
#app { width: 100%; height: 100%; overflow: hidden; }
</style>
