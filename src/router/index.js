import { createRouter, createWebHashHistory } from 'vue-router';
import Login from '../views/Login.vue';
import Home from '../views/Home.vue';
import PhotoWall from '../views/PhotoWall.vue';
import Cinema from '../views/Cinema.vue';
import Music from '../views/Music.vue';

const routes = [
  // 登录页：独立页面，不显示导航栏
  { path: '/login', name: 'Login', component: Login, meta: { hideNav: true } },
  
  // 照片墙：独立页面，不显示导航栏（沉浸式画布）
  { path: '/wall', name: 'PhotoWall', component: PhotoWall, meta: { requiresAuth: true, hideNav: true } },
  
  // 其他页面：正常显示导航栏
  { path: '/', name: 'Home', component: Home, meta: { requiresAuth: true } },
  { path: '/cinema', name: 'Cinema', component: Cinema, meta: { requiresAuth: true } },
  { path: '/music', name: 'Music', component: Music, meta: { requiresAuth: true } }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  const isLoggedIn = sessionStorage.getItem('photoWallLoggedIn') === 'true';
  if (to.meta.requiresAuth && !isLoggedIn) {
    next('/login');
  } else if (to.path === '/login' && isLoggedIn) {
    next('/');
  } else {
    next();
  }
});

export default router;