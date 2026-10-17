<template>
  <!--
    影院模式（/cinema）
    ----------------------------------------------------------------
    结构、尺寸、时长逐条对照 CINEMA_SPEC.md（主理人用真实 Chrome 实测
    forum.hanakos.cc 的 cinemaMode 后记录）。三段式纵向布局：

      [霓虹跑马灯 h=72] [斜向照片流舞台 flex:1] [霓虹跑马灯 h=72]

    外层 padding-top: 96px 是给 NavBar 让位 —— NavBar 是 position:fixed，
    top:20px + height:60px，底边落在 80px，这里留 16px 呼吸。
  -->
  <div class="cinema-page" :class="{ 'cinema-paused': isPaused }">
    <!--
      读屏用标题。屏上不放大标题：参考站整个画面就是标题本身，
      再叠一行 H1 会破坏构图。但页面没有标题会让读屏用户失去定位，
      所以用 sr-only 提供，视觉上不可见。
    -->
    <h1 class="cinema-sr-only">影院模式 · 照片墙</h1>

    <div class="cinema-shell">
      <!-- ============ 顶部霓虹跑马灯 ============ -->
      <div class="neon-marquee" aria-hidden="true">
        <div class="neon-marquee-leds"></div>
        <div class="neon-marquee-track to-left">
          <!-- 两段内容必须逐字相同：translateX(-50%) 靠它做到无缝 -->
          <span class="neon-marquee-text">{{ MARQUEE_TEXT }}</span>
          <span class="neon-marquee-text">{{ MARQUEE_TEXT }}</span>
        </div>
        <div class="neon-marquee-highlight-top"></div>
        <div class="neon-marquee-highlight-bottom"></div>
      </div>

      <!-- ============ 照片流舞台 ============ -->
      <div class="cinema-stage">
        <div class="cinema-tilted">
          <div class="cinema-cols">
            <div v-for="col in columns" :key="col.id" class="cinema-col">
              <!--
                时长走 CSS 变量而不是直接写 animation-duration：
                prefers-reduced-motion 的放行规则里需要用 !important 把
                main.css 压下去的时长还原，而 !important 的样式表规则
                压不过【内联】样式。把时长放进自定义属性后，内联样式只声明
                变量，时长本身由样式表里的 var() 决定，放行规则才生效。
              -->
              <div
                class="cinema-col-track"
                :class="col.direction === 'down' ? 'cinema-track-down' : 'cinema-track-up'"
                :style="{ '--cinema-duration': col.duration + 's' }"
              >
                <article
                  v-for="card in col.track"
                  :key="card.key"
                  class="cinema-card"
                  :aria-hidden="card.duplicate ? 'true' : undefined"
                >
                  <img
                    :src="card.src"
                    :alt="card.alt"
                    :width="card.w"
                    :height="card.h"
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                  />
                  <div class="cinema-card-meta">
                    <span class="cinema-card-no">NO.{{ card.no }}</span>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </div>

        <!--
          暂停 / 继续。
          WCAG 2.1 成功准则 2.2.2（Level A）：自动开始、持续超过 5 秒的
          移动内容必须提供暂停机制。参考站没有这个按钮，但照片流是无限滚动，
          不给开关就不合规。做成舞台右上角 34px 的低对比度玻璃按钮，
          默认 opacity .55，尽量不抢画面。
        -->
        <button
          class="cinema-toggle"
          type="button"
          :aria-label="isPaused ? '继续滚动照片流' : '暂停滚动照片流'"
          @click="isPaused = !isPaused"
        >
          <svg v-if="!isPaused" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
            <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M8 5.2v13.6L19 12z" fill="currentColor" />
          </svg>
        </button>
      </div>

      <!-- ============ 底部霓虹跑马灯（与顶部完全一致） ============ -->
      <div class="neon-marquee" aria-hidden="true">
        <div class="neon-marquee-leds"></div>
        <div class="neon-marquee-track to-left">
          <span class="neon-marquee-text">{{ MARQUEE_TEXT }}</span>
          <span class="neon-marquee-text">{{ MARQUEE_TEXT }}</span>
        </div>
        <div class="neon-marquee-highlight-top"></div>
        <div class="neon-marquee-highlight-bottom"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { IMAGE_POOL, assetUrl } from '../core/imageManifest.js';

/**
 * 每列滚动时长（秒）—— 参考站实测值，下标 = 列序号（第 1 列 55s … 第 7 列 52s）。
 * 数值故意互不相等，七列才会呈现"错落"的观感；改成同一个数会像一整块在动。
 */
const COLUMN_DURATIONS = [55, 62, 50, 68, 58, 64, 52];

/** 每列卡片数 —— 参考站实测 6/4/4/4/4/4/4，合计 30 张，用 20 张图循环取用。 */
const COLUMN_CARD_COUNTS = [6, 4, 4, 4, 4, 4, 4];

/** 跑马灯文案：两段 span 内容必须逐字相同，否则 translateX(-50%) 会露出接缝。 */
const MARQUEE_TEXT =
  'GALLERY  •  PHOTO WALL  •  NOW SHOWING  •  写真  •  NIGHT GALLERY  •  夜の写真館  ·  ';

/** 序号补零，卡片角标用（NO.07 而不是 NO.7，等宽视觉更整齐）。 */
const pad2 = (n) => String(n).padStart(2, '0');

// 防御：IMAGE_POOL 若被清空，取模会得到 NaN，整个页面直接崩。兜成 1 至少能渲染。
const POOL_SIZE = IMAGE_POOL.length || 1;

/**
 * 为一列挑选卡片。
 *
 * 【为什么用步长 7】20 张图、单列最多 6 张，步长 7 与 20 互质，
 * 保证同一列内不会撞图（7 步长走 6 步：0/7/14/1/8/15，两两不同）。
 * 再叠上 columnIndex * 5 的列偏移，避免相邻两列整列重复同一组照片。
 *
 * @param {number} columnIndex 列序号，从 0 开始
 * @param {number} count       该列卡片数
 * @returns {Array<object>} 卡片描述对象数组
 */
const buildCards = (columnIndex, count) => {
  const cards = [];
  for (let i = 0; i < count; i += 1) {
    const entry = IMAGE_POOL[(columnIndex * 5 + i * 7) % POOL_SIZE];
    cards.push({
      key: 'c' + columnIndex + '-' + i,
      // 【必须】用 assetUrl 拼地址：清单里的 thumb 是不带前导斜杠的相对路径，
      // 前缀由 import.meta.env.BASE_URL 提供，子路径部署才不会 404。
      // 这里绝不能写死 /images/thumbnails/x.webp。
      src: assetUrl(entry.thumb),
      alt: '照片 ' + pad2(entry.id),
      no: pad2(entry.id),
      w: entry.w,
      h: entry.h,
      duplicate: false,
    });
  }
  return cards;
};

/**
 * 七列数据。
 *
 * 【无缝循环的核心】每列内容必须【复制一份】拼在轨道末尾：
 * 轨道总高 = 2 × 内容高，translateY(-50%) 才恰好落在与起点完全相同的画面上。
 * 少了这一步，-50% 会跳到内容中部，肉眼可见一次"跳帧"。
 *
 * 复制份打上 duplicate 标记：alt 置空 + aria-hidden，避免读屏把同样的
 * 30 张照片念两遍。
 */
const columns = COLUMN_CARD_COUNTS.map((count, columnIndex) => {
  const cards = buildCards(columnIndex, count);
  const track = cards.concat(
    cards.map((card) => ({
      ...card,
      key: card.key + '-dup',
      alt: '',
      duplicate: true,
    }))
  );

  return {
    id: columnIndex,
    duration: COLUMN_DURATIONS[columnIndex],
    // 方向交替：第 1/3/5/7 列向下，第 2/4/6 列向上（实测规律）
    direction: columnIndex % 2 === 0 ? 'down' : 'up',
    track,
  };
});

/** 暂停开关（对应 WCAG 2.2.2 的暂停机制，见模板里的按钮注释）。 */
const isPaused = ref(false);
</script>

<style scoped>
/* ================================================================
   影院页样式
   ----------------------------------------------------------------
   ⚠️ @keyframes 名是全局命名空间，scoped 不会隔离它。
   Vue 的 scoped 编译只会给 @keyframes 加 -<hash> 后缀去重，
   但为了与 src/assets/main.css 里已有的 ptr-* 系列明确区分，
   这里所有关键帧统一加 cinema- 前缀（cinemaScrollDown / cinemaScrollUp /
   cinemaNeonScrollLeft / cinemaNeonFlicker），不做重名赌运气。
   ================================================================ */

/* ---------------- 页面骨架 ---------------- */
.cinema-page {
  position: relative;
  z-index: 10;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  /* 给固定导航留位：NavBar top:20 + height:60 = 80，这里留 16px 呼吸 */
  padding-top: 96px;
  background: #0d0d0d;
  overflow: hidden;

  /*
    跑马灯走完一整段（= 轨道宽的一半）所需的秒数。
    规格里没给这个时长（第 7 节的 .neon-marquee-track 只给了
    timing-function / iteration-count），这里按"约 66px/s 的匀速"估：
    单段文字实测约 1850px 宽，1850 / 28s ≈ 66px/s，与参考站观感接近。
    写成变量是为了让 prefers-reduced-motion 的放行规则能引用同一个值。
  */
  --cinema-marquee-duration: 28s;
}

.cinema-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

/* 只给读屏用的文本 */
.cinema-sr-only {
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

/* ---------------- 照片流舞台 ---------------- */
.cinema-stage {
  position: relative;
  flex: 1;
  /* 纵向 flex 里 flex:1 的元素默认 min-height:auto，会被内容撑破，
     导致舞台顶出视口。显式压成 0 才能正确收缩。 */
  min-height: 0;
  overflow: hidden;
  background: radial-gradient(rgba(30, 20, 40, 0.3), transparent 70%);
}

.cinema-tilted {
  position: absolute;
  inset: 0;
  /* rotate 后四个角会露出舞台底，靠 scale(1.1) 把四周补满（实测取值） */
  transform: rotate(-10deg) scale(1.1);
  transform-origin: center center;
}

.cinema-cols {
  display: flex;
  /* 列间距走变量：.cinema-col-track 的 padding-bottom 必须用同一个值，
     否则 -50% 会差半个 gap（见 .cinema-col-track 的注释） */
  --cinema-gap: 8px;
  gap: var(--cinema-gap);
  height: 100%;
  width: 100%;
}

.cinema-col {
  position: relative;
  overflow: hidden;
  /* 不写 min-width:0 的话，列内的长内容会把列撑宽，7 列宽度就不均了 */
  min-width: 0;
  flex: 1;
}

.cinema-col-track {
  display: flex;
  flex-direction: column;
  gap: var(--cinema-gap, 8px);
  /*
    ⚠️ 这一行是【无缝循环的必要条件】，不是装饰：
    轨道子项是 2N 张卡片，flex 只产生 2N-1 个 gap，
    于是轨道高 = 2N·h + (2N-1)·g，一半是 N·h + (N-0.5)·g，
    而第二份内容真正开始的位置是 N·h + N·g —— 差半个 gap（8px/2 = 4px）。
    每轮循环到 -50% 时会跳 4px，在 4 列并排时肉眼能看出一次抽搐。
    补上 padding-bottom = 一个 gap 后，轨道高变成 2N·(h+g)，一半正好等于
    N·(h+g)，与第二份内容的起点分毫不差。
  */
  padding-bottom: var(--cinema-gap, 8px);
  will-change: transform;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  animation-duration: var(--cinema-duration, 55s);
}

.cinema-track-down {
  animation-name: cinemaScrollDown;
}

.cinema-track-up {
  animation-name: cinemaScrollUp;
}

@keyframes cinemaScrollDown {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(-50%);
  }
}

@keyframes cinemaScrollUp {
  0% {
    transform: translateY(-50%);
  }
  100% {
    transform: translateY(0);
  }
}

/* ---------------- 卡片 ---------------- */
.cinema-card {
  position: relative;
  /* border-box：卡片有 1px 边框，用 content-box 会让实际宽度比列宽多 2px，
     被列的 overflow:hidden 切掉一条边，且 aspect-ratio 算高时也带上偏差 */
  box-sizing: border-box;
  width: 100%;
  aspect-ratio: 3 / 4;
  /* 轨道是 flex column，禁止卡片被压缩，否则 aspect-ratio 会被 flex 覆盖 */
  flex: 0 0 auto;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #14101a;
  transition:
    transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.35s,
    filter 0.35s;
  filter: brightness(1) saturate(1);
}

.cinema-card img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.7s;
}

.cinema-card-meta {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 8px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.6), transparent);
}

/* 我方没有真实的标题/作者数据（见 CINEMA_SPEC 第 11 条），
   信息条只放序号，保持与参考站同样的"底部压暗 + 角标"视觉语言。 */
.cinema-card-no {
  display: block;
  font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.82);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
}

/* ---------------- 悬停 ----------------
   整段包在 (hover: hover) and (pointer: fine) 里：触屏没有真悬停，
   移动端点击后会残留"粘住的 hover"，表现为整列永久暂停 + 一张卡片永久高亮。
   桌面端观感与参考站一致，只是移动端不再出现粘滞状态。 */
@media (hover: hover) and (pointer: fine) {
  .cinema-card:hover {
    transform: translateY(-4px) scale(1.04);
    box-shadow:
      0 0 40px rgba(244, 114, 182, 0.55),
      0 12px 40px rgba(0, 0, 0, 0.5);
    z-index: 5;
    filter: brightness(1.08) saturate(1.1);
  }

  .cinema-card:hover img {
    transform: scale(1.05);
  }

  /* 指针进入整列即暂停该列，鼠标可以稳稳地停在一张照片上 */
  .cinema-col:hover .cinema-col-track {
    animation-play-state: paused;
  }

  /* 聚焦式打光：有卡片被悬停时，其余卡片压暗（参考站原效果）。
     依赖 :has()（Chrome 105+/Safari 15.4+/Firefox 121+）。
     老浏览器整条规则被丢弃，退化为"只有高亮没有压暗"，不影响功能。 */
  .cinema-stage:has(.cinema-card:hover) .cinema-card:not(:hover) {
    filter: brightness(0.45) saturate(0.75);
  }
}

/* ---------------- 暂停按钮 ---------------- */
.cinema-toggle {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid rgba(255, 120, 170, 0.28);
  background: rgba(26, 6, 18, 0.55);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: rgba(255, 232, 241, 0.9);
  opacity: 0.55;
  cursor: pointer;
  transition:
    opacity 0.25s ease,
    background 0.25s ease,
    border-color 0.25s ease;
}

.cinema-toggle:hover,
.cinema-toggle:focus-visible {
  opacity: 1;
  background: rgba(60, 12, 36, 0.8);
  border-color: rgba(255, 120, 170, 0.6);
}

/* 暂停态：照片流与跑马灯一起停（含霓虹闪烁），
   避免暂停期间仍有元素在动，让人以为按钮没生效。 */
.cinema-paused .cinema-col-track,
.cinema-paused .neon-marquee-track,
.cinema-paused .neon-marquee-text {
  animation-play-state: paused;
}

/* ---------------- 霓虹跑马灯 ---------------- */
.neon-marquee {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 72px;
  flex: 0 0 72px;
  overflow: hidden;
  background: linear-gradient(#1a0612, #0f0409 50%, #1a0612);
  border-top: 1px solid rgba(255, 80, 140, 0.2);
  border-bottom: 1px solid rgba(255, 80, 140, 0.2);
  box-shadow:
    inset 0 0 30px rgba(236, 72, 153, 0.25),
    0 0 20px rgba(236, 72, 153, 0.15);
}

.neon-marquee-leds {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgba(255, 90, 160, 0.18) 1.2px, transparent 1.5px);
  background-size: 8px 8px;
  opacity: 0.8;
  mix-blend-mode: screen;
  pointer-events: none;
}

.neon-marquee-track {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  white-space: nowrap;
  /*
    ⚠️ 这一行是对规格的一处【刻意补正】，理由：
    规格给的 position:absolute; inset:0 会让轨道盒宽 = 跑马灯宽（例如 1440px），
    而内容（两段文字）实际宽约 3700px，是溢出在盒子外的。
    transform 百分比解析的是【元素自身 border box】，即 -50% 只有 -720px，
    不等于"一段文字的宽度"，循环处会看到明显跳变。
    改成 width:max-content 后，轨道盒宽 = 内容宽，
    -50% 才精确等于一段的宽度，无缝成立。
  */
  width: max-content;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  animation-duration: var(--cinema-marquee-duration, 28s);
  will-change: transform;
}

.neon-marquee-track.to-left {
  animation-name: cinemaNeonScrollLeft;
}

@keyframes cinemaNeonScrollLeft {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

.neon-marquee-text {
  display: inline-block;
  /* flex 子项默认 flex-shrink:1，会被压扁；文字必须保持自身宽度 */
  flex: 0 0 auto;
  padding: 0 1.5rem;
  font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace;
  font-weight: 800;
  font-size: clamp(22px, 3.2vh, 36px);
  letter-spacing: 0.18em;
  color: #ffe8f1;
  text-shadow:
    0 0 2px #fff,
    0 0 6px rgba(255, 220, 235, 0.95),
    0 0 14px rgba(255, 100, 170, 0.85),
    0 0 28px rgba(236, 72, 153, 0.7),
    0 0 48px rgba(190, 24, 93, 0.5);
  animation: cinemaNeonFlicker 4.5s ease-in-out infinite;
}

@keyframes cinemaNeonFlicker {
  0%,
  100% {
    opacity: 1;
  }
  47% {
    opacity: 1;
  }
  48% {
    opacity: 0.75;
  }
  49% {
    opacity: 1;
  }
  72% {
    opacity: 1;
  }
  73% {
    opacity: 0.85;
  }
  74% {
    opacity: 1;
  }
}

.neon-marquee-highlight-top {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  top: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 180, 210, 0.5),
    rgba(255, 180, 210, 0.8),
    rgba(255, 180, 210, 0.5),
    transparent
  );
}

.neon-marquee-highlight-bottom {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(190, 24, 93, 0.6), transparent);
}

/* ================================================================
   无障碍：prefers-reduced-motion 放行
   ----------------------------------------------------------------
   src/assets/main.css 里有一条全局规则，在 reduce 环境下把
   animation-duration 压到 0.01ms、animation-iteration-count 压到 1
   （两条都是 !important）。那会把照片流与跑马灯在 1 帧内跑完并停在终点，
   页面变成两排静止的残帧。

   影院页的【主体内容】就是这两组循环，不是装饰，所以这里按规格要求放行：
   用更高优先级的选择器 + !important 把时长与循环次数还原。
   （优先级：main.css 的 * 是 (0,0,0)，这里 .cinema-col-track 是 (0,1,0)，
   同为 !important 时高优先级胜出，与源码顺序无关。）

   刻意【不】放行的部分：
   - 卡片 hover 的位移/缩放（main.css 的 transition-duration 仍是 0.01ms，
     悬停反馈变成瞬时生效，信息量不丢）；
   - 跑马灯的霓虹闪烁 cinemaNeonFlicker（纯装饰的忽明忽暗，
     reduce 环境下就该关掉，这里保持关闭）。

   放行的前提是把时长存进 CSS 变量 —— 见模板里 :style 的注释：
   内联的 animation-duration 会压过任何非 !important 的样式表规则。
   ================================================================ */
@media (prefers-reduced-motion: reduce) {
  .cinema-col-track {
    animation-duration: var(--cinema-duration, 55s) !important;
    animation-iteration-count: infinite !important;
  }

  .neon-marquee-track {
    animation-duration: var(--cinema-marquee-duration, 28s) !important;
    animation-iteration-count: infinite !important;
  }
}

/* ================================================================
   窄屏适配
   ----------------------------------------------------------------
   7 列在 375px 宽的屏幕上，每列只剩 (375 - 6x6) / 7 约 48px，
   卡片被压成竖条，完全看不出是照片。

   方案：窄屏【隐藏末尾的列】，剩下的列靠 flex:1 自动撑宽 ——
   纯 CSS，不需要 JS 监听 resize，也不会因为列数变化重建动画。
   被隐藏的列不产生布局盒，里面的 loading="lazy" 图片也不会下载。
   同时把倾斜角度调小、缩放调大，保证旋转后四角不露底。
   ================================================================ */
@media (min-width: 768px) {
  .cinema-cols {
    /* 规格第 2 节：md 断点 gap 10px。改变量即可，
       gap 与 padding-bottom 会一起跟上，无缝对齐不会被破坏。 */
    --cinema-gap: 10px;
  }
}

@media (max-width: 1023px) {
  /* 保留 5 列（隐藏第 6、7 列） */
  .cinema-col:nth-child(n + 6) {
    display: none;
  }

  .cinema-cols {
    --cinema-gap: 8px;
  }

  .cinema-tilted {
    transform: rotate(-8deg) scale(1.14);
  }
}

@media (max-width: 639px) {
  /* 保留 4 列（隐藏第 5~7 列） */
  .cinema-col:nth-child(n + 5) {
    display: none;
  }

  .cinema-page {
    /* 小屏导航同样是 60px 高，但总高度紧张，收一点留白 */
    padding-top: 88px;
  }

  .cinema-cols {
    --cinema-gap: 6px;
  }

  .cinema-tilted {
    transform: rotate(-6deg) scale(1.2);
  }

  .neon-marquee {
    height: 64px;
    flex-basis: 64px;
  }

  .cinema-toggle {
    width: 30px;
    height: 30px;
    top: 10px;
    right: 10px;
  }
}

/* 横屏手机：可视高度极低，跑马灯占比过大时舞台会被挤没 */
@media (max-height: 480px) {
  .neon-marquee {
    height: 52px;
    flex-basis: 52px;
  }

  .cinema-page {
    padding-top: 84px;
  }
}
</style>
