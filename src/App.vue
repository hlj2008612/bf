<template>
  <NavBar v-if="!route.meta.hideNav" @navigate="handleNavigate" />
  <router-view />
  <PageTransition v-if="!route.meta.hideNav" ref="transitionRef" />
</template>

<script setup>
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import NavBar from './components/NavBar.vue';
import PageTransition from './components/PageTransition.vue';

const route = useRoute();
const transitionRef = ref(null);

const handleNavigate = (item) => {
  if (!transitionRef.value) return;
  
  // 【关键】照片墙需要延迟到转场完全结束才切换路由
  // 其他页面保持"胶片覆盖时切换路由"的原行为
  const delayRoute = item.path === '/wall';
  
  transitionRef.value.play(item.title, item.color, item.path, { delayRoute });
};
</script>

<style>
body, html {
    margin: 0; padding: 0;
    height: 100vh; width: 100vw;
    background: #0d0d0d;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
}
#app { width: 100%; height: 100%; overflow: hidden; }
</style>