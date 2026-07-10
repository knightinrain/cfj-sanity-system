const MODULE_ID = "cfj-sanity-system";
const FLAG_SCOPE = "world";
const SAN_FLAG = "sanity";

const RESOURCE_SLOTS = {
  none: null,
  primary: "system.resources.primary",
  secondary: "system.resources.secondary",
  tertiary: "system.resources.tertiary"
};

const STATES = {
  stable: { label: "理智：稳定", status: "cfj-sanity-stable", summary: "呼吸、判断正常", rule: "无影响。" },
  shaken: { label: "理智：动摇", status: "cfj-sanity-shaken", summary: "耳鸣、冷汗、手抖、胃部收紧", rule: "下一次同源相关检定或豁免的结果减去 1d4。" },
  unbalanced: { label: "理智：失衡", status: "cfj-sanity-unbalanced", summary: "视野发黑、短暂失语、心跳失序", rule: "对同源理智豁免具有劣势；不能从同源现象获得优势。" },
  fractured: { label: "理智：裂解", status: "cfj-sanity-fractured", summary: "呕吐、鼻血、意识断片、错误确信", rule: "获得 1 个裂解症状。" },
  collapsed: { label: "理智：崩溃", status: "cfj-sanity-collapsed", summary: "跪倒、抽搐、记忆错位、无法组织语言", rule: "获得 1 个崩溃症状。" }
};

const SYMPTOMS = {
  avoidance: {
    label: "回避",
    fractured: { name: "理智症状：裂解回避", text: "主动接近同一来源前，先进行 DC 10 理智豁免。失败：本回合不能主动靠近；仍可采取其他行动。", duration: "短休、离开来源，或稳定处理后移除。" },
    collapsed: { name: "理智症状：崩溃回避", text: "主动接近、触碰或直视同一来源前，先进行 DC 15 理智豁免。失败：本回合不能靠近、触碰或直视；移动必须优先远离至少 10 尺；无法远离则留在原地。", duration: "安全长休或专门照护后移除。" }
  },
  muted: {
    label: "失语",
    fractured: { name: "理智症状：裂解失语", text: "只能说碎片信息。同伴花费 1 个动作追问，可拼出完整线索。", duration: "短休、离开来源，或稳定处理后移除。" },
    collapsed: { name: "理智症状：崩溃失语", text: "不能主动说出与同一来源有关的完整信息。同伴花费 1 分钟安抚或引导，才能让角色说出 1 条完整线索。", duration: "安全长休或专门照护后移除。" }
  },
  misread: {
    label: "错误解释",
    fractured: { name: "理智症状：裂解错误解释", text: "第一次解读同一来源线索时，漏掉关键矛盾。", duration: "短休、离开来源，或稳定处理后移除。" },
    collapsed: { name: "理智症状：崩溃错误解释", text: "第一次解读同一来源线索时，得到 1 个错误结论。同伴提出反证后，角色可立刻进行 DC 13 理智豁免；成功则修正结论。", duration: "安全长休或专门照护后移除。" }
  },
  rejection: {
    label: "生理排斥",
    fractured: { name: "理智症状：裂解生理排斥", text: "下一次精细动作、施法专注或调查检定的结果减去 1d4。结算后移除本症状。", duration: "短休、离开来源，或稳定处理后移除。" },
    collapsed: { name: "理智症状：崩溃生理排斥", text: "持续期间，第一次精细动作、施法专注或调查检定具有劣势。若失败，直到下一回合开始前不能进行反应。", duration: "安全长休或专门照护后移除。" }
  },
  fixation: {
    label: "过度专注",
    fractured: { name: "理智症状：裂解过度专注", text: "调查同一来源线索具有优势；其他感知检定具有劣势。", duration: "短休、离开来源，或稳定处理后移除。" },
    collapsed: { name: "理智症状：崩溃过度专注", text: "对同一来源以外目标的第一次攻击、施法或感知检定具有劣势。", duration: "安全长休或专门照护后移除。" }
  },
  ritual: {
    label: "仪式依赖",
    fractured: { name: "理智症状：裂解仪式依赖", text: "花费 1 分钟祷告、记录、调香、画符或复诵训练口令后，移除本症状。", duration: "完成稳定仪式后移除。" },
    collapsed: { name: "理智症状：崩溃仪式依赖", text: "必须花费 10 分钟完成稳定仪式，且需要 1 名同伴协助。完成前，不能通过短休移除理智症状。", duration: "安全长休或专门照护后移除。" }
  }
};

Hooks.once("init", registerSettings);

Hooks.once("ready", () => {
  exposeApi();
  registerStatusEffects();
  patchAbilityRolls();
  patchRestFlow();
  installSheetBridge();
  console.log(`${MODULE_ID} | ready`);
});

function exposeApi() {
  game.cfjSanity = { installActor, generateSanity, requestDialog, requestForActors, rollSanity: runSanityRoll, refreshActor: refreshSanityState, restShort, restLong };
}

function registerSettings() {
  const register = (key, data) => game.settings.register(MODULE_ID, key, { scope: "world", config: true, ...data });
  register("defaultDc", { name: "默认 DC", hint: "GM 发起理智检定或豁免时的默认 DC。", type: Number, default: 15, range: { min: 1, max: 40, step: 1 } });
  register("requireGmRequest", { name: "玩家必须等待 GM 发起", hint: "开启后，玩家不能自行设置 DC；必须由 GM 先发起理智检定或豁免。", type: Boolean, default: true });
  register("resourceSlot", { name: "理智显示资源栏", hint: "选择把当前/最大理智显示在角色卡哪个资源栏。若该资源栏已有用途，请改用其他栏或选择不写入资源栏。", type: String, choices: { primary: "主资源栏", secondary: "副资源栏", tertiary: "第三资源栏", none: "不写入资源栏" }, default: "primary" });
  register("autoShortRest", { name: "短休自动处理理智", hint: "短休后自动移除裂解症状，并重新计算理智状态。", type: Boolean, default: true });
  register("autoLongRest", { name: "长休自动处理理智", hint: "长休后自动恢复 1 点当前理智，移除理智症状，并重新计算理智状态。", type: Boolean, default: true });
  register("autoSymptoms", { name: "自动生成裂解/崩溃症状", hint: "进入裂解或崩溃时自动抽取并添加对应症状。关闭后只显示理智状态。", type: Boolean, default: true });
  register("showGmDetail", { name: "显示 GM 明细", hint: "开启后，GM 会收到包含 DC、失败差值、同源、熟练和主动深入的私密明细。", type: Boolean, default: true });
}

function setting(key, fallback) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch (_err) {
    return fallback;
  }
}

function registerStatusEffects() {
  const list = CONFIG.statusEffects ?? [];
  const wanted = Object.values(STATES).map((e) => ({ id: e.status, name: e.label, img: "icons/svg/terror.svg" }));
  for (const key of Object.keys(SYMPTOMS)) wanted.push({ id: `cfj-sanity-symptom-${key}`, name: `理智症状：${SYMPTOMS[key].label}`, img: "icons/svg/screaming.svg" });
  for (const effect of wanted) if (!list.some((e) => e.id === effect.id)) list.push(effect);
  CONFIG.statusEffects = list;
}

function actorProto() { return CONFIG.Actor?.documentClass?.prototype; }

function patchAbilityRolls() {
  const proto = actorProto();
  if (!proto || proto._cfjSanityPatched) return;
  for (const [method, type] of [["rollAbilitySave", "save"], ["rollAbilityTest", "check"]]) {
    if (typeof proto[method] !== "function") continue;
    const original = proto[method];
    proto[method] = function patchedSanRoll(ability, ...rest) {
      if (String(ability).toLowerCase() === "san") return runSanityRoll(this, type);
      return original.call(this, ability, ...rest);
    };
  }
  proto._cfjSanityPatched = true;
}

function patchRestFlow() {
  const proto = actorProto();
  if (!proto || proto._cfjSanityRestPatched) return;
  if (typeof proto.shortRest === "function") {
    const originalShort = proto.shortRest;
    proto.shortRest = async function patchedShortRest(...args) {
      const result = await originalShort.apply(this, args);
      if (setting("autoShortRest", true)) await restShort(this);
      return result;
    };
  }
  if (typeof proto.longRest === "function") {
    const originalLong = proto.longRest;
    proto.longRest = async function patchedLongRest(...args) {
      const result = await originalLong.apply(this, args);
      if (setting("autoLongRest", true)) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await restLong(this);
      }
      return result;
    };
  }
  proto._cfjSanityRestPatched = true;
}

function installSheetBridge() {
  document.addEventListener("click", async (event) => {
    const node = event.target?.closest?.("[data-ability='san'], [data-ability-key='san'], [data-key='san']");
    if (!node) return;
    const action = String(event.target?.dataset?.action ?? node.dataset?.action ?? "").toLowerCase();
    const text = String(event.target?.textContent ?? node.textContent ?? "").toLowerCase();
    const wantsSave = action.includes("save") || text.includes("豁免") || text.includes("save");
    const wantsCheck = action.includes("test") || action.includes("check") || text.includes("检定") || text.includes("check");
    if (!wantsSave && !wantsCheck) return;
    const actor = actorFromElement(node);
    if (!actor) return;
    event.preventDefault();
    event.stopPropagation();
    await runSanityRoll(actor, wantsSave ? "save" : "check");
  }, true);
}

function actorFromElement(element) {
  const sheet = element.closest?.(".app.actor, .tidy5e-sheet.actor, [data-document-id]");
  const id = sheet?.dataset?.documentId || sheet?.id?.match(/Actor-([A-Za-z0-9]+)/)?.[1];
  return id ? game.actors.get(id) : null;
}


async function generateSanity(actor) {
  actor = resolveActor(actor);
  if (!actor) return ui.notifications.warn("请先选择或打开一个角色。");
  const roll = await new Roll("4d6kh3").evaluate({ async: true });
  await setSanity(actor, roll.total, roll.total);
  await refreshSanityState(actor, { forceState: true });
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), whisper: sanityRecipients(actor), flavor: `<strong>生成理智值</strong><br>${escapeHtml(actor.name)} 的最大理智值为 ${roll.total}。` });
}

async function installActor(actor) {
  actor = resolveActor(actor);
  if (!actor) return ui.notifications.warn("请先选择或打开一个角色。");
  const flags = getSanity(actor);
  const visible = getVisibleSanity(actor);
  const max = Number(flags.max || visible.max || actor.system?.abilities?.san?.value || 10);
  const current = Number.isFinite(Number(flags.current)) ? Number(flags.current) : Number(visible.current || max);
  await setSanity(actor, current, max);
  await refreshSanityState(actor, { forceState: true });
  ui.notifications.info(`${actor.name} 已连接理智系统。`);
}

function resolveActor(actor) {
  if (actor?.documentName === "Actor") return actor;
  if (typeof actor === "string") return game.actors.get(actor);
  return canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
}

function getSanity(actor) { return foundry.utils.deepClone(actor.getFlag(FLAG_SCOPE, SAN_FLAG) ?? {}); }

function resourcePath(slot = setting("resourceSlot", "primary")) {
  return RESOURCE_SLOTS[slot] ?? RESOURCE_SLOTS.primary;
}

function getVisibleSanity(actor) {
  const path = resourcePath();
  if (!path) return { current: null, max: null };
  const resource = foundry.utils.getProperty(actor, path) ?? {};
  return { current: resource.value, max: resource.max };
}

async function setSanity(actor, current, max) {
  current = Math.max(0, Number(current || 0));
  max = Math.max(1, Number(max || current || 1));
  current = Math.min(current, max);
  const slot = setting("resourceSlot", "primary");
  const path = resourcePath(slot);
  const update = { "system.abilities.san.value": current };
  if (path) {
    update[`${path}.value`] = current;
    update[`${path}.max`] = max;
    update[`${path}.label`] = "理智";
  }
  await actor.update(update);
  await actor.setFlag(FLAG_SCOPE, SAN_FLAG, { ...getSanity(actor), current, max, resourceSlot: slot });
}

function stateFor(current, max) {
  const loss = Math.max(0, Number(max || 0) - Number(current || 0));
  if (current <= 0 || loss >= 11) return "collapsed";
  if (loss >= 8) return "fractured";
  if (loss >= 5) return "unbalanced";
  if (loss >= 2) return "shaken";
  return "stable";
}

async function refreshSanityState(actor, { previousState = null, forceState = false, suppressSymptoms = false, messageWhisper = null } = {}) {
  const flags = getSanity(actor);
  const visible = getVisibleSanity(actor);
  const current = Number(flags.current ?? visible.current ?? actor.system?.abilities?.san?.value ?? 0);
  const max = Number(flags.max ?? visible.max ?? actor.system?.abilities?.san?.value ?? 1);
  const state = stateFor(current, max);
  const loss = Math.max(0, max - current);
  await actor.setFlag(FLAG_SCOPE, SAN_FLAG, { ...flags, current, max, loss, state, stateText: STATES[state].label });
  await syncStateEffect(actor, state, current, max, loss);
  const shouldAddSymptom = setting("autoSymptoms", true) && !suppressSymptoms && (state === "fractured" || state === "collapsed") && (forceState || state !== previousState);
  if (shouldAddSymptom) await addSymptom(actor, state, { messageWhisper });
}

async function syncStateEffect(actor, state, current, max, loss) {
  const stateStatuses = Object.values(STATES).map((s) => s.status);
  const remove = actor.effects.filter((e) => e.getFlag(MODULE_ID, "type") === "state" || [...(e.statuses ?? [])].some((s) => stateStatuses.includes(s)));
  if (remove.length) await actor.deleteEmbeddedDocuments("ActiveEffect", remove.map((e) => e.id));
  if (state === "stable") return;
  const data = STATES[state];
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: `${data.label} | ${current}/${max} | ${data.rule}`,
    icon: "icons/svg/terror.svg",
    origin: actor.uuid,
    disabled: false,
    statuses: [data.status],
    description: `<p><strong>${data.label} (${current}/${max})</strong></p><p>${data.summary}</p><p>${data.rule}</p>`,
    flags: { [MODULE_ID]: { type: "state", state, current, max, loss } }
  }]);
}

async function addSymptom(actor, state, { messageWhisper = null } = {}) {
  const severity = state === "collapsed" ? "collapsed" : "fractured";
  const keys = Object.keys(SYMPTOMS);
  const roll = await new Roll(`1d${keys.length}`).evaluate({ async: true });
  const key = keys[roll.total - 1] ?? keys[0];
  const symptom = SYMPTOMS[key][severity];
  const existing = actor.effects.find((e) => e.getFlag(MODULE_ID, "symptomKey") === key);
  const flagData = { type: "symptom", symptomKey: key, severity };
  if (existing) {
    await existing.update({ name: symptom.name, description: symptomDescription(symptom, severity), flags: { [MODULE_ID]: flagData } });
    return;
  }
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: symptom.name,
    icon: "icons/svg/screaming.svg",
    origin: actor.uuid,
    disabled: false,
    statuses: [`cfj-sanity-symptom-${key}`],
    description: symptomDescription(symptom, severity),
    flags: { [MODULE_ID]: flagData }
  }]);
  const messageData = { speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>${severity === "collapsed" ? "崩溃症状" : "裂解症状"}：${SYMPTOMS[key].label}</strong><br>${symptom.text}<br><strong>持续：</strong>${symptom.duration}` };
  if (messageWhisper?.length) messageData.whisper = messageWhisper;
  await roll.toMessage(messageData);
}

function symptomDescription(symptom, severity) {
  const label = severity === "collapsed" ? "崩溃症状" : "裂解症状";
  return `<p><strong>${label}</strong></p><p>${symptom.text}</p><p><strong>持续：</strong>${symptom.duration}</p>`;
}

async function runSanityRoll(actor, type = "save") {
  actor = resolveActor(actor);
  if (!actor) return;
  const flags = getSanity(actor);
  const pending = flags.pending;
  if (!pending && !game.user?.isGM && setting("requireGmRequest", true)) return ui.notifications.warn("目前没有 GM 发起的理智判定。玩家不能自行设置 DC。");
  const data = pending ?? (game.user?.isGM ? await promptLocalRollOptions(type) : defaultRollOptions(type));
  if (!data) return;
  const messageWhisper = pending ? sanityRecipients(actor) : null;
  const dc = Number(data.dc || setting("defaultDc", 15));
  const visible = getVisibleSanity(actor);
  const current = Number(flags.current ?? actor.system?.abilities?.san?.value ?? visible.current ?? 10);
  const max = Number(flags.max ?? visible.max ?? current);
  const mod = Math.floor((current - 10) / 2);
  const prof = data.proficient ? Number(actor.system?.attributes?.prof ?? 0) : 0;
  const roll = await new Roll(`1d20 + ${mod} + ${prof}`).evaluate({ async: true });
  const die = roll.dice?.[0]?.total ?? 0;
  const total = roll.total;
  const success = die === 20 || (die !== 1 && total >= dc);
  const failBy = Math.max(0, dc - total);
  let loss = 0;
  if (type === "save" && !success) {
    loss = die === 1 || failBy >= 10 ? 3 : failBy >= 5 ? 2 : 1;
    if (data.deep) loss += 1;
  }
  const previousState = stateFor(current, max);
  const next = Math.max(0, current - loss);
  await setSanity(actor, next, max);
  if (pending) await actor.unsetFlag(FLAG_SCOPE, `${SAN_FLAG}.pending`);
  await refreshSanityState(actor, { previousState, messageWhisper });
  const messageData = { speaker: ChatMessage.getSpeaker({ actor }), flavor: renderRollChat({ type, dc, total, success, loss, current, next, max, source: data.source }) };
  if (messageWhisper?.length) messageData.whisper = messageWhisper;
  await roll.toMessage(messageData);
  if ((pending || game.user?.isGM) && setting("showGmDetail", true)) await renderGmDetail(actor, data, dc, total, failBy);
}

function renderRollChat(r) {
  const label = r.type === "save" ? "理智豁免" : "理智检定";
  return `<h3>${label}</h3><table><tr><th>${label}</th><td>${r.total}，${r.success ? "成功" : "失败"}</td></tr><tr><th>理智变化</th><td>${r.loss ? `-${r.loss}` : "不降低"}</td></tr><tr><th>当前理智</th><td>${r.current}/${r.max} -> ${r.next}/${r.max}</td></tr><tr><th>同源</th><td>${escapeHtml(r.source || "未命名来源")}</td></tr></table>`;
}

async function renderGmDetail(actor, data, dc, total, failBy = 0) {
  const intensity = dc >= 20 ? "极端异常" : dc >= 17 ? "严重异常" : dc >= 15 ? "强烈异常" : dc >= 13 ? "明确异常" : "轻微异常";
  await ChatMessage.create({
    speaker: { alias: "理智系统" },
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<h3>理智判定 GM 明细</h3><p>${escapeHtml(actor.name)}</p><table><tr><th>DC</th><td>${dc}（${intensity}）</td></tr><tr><th>掷骰结果</th><td>${total}</td></tr><tr><th>失败差值</th><td>${failBy}</td></tr><tr><th>同源</th><td>${escapeHtml(data.source || "未命名来源")}</td></tr><tr><th>主动深入</th><td>${data.deep ? "是" : "否"}</td></tr><tr><th>加入熟练</th><td>${data.proficient ? "是" : "否"}</td></tr></table>`
  });
}

async function promptLocalRollOptions(type) {
  if (!game.user?.isGM) return null;
  const defaultDc = Number(setting("defaultDc", 15));
  return new Promise((resolve) => {
    new Dialog({
      title: type === "save" ? "理智豁免" : "理智检定",
      content: `<form><div class="form-group"><label>DC</label><input name="dc" type="number" value="${defaultDc}"></div><div class="form-group"><label>同源</label><input name="source" type="text" value="未命名来源"></div><div class="form-group"><label>加入熟练</label><input name="proficient" type="checkbox"></div><div class="form-group"><label>主动深入</label><input name="deep" type="checkbox"></div></form>`,
      buttons: { ok: { label: "掷骰", callback: (html) => resolve(formData(html)) }, cancel: { label: "取消", callback: () => resolve(null) } },
      close: () => resolve(null)
    }).render(true);
  });
}

function defaultRollOptions(type) {
  return { type, dc: Number(setting("defaultDc", 15)), source: "未命名来源", proficient: false, deep: false };
}

function requestDialog() {
  if (!game.user?.isGM) return ui.notifications.warn("只有 GM 可以发起理智判定。");
  const defaultDc = Number(setting("defaultDc", 15));
  const actors = Array.from(game.users).filter((u) => u.active && u.character).map((u) => ({ user: u, actor: u.character }));
  const selected = canvas?.tokens?.controlled?.filter((t) => t.actor).map((t) => ({ user: null, actor: t.actor })) ?? [];
  const rows = [...selected, ...actors].filter((entry, i, arr) => arr.findIndex((x) => x.actor.id === entry.actor.id) === i);
  const choices = rows.map((entry) => `<label class="cfj-sanity-target"><input type="checkbox" name="actor" value="${entry.actor.id}" checked> ${escapeHtml(entry.actor.name)}${entry.user ? ` (${escapeHtml(entry.user.name)})` : ""}</label>`).join("");
  new Dialog({
    title: "发起理智判定",
    content: `<form class="cfj-sanity-dialog"><div class="form-group"><label>类型</label><select name="type"><option value="save">理智豁免</option><option value="check">理智检定</option></select></div><div class="form-group"><label>DC</label><input name="dc" type="number" value="${defaultDc}" min="1" max="40"></div><div class="form-group"><label>同源</label><input name="source" type="text" value="未命名来源"></div><div class="form-group"><label>加入熟练</label><input name="proficient" type="checkbox"></div><div class="form-group"><label>主动深入</label><input name="deep" type="checkbox"></div><fieldset><legend>目标角色</legend>${choices || "<p>没有在线玩家角色或已选中的 token。</p>"}</fieldset></form>`,
    buttons: { ok: { label: "发送", callback: async (html) => { const data = formData(html); const ids = Array.from(html[0].querySelectorAll("input[name='actor']:checked")).map((el) => el.value); await requestForActors(ids.map((id) => game.actors.get(id)).filter(Boolean), data); } }, cancel: { label: "取消" } }
  }).render(true);
}

async function requestForActors(actors, data) {
  if (!game.user?.isGM) return;
  for (const actor of actors) {
    await actor.setFlag(FLAG_SCOPE, `${SAN_FLAG}.pending`, data);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      whisper: sanityRecipients(actor),
      content: requestCardContent(actor, data)
    });
  }
}

function sanityRecipients(actor) {
  const recipients = new Set();
  for (const user of game.users ?? []) {
    if (user.isGM || actor.testUserPermission?.(user, "OWNER")) recipients.add(user.id);
  }
  return [...recipients];
}

function requestCardContent(actor, data) {
  const label = data.type === "save" ? "理智豁免" : "理智检定";
  return `<div class="cfj-sanity-card cfj-sanity-request"><h3>${label}</h3><p>GM 已对 ${escapeHtml(actor.name)} 发起 ${label}。玩家不需要设置 DC；DC、同源和风险由 GM 保存到本次请求中。</p><div class="cfj-sanity-actions"><button type="button" data-cfj-sanity-action="roll" data-actor-id="${actor.id}" data-roll-type="${data.type}">进行${label}</button></div><p class="cfj-sanity-note">也可以点击角色卡上的 SAN ${data.type === "save" ? "豁免" : "检定"}。两种方式使用同一组 GM 参数。</p></div>`;
}

async function restShort(actor) {
  actor = resolveActor(actor);
  if (!actor) return;
  const remove = actor.effects.filter((e) => e.getFlag(MODULE_ID, "type") === "symptom" && e.getFlag(MODULE_ID, "severity") === "fractured");
  if (remove.length) await actor.deleteEmbeddedDocuments("ActiveEffect", remove.map((e) => e.id));
  await refreshSanityState(actor, { suppressSymptoms: true });
}

async function restLong(actor) {
  actor = resolveActor(actor);
  if (!actor) return;
  const flags = getSanity(actor);
  const visible = getVisibleSanity(actor);
  const max = Number(flags.max ?? visible.max ?? 1);
  const current = Number(flags.current ?? visible.current ?? 0);
  await setSanity(actor, Math.min(max, current + 1), max);
  const remove = actor.effects.filter((e) => e.getFlag(MODULE_ID, "type") === "symptom");
  if (remove.length) await actor.deleteEmbeddedDocuments("ActiveEffect", remove.map((e) => e.id));
  await refreshSanityState(actor, { suppressSymptoms: true });
}

function formData(html) {
  const form = html[0]?.querySelector?.("form") ?? html.querySelector?.("form");
  return { type: form?.querySelector("[name='type']")?.value ?? "save", dc: Number(form?.querySelector("[name='dc']")?.value ?? setting("defaultDc", 15)), source: form?.querySelector("[name='source']")?.value?.trim?.() || "未命名来源", proficient: Boolean(form?.querySelector("[name='proficient']")?.checked), deep: Boolean(form?.querySelector("[name='deep']")?.checked) };
}

function escapeHtml(value) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  return Array.from(String(value ?? "")).map((c) => map[c] ?? c).join("");
}
