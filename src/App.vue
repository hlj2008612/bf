<template>
  <NavBar v-if="!route.meta.hideNav" @navigate="handleNavigate" @logout="handleLogout" />
  <router-view />
  <PageTransition v-if="!route.meta.hideNav" ref="transitionRef" />
  <!-- 原生照片墙的调试入口（window.canvasAPI），由 src/core/main.js 安装 -->
</template>

<script setup>
import { defineAsyncComponent, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import NavBar from './components/NavBar.vue';

const route = useRoute();
const router = useRouter();
const transitionRef = ref(null);

// 【为什么要异步】PageTransition 是 gsap 的唯一使用者（23.93 kB br），
// 而 <PageTransition v-if="..."> 只挡住"渲染"，挡不住"加载"：静态 import
// 会被 Rollup 在构建期解析，gsap 会进初始 chunk，/login 和 /wall 首屏都白下它。
// 注意：这里用【同一个】import() 表达式取模块，再交给 defineAsyncComponent，
// 这样加载器与组件注册共用一次请求，不会产生重复 chunk。
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

const handleNavigate = async (item) => {
  await ensureTransitionReady();

  // 【关键】照片墙需要延迟到转场完全结束才切换路由
  // 其他页面保持"胶片覆盖时切换路由"的原行为
  const delayRoute = item.path === '/wall';

  // play() 返回 false 表示上一个转场还没播完、本次被丢弃。
  // 只有 delayRoute 模式下点击才会被吞掉（非延迟模式的跳转是转场内部自己发的），
  // 所以这种情况必须自己补一次导航。也涵盖"组件实例仍未就绪（加载失败）"。
  const accepted = transitionRef.value
    ? transitionRef.value.play(item.title, item.color, item.path, { delayRoute })
    : false;

  if (!accepted) {
    router.push(item.path);
  }
};

/**
 * 退出登录（带转场）。
 *
 * 调用时 sessionStorage 里的登录标记【已经被 NavBar 清掉】了，这是必须的：
 * router/index.js:40 的守卫是 `if (to.path === '/login' && isLoggedIn()) return '/'`，
 * 若标记还在，跳 /login 会被弹回首页，退出直接失败。
 *
 * delayRoute 必须为 true：/login 的 meta 是 hideNav，一旦提前跳路由，
 * App.vue 上的 <PageTransition v-if="!route.meta.hideNav"> 会立刻卸载，
 * GSAP timeline 随组件销毁，退场动画（胶片滑出、标题擦除）根本播不出来 ——
 * 观感是胶片卡在屏幕上然后突然消失。/wall 用 delayRoute 也是同一个原因。
 */
const handleLogout = async () => {
  await ensureTransitionReady();

  // 【为什么这里的兜底是必须的，而不是"顺手加一下"】
  // NavBar 在发出本事件之前【已经同步清掉了 sessionStorage 里的登录标记】。
  // 如果这次 play() 被 isTransitioning 挡下（转场约 1.1 秒，且转场层是
  // pointer-events:none，NavBar 全程可点，所以用户真的能连点），
  // 那么：登录态没了、路由又没跳 -> 用户停在原页面，点了退出却毫无反应。
  // 因此只要转场没被接受，就必须立刻补一次导航，把状态收干净。
  const accepted = transitionRef.value
    ? transitionRef.value.play(LOGOUT_THEME.title, LOGOUT_THEME.color, LOGOUT_THEME.path, {
        delayRoute: true
      })
    : false;

  if (!accepted) {
    router.push(LOGOUT_THEME.path);
  }
};
</script>

<!--
  body / html 的全局样式（margin、height、背景、user-select、字体）统一由
  src/assets/main.css 负责，这里只保留 #app 自身特有的规则，避免两处真相。
-->
<style>
#app { width: 100%; height: 100%; overflow: hidden; }
</style>