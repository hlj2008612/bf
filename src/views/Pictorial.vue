<template>
  <!--
    画报（/pictorial）—— 瀑布流照片卡片
    ----------------------------------------------------------------
    结构、尺寸、时长逐条对照 PICTORIAL_SPEC.md（主理人用真实 Chrome
    实测 forum.hanakos.cc 首页计算样式后记录）。

      .site-bg / .scanlines   固定背景层（纯深色 + 扫描线）
      main.pictorial-page     滚动容器，padding-top 给固定导航让位
        .pictorial-inner      最大宽 2200px 居中
          .pictorial-tabs     默认 / 热度 胶囊
          .masonry-grid       多列 flex
            .masonry-column   每列独立堆叠
              .card-shell     外层（承载入场动画与 hover 位移）
                .card-tilt    倾斜/视差层（本轮简化为静态）
                  .card-glass 玻璃卡片本体
  -->
  <div class="site-bg" aria-hidden="true"></div>
  <div class="scanlines" aria-hidden="true"></div>

  <main class="pictorial-page">
    <!--
      读屏用标题：参考站整个首屏就是卡片流本身，再叠一行大标题会破坏构图。
      但页面没有标题会让读屏用户失去定位，所以用 sr-only 提供，视觉上不可见。
    -->
    <h1 class="pictorial-sr-only">画报 · 照片卡片</h1>

    <div class="pictorial-inner">
      <div class="pictorial-tabs" role="group" aria-label="排序方式">
        <button type="button" class="pictorial-tab is-active" aria-pressed="true">默认</button>
        <!--
          「热度」刻意做成不可用：本项目没有任何真实互动数据（点赞/评论/收藏
          一律显示 0），若让它"生效"就只能靠伪造一个排序，等于骗人。
          保留按钮是为了维持参考站的两个胶囊的视觉结构；后端有真实数据时，
          把 aria-disabled 去掉并接上排序即可。
        -->
        <button
          type="button"
          class="pictorial-tab"
          aria-pressed="false"
          aria-disabled="true"
          title="暂无热度数据"
        >热度</button>
      </div>

      <div ref="gridRef" class="masonry-grid">
        <div v-for="(column, ci) in columns" :key="'col-' + ci" class="masonry-column">
          <div
            v-for="(card, i) in column"
            :key="card.uid"
            class="card-shell"
            :class="{ 'is-visible': revealed.has(card.uid), 'is-settled': animatedOnce.has(card.uid) }"
            :data-uid="card.uid"
            :style="{ '--card-delay': Math.min(i * 45, 270) + 'ms' }"
          >
            <div class="card-tilt">
              <article class="card-glass">
                <div class="card-media">
                  <img
                    :src="card.src"
                    :alt="'写真 NO.' + card.no"
                    :width="card.w"
                    :height="card.h"
                    :loading="card.eager ? 'eager' : 'lazy'"
                    decoding="async"
                    draggable="false"
                  />
                  <div class="card-media-fade" aria-hidden="true"></div>
                </div>

                <div class="card-author">
                  <!-- 头像与主图是同一张图（圆形裁切）；它是装饰性的重复，
                       alt 置空 + aria-hidden，避免读屏把同一张照片念两遍。 -->
                  <img
                    :src="card.src"
                    alt=""
                    aria-hidden="true"
                    width="40"
                    height="40"
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                  />
                  <span>美琴</span>
                </div>

                <div class="card-divider"></div>

                <div class="card-body">
                  <div class="card-body-inner">
                    <h2 class="card-title">写真 NO.{{ card.no }}</h2>
                    <!--
                      互动图标保留（它是参考站视觉语言的一部分，删掉卡片下半部
                      会空一块），但数字一律是 0 —— 本项目没有真实互动数据，
                      不伪造数字。整组对读屏隐藏：三个恒为 0 的数字没有信息量。
                    -->
                    <div class="card-actions" aria-hidden="true">
                      <span class="card-action">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                             stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
                             stroke-linejoin="round">
                          <path d="M12 20.3 10.6 19C6 14.9 3 12.2 3 8.9 3 6.2 5.1 4 7.8 4c1.5 0 3 .7 4.2 2 1.2-1.3 2.7-2 4.2-2C18.9 4 21 6.2 21 8.9c0 3.3-3 6-7.6 10.1L12 20.3Z" />
                        </svg>
                        <span class="card-action-count">0</span>
                      </span>
                      <span class="card-action">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                             stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
                             stroke-linejoin="round">
                          <path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 3v-4.2A7.5 7.5 0 0 1 8 4h5.5A7.5 7.5 0 0 1 21 11.5Z" />
                        </svg>
                        <span class="card-action-count">0</span>
                      </span>
                      <span class="card-action">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                             stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
                             stroke-linejoin="round">
                          <path d="M6 3.5h12v17l-6-4.2-6 4.2v-17Z" />
                        </svg>
                        <span class="card-action-count">0</span>
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
/**
 * 画报页脚本
 * ----------------------------------------------------------------
 * 三件事：把清单映射成卡片、把卡片贪心平衡地分到 N 列、滚动入场。
 * 没有引入任何瀑布流库 / 动画库（规格第 5.5 条）。
 */
import { nextTick, onMounted, onUnmounted, reactive, ref, shallowRef } from 'vue';
// 【必须】从 config.js 取 IMAGE_POOL，而不是直接取 imageManifest.js 的原始清单：
// config.js 的 validatePool() 会校验张数与字段，无效时返回空数组。
// 绕过它直接取模，空池时 entry 是 undefined，读 entry.thumb 会抛 TypeError
// 整页白屏（Cinema.vue 里记录过同样的实测）。空池时本页渲染空网格，符合规格第 5.4 条。
import { IMAGE_POOL } from '../core/config.js';
import { assetUrl } from '../core/imageManifest.js';

/** 序号补零：NO.07 而不是 NO.7，等宽视觉更整齐。 */
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * 卡片数据（一次性构建，不随列数变化重建）。
 * 地址必须走 assetUrl(entry.thumb)：清单里是 "images/thumbnails/1.webp" 这样的
 * 相对路径，前缀由 import.meta.env.BASE_URL 提供，子路径部署才不会 404。
 * 这里绝不能写死 /images/thumbnails/x.webp（规格第 5.1 条）。
 */
const cards = IMAGE_POOL
  // 清单条目必须带 id 与 thumb：缺 id 会让 :key 与 data-uid 全部变成 undefined
  // （Vue 报重复 key、卡片无法区分），缺 thumb 会请求 /undefined 拿 404。
  // 生成脚本目前总会写出这两个字段，这里只是防御，不改变正常路径。
  .filter((entry) => entry && entry.id != null && entry.thumb)
  .map((entry, i) => ({
    uid: entry.id,
    no: pad2(entry.id),
    src: assetUrl(entry.thumb),
    w: entry.w,
    h: entry.h,
    // 首屏前几张优先加载：全部 lazy 会让 LCP 等到滚动容器的懒加载判定，
    // 首屏出现一段空白。6 张 ≈ 一屏两行的量。
    eager: i < 6,
  }));

/* ------------------------------------------------------------ 列数 */

/**
 * 断点（规格第 4.1 条，建议值 1024 / 640）：
 *   桌面 ≥1024 → 5 列；平板 640–1023 → 3 列；手机 <640 → 2 列。
 * 与规格 2.1 的 640px 媒体查询边界对齐，避免"列数变了但间距没变"的错位。
 */
const getColumnCount = (width) => {
  if (width >= 1024) return 5;
  // 用 > 而不是 >=：样式表里的窄屏间距是 @media (max-width: 640px)，
  // 含 640 本身。两边取同一个边界，640px 整不会出现"3 列 + 窄间距"的错配。
  if (width > 640) return 3;
  return 2;
};

const viewportWidth = () => (typeof window === 'undefined' ? 1440 : window.innerWidth);

const columnCount = ref(getColumnCount(viewportWidth()));
const columns = shallowRef([]);
const gridRef = ref(null);

/* ------------------------------------------------ 贪心平衡分配（核心） */

/**
 * 实测到的卡片高度（uid → px）。挂载后由 measureHeights() 填入。
 * 规格第 4.2 条允许"固定估算值"，这里先估算、再实测纠正，两者都支持。
 */
const measured = new Map();

/**
 * 卡片除图片以外的固定高度估算（作者行 + 分隔线 + 正文区）。
 * 只在"还没测过"时用；实测后 measured 会覆盖它。
 */
const CHROME_ESTIMATE = 104;

/** 单张卡片的估算高度：图片是 1:1 正方形，高度 = 列宽；再加固定装饰高度。 */
const estimateHeight = (columnWidth) => columnWidth + CHROME_ESTIMATE;

/**
 * 贪心平衡分配：按原始顺序逐张放入【当前累计高度最短】的列。
 *
 * 【为什么不是轮询】轮询只在"所有卡片等高"时等价于平衡；一旦出现宽卡/无图卡
 * 这类高度不同的卡片，轮询会让某些列明显更长。贪心对任意高度分布都能把
 * 列高的极差压到最小。
 *
 * 【并列时取最左列】用严格小于比较，累计高度相同时不换目标，
 * 于是等高卡片会得到 0,1,2,3,4,0,1,… 的整齐落位（20 张 / 5 列 = 每列 4 张，
 * 与规格第 4.3 条一致），不会出现"第 5 列只有 1 张"这种偏斜。
 *
 * @param {number} count 列数
 * @returns {Array<Array<object>>} 每列的卡片数组
 */
function assignColumns(count) {
  const buckets = Array.from({ length: count }, () => []);
  if (!cards.length || count <= 0) return buckets;

  const totals = new Array(count).fill(0);
  const fallback = estimateHeight(gridRef.value?.firstElementChild?.clientWidth || 262);

  for (const card of cards) {
    let target = 0;
    for (let i = 1; i < count; i += 1) {
      if (totals[i] < totals[target]) target = i;
    }
    buckets[target].push(card);
    totals[target] += measured.get(card.uid) || fallback;
  }
  return buckets;
}

/** 分配结果的指纹，用来判断"重新分配后是否真的变了"，避免无意义的重复渲染。 */
const layoutKey = (buckets) => buckets.map((b) => b.map((c) => c.uid).join(',')).join('|');

/**
 * 实测已渲染卡片的高度（规格第 4.2 条：可在挂载后用 offsetHeight 实测）。
 * @returns {boolean} 是否有高度被更新
 */
function measureHeights() {
  const root = gridRef.value;
  if (!root) return false;

  let changed = false;
  const nodes = root.querySelectorAll('.card-shell[data-uid]');
  for (const node of nodes) {
    const uid = Number(node.dataset.uid);
    const h = node.offsetHeight;
    if (!Number.isFinite(h) || h <= 0) continue;
    if (measured.get(uid) !== h) {
      measured.set(uid, h);
      changed = true;
    }
  }
  return changed;
}

/* --------------------------------------------------------- 滚动入场 */

/** 已入场的卡片 uid。用 reactive(Set)：模板里 revealed.has() 会被追踪。 */
const revealed = reactive(new Set());

/**
 * 已经播过入场动画的 uid（普通 Set，故意不做响应式）。
 *
 * 【为什么需要】跨断点重排时 Vue 会把跨父列的 .card-shell 销毁重建。
 * 新节点一挂载就带 .is-visible，animation 会从头再跑一遍 1.1s，
 * 整片卡片重新模糊闪入（实测跨 5 列 -> 3 列时 20 张里有 14 张重播）。
 * 这里记住「已播过」，重建出的节点直接带 .is-settled 跳过动画。
 * 故意不响应式：只在渲染时读一次当时的值，不需要触发更新。
 */
const animatedOnce = new Set();
let observer = null;
/** 当前正在被 observer 观察的节点，用来清理已脱离文档的旧节点。 */
const observedNodes = new Set();

/**
 * 懒挂载 IntersectionObserver：只有浏览器支持时才创建。
 * 不支持时 observeCards() 会把所有卡片直接标成已入场（降级为无动画）。
 */
function ensureObserver() {
  if (observer) return observer;
  if (typeof IntersectionObserver === 'undefined') return null;

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const uid = Number(entry.target.dataset.uid);
        revealed.add(uid);
        animatedOnce.add(uid);
        observer.unobserve(entry.target);
        observedNodes.delete(entry.target);
      }
    },
    // 提前 240px 触发：等卡片真的进视口再播 1.1s 的模糊揭示，会看到"先空后闪"。
    { root: null, rootMargin: '240px 0px', threshold: 0 }
  );
  return observer;
}

/** 观察当前 DOM 里所有还没入场的卡片（重新分配列后要再调一次）。 */
function observeCards() {
  const root = gridRef.value;
  if (!root) return;

  const io = ensureObserver();
  const nodes = root.querySelectorAll('.card-shell[data-uid]');

  if (!io) {
    for (const node of nodes) { const uid = Number(node.dataset.uid); revealed.add(uid); animatedOnce.add(uid); }
    return;
  }

  // 【关键】先把已经脱离文档的旧节点移出观察列表。
  // 跨断点时 Vue 会销毁并重建跨父列的卡片，旧节点虽然已不在 DOM 里，
  // 却仍被 IntersectionObserver 强引用（连同整棵子树和 img），
  // 直到组件卸载才 disconnect()。实测连跨 4 次断点会留下 28 个游离节点。
  for (const node of observedNodes) {
    if (!node.isConnected) {
      io.unobserve(node);
      observedNodes.delete(node);
    }
  }

  for (const node of nodes) {
    const uid = Number(node.dataset.uid);
    if (revealed.has(uid)) continue;
    if (observedNodes.has(node)) continue;
    io.observe(node);
    observedNodes.add(node);
  }
}

/* --------------------------------------------------------- 布局调度 */

/** 重新分配并（必要时）重新渲染，然后实测高度、修正分配、重新观察。 */
async function rebuild() {
  const count = columnCount.value;
  const next = assignColumns(count);

  if (layoutKey(next) !== layoutKey(columns.value)) {
    columns.value = next;
    await nextTick();
  }

  // 实测纠正：首次渲染后卡片真实高度才可读。等高时这一步不会改变分配
  // （layoutKey 相同 → 不触发重渲染），只有出现高度不一的卡片才真的重排。
  if (measureHeights()) {
    const corrected = assignColumns(count);
    if (layoutKey(corrected) !== layoutKey(columns.value)) {
      columns.value = corrected;
      await nextTick();
    }
  }

  observeCards();
}

/* ------------------------------------------------------ 响应式列数 */

let rafId = 0;

/**
 * resize 用 requestAnimationFrame 节流（规格第 4.4 条）：
 * 拖动窗口时 resize 每秒能触发上百次，每次都重排会让主线程一直忙。
 */
function onResize() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    const next = getColumnCount(window.innerWidth);
    if (next === columnCount.value) return;
    columnCount.value = next;
    rebuild();
  });
}

onMounted(() => {
  // 先同步铺一次，避免首帧空网格闪一下。
  rebuild();
  window.addEventListener('resize', onResize, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  if (observer) {
    observer.disconnect();
    observedNodes.clear();
    observer = null;
  }
  measured.clear();
});

// 首屏同步布局：在 setup 阶段就把列填好，模板第一次渲染即有卡片。
columns.value = assignColumns(columnCount.value);
</script>

<style scoped>
/* ================================================================
   画报页样式
   ----------------------------------------------------------------
   ⚠️ @keyframes 是全局命名空间，scoped 不隔离它。
   项目里已有 ptr-*（main.css）与 cinema*（Cinema.vue），
   这里统一用 card / pictorial 前缀：cardEnterBlurReveal、cardSheenSweep。
   规格 2.11 写的 postEnterBlurReveal 不带前缀，按规格第 5.2 条改名。
   ================================================================ */

/* ---------------- 背景层 ---------------- */
/* 参考站的背景图是它自己的 mos-background-1920.webp，本项目没有这张图，
   按规格第 2.9 条改为纯深色（与 main.css 的 --bg 一致）+ 扫描线。 */
.site-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  background-color: #0d0d0d;
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
}

.scanlines {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.15),
    rgba(0, 0, 0, 0.15) 2px,
    rgba(0, 0, 0, 0.03) 2px,
    rgba(0, 0, 0, 0.03) 4px
  );
}

/* ---------------- 页面骨架 ----------------
   #app 在 App.vue 里是 overflow:hidden、height:100%，全局 main.css 也把
   html/body 的 overflow 钉死成 hidden。所以本页自己当滚动容器：
   height:100% + overflow-y:auto。这样不必改全局样式，
   也不会把 body 的滚动条（已被全局隐藏）搅进来。 */
.pictorial-page {
  --pictorial-accent: #a3e635;

  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  /* 给固定导航让位：NavBar top:20 + height:60 = 80，这里留 16px 呼吸 */
  padding-top: 96px;
  overflow-x: hidden;
  overflow-y: auto;
  /* 滚到顶/底时不要把滚动链传给 body（body 不滚，传过去只会产生橡皮筋） */
  overscroll-behavior-y: contain;
}

.pictorial-inner {
  box-sizing: border-box;
  width: 100%;
  max-width: 2200px;
  margin: 0 auto;
  padding: 2rem 2rem 5rem;
}

/* 只给读屏用的文本 */
.pictorial-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

/* ---------------- 标签胶囊 ---------------- */
.pictorial-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.pictorial-tab {
  border: 1px solid transparent;
  border-radius: 9999px;
  padding: 6px 16px;
  font-size: 14px;
  font-family: inherit;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease;
}

.pictorial-tab.is-active {
  font-weight: 600;
  background: rgba(255, 255, 255, 0.9);
  color: #000;
}

.pictorial-tab:not(.is-active) {
  font-weight: 400;
  color: rgba(255, 255, 255, 0.5);
}

.pictorial-tab:not(.is-active):hover {
  color: rgba(255, 255, 255, 0.8);
  border-color: rgba(255, 255, 255, 0.16);
}

.pictorial-tab[aria-disabled='true'] {
  cursor: not-allowed;
}

/* 主题色：青柠 #a3e635。参考站玻璃卡片的光泽扫过（规格 2.4 的
   rgba(190,242,99,.12)）本身就是这个色相，这里把它提为板块主色，
   与首页紫 #8b6ce8 / 照片墙蓝 #4a9eff / 影院金 #e4bb38 都能区分。 */
.pictorial-page :focus-visible {
  outline-color: var(--pictorial-accent);
}

/* ---------------- 瀑布流 ---------------- */
.masonry-grid {
  display: flex;
  align-items: flex-start;
  width: auto;
  margin-left: -1rem;
}

.masonry-column {
  /* 规格只给了 padding-left；等宽列需要 flex 撑开，否则列宽由内容决定。
     flex-basis:0 + min-width:0：每列内容宽 = (网格宽 - 5×1rem) / 5，
     1440px 视口下正好 262.4px，与规格第 2.1 条的实测 262.391px 吻合。 */
  flex: 1 1 0;
  min-width: 0;
  padding-left: 1rem;
  background-clip: padding-box;
}

.masonry-column > .card-shell {
  margin-bottom: 1rem;
}

/* ---------------- 卡片外壳 ---------------- */
.card-shell {
  position: relative;
  width: 100%;
  height: auto;
  contain: layout style;
  /* 入场前的初始态（规格 2.11）。is-visible 由 IntersectionObserver 打上。 */
  opacity: 0;
  filter: blur(24px);
  transform: translateY(20px);
  transition: transform 0.45s cubic-bezier(0.23, 1, 0.32, 1);
}

/* ⚠️ 顺序有意义：这条必须写在下面的 :hover 规则【之前】。
   两者优先级相同（0,2,0），后写的胜出，否则入场结束后 hover 位移会失效。 */
.card-shell.is-visible {
  opacity: 1;
  filter: none;
  transform: none;
  animation: cardEnterBlurReveal 1.1s cubic-bezier(0.23, 1, 0.32, 1) var(--card-delay, 0ms) backwards;
}

/* 已经播过入场动画、因跨断点被重建的卡片：直接显示，不再重播。
   必须写在 .is-visible 之后才能覆盖它的 animation。 */
.card-shell.is-visible.is-settled {
  animation: none;
}

@keyframes cardEnterBlurReveal {
  from {
    opacity: 0;
    filter: blur(24px);
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    filter: none;
    transform: none;
  }
}

/* 触屏没有真悬停：不加这层门控，移动端点过卡片会留下"粘住的"抬升态。 */
@media (hover: hover) and (pointer: fine) {
  .card-shell:hover {
    transform: translateY(-10px) scale(1.05);
    z-index: 20;
  }
}

.card-tilt {
  /* 参考站的倾斜/视差层由 JS 跟随指针实时计算；本轮按规格简化为静态，
     保留这层 DOM 是为了以后加视差时不必改模板结构。 */
  position: relative;
  transform: none;
}

/* ---------------- 玻璃卡片 ---------------- */
.card-glass {
  position: relative;
  width: 100%;
  height: auto;
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: rgba(0, 0, 0, 0.2) 0 8px 32px;
  background: rgba(25, 25, 35, 0.38);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  backdrop-filter: blur(20px) saturate(140%);
  transition:
    background-color 0.4s cubic-bezier(0.23, 1, 0.32, 1),
    border-color 0.4s cubic-bezier(0.23, 1, 0.32, 1),
    box-shadow 0.4s cubic-bezier(0.23, 1, 0.32, 1);
}

.card-glass:hover {
  background: rgba(35, 35, 48, 0.48);
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow:
    rgba(0, 0, 0, 0.4) 0 16px 48px,
    rgba(255, 255, 255, 0.1) 0 0 20px,
    rgba(255, 255, 255, 0.15) 0 1px 0 inset;
}

/* 光泽扫过（规格 2.4）：一条 115deg 的斜向高光，中间掺青柠色 */
.card-glass::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(
    115deg,
    transparent 38%,
    rgba(255, 255, 255, 0.16) 47%,
    rgba(190, 242, 99, 0.12) 53%,
    transparent 62%
  );
  transform: translateX(-130%);
  opacity: 0;
}

/* 顶部高光线（规格 2.5） */
.card-glass::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  opacity: 0;
  transition: opacity 0.3s;
}

.card-glass:hover::after {
  opacity: 1;
}

@media (hover: hover) and (pointer: fine) {
  .card-glass:hover::before {
    animation: cardSheenSweep 0.9s cubic-bezier(0.23, 1, 0.32, 1) 1;
  }
}

/* 参考站没在可读样式表里暴露这条 keyframes，按规格给的语义补 */
@keyframes cardSheenSweep {
  0% {
    transform: translateX(-130%);
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
  100% {
    transform: translateX(130%);
    opacity: 0;
  }
}

/* ---------------- 图片区 ---------------- */
.card-media {
  position: relative;
  overflow: hidden;
  contain: layout style paint;
  transform: translateZ(0);
  aspect-ratio: 1 / 1;
  background: rgba(255, 255, 255, 0.03);
}

.card-media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s cubic-bezier(0, 0, 0.2, 1);
}

.card-glass:hover .card-media img {
  transform: scale(1.04);
}

/* 底部渐变遮罩：让上浮的作者行与图片底部之间有过渡，不至于硬切 */
.card-media-fade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    transparent 30%,
    rgba(18, 13, 30, 0.45) 56%,
    rgba(18, 13, 30, 0.65) 84%,
    rgba(13, 10, 24, 0.8) 100%
  );
}

/* ---------------- 作者行 ---------------- */
.card-author {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0 1rem;
  /* 上浮盖住图片底部（规格 2.7） */
  margin-top: -1.25rem;
}

.card-author img {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  cursor: pointer;
}

.card-author img:hover {
  transform: scale(1.15) rotate(10deg);
}

.card-author span {
  position: relative;
  top: 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #fff;
}

.card-divider {
  margin: 0.625rem 1rem 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

/* ---------------- 正文区 ---------------- */
.card-body {
  padding: 0.25rem 0.5rem;
}

.card-body-inner {
  padding: 0.5rem 0.75rem 0.5rem 0.5rem;
}

.card-title {
  margin: 0 0 0.375rem;
  font-size: 1rem;
  font-weight: 500;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 0.5rem;
  gap: 0.25rem;
}

.card-action {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  /* 规格给的组间距只有 0.25rem，三组图标会挤在一起；
     用内边距把视觉间距撑到约 12px，同时不改规格里的 gap 值。 */
  padding: 0 0.25rem;
  color: rgba(255, 255, 255, 0.55);
}

.card-action-count {
  font-size: 0.75rem;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

/* ================================================================
   无障碍：prefers-reduced-motion
   ----------------------------------------------------------------
   src/assets/main.css 有一条全局规则，在 reduce 环境下把
   animation-duration 压到 0.01ms、transition-duration 压到 0.01ms（都是 !important）。
   对本页的影响与对策：

   1. 入场动画被压成 0.01ms —— 因为用了 backwards 填充，动画会瞬间跑完，
      之后回落到 .is-visible 的静态样式，卡片仍可见，不会白屏。
      但为了不依赖这个推理，这里直接把入场动画整个关掉并强制可见。
   2. 光泽扫过被压成 0.01ms —— 变成一次看不见的闪烁，直接禁用。
   3. 图片缩放 / 头像旋转 / 卡片抬升是纯动效，reduce 下全部取消；
      玻璃卡片的颜色、边框、阴影过渡保留（它们不产生位移，不引发不适）。
   ================================================================ */
@media (prefers-reduced-motion: reduce) {
  .card-shell {
    opacity: 1 !important;
    filter: none !important;
    transform: none !important;
    animation: none !important;
  }

  .card-glass::before {
    display: none !important;
  }

  .card-glass:hover .card-media img,
  .card-author img:hover,
  .card-shell:hover {
    transform: none !important;
  }
}

/* ================================================================
   窄屏适配（规格 2.1 的 640px 断点，数值逐字照抄）
   ================================================================ */
@media (max-width: 640px) {
  .masonry-grid {
    margin-left: -0.5rem;
  }

  .masonry-column {
    padding-left: 0.5rem;
  }

  .masonry-column > .card-shell {
    margin-bottom: 0.5rem;
  }

  .pictorial-inner {
    padding: 1rem 1rem 4rem;
  }

  .pictorial-page {
    /* 小屏导航同样 60px 高，但总高度紧张，收一点留白 */
    padding-top: 88px;
  }
}
</style>
