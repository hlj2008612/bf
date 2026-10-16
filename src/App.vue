<template>
  <NavBar v-if="!route.meta.hideNav" @navigate="handleNavigate" />
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

const handleNavigate = async (item) => {
  await ensureTransitionReady();

  // 【关键】照片墙需要延迟到转场完全结束才切换路由
  // 其他页面保持"胶片覆盖时切换路由"的原行为
  const delayRoute = item.path === '/wall';

  if (transitionRef.value) {
    transitionRef.value.play(item.title, item.color, item.path, { delayRoute });
  } else {
    // 组件实例仍未就绪（加载失败等）也必须完成导航，不能静默丢弃点击
    router.push(item.path);
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