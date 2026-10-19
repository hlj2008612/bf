<script>
/**
 * PtrTransition —— 参考站 forum.hanakos.cc 的站点级转场覆盖层（代号 ptr）的 Vue 3 复刻。
 *
 * 权威来源：参考站 layout chunk 内的组件本体 + webpack module 19812（helper）。
 * DOM 结构 / 类名 / CSS 变量 / 文本模板 / 状态机时序全部逐字对齐。装饰 CSS 在
 * src/assets/main.css 的 .ptr-* 段（99 条规则 + 15 个 @keyframes，由 Lead 维护），
 * 因此本组件【不得】使用 <style scoped>：scoped 会加属性限定符，让那些全局规则匹配不上。
 *
 * 时序（与参考站一致，也是本组件最容易做错的地方）：
 *   play() -> phase='cover'（三段 wipe 擦入：a 0s / b .06s / main .12s，各 .28s）
 *          -> .ptr-wipe-main 的 ptr-wipe-in animationend 触发 toReveal()
 *          -> toReveal() 里【立刻】router.push（此刻画面已被不透明 .ptr-panel 完全盖住），
 *             并与 (就绪信号 1500ms | 最短盖住 440ms) 的 Promise.all 并行
 *          -> 双层 rAF -> phase='reveal'
 *          -> 三段 wipe 反向擦出（main 0s / b .06s / a .12s）
 *          -> .ptr-wipe-a 的 ptr-wipe-out animationend 触发 finish() -> phase='idle'
 *          -> 180ms 后 state=null（回到空的 ptr-root.ptr-idle），IDLE_MS 后释放 busy
 * 绝不能「先 push 再播动画」：那样旧页面会在被盖住之前消失，露出底色（闪黑）。
 */
import { ref, computed, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';

/* ------------------------------------------------------------------ 常量 */

// 参考站：let I = _.Bh ? 480 : 260。安卓下 idle 驻留更久。
const IDLE_MS_ANDROID = 480;
const IDLE_MS_DEFAULT = 260;

// 参考站：L = ['pink','purple','green','yellow']。CSS 里【没有】.ptr-theme-pink，
// 'pink' 靠 .ptr-root 上的默认变量生效；类名照常输出，不要为 pink 特判。
const ALL_THEMES = ['pink', 'purple', 'green', 'yellow'];

// 参考站：G = 安卓?6:14、D = 安卓?5:12、band 重复 = 安卓?5:10
const REPEAT_BIG_ANDROID = 6;
const REPEAT_BIG_DEFAULT = 14;
const REPEAT_SMALL_ANDROID = 5;
const REPEAT_SMALL_DEFAULT = 12;
const REPEAT_BAND_ANDROID = 5;
const REPEAT_BAND_DEFAULT = 10;

const READY_SIGNAL_MS = 1500;    // 参考站 toReveal() 的就绪信号超时
const MIN_COVER_MS = 440;        // 参考站 toReveal() 的最短遮盖时长
const START_FALLBACK_MS = 900;   // 参考站 start(): 900ms 兜底 -> toReveal
const REVEAL_FALLBACK_MS = 900;  // 参考站 toReveal(): 900ms 兜底 -> finish
const IDLE_CLEAR_MS = 180;       // 参考站 finish(): 180ms 后 state=null

/**
 * 路由元数据表（参考站 M 表）。
 * 逐字对照参考站，剔除它专有的 /live、/profile、/home（我方没有这些页面），
 * 并新增 '/wall' —— 这是我方特有页面，参考站无对应项，文案沿用其 GALLERY 语义。
 * 表外的路径（例如 '/login'）走 DEFAULT_META，与参考站 `M[path] ?? A` 一致。
 * 改文案只需要动这张表，组件其余部分不感知具体路由。
 */
const META = Object.freeze({
  '/': { word: 'HOME', jp: 'ホーム', cn: '首页', no: '01', mark: '◇' },
  '/wall': { word: 'GALLERY', jp: 'ギャラリー', cn: '照片墙', no: '02', mark: '▣' },
  '/cinema': { word: 'CINEMA', jp: 'シアター', cn: '影院模式', no: '03', mark: '▶' },
  '/pictorial': { word: 'PICTORIAL', jp: 'ピクトリアル', cn: '画报', no: '04', mark: '◈' },
});

// 参考站 A 表，逐字
const DEFAULT_META = Object.freeze({
  word: 'HANA', jp: 'ホタル', cn: '萤火虫', no: '??', mark: '✦',
});

const isAndroid = typeof navigator !== 'undefined' && /android|harmony/i.test(navigator.userAgent);

/**
 * ★ 刻意取舍：不做安卓「分阶段揭示」（参考站的 T / R / F 门控）。
 *
 * 参考站是 T = 安卓 ? stage : 2; R = T >= 1; F = T >= 2 —— 桌面恒为 2（R/F 恒真），
 * 安卓则由覆盖期的两层 rAF + 110ms 定时器把 stage 从 0 推到 1、再推到 2，用来
 * 逐梯队揭示面板装饰（halftone+band1-3 / rows / mark / title+corner+edge）。
 *
 * 我方选择 (a) 全部渲染、不分阶段，理由：
 *   1. 参考站引入分阶段是为了配合它自己的安卓性能降级（.ptr-android 的 17 条规则
 *      关掉渐变背景、改用单次动画、去掉 text-stroke）。我方已通过同一套 .ptr-android
 *      CSS 拿到降级收益，分阶段揭示在上面只是锦上添花，收益极小。
 *   2. 桌面（R=F=真）两条路径完全等价，所以这个取舍【不影响桌面观感】，
 *      也就不影响本任务「复刻参考站观感」的目标。
 *   3. 分阶段需要额外的 stageCounter + rAF/定时器状态机，会引入一类新的
 *      「阶段推进没跑完就被下一轮转场覆盖」的竞态。用复杂度换一个只在
 *      安卓 UA 上可见的细枝末节，不划算。
 * 若日后确实要还原安卓分阶段，改动点只在这里：加 stage ref，在覆盖期推进，
 * 并按 R/F 给 <template> 里的 panel 装饰分组加 v-if 即可。
 */

/* --------------------------------------------------- 就绪信号 / 竞态守卫 */

/**
 * 参考站 helper 的 `(0,_.lf)(ms)` —— 注意：它【不是】字体等待，
 * 所以这里刻意【不叫】waitForFonts，避免以后有人按那个名字去“修”它。
 * 参考站真实实现是一个【全局单槽 + 定时就绪信号】的竞态守卫：
 *
 *   let l = null;
 *   function s(e) {
 *     return new Promise((t) => {
 *       let n = false;
 *       const r = () => { if (n) return; n = true; if (l === r) l = null; t(); };
 *       l = r;
 *       setTimeout(r, e);
 *     });
 *   }
 *
 * 后登记的回调会顶掉前一个；被顶掉的那个 promise 永不 resolve（靠 l !== r 白等）——
 * 这正是「取消上一轮等待」的表达方式。参考站在两处复用它：toReveal 的 1500ms、
 * 以及立方体分支 startViewTransition 里的 800ms。
 * 注意 r() 自带幂等守卫，超时后即使已 resolve 也不会重复触发，所以无需 clearTimeout。
 */
let readySlot = null;
function registerReadySignal(ms) {
  return new Promise((resolve) => {
    let settled = false;
    const fire = () => {
      if (settled) return;
      settled = true;
      if (readySlot === fire) readySlot = null;
      resolve();
    };
    readySlot = fire;
    setTimeout(fire, ms);
  });
}

/**
 * 参考站 helper 的 St()：丢弃当前挂着的就绪信号（不 resolve，只摘引用）。
 * 参考站在 pathname 变化时调用它，让上一轮 toReveal 的等待作废。
 * 这里与参考站行为一致：不调用被丢弃的回调，让那个 promise 永久悬挂。
 */
function dropReadySignal() {
  readySlot = null;
}

/* ------------------------------------------------------------ 文本模板 */

function buildBigText(card) {
  const g = isAndroid ? REPEAT_BIG_ANDROID : REPEAT_BIG_DEFAULT;
  return `${card.word}  ${card.mark}  ${card.jp}  •  ${card.word}  ${card.mark}  ${card.cn}  •`.repeat(g);
}

function buildSmallText(card) {
  const d = isAndroid ? REPEAT_SMALL_ANDROID : REPEAT_SMALL_DEFAULT;
  return `${card.word}  ${card.mark}  `.repeat(d);
}

function buildBandText(card) {
  const w = isAndroid ? REPEAT_BAND_ANDROID : REPEAT_BAND_DEFAULT;
  return `${card.mark}  ${card.word}  ★  ${card.no}  ◆  ${card.jp}  ✦  `.repeat(w);
}

/* --------------------------------------------------------------- 组件 */

export default {
  name: 'PtrTransition',
  setup(props, { expose }) {
    const router = useRouter();
    const route = useRoute();

    // 受 state 驱动的覆盖层；state=null 时渲染空的 .ptr-root.ptr-idle
    const state = ref(null);

    // 非响应式控制位（对应参考站的 useRef，避免无谓的重新渲染）
    let busy = false;
    let enteredReveal = false;
    let wentIdle = false;
    let gen = 0;
    let lastTheme = null;
    let targetPath = '';
    let timers = [];

    // 本轮导航的 deferred。★ 必须【每个 generation 一个】：play() 的返回值语义是
    // 「本次调用被接受、且本轮的 router.push 已落地」，而 push 发生在 toReveal()
    // （wipe-in 动画结束后）。如果像早先那样共用一个槽位读上一轮的值，play() 会在
    // 本轮 push 之前就 resolve（首次更是立刻拿到初始 Promise.resolve()），
    // 语义名不副实。由 start() 建新 deferred、toReveal() 在 push 落定后 settle。
    let pushDeferred = null;   // { promise, resolve }

    const idleMs = isAndroid ? IDLE_MS_ANDROID : IDLE_MS_DEFAULT;

    /* --------------------------------------------------------- 定时器 */

    function later(fn, ms) {
      const id = setTimeout(fn, ms);
      timers.push(id);
      return id;
    }
    function clearTimers() {
      for (let i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
    }

    /* -------------------------------------------------- 动画事件处理 */

    // .ptr-wipe-a 的 ptr-wipe-out 结束 => 收尾。
    function onWipeAEnd(e) {
      // ★ 必须判 target === currentTarget：wipe-main 内部有几十个子元素在跑无限动画
      //   （band-drift 3~3.6s、row-slide 5~7.5s、mark-drift、blink…），它们的 animationend
      //   会冒泡上来。参考站只靠 animationName 白名单过滤，这里两道都判，更严谨。
      if (e.target !== e.currentTarget) return;
      if (e.animationName !== 'ptr-wipe-out') return;
      finish();
    }

    // .ptr-wipe-main 的 ptr-wipe-in 结束 => 立刻切路由并准备揭幕。
    function onWipeMainEnd(e) {
      if (e.target !== e.currentTarget) return;
      if (e.animationName !== 'ptr-wipe-in') return;
      toReveal();
    }

    /* ----------------------------------------------------- settlePush() */

    /**
     * 落定【本轮】push 的 deferred（幂等）。
     * play() 的返回值语义是「本次调用被接受，且本轮的 router.push 已落地」，
     * 所以必须有这样一处显式的落定点：toReveal() 里 push 成功/失败都调用它。
     * 幂等很重要 —— toReveal() 可能被 animationend 与 900ms 兜底重复触发、
     * 也可能因 enteredReveal 已置位而早退，任何一种都不允许让 play() 永久悬挂。
     * 同时它也是「上一轮遗留 deferred」的放行点：start() 在建新 deferred 前先调用它，
     * 保证不会有调用方卡在一个永远不会 settle 的 promise 上。
     */
    function settlePush() {
      if (!pushDeferred) return;
      const d = pushDeferred;
      pushDeferred = null;
      d.resolve();
    }

    /* ----------------------------------------------------- finish() */

    // 参考站 x()：收尾。幂等（wentIdle / busy 双守卫），可被 animationend 与兜底定时器同时调用。
    function finish() {
      if (wentIdle || !busy) return;
      wentIdle = true;
      if (state.value) state.value = { ...state.value, phase: 'idle' };
      later(() => {
        state.value = null;
      }, IDLE_CLEAR_MS);
      later(() => {
        busy = false;
      }, idleMs);
    }

    /* ---------------------------------------------------- toReveal() */

    // 参考站 g()：擦入盖住后切路由，再等一帧把 phase 推到 'reveal'（触发反向擦出）。
    function toReveal() {
      if (enteredReveal || !busy) return;
      enteredReveal = true;

      const target = targetPath;
      // 参考站：目标路径 === 当前路径时跳过 1500ms 就绪等待，只等 440ms。
      const samePath = target === route.path;
      // ★ 必须【无条件登记】就绪信号：它兼任「取消上一轮等待」的竞态守卫
      //   （registerReadySignal 是全局单槽，后登记顶掉前登记）。即使下面用竞速，
      //   也不能因为「push 可能更快」就不登记 —— 否则上一轮的悬挂等待不会被顶掉。
      const readySignal = samePath ? Promise.resolve() : registerReadySignal(READY_SIGNAL_MS);
      const minCover = new Promise((resolve) => later(resolve, MIN_COVER_MS));

      // ★ 移植取舍：参考站 here 还有一层 cinemaMode 业务 —— 它把 /cinema 当作「首页的一个模式」，
      //   目标为 /cinema 时 push 到 '/' 并 setCinemaMode(true)，当前已在 /cinema 时反向。
      //   我方 /cinema 是独立路由（src/router/index.js 里就是普通一条），语义不同，
      //   故【不模拟 cinemaMode】，直接 push 目标路径。这不是漏抄，是刻意取舍。
      //
      // ★ 关键时序：push 发生在 await 之前、在 phase 变成 'reveal' 之前。
      //   此刻画面已被不透明 .ptr-panel 完全盖住，旧页面消失不可见；先 push 再播动画会闪黑。
      // ★ 本轮的 deferred 在这里落定：play() 的 promise 要等它，而不是等一个跨轮共享的槽位。
      //   settlePush() 幂等，所以 animationend 与 900ms 兜底重复触发 toReveal/early-return
      //   都不会让 play() 永久悬挂。
      // ★ 方案 2（竞速）：把「本轮 push 落定」也纳入就绪条件。
      //   参考站的 1500ms 是给它自己 Next.js 异步渲染留的经验值；我方 push 之后
      //   新组件是同步挂载的，1500ms 就变成纯空等（实测 1483ms）。这里让 push 一落定
      //   就推进 reveal，push 慢时仍由 registerReadySignal(1500) 封顶。
      //   ★ 两个必须守住的点：
      //     (a) pushPromise 已经 .catch(()=>{}) 吞掉 reject，纳入竞速是安全的；
      //     (b) 绝不能丢掉 minCover 440ms —— 否则 push 极快时覆盖层还没铺满就开始擦出，
      //         会看到旧页面从擦缝里露出来。
      let pushSettled;
      const pushReady = new Promise((resolve) => { pushSettled = resolve; });
      if (!samePath) {
        // vue-router 在重复/被中止导航时会 reject，必须吞掉。
        // （参考站既未 await 也未 catch，那是 Next 的写法；Vue 下会变成 unhandled rejection。）
        Promise.resolve(router.push(target))
          .catch(() => {})
          .then(() => {
            settlePush();      // play() 的语义 = 本轮 push 已落地
            pushSettled();     // 竞速的「新页面已就绪」信号
          });
      } else {
        settlePush();
        pushSettled();
      }

      const myGen = gen;
      Promise.all([Promise.race([readySignal, pushReady]), minCover]).then(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (myGen !== gen) return;
            if (state.value) state.value = { ...state.value, phase: 'reveal' };
            // 兜底：万一 ptr-wipe-out 的 animationend 没来（后台标签页被节流等）也能回到 idle。
            later(() => {
              if (myGen === gen) finish();
            }, REVEAL_FALLBACK_MS);
          });
        });
      });
    }

    /* ------------------------------------------------------ start() */

    // 参考站 j()：启动转场。busy 时返回 false，绝不静默吞掉调用方的意图。
    function start(path, dir) {
      if (busy) return false;
      busy = true;
      enteredReveal = false;
      wentIdle = false;
      targetPath = path;
      const myGen = ++gen;

      // 本轮专属的 deferred：play() 返回它，toReveal() 在 push 落定后 settle 它。
      // 上一轮若还没 settle（例如被 busy 守卫拒绝后一直没人 settle），这里直接放行，
      // 避免调用方的 await 永久悬挂。
      settlePush();
      let resolvePush;
      pushDeferred = { promise: new Promise((r) => { resolvePush = r; }), resolve: resolvePush };

      // 随机主题，且排除上一个（参考站 L.filter(t => t !== lastTheme)）
      const pool = ALL_THEMES.filter((t) => t !== lastTheme);
      const theme = pool[Math.floor(Math.random() * pool.length)];
      lastTheme = theme;

      state.value = {
        dir,
        phase: 'cover',
        card: META[path] || DEFAULT_META,
        theme,
      };

      // 参考站 start() 里的 900ms 兜底 -> toReveal（防 ptr-wipe-in 的 animationend 丢失）
      later(() => {
        if (myGen === gen) toReveal();
      }, START_FALLBACK_MS);
      return true;
    }

    /* ------------------------------------------------------- play() */

    /**
     * 对外唯一入口。
     * @param {string} path        目标路由
     * @param {'next'|'prev'} dir  方向（决定根元素上的 --ptr-x：next=1 / prev=-1）
     * @returns {Promise<boolean>} true  = 调用被接受（转场已启动，或 reduced 下已完成直接跳转）；
     *                             false = 已在转场中，调用方应自行补一次 router.push，
     *                                     绝不能因为拿到 false 就什么都不做。
     */
    function play(path, dir = 'next') {
      // ★ 最早的守卫：prefers-reduced-motion 【或】 页面不可见。
      //   参考站把这道守卫放在导航入口 b() 里，原文是【两个并列条件】：
      //     if (matchMedia('(prefers-reduced-motion: reduce)').matches
      //         || document.visibilityState === 'hidden') { push(target); return; }
      //   命中时只有一次路由 push，return 之后什么都不做（无 setState / dataset / 转场）。
      //   App.vue 由 Lead 接线，这里【再守一道】，保证「reduce 或后台标签页时直接跳转
      //   不播动画」不依赖调用方实现。
      //   命中时不设 state、不加 class、不写内联 style、不排任何定时器 ——
      //   否则残留的 data-phase / --ptr-x 会被下一轮正常转场继承。
      //
      //   为什么 visibilityState === 'hidden' 这道条件是真的需要（不是学究）：
      //   1. 后台标签页里转场用户根本看不见，却会真的占用两层 rAF 与三条 .28s 动画；
      //   2. 标签页在后台时 rAF 被浏览器节流到几乎不跑，而 toReveal() 推进 reveal 正是
      //      依赖双层 rAF —— 这会让转场卡在 cover 直到 900ms 兜底，用户切回前台时
      //      看到的是一个卡住的覆盖层；
      //   3. 参考站正是为此加了这道守卫，复刻它才算真的复刻。
      //   防御性写法与下面一致：window / document / matchMedia 都可能不存在或不可读。
      if (
        (typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
        (typeof document !== 'undefined' && document.visibilityState === 'hidden')
      ) {
        return Promise.resolve(router.push(path))
          .catch(() => {})
          .then(() => true);
      }

      // 换目标了就把上一轮挂着的就绪信号摘掉（参考站 St()）
      if (path !== targetPath) dropReadySignal();

      if (!start(path, dir === 'prev' ? 'prev' : 'next')) return Promise.resolve(false);
      // ★ 返回【本轮】的 deferred，而不是跨轮共享的槽位（见 pushDeferred 的说明）。
      const round = pushDeferred;
      return round.promise.then(() => true);
    }

    /* -------------------------------------------------- 生命周期清理 */

    onUnmounted(() => {
      clearTimers();
      dropReadySignal();
      settlePush(); // 组件卸载后不可能再有 push 落定，放行挂着的 play() 调用方
      state.value = null;
      busy = false;
      enteredReveal = false;
      wentIdle = false;
      gen++; // 让所有在途闭包失效
      lastTheme = null;
      targetPath = '';
    });

    expose({ play });

    /* -------------------------------------------------------- 派生值 */

    const card = computed(() => (state.value ? state.value.card : DEFAULT_META));
    const dir = computed(() => (state.value ? state.value.dir : 'next'));
    const phase = computed(() => (state.value ? state.value.phase : null));
    const letters = computed(() => Array.from(card.value.word));
    // 参考站：U = .3 + (H.length - 1) * .04 + .16，注入 --ptr-land 给 echo / ghost 用
    const landDelay = computed(() =>
      state.value ? (0.3 + (letters.value.length - 1) * 0.04 + 0.16).toFixed(4) + 's' : '0s'
    );

    const bigText = computed(() => (state.value ? buildBigText(card.value) : ''));
    const smallText = computed(() => (state.value ? buildSmallText(card.value) : ''));
    const bandText = computed(() => (state.value ? buildBandText(card.value) : ''));

    // 根元素 class：idle 态只有 ptr-root ptr-idle，【没有】ptr-theme-*（与参考站一致）
    const rootClass = computed(() => {
      const s = state.value;
      if (!s) return 'ptr-root ptr-idle' + (isAndroid ? ' ptr-android' : '');
      return (
        'ptr-root ptr-theme-' +
        s.theme +
        (isAndroid ? ' ptr-android' : '') +
        (s.phase === 'idle' ? ' ptr-idle' : '')
      );
    });

    const rows = [1, 2, 3, 4, 5, 6];
    const streakIndexes = [1, 2, 3, 4, 5, 6];

    return {
      state, rootClass, card, dir, phase,
      letters, landDelay, bigText, smallText, bandText,
      rows, streakIndexes, isAndroid,
      play, onWipeAEnd, onWipeMainEnd,
    };
  },
};
</script>

<template>
  <Teleport to="body">
    <div
      :class="rootClass"
      :data-phase="phase || undefined"
      :style="state ? { '--ptr-x': dir === 'next' ? 1 : -1 } : undefined"
      aria-hidden="true"
    >
      <template v-if="state">
        <div class="ptr-wipe ptr-wipe-a" @animationend="onWipeAEnd">
          <div class="ptr-wipe-fill"></div>
        </div>

        <div class="ptr-wipe ptr-wipe-b">
          <div class="ptr-wipe-fill"></div>
        </div>

        <div class="ptr-wipe ptr-wipe-main" @animationend="onWipeMainEnd">
          <div class="ptr-panel">
            <div class="ptr-halftone"></div>
            <div class="ptr-band ptr-band-1"><span class="ptr-band-text">{{ bandText }}</span></div>
            <div class="ptr-band ptr-band-2"><span class="ptr-band-text">{{ bandText }}</span></div>
            <div class="ptr-band ptr-band-3"><span class="ptr-band-text">{{ bandText }}</span></div>
            <div class="ptr-rows">
              <div v-for="n in rows" :key="n" :class="'ptr-row ptr-row-' + n">
                <span>{{ n % 2 === 1 ? smallText : bigText }}</span>
              </div>
            </div>
            <div class="ptr-scanlines"></div>
          </div>

          <div class="ptr-mark">{{ card.mark }}</div>

          <div class="ptr-title" :style="{ '--ptr-land': landDelay }">
            <div class="ptr-title-word">
              <span class="ptr-title-echo">{{ card.word }}</span>
              <span class="ptr-title-ghost ptr-title-ghost-c">{{ card.word }}</span>
              <span class="ptr-title-ghost ptr-title-ghost-m">{{ card.word }}</span>
              <span class="ptr-title-main">
                <span
                  v-for="(ch, i) in letters"
                  :key="i"
                  class="ptr-letter"
                  :style="{ '--ptr-i': i }"
                >{{ ch }}</span>
              </span>
            </div>
            <div class="ptr-title-hazard"></div>
            <div class="ptr-title-chip">
              <span>{{ card.jp }}</span>
              <i></i>
              <span>{{ card.cn }}</span>
            </div>
          </div>

          <div class="ptr-corner-no">
            {{ card.no }}<em v-if="card.no !== 'EX'">/ 04</em>
          </div>
          <div class="ptr-corner-loading">NOW LOADING ▸▸▸</div>
          <div class="ptr-edge ptr-edge-left"></div>
          <div class="ptr-edge ptr-edge-right"></div>
        </div>

        <!-- streaks 是根元素的直接子节点，且仅非安卓渲染（参考站 !_.Bh && ...） -->
        <div v-if="!isAndroid" class="ptr-streaks">
          <span v-for="n in streakIndexes" :key="n" :class="'ptr-streak ptr-streak-' + n"></span>
        </div>

        <div class="ptr-flash"></div>
      </template>
    </div>
  </Teleport>
</template>
