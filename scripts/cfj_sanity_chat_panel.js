const MODULE_ID = "cfj-sanity-system";
const FLAG_SCOPE = "world";
const SAN_FLAG = "sanity";
const CHAT_BUTTON_ID = "cfj-sanity-chat-entry";

Hooks.once("init", () => {
  Hooks.on("getSceneControlButtons", removeExternalSanityTool);
});

Hooks.once("ready", () => {
  Hooks.on("getSceneControlButtons", removeExternalSanityTool);
  installSanityChatCommand();
  installSanityChatActions();
  installSanityChatButton();
  console.log(`${MODULE_ID} | chat panel ready`);
});

Hooks.on("renderSidebarTab", () => installSanityChatButton());
Hooks.on("renderChatLog", () => installSanityChatButton());

function removeExternalSanityTool(controls) {
  const tokenControls = Array.isArray(controls) ? controls.find((c) => c.name === "token") : controls?.tokens;
  if (!tokenControls?.tools) return;
  if (Array.isArray(tokenControls.tools)) {
    const index = tokenControls.tools.findIndex((tool) => tool.name === "cfj-sanity-request");
    if (index >= 0) tokenControls.tools.splice(index, 1);
    return;
  }
  delete tokenControls.tools["cfj-sanity-request"];
}

function installSanityChatButton() {
  if (!game.user?.isGM) return;
  setTimeout(() => {
    if (document.getElementById(CHAT_BUTTON_ID)) return;
    const chat = document.querySelector("#chat, #sidebar #chat, [data-tab='chat']");
    if (!chat) return;
    const form = chat.querySelector("#chat-form, form.chat-form, textarea[name='content']")?.closest?.("form") ?? chat.querySelector("textarea")?.closest?.("form");
    if (!form?.parentElement) return;
    const row = document.createElement("div");
    row.id = CHAT_BUTTON_ID;
    row.className = "cfj-sanity-chat-entry";
    row.innerHTML = `<button type="button" data-cfj-sanity-action="panel"><i class="fas fa-brain"></i> 理智系统</button>`;
    form.parentElement.insertBefore(row, form);
  }, 50);
}

function installSanityChatCommand() {
  Hooks.on("preCreateChatMessage", (message, data, _options, userId) => {
    if (userId !== game.user.id) return;
    const content = String(data?.content ?? message?.content ?? "").trim();
    if (!["/理智", "/理智系统", "/san", "/sanity"].includes(content.toLowerCase())) return;
    if (!game.user?.isGM) ui.notifications.warn("理智系统控制台只有 GM 可以打开。等待 GM 发起理智判定后，玩家会收到专用判定卡。");
    else renderSanityPanel();
    return false;
  });
}

function installSanityChatActions() {
  document.addEventListener("click", async (event) => {
    const button = event.target?.closest?.("button[data-cfj-sanity-action]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset.cfjSanityAction;
    if (action === "request") return requestDialogFromChat();
    if (action === "setup") return setupActorDialog();
    if (action === "roll") return rollRequestedSanity(button.dataset.actorId, button.dataset.rollType);
    if (action === "panel") return renderSanityPanel();
  }, true);
}

async function renderSanityPanel() {
  if (!game.user?.isGM) return ui.notifications.warn("理智系统控制台只有 GM 可以打开。");
  await ChatMessage.create({
    speaker: { alias: "理智系统" },
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: gmPanelContent()
  });
}

function gmPanelContent() {
  return `<div class="cfj-sanity-card"><h3>理智系统控制台</h3><p>这张控制台只对 GM 可见。玩家不会看到 DC、同源、熟练、主动深入或目标选择过程。</p><div class="cfj-sanity-actions"><button type="button" data-cfj-sanity-action="request">发起理智判定</button><button type="button" data-cfj-sanity-action="setup">初始化或刷新选中角色</button></div><p class="cfj-sanity-note">玩家只会收到被发起后的判定卡，或点击自己角色卡上的 SAN 检定 / SAN 豁免。</p></div>`;
}

function selectedActors() {
  const fromTokens = (canvas?.tokens?.controlled ?? []).map((token) => token.actor).filter(Boolean);
  const actors = fromTokens.length ? fromTokens : [game.user?.character].filter(Boolean);
  const byId = new Map();
  for (const actor of actors) byId.set(actor.id, actor);
  return [...byId.values()];
}

function setupActorDialog() {
  if (!game.user?.isGM) return ui.notifications.warn("只有 GM 可以初始化或刷新理智。玩家等待 GM 处理即可。");
  const actors = selectedActors();
  if (!actors.length) return ui.notifications.warn("请先选择角色 token，或给当前用户指定角色。");
  const names = actors.map((actor) => escapeHtml(actor.name)).join("、");
  new Dialog({
    title: "初始化或刷新理智",
    content: `<form class="cfj-sanity-dialog"><p>目标角色：${names}</p><p><strong>生成新理智值</strong>会按 4d6 去最低重置最大理智和当前理智。<br><strong>只连接/刷新</strong>不会重掷，只同步当前卡面的理智数据和状态。</p></form>`,
    buttons: {
      generate: { label: "生成新理智值", callback: async () => { for (const actor of actors) await game.cfjSanity.generateSanity(actor); } },
      install: { label: "只连接/刷新", callback: async () => { for (const actor of actors) await game.cfjSanity.installActor(actor); } },
      cancel: { label: "取消" }
    }
  }).render(true);
}

function requestDialogFromChat() {
  if (!game.user?.isGM) return ui.notifications.warn("只有 GM 可以发起理智判定。");
  const defaultDc = Number(game.settings.get(MODULE_ID, "defaultDc") ?? 15);
  const rows = requestTargetRows();
  const choices = rows.map((entry) => `<label class="cfj-sanity-target"><input type="checkbox" name="actor" value="${entry.actor.id}" checked> ${escapeHtml(entry.actor.name)}${entry.user ? ` (${escapeHtml(entry.user.name)})` : ""}</label>`).join("");
  new Dialog({
    title: "发起理智判定",
    content: `<form class="cfj-sanity-dialog"><div class="form-group"><label>类型</label><select name="type"><option value="save">理智豁免</option><option value="check">理智检定</option></select></div><div class="form-group"><label>DC</label><input name="dc" type="number" value="${defaultDc}" min="1" max="40"></div><div class="form-group"><label>同源</label><input name="source" type="text" value="未命名来源"></div><div class="form-group"><label>加入熟练</label><input name="proficient" type="checkbox"></div><div class="form-group"><label>主动深入</label><input name="deep" type="checkbox"></div><fieldset><legend>目标角色</legend>${choices || "<p>没有在线玩家角色或已选中的 token。</p>"}</fieldset></form>`,
    buttons: {
      ok: { label: "发送到玩家判定卡", callback: async (html) => {
        const data = formData(html);
        const ids = Array.from(html[0].querySelectorAll("input[name='actor']:checked")).map((el) => el.value);
        const actors = ids.map((id) => game.actors.get(id)).filter(Boolean);
        await requestForActorsFromChat(actors, data);
      } },
      cancel: { label: "取消" }
    }
  }).render(true);
}

function requestTargetRows() {
  const actors = Array.from(game.users).filter((u) => u.active && u.character).map((u) => ({ user: u, actor: u.character }));
  const selected = canvas?.tokens?.controlled?.filter((t) => t.actor).map((t) => ({ user: null, actor: t.actor })) ?? [];
  return [...selected, ...actors].filter((entry, index, array) => array.findIndex((other) => other.actor.id === entry.actor.id) === index);
}

async function requestForActorsFromChat(actors, data) {
  if (!game.user?.isGM) return;
  for (const actor of actors) {
    await actor.setFlag(FLAG_SCOPE, `${SAN_FLAG}.pending`, data);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      whisper: whisperRecipientsForActor(actor),
      content: requestCardContent(actor, data)
    });
  }
}

function whisperRecipientsForActor(actor) {
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

async function rollRequestedSanity(actorId, type) {
  const actor = game.actors.get(actorId);
  if (!actor) return ui.notifications.warn("找不到目标角色。");
  if (!game.user?.isGM && !actor.isOwner) return ui.notifications.warn("你不能操作这个角色的理智判定。");
  await game.cfjSanity.rollSanity(actor, type || "save");
}

function formData(html) {
  const form = html[0]?.querySelector?.("form") ?? html.querySelector?.("form");
  return {
    type: form?.querySelector("[name='type']")?.value ?? "save",
    dc: Number(form?.querySelector("[name='dc']")?.value ?? game.settings.get(MODULE_ID, "defaultDc") ?? 15),
    source: form?.querySelector("[name='source']")?.value?.trim?.() || "未命名来源",
    proficient: Boolean(form?.querySelector("[name='proficient']")?.checked),
    deep: Boolean(form?.querySelector("[name='deep']")?.checked)
  };
}

function escapeHtml(value) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  return Array.from(String(value ?? "")).map((char) => map[char] ?? char).join("");
}
