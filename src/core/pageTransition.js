/**
 * 参考站（forum.hanakos.cc）的页面转场复刻：View Transitions API 驱动的 3D 立方体翻转。
 *
 * 原站机制（从 app 布局 chunk 的压缩源码里逐行还原，模块 19812）：
 *
 *   let r = typeof document !== 'undefined' && typeof document.startViewTransition === 'function';
 *   let l = null;                                  // 当前"滚动兜底 Promise"的 resolver
 *   function i(){ l && (l(), l = null) }           // 主动取消
 *   function s(e){ return new Promise(t => {       // 注册兜底，同时把上一个顶掉
 *     let n = false, r = () => { n || (n = true, l === r && (l = null), t()) };
 *     l = r; setTimeout(r, e);
 *   }) }
 *   let f = ["/", "/live", "/cinema", "/music", "/profile", "/home"];   // 顺序表
 *   function m(e, t){                             // 方向判定
 *     let n = f.indexOf(e), r = f.indexOf(t);
 *     return n === -1 || r === -1 || n === r ? null : (r > n ? "next" : "prev");
 *   }
 *   let h = null;                                  // 手势处理器（触摸横滑）
 *   function p(e){ h = e; return () => { h === e && (h = null) } }
 *
 *   function b(router, target, dir){
 *     // 1. reduced-motion 或 页面隐藏 -> 直接跳，不做动画
 *     if (window.matchMedia("(prefers-reduced-motion: reduce)").matches
 *         || document.visibilityState === "hidden") { router.push(target); return; }
 *     // 2. 有手势处理器接管 -> 交给它，这里不动
 *     if (h) { h(target, dir); return; }
 *     // 3. 不支持 VT -> 直接跳
 *     if (!r || typeof document.startViewTransition !== "function") { router.push(target); return; }
 *     // 4. 正式播放
 *     let l = document.documentElement;
 *     l.dataset.pt = dir;                                    // 写入方向，CSS 靠它选 keyframes
 *     a.startViewTransition(() => {
 *       let n = s(800);                                      // 800ms 兜底
 *       return router.push(target), n;                       // 返回 Promise -> VT 等它
 *     }).finished.finally(() => {
 *       l.dataset.pt === dir && delete l.dataset.pt;         // 只删自己那轮的标记
 *     });
 *   }
 *   function v(router, from, to){
 *     b(router, to, m(from, to) ?? "next");                  // 无方向时回退 "next"
 *   }
 *
 * 我方差异（刻意保留）：
 *  - 路由顺序表换成 ["/", "/wall", "/cinema", "/music"]；
 *  - /login 不在表里，退出登录时方向回退 "next"；
 *  - 原站用 setViewTransition 的返回 Promise 直接等 router.push；vue-router 的 push
 *    在守卫重定向时 resolve 得比渲染早，所以这里额外等一次 nextTick + rAF（见 waitForPaint）；
 *  - 原站的 s(800) 是"滚动兜底"（真正的作用是让旧的兜底 Promise 提前 resolve），
 *    这里保持同样的 800ms 语义并加上 clearTimeout，避免定时器泄漏。
 */

/**
 * 路由顺序表：决定 next / prev。
 * 参考站是 ["/", "/live", "/cinema", "/music", "/profile", "/home"]，
 * 我方对应的 4 个主页面顺序保持不变（首页 -> 照片墙 -> 影院 -> 音乐）。
 */
const ROUTE_ORDER = ['/', '/wall', '/cinema', '/music'];

/** 兜底超时：参考站写死 800ms。push 被守卫拦下 / 组件加载卡住时靠它收尾。 */
const FALLBACK_MS = 800;

/** 当前挂起的兜底 resolver（对应原站的模块级变量 l）。 */
let pendingFallback = null;

/** 当前是否已有一轮 View Transition 在进行（对应原站的模块级变量 h）。 */
let gestureHandler = null;

/**
 * 是否支持 View Transitions API。
 * 必须在运行时判断（不能在模块顶层缓存成常量后直接用于分支以外的场景），
 * 因为 SSR / 老浏览器下 document 可能不存在。
 */
export function supportsViewTransition() {
  return typeof document !== 'undefined' && typeof document.startViewTransition === 'function';
}

/**
 * 是否应当跳过动画直接跳转。
 * 对齐原站：reduced-motion 或页面处于 hidden（后台标签页）时不播动画。
 */
export function shouldSkipAnimation() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return true;
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  } catch (e) {
    // matchMedia 在极老的浏览器/异常环境下可能抛错，此时不阻塞导航
  }
  return document.visibilityState === 'hidden';
}

/**
 * 方向判定。语义与参考站 getDirection(from, to) 完全一致。
 *
 * @param {string} from 当前路径
 * @param {string} to   目标路径
 * @returns {'next'|'prev'|null} 任一索引为 -1 或两者相等 -> null；否则按顺序表先后
 */
export function getDirection(from, to) {
  const fromIndex = ROUTE_ORDER.indexOf(from);
  const toIndex = ROUTE_ORDER.indexOf(to);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return null;
  return toIndex > fromIndex ? 'next' : 'prev';
}

/**
 * 带方向的判定封装：null 一律回退 'next'（原站 v() 的 ?? "next"）。
 */
export function resolveDirection(from, to) {
  return getDirection(from, to) || 'next';
}

/** 暴露顺序表供测试 / 复用（只读语义，调用方不要改）。 */
export function getRouteOrder() {
  return ROUTE_ORDER.slice();
}

/**
 * 注册一个兜底 Promise（逐字对应原站的 s(e)）。
 *
 * 【语义澄清，别想当然】原站 s(e) 只是 `l = r; setTimeout(r, e)` —— 新调用【只覆盖指针，
 * 并不会去 resolve 上一个 Promise】。旧的那个仍然要等它自己的 800ms 到点才会 settle。
 * 我实测过原站行为：50ms 时再注册一次，第一个 Promise 依旧在 ~810ms 才 resolve。
 * 所以"上一轮被立刻放行"这件事【不存在】；真正的中断是显式的 St()（= 本文件的 cancelPendingFallback）。
 * 这里严格照抄这个语义，不做"聪明的"提前 resolve —— 否则会改变正常路径的抓快照时机。
 *
 * 额外加的两个保险（原站没有，但无害）：
 *  1. clearTimeout，避免超时器在已经 resolve 之后还挂着（进程/页面活久了会累积）。
 *  2. 自己从 pendingFallback 摘除，避免 cancelPendingFallback() 去 fire 一个已 settle 的回调。
 */
function registerFallback(ms) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const fire = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      if (pendingFallback === fire) pendingFallback = null;
      resolve();
    };
    pendingFallback = fire;
    timer = setTimeout(fire, ms);
  });
}

/** 主动取消挂起的兜底（对应原站 St()）。 */
export function cancelPendingFallback() {
  if (pendingFallback) {
    const fn = pendingFallback;
    pendingFallback = null;
    fn();
  }
}

/**
 * 等一次"真正绘制完成"。
 * vue-router 的 push() 在守卫重定向/异步组件场景会提前 resolve，
 * 直接返回它会让 startViewTransition 在新视图挂载前就抓快照（表现为动画闪一下或不动）。
 * 这里额外等 nextTick + 两帧 rAF，且不阻塞（超时后照样 resolve）。
 */
function waitForPaint() {
  return new Promise((resolve) => {
    const done = () => resolve();
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(done, 0);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(done));
    // 极端情况下（后台标签页 rAF 不触发）不无限等
    setTimeout(done, 250);
  });
}

/**
 * 核心播放函数。
 *
 * @param {import('vue-router').Router} router vue-router 实例
 * @param {string} target 目标路径
 * @param {'next'|'prev'} direction 方向
 * @returns {Promise<boolean>} true = 已接管并完成导航；false = 未接管（调用方需自行兜底）
 */
export async function playTransition(router, target, direction) {
  const dir = direction === 'prev' ? 'prev' : 'next';

  // 分支 1：降级 —— reduced-motion / 页面隐藏 / 不支持 VT，一律直接跳。
  if (shouldSkipAnimation() || !supportsViewTransition()) {
    await router.push(target);
    return true;
  }

  const html = document.documentElement;

  try {
    html.dataset.pt = dir;

    // 关键：startViewTransition 拿到的是「旧视图」的快照时机。
    // 回调里发起导航，并返回一个 Promise，告诉浏览器「等它 resolve 再抓新快照」。
    //
    // 【这里踩过一个真实的坑，别改回去】
    // 最初写成：const fallback = registerFallback(FALLBACK_MS);
    //            try { await Promise.all([router.push(target), waitForPaint()]); } catch {}
    //            return fallback;
    // 那样是【错的】：只要 router.push 永远不 resolve（例如守卫 reject 后又没有后续导航，
    // 或同一个 URL 的重复 push 被吞掉），Promise.all 就永远挂着，
    // `return fallback` 这行【根本执行不到】——800ms 兜底虽然按时触发了，但没有任何人去等它。
    // 实测症状：transition.finished 永不 settle、html[data-pt] 永久残留在 <html> 上，
    // 之后所有导航都会带着一个陈旧的方向值，转场时序错乱。
    // 正确写法：把 fallback 作为【等待时间的上界】，并且返回 race 的【胜者】：
    // 正常时胜者是 guard（导航+绘制真的完成了），异常时胜者是已 resolve 的 fallback。
    // 这样既不会在正常路径上白等 800ms，也不会在 push 挂死时永远不结束。
    const transition = document.startViewTransition(async () => {
      const fallback = registerFallback(FALLBACK_MS);
      // 导航与绘制并行推进；失败（重复导航 / 守卫 reject）只记录，不影响兜底。
      // 注意 catch 放在最内层：guard 自身永远不会 reject，这样它才能安全地被返回。
      const guard = Promise.all([
        Promise.resolve()
          .then(() => router.push(target))
          .catch((e) => {
            console.warn('[pageTransition] 导航未完成：', e);
          }),
        waitForPaint()
      ]);
      // 【必须用 winner，不能写 `await race(...); return fallback;`】
      // 那样在【正常路径】下也会让浏览器白等满 800ms 才抓新快照（动画明显延迟、
      // 表现为切页前先愣一下）；而在【挂死路径】下又必须靠 fallback 解围。
      // 所以：谁先完成就返回谁 —— 正常时返回 guard（真实导航+绘制完成即可抓快照），
      // 异常时返回已 resolve 的 fallback（立刻放行，不再等那个永不 settle 的 guard）。
      return Promise.race([guard, fallback]);
    });

    // 关键：.finished 可能 reject（转场被打断），用 finally 保证一定会清理标记。
    // 清理时必须比对方向：用户连点时，新一轮可能已经写了不同的 dir，
    // 无条件 delete 会把新一轮的标记抹掉，导致它退化成无方向（无动画）。
    if (transition && transition.finished && typeof transition.finished.finally === 'function') {
      transition.finished
        .catch(() => {})
        .finally(() => {
          if (html.dataset.pt === dir) delete html.dataset.pt;
        });
    } else {
      // 极小概率：startViewTransition 返回了非标准对象，别让标记永久留在 html 上
      if (html.dataset.pt === dir) delete html.dataset.pt;
    }
    return true;
  } catch (e) {
    // 分支 4：任何异常都不能让路由卡死（例如 startViewTransition 被调用方 monkey patch 成抛错）
    console.warn('[pageTransition] startViewTransition 失败，降级为直接跳转：', e);
    if (html.dataset.pt === dir) delete html.dataset.pt;
    await router.push(target);
    return true;
  }
}

/**
 * 面向调用方的入口：自动判定方向（null -> 'next'）。
 *
 * @param {import('vue-router').Router} router
 * @param {string} from 当前路径
 * @param {string} to   目标路径
 */
export async function navigateWithTransition(router, from, to) {
  return playTransition(router, to, resolveDirection(from, to));
}

/**
 * 测试/调试用：重置模块级状态，避免用例之间互相污染。
 */
export function __resetTransitionState() {
  cancelPendingFallback();
  gestureHandler = null;
}

export default {
  getDirection,
  resolveDirection,
  supportsViewTransition,
  shouldSkipAnimation,
  playTransition,
  navigateWithTransition,
  cancelPendingFallback,
  getRouteOrder
};
