const CFJ_INJURY_MODULE_ID = "cfj-sanity-system";

const CFJ_DAMAGE_TABLES = {
  acid: { label: "酸性伤害", table: "酸性伤害" },
  bludgeoning: { label: "钝击伤害", table: "钝击伤害" },
  cold: { label: "寒冷伤害", table: "寒冷伤害" },
  fire: { label: "火焰伤害", table: "火焰伤害" },
  force: { label: "力场伤害", table: "力场伤害" },
  lightning: { label: "闪电伤害", table: "闪电伤害" },
  necrotic: { label: "黯蚀伤害", table: "黯蚀伤害" },
  piercing: { label: "穿刺伤害", table: "穿刺伤害" },
  poison: { label: "毒素伤害", table: "毒素伤害" },
  psychic: { label: "心灵伤害", table: "物理伤害" },
  radiant: { label: "光耀伤害", table: "光耀伤害" },
  slashing: { label: "挥砍伤害", table: "挥砍伤害" },
  thunder: { label: "雷鸣伤害", table: "雷鸣伤害" }
};

Hooks.once("init", registerInjurySettings);

Hooks.once("ready", () => {
  game.cfjInjury = {
    showRules: showInjuryRules,
    promptRoll: promptInjuryRoll,
    roll: rollInjury
  };
  installInjuryChatActions();
  console.log(`${CFJ_INJURY_MODULE_ID} | injury rules ready`);
});

function registerInjurySettings() {
  const register = (key, data) => game.settings.register(CFJ_INJURY_MODULE_ID, key, { scope: "world", config: true, ...data });
  register("enableInjuryRules", {
    name: "【持续伤势】启用持续伤势房规",
    hint: "默认关闭。开启后，GM 可以在跑团房规控制台中手动投掷持续伤势表。关闭时，所有伤势按钮只显示规则说明，不产生任何伤势结果。",
    type: Boolean,
    default: false
  });
  register("injuryTriggerCritical", {
    name: "【持续伤势】触发：暴击",
    hint: "建议开启。角色受到暴击且该次攻击造成实际伤害时，GM 可以要求投掷对应伤害类型的持续伤势表。",
    type: Boolean,
    default: true
  });
  register("injuryTriggerSevereSave", {
    name: "【持续伤势】触发：造成伤害的豁免严重失败",
    hint: "建议开启。角色在会造成伤害的豁免中严重失败时，GM 可以要求投掷对应伤害类型的持续伤势表。",
    type: Boolean,
    default: true
  });
  register("injurySevereFailBy", {
    name: "【持续伤势】严重失败差值",
    hint: "豁免结果低于 DC 多少才算严重失败。建议为 5；若战役更严酷，可改为 10。",
    type: Number,
    default: 5,
    range: { min: 1, max: 20, step: 1 }
  });
}

function injurySetting(key, fallback) {
  try {
    return game.settings.get(CFJ_INJURY_MODULE_ID, key);
  } catch (_err) {
    return fallback;
  }
}

function installInjuryChatActions() {
  document.addEventListener("click", async (event) => {
    const button = event.target?.closest?.("button[data-cfj-injury-action]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (!game.user?.isGM) return ui.notifications.warn("只有 GM 可以使用持续伤势房规。");
    if (button.dataset.cfjInjuryAction === "rules") return showInjuryRules();
    if (button.dataset.cfjInjuryAction === "roll") return promptInjuryRoll();
  }, true);
}

async function showInjuryRules() {
  if (!game.user?.isGM) return;
  const enabled = injurySetting("enableInjuryRules", false);
  const crit = injurySetting("injuryTriggerCritical", true);
  const severe = injurySetting("injuryTriggerSevereSave", true);
  const severeBy = Number(injurySetting("injurySevereFailBy", 5));
  await ChatMessage.create({
    speaker: { alias: "苍梵界跑团房规" },
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<div class="cfj-sanity-card"><h3>持续伤势房规</h3><p><strong>当前状态：</strong>${enabled ? "已启用" : "未启用"}</p><p>持续伤势只用于强调严重创伤，不替代生命值、死亡豁免或普通状态。默认由 GM 手动触发；本模块暂不接管 Midi-QOL 的伤害结算，也不会自动修改生命值上限。</p><table><tr><th>可用触发</th><td>${crit ? "暴击造成实际伤害" : "暴击触发已关闭"}；${severe ? `造成伤害的豁免失败 ${severeBy} 点或更多` : "豁免严重失败触发已关闭"}</td></tr><tr><th>使用限制</th><td>同一次攻击、法术、陷阱或环境事件通常只投一次。若一次伤害含多种类型，使用造成伤害最高的类型；无法判定时由 GM 选择最贴合叙事的一种。</td></tr><tr><th>不触发</th><td>未造成实际伤害、临时生命值完全吸收、纯叙事擦伤、玩家不在场、GM 判断会打断节奏的普通小战斗。</td></tr><tr><th>后续处理</th><td>伤势结果由表格给出。需要部位时，再按结果要求投掷大肢体、小肢体或由 GM 指定。需要治疗、手术或长期适应时，按桌面裁定处理。</td></tr></table><p class="cfj-sanity-note">这些规则来自现有 Maxwell 伤势资料的苍梵界桌面化整理；物品包不纳入本模块。</p></div>`
  });
}

function promptInjuryRoll() {
  if (!game.user?.isGM) return;
  if (!injurySetting("enableInjuryRules", false)) {
    ui.notifications.warn("持续伤势房规尚未启用。请先在模块设置中开启。");
    return showInjuryRules();
  }
  const options = Object.entries(CFJ_DAMAGE_TABLES)
    .map(([key, data]) => `<option value="${key}">${data.label}</option>`)
    .join("");
  const actors = selectedInjuryActors();
  const names = actors.length ? actors.map((actor) => escapeInjuryHtml(actor.name)).join("、") : "未选择角色";
  new Dialog({
    title: "投掷持续伤势",
    content: `<form class="cfj-sanity-dialog"><p>目标角色：${names}</p><div class="form-group"><label>触发原因</label><select name="trigger"><option value="critical">暴击造成实际伤害</option><option value="severe-save">造成伤害的豁免严重失败</option><option value="gm">GM 手动裁定</option></select></div><div class="form-group"><label>伤害类型</label><select name="damage">${options}</select></div><div class="form-group"><label>备注</label><input name="note" type="text" value=""></div><p class="notes">此处只投掷伤势表并生成聊天结果，不自动修改生命值、生命值上限、装备或状态。</p></form>`,
    buttons: {
      roll: { label: "投掷伤势", callback: async (html) => {
        const form = html[0]?.querySelector("form");
        await rollInjury({
          actors,
          trigger: form?.querySelector("[name='trigger']")?.value ?? "gm",
          damage: form?.querySelector("[name='damage']")?.value ?? "slashing",
          note: form?.querySelector("[name='note']")?.value?.trim?.() ?? ""
        });
      } },
      cancel: { label: "取消" }
    }
  }).render(true);
}

async function rollInjury({ actors = [], trigger = "gm", damage = "slashing", note = "" } = {}) {
  if (!game.user?.isGM) return;
  if (!injurySetting("enableInjuryRules", false)) {
    ui.notifications.warn("持续伤势房规尚未启用。");
    return showInjuryRules();
  }
  const tableInfo = CFJ_DAMAGE_TABLES[damage] ?? CFJ_DAMAGE_TABLES.slashing;
  const table = await findInjuryTable(tableInfo.table);
  const roll = await new Roll("3d6").evaluate({ async: true });
  const rollText = await roll.render();
  const result = table ? findTableResult(table, roll.total) : null;
  const actorNames = actors.length ? actors.map((actor) => escapeInjuryHtml(actor.name)).join("、") : "未指定角色";
  await ChatMessage.create({
    speaker: { alias: "苍梵界跑团房规" },
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<div class="cfj-sanity-card"><h3>持续伤势：${tableInfo.label}</h3><table><tr><th>目标</th><td>${actorNames}</td></tr><tr><th>触发</th><td>${triggerLabel(trigger)}</td></tr><tr><th>投骰</th><td>${roll.total}</td></tr><tr><th>表格</th><td>${escapeInjuryHtml(tableInfo.table)}</td></tr><tr><th>结果</th><td>${result ? renderTableResult(result) : "未找到对应表格结果；请打开原始 RollTable 手动核对。"}</td></tr>${note ? `<tr><th>备注</th><td>${escapeInjuryHtml(note)}</td></tr>` : ""}</table>${rollText}<p class="cfj-sanity-note">本结果只提示伤势内容。是否需要部位表、治疗、手术或长期适应，由 GM 根据当前场景裁定。</p></div>`
  });
}

function selectedInjuryActors() {
  const actors = (canvas?.tokens?.controlled ?? []).map((token) => token.actor).filter(Boolean);
  const byId = new Map();
  for (const actor of actors) byId.set(actor.id, actor);
  return [...byId.values()];
}

async function findInjuryTable(name) {
  const fromWorld = game.tables?.find?.((table) => table.name === name);
  if (fromWorld) return fromWorld;
  for (const pack of game.packs ?? []) {
    if (pack.documentName !== "RollTable") continue;
    const title = String(pack.metadata?.label ?? pack.collection ?? "");
    if (!title.includes("Malicious Maladies") && !title.includes("伤害") && !title.includes("Tables")) continue;
    if (!pack.index?.size) {
      try {
        await pack.getIndex({ fields: ["name"] });
      } catch (_err) {
        continue;
      }
    }
    const indexed = Array.from(pack.index ?? []);
    const row = indexed.find((entry) => entry.name === name);
    if (!row) continue;
    try {
      return await pack.getDocument(row._id);
    } catch (_err) {
      return { pack, id: row._id, name };
    }
  }
  return null;
}

function findTableResult(table, total) {
  if (table.results) return Array.from(table.results).find((result) => total >= Number(result.range?.[0] ?? 0) && total <= Number(result.range?.[1] ?? 0));
  if (table.pack) return { text: `请打开合集包 ${table.pack.metadata?.label ?? table.pack.collection} 中的 ${table.name}，查看 ${total} 对应结果。` };
  return null;
}

function renderTableResult(result) {
  if (!result) return "";
  const text = result.text ?? result.description ?? result.name ?? "";
  const range = result.range ? `${result.range[0]}-${result.range[1]}` : "";
  return `${range ? `<strong>${range}</strong>：` : ""}${escapeInjuryHtml(text)}`;
}

function triggerLabel(trigger) {
  if (trigger === "critical") return "暴击造成实际伤害";
  if (trigger === "severe-save") return "造成伤害的豁免严重失败";
  return "GM 手动裁定";
}

function escapeInjuryHtml(value) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  return Array.from(String(value ?? "")).map((char) => map[char] ?? char).join("");
}


