const MODULE_ID = "cfj-sanity-system";
const FLAG_SCOPE = "world";
const SAN_FLAG = "sanity";
const CHAT_BUTTON_ID = "cfj-sanity-chat-entry";
const CHAT_FALLBACK_BUTTON_ID = "cfj-sanity-floating-entry";
const CHAT_COMMANDS = ["/\u7406\u667a", "/\u7406\u667a\u7cfb\u7edf", "/san", "/sanity"];

Hooks.once("init", () => {
  Hooks.on("getSceneControlButtons", removeExternalSanityTool);
});

Hooks.once("ready", () => {
  Hooks.on("getSceneControlButtons", removeExternalSanityTool);
  installSanityChatCommand();
  installSanityChatDomCommand();
  installSanityChatActions();
  installSanityChatButton();
  window.setTimeout(() => {
    ensureSanityEntryVisible();
  }, 4500);
  exposeHouseRulesApi();
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

function installSanityChatButton(attempt = 0) {
  if (!game.user?.isGM) return;
  window.setTimeout(() => {
    const existing = document.getElementById(CHAT_BUTTON_ID);
    if (existing) {
      if (isElementVisible(existing)) removeSanityFallbackButton();
      else installSanityFallbackButton();
      return;
    }
    const mount = findSanityChatButtonMount();
    if (!mount) {
      if (attempt < 20) installSanityChatButton(attempt + 1);
      else {
        console.warn(`${MODULE_ID} | \u627e\u4e0d\u5230\u804a\u5929\u6846\u6309\u94ae\u6302\u8f7d\u70b9\uff0c\u6539\u7528 GM \u5907\u7528\u5165\u53e3\u3002\u4e5f\u53ef\u4ee5\u5728\u804a\u5929\u6846\u8f93\u5165 /\u7406\u667a \u6253\u5f00\u63a7\u5236\u53f0\u3002`);
        installSanityFallbackButton();
      }
      return;
    }
    const row = document.createElement("div");
    row.id = CHAT_BUTTON_ID;
    row.className = "cfj-sanity-chat-entry";
    row.innerHTML = `<button type="button" data-cfj-sanity-action="panel" title="\u6253\u5f00\u82cd\u68b5\u754c\u8dd1\u56e2\u623f\u89c4\u63a7\u5236\u53f0"><i class="fas fa-dice-d20"></i> \u8dd1\u56e2\u623f\u89c4</button>`;
    mount.parent.insertBefore(row, mount.before ?? null);
    window.setTimeout(ensureSanityEntryVisible, 250);
  }, 100 + attempt * 150);
}

function findSanityChatButtonMount() {
  const chat = document.querySelector("#chat, #sidebar #chat, aside#sidebar [data-tab='chat'], [data-tab='chat']");
  if (!chat) return null;
  const form = chat.querySelector("#chat-form, form.chat-form, textarea[name='content']")?.closest?.("form") ?? chat.querySelector("textarea")?.closest?.("form");
  if (form?.parentElement) return { parent: form.parentElement, before: form };
  const textarea = chat.querySelector("textarea, [contenteditable='true']");
  const inputBlock = textarea?.closest?.("form, .chat-form, .chat-input, .message-input, .message-content, .editor") ?? textarea?.parentElement;
  if (inputBlock?.parentElement) return { parent: inputBlock.parentElement, before: inputBlock };
  const diceTray = chat.querySelector("#dice-tray, .dice-tray, .dice-calculator, [class*='dice-tray'], [class*='diceTray']");
  if (diceTray?.parentElement) return { parent: diceTray.parentElement, before: diceTray };
  const controls = chat.querySelector("#chat-controls, .chat-controls, footer, .sidebar-footer");
  if (controls?.parentElement) return { parent: controls.parentElement, before: controls };
  return null;
}

function ensureSanityEntryVisible() {
  if (!game.user?.isGM) return;
  const chatButton = document.getElementById(CHAT_BUTTON_ID);
  if (chatButton && isElementVisible(chatButton)) {
    removeSanityFallbackButton();
    return;
  }
  installSanityFallbackButton();
}

function isElementVisible(element) {
  if (!element?.isConnected) return false;
  const rect = element.getBoundingClientRect?.();
  if (!rect || rect.width < 8 || rect.height < 8) return false;
  const style = window.getComputedStyle?.(element);
  if (!style || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

function installSanityChatCommand() {
  Hooks.on("preCreateChatMessage", (message, data, _options, userId) => {
    if (userId !== game.user.id) return;
    const content = String(data?.content ?? message?.content ?? "").trim();
    if (!isSanityChatCommand(content)) return;
    return openPanelFromCommand();
  });
}

function installSanityChatDomCommand() {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    const input = event.target?.closest?.("textarea, input[type='text'], [contenteditable='true']");
    if (!input || !isChatInput(input) || !isSanityChatCommand(getInputValue(input))) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    clearInputValue(input);
    openPanelFromCommand();
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target?.closest?.("form");
    const input = form?.querySelector?.("textarea, input[type='text'], [contenteditable='true']");
    if (!input || !isChatInput(input) || !isSanityChatCommand(getInputValue(input))) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    clearInputValue(input);
    openPanelFromCommand();
  }, true);
}

function installSanityFallbackButton() {
  if (!game.user?.isGM || document.getElementById(CHAT_FALLBACK_BUTTON_ID)) return;
  const host = document.body;
  const row = document.createElement("div");
  row.id = CHAT_FALLBACK_BUTTON_ID;
  row.className = "cfj-sanity-floating-entry";
  row.innerHTML = `<button type="button" data-cfj-sanity-action="panel" title="\u6253\u5f00\u82cd\u68b5\u754c\u8dd1\u56e2\u623f\u89c4\u63a7\u5236\u53f0"><i class="fas fa-dice-d20"></i> \u8dd1\u56e2\u623f\u89c4</button>`;
  host.appendChild(row);
}

function isSanityChatCommand(value) {
  return CHAT_COMMANDS.includes(String(value ?? "").trim().toLowerCase());
}

function isChatInput(input) {
  return Boolean(input.closest?.("#chat, #sidebar, [data-tab='chat'], #ui-right"));
}

function getInputValue(input) {
  return "value" in input ? input.value : input.textContent;
}

function clearInputValue(input) {
  if ("value" in input) input.value = "";
  else input.textContent = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function openPanelFromCommand() {
  if (!game.user?.isGM) ui.notifications.warn("\u82cd\u68b5\u754c\u8dd1\u56e2\u623f\u89c4\u63a7\u5236\u53f0\u53ea\u6709 GM \u53ef\u4ee5\u6253\u5f00\u3002\u7b49\u5f85 GM \u53d1\u8d77\u7406\u667a\u5224\u5b9a\u540e\uff0c\u73a9\u5bb6\u4f1a\u6536\u5230\u4e13\u7528\u5224\u5b9a\u5f39\u7a97\u548c\u5224\u5b9a\u5361\u3002");
  else renderSanityPanel();
  return false;
}

function exposeHouseRulesApi() {
  game.cfjHouseRules = {
    ...(game.cfjHouseRules ?? {}),
    openPanel: renderSanityPanel,
    installButton: installSanityChatButton,
    installFallbackButton: installSanityFallbackButton,
    requestSanity: requestDialogFromChat,
    setupSanity: setupActorDialog,
    diagnose: () => ({
      version: game.modules.get(MODULE_ID)?.version,
      isGM: game.user?.isGM,
      hasChatButton: Boolean(document.getElementById(CHAT_BUTTON_ID)),
      chatButtonVisible: isElementVisible(document.getElementById(CHAT_BUTTON_ID)),
      hasFallbackButton: Boolean(document.getElementById(CHAT_FALLBACK_BUTTON_ID)),
      fallbackButtonVisible: isElementVisible(document.getElementById(CHAT_FALLBACK_BUTTON_ID)),
      hasChat: Boolean(document.querySelector("#chat, #sidebar #chat, aside#sidebar [data-tab=\'chat\'], [data-tab=\'chat\']"))
    })
  };
}

function diagnoseHouseRulesEntry() {
  const chatButton = document.getElementById(CHAT_BUTTON_ID);
  const fallbackButton = document.getElementById(CHAT_FALLBACK_BUTTON_ID);
  const chat = document.querySelector("#chat, #sidebar #chat, aside#sidebar [data-tab='chat'], [data-tab='chat']");
  const rectInfo = (element) => {
    const rect = element?.getBoundingClientRect?.();
    return rect ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } : null;
  };
  return {
    version: game.modules.get(MODULE_ID)?.version,
    isGM: game.user?.isGM,
    hasChat: Boolean(chat),
    hasChatButton: Boolean(chatButton),
    chatButtonVisible: isElementVisible(chatButton),
    chatButtonRect: rectInfo(chatButton),
    hasFallbackButton: Boolean(fallbackButton),
    fallbackButtonVisible: isElementVisible(fallbackButton),
    fallbackButtonRect: rectInfo(fallbackButton),
    hasChatForm: Boolean(chat?.querySelector?.("#chat-form, form.chat-form, textarea[name='content']")),
    hasDiceTray: Boolean(chat?.querySelector?.("#dice-tray, .dice-tray, .dice-calculator, [class*='dice-tray'], [class*='diceTray']")),
    commandExamples: CHAT_COMMANDS
  };
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
  if (!game.user?.isGM) return ui.notifications.warn("苍梵界跑团房规控制台只有 GM 可以打开。");
  await ChatMessage.create({
    speaker: { alias: "苍梵界跑团房规" },
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: gmPanelContent()
  });
}

function panelSetting(key, fallback) {
  try { return game.settings.get(MODULE_ID, key); } catch (_err) { return fallback; }
}

function gmPanelContent() {
  const sanity = panelSetting("enableSanityRules", true);
  const injury = panelSetting("enableInjuryRules", false);
  const rideable = panelSetting("enableRideableRules", true);
  const status = (enabled) => enabled ? "已启用" : "已关闭";
  return `<div class="cfj-sanity-card"><h3>苍梵界跑团房规控制台</h3><p>这张控制台只对 GM 可见。玩家不会看到 DC、同源、熟练、主动深入或目标选择过程。</p>
  <section class="cfj-house-rule-section"><h4>理智 <span>${status(sanity)}</span></h4><div class="cfj-sanity-actions">${sanity ? `<button type="button" data-cfj-sanity-action="request">发起理智判定</button><button type="button" data-cfj-sanity-action="setup">初始化或刷新选中角色</button>` : `<button type="button" disabled>理智规则已关闭</button>`}</div></section>
  <section class="cfj-house-rule-section"><h4>持续伤势 <span>${status(injury)}</span></h4><div class="cfj-sanity-actions"><button type="button" data-cfj-injury-action="rules">持续伤势规则</button>${injury ? `<button type="button" data-cfj-injury-action="roll">投掷持续伤势</button>` : `<button type="button" disabled>持续伤势已关闭</button>`}</div></section>
  <section class="cfj-house-rule-section"><h4>骑乘 <span>${status(rideable)}</span></h4><p class="cfj-sanity-note">骑乘使用 Token HUD 和快捷键：M 骑乘，N 下马。${rideable ? "当前可用。" : "当前已关闭，不显示骑乘 HUD 按钮，也不执行快捷键。"}</p></section>
  <p class="cfj-sanity-note">每个功能都可在模块设置中单独启用或关闭，设置项按【理智】、【持续伤势】、【骑乘】分区排列。</p></div>`;
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
  await game.cfjSanity?.requestForActors?.(actors, data);
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




