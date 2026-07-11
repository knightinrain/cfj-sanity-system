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

const EFFECT_MODES = {
  CUSTOM: 0,
  MULTIPLY: 1,
  ADD: 2,
  DOWNGRADE: 3,
  UPGRADE: 4,
  OVERRIDE: 5
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
    hint: "默认关闭。开启后，GM 可以在跑团房规控制台中选择目标和伤害类型；模块会自动投掷对应持续伤势表并写入结果。关闭时，所有伤势按钮只显示规则说明，不产生任何伤势结果。",
    type: Boolean,
    default: false
  });
  register("autoCreateInjuryEffects", {
    name: "【持续伤势】自动添加伤势效应",
    hint: "开启后，投掷持续伤势表时，会把随机表结果写入目标角色的 ActiveEffect。该效应用于显示和追踪，不会自动改生命值。",
    type: Boolean,
    default: true
  });
  register("injuryEffectMidiReady", {
    name: "【持续伤势】效应预留 Midi/DAE 标记",
    hint: "开启后，伤势效应会带有可供 Midi-QOL/DAE 识别的 flags。",
    type: Boolean,
    default: true
  });
  register("injuryApplyMappedMechanics", {
    name: "【持续伤势】自动套用明确机械效果",
    hint: "开启后，模块会把已经规则化的伤势结果写成 DAE/Midi 可读取的机械效果，例如减速、攻击劣势、检定劣势、专注豁免劣势。无法可靠识别的结果仍只做记录。",
    type: Boolean,
    default: true
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
  const mapped = injurySetting("injuryApplyMappedMechanics", true);
  await ChatMessage.create({
    speaker: { alias: "苍梵界跑团房规" },
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<div class="cfj-sanity-card"><h3>持续伤势房规</h3><p><strong>当前状态：</strong>${enabled ? "已启用" : "未启用"}</p><p>持续伤势只用于强调严重创伤，不替代生命值、死亡豁免或普通状态。GM 选择目标和伤害类型后，模块会自动投掷对应随机表，并可把结果写成角色效应。本模块不接管生命值结算，也不会自动修改生命值上限。</p><table><tr><th>可用触发</th><td>${crit ? "暴击造成实际伤害" : "暴击触发已关闭"}；${severe ? `造成伤害的豁免失败 ${severeBy} 点或更多` : "豁免严重失败触发已关闭"}</td></tr><tr><th>机械效果</th><td>${mapped ? "已开启。已规则化的伤势会自动写入 DAE/Midi 可读取效果；无法识别的伤势只记录。" : "已关闭。伤势只写入说明，不套用机械效果。"}</td></tr><tr><th>使用限制</th><td>同一次攻击、法术、陷阱或环境事件通常只投一次。若一次伤害含多种类型，使用造成伤害最高的类型；无法判定时由 GM 选择最贴合叙事的一种。</td></tr><tr><th>不触发</th><td>未造成实际伤害、临时生命值完全吸收、纯叙事擦伤、玩家不在场、GM 判断会打断节奏的普通小战斗。</td></tr><tr><th>后续处理</th><td>伤势结果由表格给出。需要部位时，再按结果要求投掷大肢体、小肢体或由 GM 指定。需要治疗、手术或长期适应时，按桌面裁定处理。</td></tr></table><p class="cfj-sanity-note">这些规则来自现有 Maxwell 伤势资料的苍梵界桌面化整理；物品包不纳入本模块。</p></div>`
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
    content: `<form class="cfj-sanity-dialog"><p>目标角色：${names}</p><div class="form-group"><label>触发原因</label><select name="trigger"><option value="critical">暴击造成实际伤害</option><option value="severe-save">造成伤害的豁免严重失败</option><option value="gm">GM 手动裁定</option></select></div><div class="form-group"><label>伤害类型</label><select name="damage">${options}</select></div><div class="form-group"><label>备注</label><input name="note" type="text" value=""></div><p class="notes">模块会自动投掷对应伤势表。若开启“自动添加伤势效应”，结果会写入目标角色效应；若开启“自动套用明确机械效果”，已规则化结果会写入 DAE/Midi 可读取效果；不会自动修改生命值、生命值上限或装备。</p></form>`,
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
  const resultText = result?.text ?? result?.description ?? result?.name ?? "";
  const mapped = result ? resolveInjuryMechanics(resultText, tableInfo) : injuryNoMappedMechanics();
  const actorNames = actors.length ? actors.map((actor) => escapeInjuryHtml(actor.name)).join("、") : "未指定角色";
  const effectIds = await applyInjuryEffects(actors, { tableInfo, result, rollTotal: roll.total, trigger, note });
  await ChatMessage.create({
    speaker: { alias: "苍梵界跑团房规" },
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<div class="cfj-sanity-card"><h3>持续伤势：${tableInfo.label}</h3><table><tr><th>目标</th><td>${actorNames}</td></tr><tr><th>触发</th><td>${triggerLabel(trigger)}</td></tr><tr><th>投骰</th><td>${roll.total}</td></tr><tr><th>表格</th><td>${escapeInjuryHtml(tableInfo.table)}</td></tr><tr><th>结果</th><td>${result ? renderTableResult(result) : "未找到对应表格结果；请打开原始 RollTable 手动核对。"}</td></tr><tr><th>规则化</th><td>${escapeInjuryHtml(mapped.label)}：${escapeInjuryHtml(mapped.summary)}</td></tr><tr><th>角色效应</th><td>${effectIds.length ? `已写入 ${effectIds.length} 个伤势效应` : "未写入；未选择目标、设置关闭或表格结果缺失"}</td></tr>${note ? `<tr><th>备注</th><td>${escapeInjuryHtml(note)}</td></tr>` : ""}</table>${rollText}<p class="cfj-sanity-note">本结果自动来自随机表。是否需要部位表、治疗、手术或长期适应，由 GM 根据当前场景裁定。</p></div>`
  });
}

async function applyInjuryEffects(actors, { tableInfo, result, rollTotal, trigger, note }) {
  if (!injurySetting("autoCreateInjuryEffects", true)) return [];
  if (!result || !actors?.length) return [];
  const effectIds = [];
  const resultText = result.text ?? result.description ?? result.name ?? "未命名伤势";
  const range = result.range ? `${result.range[0]}-${result.range[1]}` : String(rollTotal);
  const midiReady = injurySetting("injuryEffectMidiReady", true);
  for (const actor of actors) {
    if (!actor?.createEmbeddedDocuments) continue;
    const mapped = resolveInjuryMechanics(resultText, tableInfo);
    const effectData = {
      name: `持续伤势：${tableInfo.label} ${range}`,
      icon: "icons/svg/blood.svg",
      origin: actor.uuid,
      disabled: false,
      changes: mapped.changes,
      description: injuryEffectDescription({ tableInfo, resultText, range, rollTotal, trigger, note, mapped }),
      flags: {
        [CFJ_INJURY_MODULE_ID]: {
          type: "injury",
          damage: tableInfo.label,
          table: tableInfo.table,
          range,
          rollTotal,
          trigger,
          text: resultText,
          midiReady,
          mechanics: mapped.id,
          mechanicsLabel: mapped.label,
          mechanicsSummary: mapped.summary,
          mechanicalTags: mapped.tags
        }
      }
    };
    if (midiReady) {
      effectData.flags.dae = { transfer: false, stackable: "multi" };
      effectData.flags["midi-qol"] = { cfjInjury: true, cfjInjuryMechanics: mapped.id };
    }
    try {
      const created = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
      effectIds.push(...created.map((effect) => effect.id));
    } catch (err) {
      console.warn(`${CFJ_INJURY_MODULE_ID} | 无法写入持续伤势效应`, actor?.name, err);
    }
  }
  return effectIds;
}

function injuryEffectDescription({ tableInfo, resultText, range, rollTotal, trigger, note, mapped }) {
  const changes = mapped?.changeLabels?.length ? mapped.changeLabels.map((line) => `<li>${escapeInjuryHtml(line)}</li>`).join("") : "<li>无自动机械效果；仅记录伤势。</li>";
  const cautions = mapped?.cautions?.length ? `<p><strong>仍需 GM 裁定：</strong>${mapped.cautions.map(escapeInjuryHtml).join("；")}</p>` : "";
  return `<p><strong>持续伤势：${escapeInjuryHtml(tableInfo.label)}</strong></p><table><tr><th>表格</th><td>${escapeInjuryHtml(tableInfo.table)}</td></tr><tr><th>范围</th><td>${escapeInjuryHtml(range)}</td></tr><tr><th>投骰</th><td>${escapeInjuryHtml(rollTotal)}</td></tr><tr><th>触发</th><td>${escapeInjuryHtml(triggerLabel(trigger))}</td></tr><tr><th>结果</th><td>${escapeInjuryHtml(resultText)}</td></tr><tr><th>规则化</th><td>${escapeInjuryHtml(mapped?.label ?? "未映射")}</td></tr>${note ? `<tr><th>备注</th><td>${escapeInjuryHtml(note)}</td></tr>` : ""}</table><p><strong>自动效果：</strong>${escapeInjuryHtml(mapped?.summary ?? "无")}</p><ul>${changes}</ul>${cautions}`;
}

function resolveInjuryMechanics(resultText, tableInfo) {
  if (!injurySetting("injuryApplyMappedMechanics", true)) return injuryMechanicsDisabled();
  return mapInjuryMechanics(resultText, tableInfo);
}

function mapInjuryMechanics(resultText, tableInfo) {
  const text = normalizeInjuryText(`${tableInfo?.label ?? ""} ${resultText ?? ""}`);
  if (/(死亡|死去|立即死亡|毙命)/.test(text)) {
    return mechanicalProfile({
      id: "fatal",
      label: "致命伤",
      summary: "不自动杀死角色；此类结果必须由 GM 结合法术、死亡豁免和桌面裁定处理。",
      cautions: ["不会自动把生命值设为 0", "不会自动改变死亡豁免"]
    });
  }
  if (/(失去|切断|斩断|截断|断掉|断裂|粉碎).*(手臂|胳膊|手|腿|脚|足|肢|肢体)|断肢|残肢|截肢/.test(text)) {
    return mechanicalProfile({
      id: "lost-limb",
      label: "失去肢体",
      summary: "移动速度降低 10 尺；攻击具有劣势；敏捷和力量检定具有劣势。需要假肢、再生或长期适应。",
      changes: [
        movementChange("walk", -10),
        movementChange("climb", -10),
        disadvantage("flags.midi-qol.disadvantage.attack.all", "所有攻击具有劣势"),
        disadvantage("flags.midi-qol.disadvantage.ability.check.dex", "敏捷检定具有劣势"),
        disadvantage("flags.midi-qol.disadvantage.ability.check.str", "力量检定具有劣势")
      ],
      cautions: ["若伤势文本只影响单手或单脚，GM 可以手动放宽攻击或移动惩罚"]
    });
  }
  if (/(眼|目|视力|失明|盲)/.test(text)) {
    return mechanicalProfile({
      id: "eye-injury",
      label: "眼部伤势",
      summary: "远程攻击和依赖视觉的察觉检定具有劣势。完全失明仍由 GM 手动添加失明状态。",
      changes: [
        disadvantage("flags.midi-qol.disadvantage.attack.rwak", "远程武器攻击具有劣势"),
        disadvantage("flags.midi-qol.disadvantage.attack.rsak", "远程法术攻击具有劣势"),
        disadvantage("flags.midi-qol.disadvantage.skill.prc", "察觉检定具有劣势")
      ],
      cautions: ["若结果是完全失明，请由 GM 额外添加 Foundry 的“目盲”状态"]
    });
  }
  if (/(骨折|骨裂|断骨|肋骨|脱臼|扭伤|肌腱|韧带|跛|瘸|腿伤|脚伤|足伤)/.test(text)) {
    return mechanicalProfile({
      id: "fracture",
      label: "骨折或行动伤",
      summary: "移动速度降低 10 尺；敏捷检定和力量检定具有劣势。",
      changes: [
        movementChange("walk", -10),
        movementChange("climb", -10),
        movementChange("swim", -10),
        disadvantage("flags.midi-qol.disadvantage.ability.check.dex", "敏捷检定具有劣势"),
        disadvantage("flags.midi-qol.disadvantage.ability.check.str", "力量检定具有劣势")
      ],
      cautions: ["如果伤势只影响上肢，GM 可以手动移除移动速度惩罚"]
    });
  }
  if (/(内伤|内出血|脏器|器官|肺|心|肾|肝|胃|腹|胸|脑震荡|震荡|眩晕|昏沉)/.test(text)) {
    return mechanicalProfile({
      id: "internal-injury",
      label: "内伤",
      summary: "体质豁免和专注豁免具有劣势；不能从本模块自动判断是否需要持续治疗。",
      changes: [
        disadvantage("flags.midi-qol.disadvantage.ability.save.con", "体质豁免具有劣势"),
        disadvantage("flags.midi-qol.disadvantage.concentration", "专注豁免具有劣势")
      ],
      cautions: ["持续伤害、治疗 DC、是否恶化由 GM 处理"]
    });
  }
  if (/(失血|流血|出血|大出血|撕裂|割裂|开放性|伤口|裂口)/.test(text)) {
    return mechanicalProfile({
      id: "bleeding",
      label: "失血",
      summary: "体质豁免和专注豁免具有劣势；不自动扣血，避免未经确认的持续伤害误触发。",
      changes: [
        disadvantage("flags.midi-qol.disadvantage.ability.save.con", "体质豁免具有劣势"),
        disadvantage("flags.midi-qol.disadvantage.concentration", "专注豁免具有劣势")
      ],
      cautions: ["如需每回合失血扣血，应在真实测试后单独开启 OverTime 规则"]
    });
  }
  if (/(灼伤|烧伤|腐蚀|酸蚀|冻伤|坏死|感染|中毒|脓|溃烂|疾病)/.test(text)) {
    return mechanicalProfile({
      id: "systemic-trauma",
      label: "持续性创伤",
      summary: "体质豁免具有劣势；治疗和恶化由 GM 裁定。",
      changes: [
        disadvantage("flags.midi-qol.disadvantage.ability.save.con", "体质豁免具有劣势")
      ],
      cautions: ["感染、毒素、坏死是否造成持续伤害不自动处理"]
    });
  }
  if (/(疤|伤疤|毁容|面容|容貌|恐怖外貌)/.test(text)) {
    return mechanicalProfile({
      id: "scar",
      label: "疤痕或毁容",
      summary: "不自动惩罚战斗；社交影响由 GM 按场景处理。",
      cautions: ["若桌面决定影响威吓、游说或欺瞒，请手动添加更具体的效应"]
    });
  }
  return injuryNoMappedMechanics();
}

function injuryNoMappedMechanics() {
  return mechanicalProfile({
    id: "record-only",
    label: "未识别或仅记录",
    summary: "没有自动机械效果；仅把随机表结果写入角色效应。",
    cautions: ["该结果没有命中已规则化关键词，GM 可以按原文手动处理"]
  });
}

function injuryMechanicsDisabled() {
  return mechanicalProfile({
    id: "mechanics-disabled",
    label: "机械效果已关闭",
    summary: "当前设置只记录伤势，不写入自动机械惩罚。",
    cautions: ["如需自动减速、劣势或专注惩罚，请在模块设置中开启【持续伤势】自动套用明确机械效果"]
  });
}

function mechanicalProfile({ id, label, summary, changes = [], cautions = [] }) {
  return {
    id,
    label,
    summary,
    changes: changes.map(({ label: _label, ...change }) => ({ priority: change.priority ?? 20, ...change })),
    changeLabels: changes.map((change) => change.label ?? change.key),
    tags: changes.map((change) => change.label ?? change.key),
    cautions
  };
}

function movementChange(kind, value) {
  return {
    key: `system.attributes.movement.${kind}`,
    mode: EFFECT_MODES.ADD,
    value,
    label: `${movementLabel(kind)} ${value} 尺`
  };
}

function disadvantage(key, label) {
  return {
    key,
    mode: EFFECT_MODES.OVERRIDE,
    value: 1,
    label
  };
}

function movementLabel(kind) {
  if (kind === "walk") return "步行速度";
  if (kind === "climb") return "攀爬速度";
  if (kind === "swim") return "游泳速度";
  if (kind === "fly") return "飞行速度";
  return "移动速度";
}

function normalizeInjuryText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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
