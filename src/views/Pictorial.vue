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
            <div
              class="card-tilt"
              @mouseenter="onTiltEnter"
              @mousemove="onTiltMove"
              @mouseleave="onTiltLeave"
            >
              <article class="card-glass">
                <div class="card-media">
                  <img
                    :src="card.src"
                    alt="写真"
                    :width="card.w"
                    :height="card.h"
                    :loading="card.eager ? 'eager' : 'lazy'"
                    decoding="async"
                    draggable="false"
                  />
                  <div class="card-media-fade" aria-hidden="true"></div>
                </div>

                <div class="card-author">
                  <!--
                    头像 = 打开照片预览的按钮（复刻参考站点头像弹出 popover 的交互，
                    内容换成这张卡对应的照片）。

                    【为什么用 <button> 包一个 img，而不是给 img 加 tabindex】
                    .card-shell 带 contain: layout style，卡片又是被 hover 抬升的层，
                    在 img 上直接绑键盘事件要自己补 role/tabindex/Enter·Space 处理，
                    还容易在 Firefox 里出现「可聚焦 img」的读屏歧义。用原生 button
                    一次拿到键盘可达、Enter/Space 触发、以及不依赖 i18n 的语义。

                    【alt 仍然置空】读屏信息由 button 的 aria-label 承担（它是图片本身，
                    不是"美琴的头像"），图片再报一次照片编号只会念两遍。
                  -->
                  <button
                    type="button"
                    class="card-avatar"
                    :aria-label="'预览照片 ' + padId(card.uid)"
                    :aria-expanded="activeCard && activeCard.uid === card.uid ? 'true' : 'false'"
                    aria-haspopup="dialog"
                    :data-uid="card.uid"
                    @click.stop="togglePreview($event, card)"
                  >
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
                  </button>
                  <span>美琴</span>
                </div>

                <div class="card-divider"></div>

                <div class="card-body">
                  <div class="card-body-inner">
                    <!--
                      标题行原本是 <h2 class="card-title">写真</h2>，已按需求删除：
                      每张卡片的标题都是同一个词，没有信息量，反而占走正文区第一行。
                      现在 .card-body-inner 里只剩互动图标那一行（padding 不变，
                      首行留白由 .card-body-inner 的 padding-top 提供）。
                    -->
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

  <!--
    照片预览弹层（仿参考站点开头像弹出的 popover，内容是这张卡对应的照片）。

    【为什么 Teleport 到 body】
    本页滚动容器 .pictorial-page 是 overflow:auto，祖先还有 #app 的 overflow:hidden。
    只要弹层留在卡片 DOM 里，任何 ancestor 的 overflow 都会把它裁掉；
    而且卡片 hover 时带 transform（translateY(-10px) scale(1.05)），
    transform 会另建包含块，position:fixed 在那里面会变成相对卡片定位。
    Teleport 到 body + position:fixed 才真正相对视口。

    v-if 而不是 v-show：关闭时必须从 DOM 移除，否则那张 1600px 的 full 图
    会一直留在内存里，20 张卡片来回点会累积。

    @click.stop 必须写在弹层容器上（见脚本里的注释）：
    弹层的点击不能被 document 上的"点外部关闭"监听器当成"点在外部"。
  -->
  <Teleport to="body">
    <div
      v-if="activeCard"
      ref="popoverRef"
      class="card-popover"
      :class="popoverAnim === 'closing' ? 'is-closing' : 'is-open'"
      :data-side="popoverState.side"
      :data-align="popoverState.align"
      role="dialog"
      aria-modal="false"
      tabindex="-1"
      :aria-label="'照片 ' + padId(activeCard.uid) + ' 预览'"
      :style="popoverStyle"
      @click.stop
      @animationend="onPopoverAnimEnd"
    >
      <div class="card-popover-media">
        <img
          :src="activeCard.full"
          :alt="'照片 ' + padId(activeCard.uid) + ' 大图'"
          decoding="async"
          draggable="false"
          @load="onPopoverImgLoad"
          @error="onPopoverImgError"
        />
      </div>
      <div class="card-popover-bar">
        <span class="card-popover-no">NO.{{ padId(activeCard.uid) }}</span>
        <span class="card-popover-cap">美琴 · 画报</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * 画报页脚本
 * ----------------------------------------------------------------
 * 三件事：把清单映射成卡片、把卡片贪心平衡地分到 N 列、滚动入场。
 * 没有引入任何瀑布流库 / 动画库（规格第 5.5 条）。
 */
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef } from 'vue';
// 【必须】从 config.js 取 IMAGE_POOL，而不是直接取 imageManifest.js 的原始清单：
// config.js 的 validatePool() 会校验张数与字段，无效时返回空数组。
// 绕过它直接取模，空池时 entry 是 undefined，读 entry.thumb 会抛 TypeError
// 整页白屏（Cinema.vue 里记录过同样的实测）。空池时本页渲染空网格，符合规格第 5.4 条。
import { IMAGE_POOL } from '../core/config.js';
import { assetUrl } from '../core/imageManifest.js';

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
    src: assetUrl(entry.thumb),
    // 头像弹层用的大图：清单里 full 是 1600px 版本（见 imageManifest.js 的 ImageEntry）。
    // 继续走 assetUrl()，而不是手拼路径 —— 子路径部署（gh-pages 的 /mqz/）才不会 404。
    // full 字段缺失时退回 thumb：宁可糊一点，也不要弹层里是张裂图。
    full: assetUrl(entry.full || entry.thumb),
    w: entry.w,
    h: entry.h,
    // 原图像素宽高，弹层按它算显示高宽比（w/h 是缩略图的宽度，比例相同但语义不同）。
    fw: entry.w,
    fh: entry.h,
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
  // 点窗口外（切到别的应用 / 地址栏）时关闭预览：非模态弹层留在屏幕上没有意义。
  window.addEventListener('blur', handleWindowBlur);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  window.removeEventListener('blur', handleWindowBlur);

  // 弹层：先终止出场定时器，再解绑全局监听，最后清状态。
  // 【顺序不能反】closePreview() 会重新挂一个定时器并再次调 detach，
  // 这里直接走幂等的清理路径，不留任何异步尾巴。
  clearCloseTimer();
  detachGlobalListeners();
  activeCard.value = null;
  popoverAnim.value = 'idle';
  popoverAnchor = null;
  popoverState.side = 'bottom';
  popoverState.align = 'start';
  popoverState.top = 0;
  popoverState.left = 0;

  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  if (observer) {
    observer.disconnect();
    observedNodes.clear();
    observer = null;
  }
  measured.clear();

  // 倾斜视差可能还排着一个 rAF：不取消的话，卸载后回调仍会跑一次
  // （applyTilt 里有 isConnected 守卫，但取消更干净，也避免持有元素引用）。
  if (tiltRaf) {
    cancelAnimationFrame(tiltRaf);
    tiltRaf = 0;
  }
  tiltBox = null;
});

/* --------------------------------------------------- 3D 倾斜视差 */

/**
 * 悬停时的 3D 倾斜与视差（逐字复刻参考站）。
 *
 * 参考站源码（page chunk @1341 附近的 S 组件）：
 *   onMouseEnter 量一次卡片矩形，记 cx/cy/w/h，加 .is-tilting
 *   onMouseMove  归一化 n = clamp((x-cx)/w, -0.5, 0.5)、r = clamp((y-cy)/h, -0.5, 0.5)
 *                然后写 6 个自定义属性：
 *                  --tilt-x      = (-(2*r*6)).toFixed(2) + 'deg'   垂直倾斜，最大 ±6deg
 *                  --tilt-y      = ((2*n*8)).toFixed(2) + 'deg'    水平倾斜，最大 ±8deg
 *                  --card-par-x  = ((2*n*10)).toFixed(1) + 'px'    图片视差，最大 ±10px
 *                  --card-par-y  = ((2*r*6)).toFixed(1) + 'px'     图片视差，最大 ±6px
 *                  --tilt-shadow-x = (-(2*n*12)).toFixed(1) + 'px' 投影偏移，最大 ±12px
 *                  --tilt-shadow-y = (-(2*r*12)).toFixed(1) + 'px'
 *   onMouseLeave 取消 rAF、清空矩形、逐个 removeProperty、移除 .is-tilting
 *
 * 三条与参考站一致的约束：
 *   1. 只在 (hover: hover) and (pointer: fine) 且非 reduced-motion 下启用 ——
 *      参考站是在 effect 里算一次 c.current 布尔值，触屏与减少动态效果环境直接不响应。
 *   2. mousemove 用 rAF 合并，且用 s.current 作为「已排队」标志（同参考站）。
 *   3. 矩形只在 mouseenter 量一次，移动过程不再读布局 —— 避免每帧强制回流。
 */

/** 参考站清理时遍历的属性名，顺序一致。 */
const TILT_PROPS = [
  '--tilt-x',
  '--tilt-y',
  '--card-par-x',
  '--card-par-y',
  '--tilt-shadow-x',
  '--tilt-shadow-y',
];

/** 当前指针位置（rAF 里读，避免每个 mousemove 都进渲染帧）。 */
const tiltPointer = { x: 0, y: 0 };
/** 当前卡片的矩形缓存，null 表示未进入任何卡片。 */
let tiltBox = null;
/** 待执行的 rAF id，0 表示空闲。参考站用同一个变量兼任「已排队」标志。 */
let tiltRaf = 0;

/**
 * 是否启用倾斜。与参考站一致：算一次，不随窗口变化重算。
 * 用 try/catch 包住 matchMedia：极老的环境里没有 matchMedia，不能因此整页报错。
 */
const tiltEnabled = (() => {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return true;
  } catch (e) {
    return false;
  }
})();

/** 指针进入卡片：量一次矩形，加上倾斜类。 */
const onTiltEnter = (e) => {
  if (!tiltEnabled) return;
  const el = e.currentTarget;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  tiltBox = {
    el,
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    w: rect.width,
    h: rect.height,
  };
  el.classList.add('is-tilting');
};

/** 指针移动：只记坐标，真正写样式交给 rAF。 */
const onTiltMove = (e) => {
  if (!tiltEnabled || !tiltBox) return;
  tiltPointer.x = e.clientX;
  tiltPointer.y = e.clientY;
  if (tiltRaf) return;
  tiltRaf = requestAnimationFrame(applyTilt);
};

/** 把归一化坐标换算成 6 个自定义属性写进元素。 */
function applyTilt() {
  tiltRaf = 0;
  const box = tiltBox;
  if (!box) return;
  const el = box.el;
  if (!el || !el.isConnected) return;

  // clamp 到 ±0.5：参考站用 Math.max/Math.min 而不是 Math.max(-1,...)，
  // 因为卡片可能被缩放，指针跑到边缘外时也不该让倾斜超过设计上限。
  const n = Math.max(-0.5, Math.min(0.5, (tiltPointer.x - box.cx) / box.w));
  const r = Math.max(-0.5, Math.min(0.5, (tiltPointer.y - box.cy) / box.h));

  el.style.setProperty('--tilt-x', (-(2 * r * 6)).toFixed(2) + 'deg');
  el.style.setProperty('--tilt-y', (2 * n * 8).toFixed(2) + 'deg');
  el.style.setProperty('--card-par-x', (2 * n * 10).toFixed(1) + 'px');
  el.style.setProperty('--card-par-y', (2 * r * 6).toFixed(1) + 'px');
  el.style.setProperty('--tilt-shadow-x', (-(2 * n * 12)).toFixed(1) + 'px');
  el.style.setProperty('--tilt-shadow-y', (-(2 * r * 12)).toFixed(1) + 'px');
}

/** 指针离开卡片：取消排队、清缓存、逐个移除属性、去掉倾斜类。 */
const onTiltLeave = (e) => {
  if (tiltRaf) {
    cancelAnimationFrame(tiltRaf);
    tiltRaf = 0;
  }
  tiltBox = null;
  const el = e && e.currentTarget;
  if (!el) return;
  for (const prop of TILT_PROPS) el.style.removeProperty(prop);
  el.classList.remove('is-tilting');
};


/* --------------------------------------------------- 照片预览弹层 */
/**
 * 点头像弹出「这张卡对应的照片」大图（复刻参考站点头像弹 popover 的交互形态，
 * 内容不是用户资料，而是照片本身）。
 *
 * 【规格来源】参考站用真 Chrome 读计算样式得到的值，逐条照搬：
 *   宽 288px、圆角 16px、background rgba(20,20,28,.55)、
 *   border 1px solid rgba(255,255,255,.15)、
 *   box-shadow 0 24px 64px rgba(0,0,0,.5)、
 *   backdrop-filter blur(24px) saturate(1.5)、overflow hidden；
 *   出现在锚点下方（data-side=bottom / data-align=start），距锚点 22px；
 *   200ms 淡入 + zoom .95→1 + 从顶部滑入 8px。
 * 这些全部写在 <style scoped> 的 .card-popover 里（**注意 scoped 与 Teleport 的
 * 组合：Vue 3 会给 Teleport 内容也打上 scope id，所以 scoped 样式对弹层生效**）。
 *
 * 与本项目的差异（适配，不是遗漏）：
 *   1. 参考站内容是可滚动的用户资料卡；这里是一张按原比例显示的图片，
 *      所以高度由图片长宽比和视口决定，需要一套「翻转 + 钳制」的定位算法
 *      （参考站因为宽度固定、内容自适应，只需要简单的固定偏移）。
 *   2. 大图走 assetUrl(entry.full)：表格里的 thumb 只有 560px，放大后必糊。
 *   3. 图上叠的编号用 padId()，不伪造点赞数（与卡片上的 0 一致）。
 */

/** 照片编号补零成两位，卡片与弹层共用（原 card-title 里的 "NO.xx" 的同一套编号）。 */
const padId = (id) => String(id).padStart(2, '0');

/** 当前打开的卡片（null = 关闭）。整个页面同一时刻只有一个。 */
const activeCard = ref(null);
/** 弹层 DOM 引用，定位时需要量它自己的尺寸。 */
const popoverRef = ref(null);

/**
 * 弹层动画阶段：'opening'（入场中）/ 'closing'（出场中，播完才卸载）/ 'idle'。
 * 模板里把非 closing 的状态一律映射成 .is-open —— 这样首帧 DOM 就带着入场
 * keyframes，不存在「先挂载、下一帧再加类」时的一帧裸弹层闪动。
 */
const popoverAnim = ref('opening');
/** 弹层的锚点元素（被点的那个头像按钮）。用普通变量而非 ref：不需要响应式。 */
let popoverAnchor = null;

/** 定位结果：side（bottom / top）、align（start / center[钳制后才出现]）、坐标。 */
const popoverState = reactive({ side: 'bottom', align: 'start', top: 0, left: 0 });

/**
 * 渲染用样式。只负责「在什么位置」，视觉（背景/圆角/阴影/动画）全在 CSS 里 ——
 * 这样 reference 站给的那组数值只需要维护一份。
 */
const popoverStyle = computed(() => ({
  top: popoverState.top + 'px',
  left: popoverState.left + 'px',
}));

/**
 * 锚点与弹层之间的间距（参考站实测 22px）。
 * 翻到上方 / 贴边钳制时这 22px 可能被压到更小 —— 如果为守住它而把弹层推出视口，
 * 那就是「看不见」，优先级明显更低：先保证看得见，再谈间距。
 */
const POPOVER_GAP = 22;
/** 弹层与视口边缘至少留出的距离。 */
const POPOVER_MARGIN = 12;
/** 参与「是否够放」判断时用的视口最小高度（手机软键盘/小窗会把它压到很小）。 */
const POPOVER_FALLBACK_VW = 320;
const POPOVER_FALLBACK_VH = 560;

const clampNum = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * 量一张图片的显示尺寸：宽度铺满弹层，高度按原图长宽比，并有上下限。
 *
 * 【为什么不用 CSS 的 aspect-ratio 来定高】定位（尤其是「放得下吗 / 要不要翻到上方」）
 * 需要在弹层渲染前就知道它的高度，否则要渲染两次、第一帧还会闪一下。
 * 这里在 JS 里用同一套规则算出来，再作为内联宽高写回去，CSS 与 JS 只有一个真相。
 *
 * @param {object} card 卡片数据（含 fw / fh 原始像素宽高）
 * @returns {{ width:number, height:number }}
 */
function measurePopoverSize(card) {
  const vw = typeof window === 'undefined' ? 1440 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 900 : window.innerHeight;
  const vwOk = vw > 0 ? vw : POPOVER_FALLBACK_VW;
  const vhOk = vh > 0 ? vh : POPOVER_FALLBACK_VH;

  // 窄屏（<320px）时 288px 会顶出视口，按视口宽度收窄。
  const width = Math.min(288, vwOk - POPOVER_MARGIN * 2);
  // 长宽比优先用清单里的原图像素；缺失时退回 3:4，绝不按 0 去除。
  const ratio = card.fw > 0 && card.fh > 0 ? card.fh / card.fw : 4 / 3;
  const bar = POPOVER_BAR_HEIGHT;
  // 弹层高度上限：在视口里除了上下各留 POPOVER_MARGIN 之外，
  // 还要扣掉「视觉上与它冲突的那部分」——
  //   - 桌面端：固定导航（NavBar top 20 + 高 60 + 10 呼吸 = 90），弹层翻到上方时
  //     会顶到导航下面，先给它让位；
  //   - 窄屏（<= 640px，与本文件窄屏断点一致）：导航更扁（88px），
  //     多扣一点，否则 2 列瀑布流 + 288px 弹层会几乎盖满屏幕。
  // 这个上限同时是「翻转判定」里用的高度，所以小屏才会出现「上下都放不下 →
  // 贴边钳制」的兜底路径。
  const safeTop = vwOk <= 640 ? POPOVER_SAFE_TOP_NARROW : POPOVER_SAFE_TOP;
  const maxByViewport = vhOk - POPOVER_MARGIN * 2 - safeTop - bar;
  const maxHeight = Math.max(POPOVER_MIN_IMG_H, Math.round(vhOk * POPOVER_MAX_VH_RATIO) - bar, maxByViewport);

  let height = width * ratio;
  height = clampNum(height, POPOVER_MIN_IMG_H, maxHeight);
  return { width, height: height + bar };
}
/** 弹层底部信息条高度（与 CSS 里 .card-popover-bar 的 padding + 行高一致）。 */
const POPOVER_BAR_HEIGHT = 44;
const POPOVER_MIN_IMG_H = 140;
const POPOVER_MAX_VH_RATIO = 0.7;
/** 顶部固定导航预留高度：NavBar top:20 + height:60 + 10px 呼吸。 */
const POPOVER_SAFE_TOP = 90;
/** 窄屏导航的同一预留（NavBar 在小屏更扁，这里按 88px 的页面 padding-top 取）。 */
const POPOVER_SAFE_TOP_NARROW = 88;

/**
 * 按锚点矩形与弹层尺寸算位置：优先下方，下方放不下就翻到上方；
 * 水平方向优先与锚点左边缘对齐（data-align=start），再钳进视口。
 *
 * @param {DOMRect} rect 锚点矩形（来自 getBoundingClientRect）
 * @param {{width:number,height:number}} size 弹层尺寸
 * @returns {{side:'bottom'|'top', align:'start'|'center', top:number, left:number}}
 */
function computePopoverPosition(rect, size) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const below = rect.bottom + POPOVER_GAP;
  const above = rect.top - POPOVER_GAP - size.height;
  const spaceBelow = vh - rect.bottom - POPOVER_GAP - POPOVER_MARGIN;
  const spaceAbove = rect.top - POPOVER_GAP - POPOVER_MARGIN;

  // 翻转规则：下方放得下就放下方（参考站默认 side=bottom）；
  // 放不下且上方更宽裕就翻到上方；两边都不够时留在空间更大的那一侧，交给钳制贴边。
  let side = 'bottom';
  if (size.height > spaceBelow) {
    side = spaceAbove > spaceBelow ? 'top' : 'bottom';
  }

  let top = side === 'bottom' ? below : above;
  top = clampNum(top, POPOVER_MARGIN, Math.max(POPOVER_MARGIN, vh - POPOVER_MARGIN - size.height));

  // 水平：与锚点左边缘对齐，右侧出界时先尝试整体左移（仍保持 start 对齐语义），
  // 移不动再钳进视口。
  let left = rect.left;
  const maxLeft = vw - POPOVER_MARGIN - size.width;
  left = clampNum(left, POPOVER_MARGIN, Math.max(POPOVER_MARGIN, maxLeft));

  // align 只作视觉/调试标记：参考站是 start；钳制后如果和锚点左边缘差得明显，
  // 标记成 center，便于日后排查「弹层为什么没对齐」。
  const align = Math.abs(left - rect.left) > 1 ? 'center' : 'start';

  return { side, align, top: Math.round(top), left: Math.round(left) };
}

/** 按当前锚点重新定位（打开时、滚动时、尺寸变化时都会调用）。 */
function positionPopover() {
  if (!activeCard.value || !popoverAnchor || !popoverAnchor.isConnected) return;
  const rect = popoverAnchor.getBoundingClientRect();
  Object.assign(popoverState, computePopoverPosition(rect, measurePopoverSize(activeCard.value)));
}

/** 当前是否处于 reduced-motion：动画要按参考站原值放行，但位移/缩放要去掉。 */
const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* --------------------------------------------------- 全局事件（成对管理） */

/**
 * 【为什么要这三个监听、为什么必须成对】
 *   - document click（捕获阶段）：点弹层外部关闭。用 pointerdown 不行 ——
 *     参考站和本项目都用 click 判定，触屏也能触发，且不会与按钮的 click 重复。
 *     这里用【捕获阶段】是为了在卡片自己的 @click.stop 生效前就拿到事件，
 *     再在 handleDocClick 里用 closest('.card-avatar') 排除头像本身
 *     （否则「点同一个头像关闭」会被误判成「点在外部」再被 toggle 打开一次）。
 *   - document keydown：Esc 关闭；Tab 时把焦点收进弹层（见 trapFocus）。
 *   - window scroll（capture: true）：滚动容器是 .pictorial-page 而不是 window，
 *     只有 capture 才能收到它的 scroll；不监听的话卡片滚动后弹层会离开锚点。
 *   - window resize：重新算法尺寸与位置（也覆盖手机旋转）。
 *
 * 全部用【同一个函数引用】removeEventListener —— 匿名函数移除不掉，
 * 这是最常见的泄漏来源。组件卸载与每次关闭都会走 detachGlobalListeners()，
 * 该函数自身用 bound 标志保证幂等，重复调用不会重复移除或重复添加。
 */
let listenersBound = false;

function handleDocClick(e) {
  if (!activeCard.value) return;
  const target = e.target;
  if (!(target instanceof Element)) return;
  // 点在弹层内部：不关（弹层容器上还有 @click.stop 兜底）。
  if (popoverRef.value && popoverRef.value.contains(target)) return;
  // 点在任何一张卡的头像上：交给头像自己的 click（togglePreview）处理。
  // 不 return 的话会出现「先当外部关掉、再被同一个 click 打开」的双重切换。
  if (target.closest('.card-avatar')) return;
  closePreview();
}

function handleDocKeydown(e) {
  if (!activeCard.value) return;
  if (e.key === 'Escape' || e.key === 'Esc') {
    e.preventDefault();
    closePreview();
    return;
  }
  if (e.key === 'Tab') trapFocus(e);
}

function handleViewportChange() {
  if (!activeCard.value) return;
  positionPopover();
}

/**
 * 窗口失焦（切到其它应用、点地址栏）：关闭预览。
 * 【为什么不留着】弹层是 position:fixed 贴着头像的临时预览，
 * 用户离开页面后回来，它要么已经过期、要么挡在别的内容前面。
 * 这里只是「顺手关掉」，不参与核心的三种关闭方式（头像 / 外部 / Esc）。
 */
function handleWindowBlur() {
  if (activeCard.value) closePreview();
}

function attachGlobalListeners() {
  if (listenersBound) return;
  listenersBound = true;
  document.addEventListener('click', handleDocClick, true);
  document.addEventListener('keydown', handleDocKeydown);
  window.addEventListener('scroll', handleViewportChange, { passive: true, capture: true });
  window.addEventListener('resize', handleViewportChange, { passive: true });
}

function detachGlobalListeners() {
  if (!listenersBound) return;
  listenersBound = false;
  document.removeEventListener('click', handleDocClick, true);
  document.removeEventListener('keydown', handleDocKeydown);
  window.removeEventListener('scroll', handleViewportChange, { capture: true });
  window.removeEventListener('resize', handleViewportChange);
}

/**
 * 焦点管理（非模态预览卡）：
 *   【为什么不锁焦点】aria-modal="false" —— 这是参考站式的 popover，不是对话框。
 *   弹层里没有任何可交互元素，强行锁焦点只会让键盘用户 "Tab 进去出不来"。
 *   打开时焦点仍留在头像按钮上，用户可以继续 Tab 到下一张卡。
 *
 *   【但要防住一个真实的坑】弹层被设为 tabindex="-1" 以接受程序化焦点，
 *   若键盘用户 Shift+Tab 到它，焦点会落在一个没有出口的 div 上，
 *   之后的 Tab 还能出去（不会被困死），所以只需要在 keydown 里兜一次：
 *   焦点落在弹层自身时，按 Tab 直接跳回锚点。
 */
function trapFocus(e) {
  const el = popoverRef.value;
  if (!el || e.key !== 'Tab') return;
  if (e.target !== el) return;
  if (e.shiftKey) return;
  const anchor = popoverAnchor;
  if (anchor && anchor.isConnected) {
    e.preventDefault();
    anchor.focus({ preventScroll: true });
  }
}

/** 出场动画的兜底定时器（reduced-motion 下没有 animationend，或动画被禁用时用）。 */
let closeTimer = 0;

/** 取消出场兜底定时器（重复打开时不能让它把新弹层清掉）。 */
function clearCloseTimer() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = 0;
  }
}

/**
 * 打开弹层（只服务于 togglePreview：调用方已保证「同一时刻只有一个」——先 close 再 open）。
 *
 * @param {HTMLElement} anchor 被点的头像按钮
 * @param {object} card 卡片数据
 */
function openPreview(anchor, card) {
  clearCloseTimer();
  // 顺序：先关掉上一张（动画会走 closing，但新弹层直接替换 ref），再设置新锚点。
  activeCard.value = card;
  popoverAnchor = anchor;

  // 尺寸/位置必须在弹层【渲染前】算好并写进 style，
  // 否则会先以 top:0/left:0 出现在左上角再跳位（一帧可见的错位）。
  Object.assign(popoverState, computePopoverPosition(
    anchor.getBoundingClientRect(),
    measurePopoverSize(card)
  ));

  popoverAnim.value = 'opening';
  attachGlobalListeners();

  // 渲染后按弹层真实矩形再校正一次：上面的尺寸是按清单比例算的估算值，
  // 大图的真实宽高比、以及 translateZ(0) 造成的尺寸误差都以实测为准。
  // 放在 nextTick 里只做一次，不影响首帧（首帧已经有估算位置，不会闪到左上角）。
  nextTick(() => {
    const el = popoverRef.value;
    if (!el || !activeCard.value || !popoverAnchor || popoverAnim.value === 'closing') return;
    const rect = popoverAnchor.getBoundingClientRect();
    Object.assign(popoverState, computePopoverPosition(rect, {
      width: el.offsetWidth,
      height: el.offsetHeight,
    }));
  });
}

/** 关闭弹层：先播 200ms 出场动画，再卸载 DOM 并解绑全局事件。 */
function closePreview() {
  if (!activeCard.value) return;
  const anim = prefersReducedMotion() ? 0 : POPOVER_DURATION;
  popoverAnim.value = 'closing';
  detachGlobalListeners();
  clearCloseTimer();
  closeTimer = setTimeout(() => {
    closeTimer = 0;
    activeCard.value = null;
    popoverAnim.value = 'idle';
    popoverAnchor = null;
  }, anim);
}

/**
 * 头像点击：同一张卡再点一次 = 关闭；点另一张 = 切换（旧的先关）。
 * stopPropagation 防止触发卡片的其它点击行为，也防止 document 监听误判。
 */
function togglePreview(e, card) {
  if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
  const anchor = e && e.currentTarget;
  if (activeCard.value && activeCard.value.uid === card.uid) {
    closePreview();
    return;
  }
  // 上一张还在 closing 的定时器里，先取消它的卸载，避免它把新弹层清掉。
  clearCloseTimer();
  openPreview(anchor, card);
}

/** 出场动画结束：立刻卸载，比等定时器更快。 */
const onPopoverAnimEnd = (e) => {
  if (e.target !== popoverRef.value) return;
  if (popoverAnim.value !== 'closing') return;
  clearCloseTimer();
  activeCard.value = null;
  popoverAnim.value = 'idle';
  popoverAnchor = null;
};

/**
 * 大图加载完 / 失败：
 *   - 加载完：图片真实长宽比可能与清单略有出入，重新定位一次（尺寸规则是
 *     「宽铺满、高按比例并钳制」，用清单比例已经够准，这里是最后一层保险）。
 *   - 失败：不显示破图。记录一次并在弹层里给出降级文案 —— 但本项目 full/
 *     与 thumbnails/ 同一批生成，失败通常意味着部署漏了 public/images/full。
 */
const onPopoverImgLoad = () => { positionPopover(); };
const onPopoverImgError = () => {
  const el = popoverRef.value;
  if (el) el.classList.add('is-broken');
};

/** 出场动画时长（ms），与 CSS 的 200ms 保持一致。 */
const POPOVER_DURATION = 200;

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

/*
 * 倾斜/视差层。逐字对应参考站的 .post-card-tilt。
 *
 * 静止时只有位置与过渡声明，不写 transform —— 由脚本在指针进入时通过
 * 6 个自定义属性驱动，离开时脚本会把属性逐个 removeProperty 掉，
 * 这里靠 var() 的默认值 0deg/0 回落到平面。
 *
 * 两段过渡时长不同，这是参考站的原样设计：
 *   .card-tilt            0.45s  (指针离开后平滑回正)
 *   .card-tilt.is-tilting 0.12s  (跟随指针，短才能跟手)
 */
.card-tilt {
  position: relative;
  transition:
    transform 0.45s cubic-bezier(0.23, 1, 0.32, 1),
    box-shadow 0.45s cubic-bezier(0.23, 1, 0.32, 1);
}

.card-tilt.is-tilting {
  transform: perspective(1000px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg));
  transition:
    transform 0.12s ease-out,
    box-shadow 0.12s ease-out;
  will-change: transform;
  border-radius: 24px;
  /* 投影跟着倾斜方向反向偏移，制造「卡片被抬起」的体积感。 */
  box-shadow: var(--tilt-shadow-x, 0) var(--tilt-shadow-y, 0) 22px rgba(0, 0, 20, 0.3);
}

/* 倾斜时图片反向视差 + 放大到 1.1，比普通 hover 的 1.04 更强，产生景深。 */
.card-tilt.is-tilting .card-media img {
  transform: translate3d(var(--card-par-x, 0), var(--card-par-y, 0), 0) scale(1.1);
  transition: transform 0.15s ease-out;
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
  /* 参考站是 1.08；倾斜态会覆盖成 1.1（见 .card-tilt.is-tilting）。 */
  transform: scale(1.08);
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

/* 头像：<button class="card-avatar"> 包一个圆形 img。
   按钮本身必须【完全透明且去掉原生外观】，否则浏览器默认的灰底/内边距/焦点框
   会把 40px 的圆形头像撑成一块方块；尺寸与布局语义与原 <img> 保持一致，
   卡片的总高度（贪心分配用的实测值）因此不会变。 */
.card-avatar {
  display: block;
  flex: 0 0 auto;
  width: 2.5rem;
  height: 2.5rem;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  background: none;
  color: inherit;
  font: inherit;
  line-height: 0;
  cursor: pointer;
  /* 头像悬停会等比放大 1.15 并旋转 10deg，超出圆形的部分不能撑出滚动条 */
  -webkit-tap-highlight-color: transparent;
}

.card-avatar img {
  display: block;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  cursor: pointer;
}

.card-avatar:hover img,
.card-avatar:focus-visible img {
  transform: scale(1.15) rotate(10deg);
}

/* 键盘焦点环：跟随圆形轮廓（全局 :focus-visible 是矩形描边，落在按钮上会是个方框）。
   不用 outline:none 一刀切，只是把描边改圆。 */
.card-avatar:focus-visible {
  outline: 2px solid var(--pictorial-accent);
  outline-offset: 3px;
  border-radius: 9999px;
}

/* 弹层打开时，对应头像保持放大态，让「这个弹层属于谁」一目了然 */
.card-avatar[aria-expanded='true'] img {
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

/* .card-title 规则已随模板里的 <h2 class="card-title">写真</h2> 一并删除。
   正文区现在第一行就是互动图标那一行；.card-body-inner 的 padding-top（0.5rem）
   保留，否则图标会贴到分隔线上。 */

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
   照片预览弹层（Teleport 到 body，见模板注释）
   ----------------------------------------------------------------
   以下数值【逐条照搬】参考站 popover 的计算样式（真 Chrome 实测）：
     宽 288px / border-radius 16px / background rgba(20,20,28,.55)
     border 1px solid rgba(255,255,255,.15)
     box-shadow 0 24px 64px rgba(0,0,0,.5)
     backdrop-filter blur(24px) saturate(1.5) / overflow hidden
     出现在锚点下方、左对齐（data-side=bottom / data-align=start），间距 22px
     200ms 淡入 + scale .95→1 + 从顶部滑入 8px
   本项目适配的部分都在「内容区 / 定位 / 无障碍」三块，已在各处单独注明。

   ⚠️ scoped 与 Teleport：Vue 3 会把 scope id 打到 Teleport 出去的内容上，
   所以这段 scoped 样式对 body 下的弹层同样生效，不需要全局样式。
   ================================================================ */
.card-popover {
  /* 盒子模型：宽 288 是【含边框】的总宽，与参考站的实测一致 */
  box-sizing: border-box;
  position: fixed;
  z-index: 2000;
  width: 288px;
  border-radius: 16px;
  background: rgba(20, 20, 28, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  backdrop-filter: blur(24px) saturate(1.5);
  overflow: hidden;
  color: #fff;
  /* 弹层里的图片与文字都不要被选中/拖拽（拖拽会触发浏览器原生 ghost image） */
  user-select: none;
  -webkit-user-select: none;
  /* 提升为独立合成层，避免每帧重新计算 backdrop-filter 的采样区域 */
  will-change: transform, opacity;
}

/*
 * 入场 / 出场：两个 keyframes 覆盖同一组属性，用 animation-direction /
 * animation-name 切换，而不是「入场写一套、出场写另一套反向值」——
 * 后者在动画被打断（打开后立刻关闭）时会把元素闪回初始态。
 *
 * 名字按项目约定加 card 前缀：scoped 不隔离 keyframes 名，
 * 项目里已有 ptr-*（main.css）与 cinema*（Cinema.vue）。
 */
.card-popover.is-open {
  animation: cardPopoverIn 200ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

.card-popover.is-closing {
  animation: cardPopoverOut 200ms cubic-bezier(0.4, 0, 1, 1) both;
  pointer-events: none;
}

@keyframes cardPopoverIn {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes cardPopoverOut {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(-8px) scale(0.95);
  }
}

/*
 * 翻到锚点上方时，从下方滑入、向上收起 —— 位移动画必须跟着翻转方向，
 * 否则「在下方弹出却从上面滑下来」会有一次穿模感。
 * transform-origin 同理：从靠近锚点的那条边展开。
 */
.card-popover[data-side='top'] {
  transform-origin: 50% 100%;
}

.card-popover[data-side='top'].is-open {
  animation-name: cardPopoverInUp;
}

.card-popover[data-side='top'].is-closing {
  animation-name: cardPopoverOutUp;
}

@keyframes cardPopoverInUp {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes cardPopoverOutUp {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(8px) scale(0.95);
  }
}

/* ---------------- 图片区（本项目内容） ----------------
   参考站这里是用户资料，本项目是一张照片。
   图片高度由脚本按原图比例算好后以内联 height 写回（见 measurePopoverSize），
   所以这里只需要 object-fit: cover 兜住「真实比例与清单微差」的那几像素。 */
.card-popover-media {
  position: relative;
  width: 100%;
  background: rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.card-popover-media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 大图多半还在下载：给一个极轻的模糊占位，加载完自然清晰，
     比空白框好看，也不会像骨架屏那样抢注意力 */
  background: rgba(255, 255, 255, 0.04);
}

/* 大图 404（部署漏了 public/images/full）时不要让浏览器显示裂图图标 */
.card-popover.is-broken .card-popover-media {
  min-height: 160px;
}

.card-popover.is-broken .card-popover-media::after {
  content: '大图加载失败';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
  background: rgba(20, 20, 28, 0.9);
}

.card-popover.is-broken .card-popover-media img {
  visibility: hidden;
}

/* ---------------- 底部信息条 ----------------
   只放「照片编号 + 作者」，不伪造点赞/评论/浏览数。
   高度在脚本里是 POPOVER_BAR_HEIGHT = 44，改这里的 padding 要同步改那个常量。 */
.card-popover-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-sizing: border-box;
  height: 44px;
  padding: 0 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.card-popover-no {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
  color: #a3e635;
}

.card-popover-cap {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 弹层本身被程序化聚焦时（tabindex=-1）不要描边：
   它的焦点意义只是「Tab 的落点」，不是可操作控件。 */
.card-popover:focus {
  outline: none;
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

  /*
   * 倾斜视差：脚本层面 tiltEnabled 已经在这种环境下返回 false、根本不会
   * 加 .is-tilting，所以下面两条理论上不会命中。仍然写上是为了防住
   * 「用户在页面打开后才切换系统设置」的场景 —— matchMedia 只在 setup 时
   * 求值一次，设置改变后脚本不会重新计算，此时必须由 CSS 兜底压平。
   */
  .card-tilt,
  .card-tilt.is-tilting {
    transform: none !important;
    box-shadow: none !important;
    transition: none !important;
  }

  .card-tilt.is-tilting .card-media img {
    transform: none !important;
    transition: none !important;
  }

  /*
   * 预览弹层：
   *   1. main.css 的全局规则会把 animation-duration 压到 0.01ms，
   *      如果不处理，弹层会「瞬间出现、瞬间消失」—— 消失时因为
   *      .is-closing 的 animation-fill-mode: both 会停在 opacity:0，
   *      之后才被 setTimeout 卸载，看起来像闪一下。
   *   2. 位移 8px 与缩放 0.95 本身就是「让用户不适」的动效，reduce 下必须去掉。
   * 做法：整段动画关掉，强制终态（不透明、无变换）；关闭时的卸载
   * 由脚本里的 prefersReducedMotion() 判断（直接 0ms 卸载，不等 animationend）。
   */
  .card-popover,
  .card-popover.is-open,
  .card-popover.is-closing,
  .card-popover[data-side='top'].is-open,
  .card-popover[data-side='top'].is-closing {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }

  .card-popover.is-closing {
    opacity: 0 !important;
  }

  .card-avatar:hover img,
  .card-avatar:focus-visible img,
  .card-avatar[aria-expanded='true'] img {
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

  /* 窄屏弹层：脚本已经把宽度钳到 min(288, 视口 - 24)，这里只收一下圆角，
     免得在 320px 屏上弹层几乎占满宽度时圆角显得过大 */
  .card-popover {
    border-radius: 14px;
  }
}
</style>
