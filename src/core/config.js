// ================================================================
//  全局配置 - 照片墙基础参数
// ================================================================

export const TOTAL_IMAGES = 20;   // 照片总数，必须和 public/images/thumbnails 里的实际张数一致
export const WORLD_COLS = 20;     // 横向网格数
export const WORLD_ROWS = 15;     // 纵向网格数
export const STEP = 340;          // 卡片间距
export const EPSILON = 1e-6;      // 浮点修正系数

export const WORLD_W = WORLD_COLS * STEP;
export const WORLD_H = WORLD_ROWS * STEP;