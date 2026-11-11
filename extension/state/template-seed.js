/**
 * template-seed.js — 内置模板 seed（state 层）
 *
 * 只 seed 一次、不复活（2026-11-11 PRD R3）：
 * - 判定靠独立 meta key `templatesSeed`（版本号）——不能靠"templates 列表为空"，
 *   因为 `getTemplates` 对「从未初始化」和「用户删光」都返回 `[]`，区分不了。
 * - 升级清单（版本 +1）时只**补缺 id**：用户删掉的内置是主动选择，不复活。
 * - host 离线 / 老版本 host（无 templatesSeed 路由）：静默跳过，下次启动再试。
 *
 * 依赖方向：state 层消费 shared 纯数据 + host-client（meta 读写唯一通路）。
 */

import {
  TEMPLATES_SEED_VERSION, missingBuiltinTemplates,
} from '../shared/builtin-templates.js';
import { getHostMeta, setHostMeta, updateHostMeta } from './host-client.js';

/**
 * 确保内置模板已 seed（幂等；失败静默，下次启动重试）。
 *
 * @returns {Promise<void>}
 */
export async function ensureBuiltinTemplates() {
  try {
    const seed = await getHostMeta('templatesSeed');
    // 已达版本 → 不再动模板列表（用户删掉的内置不复活）
    if (seed !== null && Number(seed) >= TEMPLATES_SEED_VERSION) return;

    // 补缺 id：只在确有缺失时写列表（避免每次启动空写一遍全量模板）
    const next = await updateHostMeta('templates', (cur) => {
      const missing = missingBuiltinTemplates(cur);
      if (!missing.length) return cur;
      return [...missing, ...(Array.isArray(cur) ? cur : [])];
    });

    // 记版本（老 host 无此路由 → 抛错 → 上面的列表写入已生效，下次启动
    // missingBuiltinTemplates 会因 id 齐全而跳过写，只剩版本探测的两次 GET，无副作用）
    await setHostMeta('templatesSeed', TEMPLATES_SEED_VERSION);
    if (Array.isArray(next) && next.length) {
      console.debug('[journal] 内置模板 seed 完成，共', next.length, '个模板');
    }
  } catch (e) {
    // seed 失败不阻塞启动、不弹 toast：内置模板是锦上添花，下次启动自愈
    console.debug('[journal] 内置模板 seed 跳过（host 未就绪或老版本）：', e?.message ?? e);
  }
}
