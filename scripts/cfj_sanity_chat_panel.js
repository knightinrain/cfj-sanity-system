const MODULE_ID = "cfj-sanity-system";
const CHAT_BUTTON_ID = "cfj-sanity-chat-entry";
const CHAT_FALLBACK_BUTTON_ID = "cfj-sanity-floating-entry";
const CHAT_COMMANDS = ["/理智", "/理智系统", "/san", "/sanity"];

Hooks.once("init", () => Hooks.on("getSceneControlButtons", removeExternalSanityTool));

Hooks.once("ready", () => {
  Hooks.on("getSceneControlButtons", removeExternalSanityTool);
  installSanityChatCommand();
  installSanityChatDomCommand();
  installSanityChatActions();
  installSanityChatButton();
  window.setTimeout(ensureSanityEntryVisible, 4500);
  exposeSanityUiApi();
  console.log(`${MODULE_ID} | sanity panel ready`);
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
        console.warn(`${MODULE_ID} | 找不到聊天区理智按钮挂载点，改用 GM 备用入口。也可以在聊天框输入 /理智 打开控制台。`);
        installSanityFallbackButton();
      }
      return;
    }
    const row = document.createElement("div");
    row.id = CHAT_BUTTON_ID;
    row.className = "cfj-sanity-chat-entry";
    row.innerHTML = `<button type="button" data-cfj-sanity-action="panel" title="打开苍梵界理智系统控制台"><i class="fas fa-brain"></i> 理智系统</button>`;
    mount.parent.insertBefore(row, mount.before ?? null);
    window.setTimeout(ensureSanityEntryVisible, 250);
  }, 100 + attempt * 150);
}

function findSanityChatButtonMount() {
  const explicitDice = findVisibleDiceTray();
  if (explicitDice?.parentElement) return { parent: explicitDice.parentElement, before: explicitDice.nextSibling };
  const chat = document.querySelector("#chat, #sidebar #chat, aside#sidebar [data-tab='chat'], [data-tab='chat'], #ui-right");
  if (!chat) return null;
  const diceTray = chat.querySelector("#dice-tray, .dice-tray, .dice-calculator, [class*='dice-tray'], [class*='diceTray']");
  const diceBlock = diceTray?.closest?.("#dice-tray, .dice-tray, .dice-calculator, [class*='dice-tray'], [class*='diceTray']") ?? diceTray;
  if (diceBlock?.parentElement) return { parent: diceBlock.parentElement, before: diceBlock.nextSibling };
  const form = chat.querySelector("#chat-form, form.chat-form, textarea[name='content']")?.closest?.("form") ?? chat.querySelector("textarea")?.closest?.("form");
  if (form?.parentElement) return { parent: form.parentElement, before: form.nextSibling };
  const textarea = chat.querySelector("textarea, [contenteditable='true']");
  const inputBlock = textarea?.closest?.("form, .chat-form, .chat-input, .message-input, .message-content, .editor") ?? textarea?.parentElement;
  if (inputBlock?.parentElement) return { parent: inputBlock.parentElement, before: inputBlock.nextSibling };
  const controls = chat.querySelector("#chat-controls, .chat-controls, footer, .sidebar-footer");
  if (controls?.parentElement) return { parent: controls.parentElement, before: controls.nextSibling };
  return null;
}

function findVisibleDiceTray() {
  const root = document.querySelector("#ui-right, #sidebar, aside#sidebar, body");
  const candidates = Array.from(root?.querySelectorAll?.("div, section, footer, form") ?? []);
  return candidates.filter(isElementVisible).filter((element) => {
    const text = compactText(element);
    if (!text.includes("D2") && !text.includes("D3") && !text.includes("掷骰")) return false;
    if (element.querySelector(`#${CHAT_BUTTON_ID}, #${CHAT_FALLBACK_BUTTON_ID}`)) return false;
    const rect = element.getBoundingClientRect();
    return rect.width >= 120 && rect.width <= 420 && rect.height >= 35 && rect.height <= 220;
  }).sort((a, b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return (ar.height - br.height) || (br.top - ar.top);
  })[0] ?? null;
}

function compactText(element) {
  return String(element?.innerText ?? element?.textContent ?? "").replace(/\s+/g, "");
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
  const row = document.createElement("div");
  row.id = CHAT_FALLBACK_BUTTON_ID;
  row.className = "cfj-sanity-floating-entry";
  row.innerHTML = `<button type="button" data-cfj-sanity-action="panel" title="打开苍梵界理智系统控制台"><i class="fas fa-brain"></i> 理智系统</button>`;
  document.body.appendChild(row);
}

function removeSanityFallbackButton() {
  document.getElementById(CHAT_FALLBACK_BUTTON_ID)?.remove();
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
  if (!game.user?.isGM) ui.notifications.warn("苍梵界理智系统控制台只有 GM 可以打开。等待 GM 发起理智判定后，玩家会收到专用判定弹窗和判定卡。");
  else renderSanityPanel();
  return false;
}

function exposeSanityUiApi() {
  game.cfjSanityUi = {
    openPanel: renderSanityPanel,
    installButton: installSanityChatButton,
    installFallbackButton: installSanityFallbackButton,
    requestSanity: requestDialogFromChat,
    setupSanity: setupActorDialog,
    diagnose: diagnoseSanityEntry
  };
}

function diagnoseSanityEntry() {
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
  if (!game.user?.isGM) return ui.notifications.warn("苍梵界理智系统控制台只有 GM 可以打开。");
  await ChatMessage.create({
    speaker: { alias: "苍梵界理智系统" },
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: gmPanelContent()
  });
}

function panelSetting(key, fallback) {
  try { return game.settings.get(MODULE_ID, key); } catch (_err) { return fallback; }
}

function gmPanelContent() {
  const enabled = panelSetting("enableSanityRules", true);
  return `<div class="cfj-sanity-card"><h3>苍梵界理智系统</h3>
  <p>这张控制台只对 GM 可见。玩家不会看到 DC、同源、熟练、主动深入或目标选择过程。</p>
  <p><strong>建卡提醒：</strong>角色卡属性中需要有 <code>SAN</code> / 理智属性，Tidy 角色卡会显示理智值和理智调整值。若角色还没有合法理智值，请先选中角色 token，然后点击“生成或连接理智值”。</p>
  <section class="cfj-sanity-section"><h4>理智 <span>${enabled ? "已启用" : "已关闭"}</span></h4>
  <div class="cfj-sanity-actions">${enabled ? `<button type="button" data-cfj-sanity-action="request">发起理智判定</button><button type="button" data-cfj-sanity-action="setup">生成或连接理智值</button>` : `<button type="button" disabled>理智规则已关闭</button>`}</div></section>
  <p class="cfj-sanity-note">玩家只需要点击角色卡上的 SAN 检定或 SAN 豁免；DC、同源和风险由 GM 发起时保存。</p></div>`;
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
    title: "生成或连接理智值",
    content: `<form class="cfj-sanity-dialog"><p>目标角色：${names}</p>
    <p><strong>生成新理智值</strong>：按 4d6 去最低，写入最大理智、当前理智和角色卡 SAN 属性。</p>
    <p><strong>只连接/刷新</strong>：不重掷，只读取现有 SAN/资源栏/理智旗标并刷新状态。若没有合法最大理智，不会写入 0。</p>
    <p class="notes">建议在 Tidy 角色卡属性区添加 <strong>SAN / 理智</strong>，这样卡面会显示理智值、理智调整值，并能直接点击 SAN 检定或 SAN 豁免。</p></form>`,
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
