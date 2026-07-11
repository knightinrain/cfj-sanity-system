const MODULE_ID = "cfj-sanity-system";
const RIDEABLE_FEATURE = "rideable";
const FLAG_RIDERS = "riders";
const FLAG_MOUNT = "mount";
const FLAG_CONFIG = "config";
const FLAG_FOLLOW = "follow";
const DEFAULT_SEAT_OFFSET = { x: 0, y: 0 };
const pendingMountSyncs = new Map();
const RIDER_EFFECT_FLAG = "rideEffect";

function gridSize() {
  return canvas?.grid?.size ?? canvas?.scene?.grid?.size ?? 100;
}

function gridDistance() {
  return canvas?.scene?.grid?.distance ?? 5;
}

function tokenCenter(tokenDoc) {
  const size = gridSize();
  return {
    x: Number(tokenDoc.x ?? 0) + Number(tokenDoc.width ?? 1) * size / 2,
    y: Number(tokenDoc.y ?? 0) + Number(tokenDoc.height ?? 1) * size / 2
  };
}

function topLeftFromCenter(tokenDoc, center) {
  const size = gridSize();
  return {
    x: Math.round(center.x - Number(tokenDoc.width ?? 1) * size / 2),
    y: Math.round(center.y - Number(tokenDoc.height ?? 1) * size / 2)
  };
}

function currentScene() {
  return canvas?.scene ?? game?.scenes?.active ?? null;
}

function sceneOf(tokenDoc) {
  return tokenDoc?.parent ?? currentScene();
}

function tokenById(scene, tokenId) {
  if (!scene || !tokenId) return null;
  return scene.tokens?.get(tokenId) ?? null;
}

function tokenObjectByDoc(tokenDoc) {
  return canvas?.tokens?.get(tokenDoc?.id) ?? null;
}

function controlledTokenDocs() {
  return (canvas?.tokens?.controlled ?? [])
    .map(token => token?.document)
    .filter(Boolean);
}

function targetedTokenDocs() {
  return [...(game?.user?.targets ?? [])]
    .map(token => token?.document)
    .filter(Boolean);
}

function hoveredTokenDoc() {
  return canvas?.tokens?.hover?.document ?? null;
}

function uniqueIds(values) {
  return [...new Set(values.filter(Boolean))];
}

function moduleSetting(key, fallback) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch (_err) {
    return fallback;
  }
}

function rideableEnabled() { return moduleSetting("enableRideableRules", true); }

function tokenConfig(tokenDoc) {
  return tokenDoc?.getFlag(MODULE_ID, FLAG_CONFIG) ?? {};
}

function tokenOption(tokenDoc, key, fallback) {
  const config = tokenConfig(tokenDoc);
  return config[key] ?? moduleSetting(key, fallback);
}

function getMountFlag(tokenDoc) {
  return tokenDoc?.getFlag(MODULE_ID, FLAG_MOUNT) ?? null;
}

function getRiderIds(mountDoc) {
  return mountDoc?.getFlag(MODULE_ID, FLAG_RIDERS) ?? [];
}

function tokenSizeRank(tokenDoc) {
  const actorSize = tokenDoc?.actor?.system?.traits?.size;
  const size = actorSize ?? tokenConfig(tokenDoc).size ?? null;
  const ranks = { tiny: 0, sm: 1, small: 1, med: 2, medium: 2, lg: 3, large: 3, huge: 4, grg: 5, gargantuan: 5 };
  if (size && ranks[size] !== undefined) return ranks[size];
  const footprint = Math.max(Number(tokenDoc?.width ?? 1), Number(tokenDoc?.height ?? 1));
  if (footprint <= 0.5) return 0;
  if (footprint < 1) return 1;
  if (footprint < 2) return 2;
  if (footprint < 3) return 3;
  if (footprint < 4) return 4;
  return 5;
}

function validMountSize(riderDoc, mountDoc) {
  if (!moduleSetting("enforceSizeRestriction", true)) return true;
  const requiredDifference = Number(moduleSetting("requiredSizeDifference", 1) ?? 1);
  const difference = tokenSizeRank(mountDoc) - tokenSizeRank(riderDoc);
  const mode = moduleSetting("sizeRuleMode", "atLeast");
  return mode === "exact" ? difference === requiredDifference : difference >= requiredDifference;
}
function distanceBetween(a, b) {
  const ac = tokenCenter(a);
  const bc = tokenCenter(b);
  const pixels = Math.hypot(ac.x - bc.x, ac.y - bc.y);
  return pixels / gridSize() * gridDistance();
}

function sameDisposition(a, b) {
  return Number(a?.disposition ?? 0) === Number(b?.disposition ?? 0);
}

function canMount(riderDoc, mountDoc, options = {}) {
  if (!rideableEnabled()) return { ok: false, reason: "骑乘规则当前已关闭。" };
  if (!riderDoc || !mountDoc) return { ok: false, reason: "缺少骑手或坐骑。" };
  if (riderDoc.id === mountDoc.id) return { ok: false, reason: "Token 不能骑乘自己。" };
  if (sceneOf(riderDoc)?.id !== sceneOf(mountDoc)?.id) return { ok: false, reason: "骑手和坐骑必须在同一个场景中。" };

  const mountConfig = tokenConfig(mountDoc);
  if (!validMountSize(riderDoc, mountDoc) && !options.force) return { ok: false, reason: `${mountDoc.name} 不符合 ${riderDoc.name} 的体型骑乘要求。` };
  const rideable = mountConfig.rideable ?? moduleSetting("rideableByDefault", true);
  if (!rideable && !options.force) return { ok: false, reason: `${mountDoc.name} 没有被设为可骑乘。` };

  const distanceLimit = Number(tokenOption(mountDoc, "mountingDistance", 0) ?? 0);
  if (!game.user?.isGM && distanceLimit > 0 && distanceBetween(riderDoc, mountDoc) > distanceLimit) {
    return { ok: false, reason: `${riderDoc.name} 距离 ${mountDoc.name} 太远，不能骑乘。` };
  }

  if (!game.user?.isGM && moduleSetting("preventEnemyRiding", false) && !sameDisposition(riderDoc, mountDoc)) {
    return { ok: false, reason: "当前设置禁止敌对 Token 骑乘。" };
  }

  const currentRiders = getRiderIds(mountDoc).filter(id => id !== riderDoc.id);
  const maxRiders = Number(tokenOption(mountDoc, "maxRiders", 2) ?? 2);
  if (maxRiders > 0 && currentRiders.length >= maxRiders) {
    return { ok: false, reason: `${mountDoc.name} 已没有可用骑乘位置。` };
  }

  let cursor = mountDoc;
  while (cursor) {
    const flag = getMountFlag(cursor);
    if (!flag?.mountId) break;
    if (flag.mountId === riderDoc.id) return { ok: false, reason: "不能形成循环骑乘关系。" };
    cursor = tokenById(sceneOf(cursor), flag.mountId);
  }

  return { ok: true };
}

async function setRiderList(mountDoc, riderIds) {
  if (!mountDoc) return;
  await mountDoc.setFlag(MODULE_ID, FLAG_RIDERS, uniqueIds(riderIds));
}

async function removeRiderFromMount(mountDoc, riderId) {
  if (!mountDoc || !riderId) return;
  await setRiderList(mountDoc, getRiderIds(mountDoc).filter(id => id !== riderId));
}

async function clearMountFlag(tokenDoc) {
  if (!tokenDoc) return;
  await tokenDoc.unsetFlag(MODULE_ID, FLAG_MOUNT);
  if (tokenDoc.getFlag(MODULE_ID, FLAG_MOUNT)) {
    await tokenDoc.update({ [`flags.${MODULE_ID}.-=${FLAG_MOUNT}`]: null });
  }
}

function mountedRiders(mountDoc) {
  const scene = sceneOf(mountDoc);
  return getRiderIds(mountDoc)
    .map(id => tokenById(scene, id))
    .filter(tokenDoc => tokenDoc && getMountFlag(tokenDoc)?.mountId === mountDoc.id);
}

function riderMode(options = {}) {
  if (options.Grappled || options.grappled) return "grappled";
  if (options.Familiar || options.familiar) return "familiar";
  return options.mode ?? "mounted";
}

function seatOffsetFor(mountDoc, riderDoc, index, count, mode = "mounted") {
  const size = gridSize();
  const config = tokenConfig(mountDoc);
  const placement = config.riderPlacement ?? moduleSetting("riderPlacement", "circle");
  const baseOffset = config.ridersOffset ?? { x: 0, y: 0 };
  const rotationalOffset = Number(config.ridersRotationalOffset ?? 0);

  if (mode === "familiar") {
    const corners = [
      { x: -0.35, y: -0.35 },
      { x: 0.35, y: -0.35 },
      { x: -0.35, y: 0.35 },
      { x: 0.35, y: 0.35 }
    ];
    const corner = corners[index % corners.length];
    return {
      x: corner.x * Number(mountDoc.width ?? 1) * size + Number(baseOffset.x ?? 0),
      y: corner.y * Number(mountDoc.height ?? 1) * size + Number(baseOffset.y ?? 0)
    };
  }

  if (mode === "grappled") {
    const side = index % 2 === 0 ? 1 : -1;
    return {
      x: side * (Number(mountDoc.width ?? 1) * size / 2 + Number(riderDoc.width ?? 1) * size / 2),
      y: (Math.floor(index / 2) - Math.max(0, count - 2) / 4) * size * 0.45
    };
  }

  if (placement === "center" || count <= 1) {
    return { x: Number(baseOffset.x ?? 0), y: Number(baseOffset.y ?? 0) };
  }

  if (placement === "row") {
    const spacing = size * 0.55;
    return {
      x: (index - (count - 1) / 2) * spacing + Number(baseOffset.x ?? 0),
      y: Number(baseOffset.y ?? 0)
    };
  }

  const radius = Math.max(Number(mountDoc.width ?? 1), Number(mountDoc.height ?? 1)) * size * 0.32;
  const angle = (Math.PI * 2 * index / count) + (rotationalOffset * Math.PI / 180);
  return {
    x: Math.cos(angle) * radius + Number(baseOffset.x ?? 0),
    y: Math.sin(angle) * radius + Number(baseOffset.y ?? 0)
  };
}

function mountHeight(mountDoc, riderDoc, mountFlag = {}) {
  const config = tokenConfig(mountDoc);
  const base = Number(config.ridingHeight ?? moduleSetting("riderElevationOffset", 1) ?? 1);
  return Number(mountDoc.elevation ?? 0) + base + Number(mountFlag.extraHeight ?? 0);
}

async function applyRideEffect(riderDoc, mode) {
  const shouldApply = mode === "grappled"
    ? moduleSetting("applyGrappledEffect", true)
    : moduleSetting("applyMountedEffect", true);
  if (!shouldApply || !riderDoc?.actor) return [];

  const label = mode === "grappled" ? "骑乘：被擒抱" : "骑乘";
  const icon = mode === "grappled" ? "icons/svg/net.svg" : "icons/svg/wingfoot.svg";
  const existing = riderDoc.actor.effects?.filter(effect => effect.getFlag?.(MODULE_ID, RIDER_EFFECT_FLAG) === riderDoc.id) ?? [];
  if (existing.length) return existing.map(effect => effect.id);

  try {
    const created = await riderDoc.actor.createEmbeddedDocuments("ActiveEffect", [{
      name: label,
      icon,
      disabled: false,
      changes: [],
      flags: { [MODULE_ID]: { [RIDER_EFFECT_FLAG]: riderDoc.id, mode } }
    }]);
    return created.map(effect => effect.id);
  } catch (err) {
    console.warn(`${MODULE_ID} | 无法创建${label}效应`, err);
    return [];
  }
}

async function removeRideEffects(riderDoc) {
  if (!riderDoc?.actor) return;
  const ids = (riderDoc.actor.effects ?? [])
    .filter(effect => effect.getFlag?.(MODULE_ID, RIDER_EFFECT_FLAG) === riderDoc.id)
    .map(effect => effect.id);
  if (ids.length) await riderDoc.actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

async function syncRiderToMount(riderDoc, mountDoc, index = 0, count = 1, options = {}) {
  if (!rideableEnabled()) return false;
  if (!riderDoc || !mountDoc) return false;

  const mountFlag = getMountFlag(riderDoc) ?? {};
  const mode = mountFlag.mode ?? "mounted";
  const freeMove = Boolean(mountFlag.freeMove ?? tokenConfig(mountDoc).ridersCanMoveFreely ?? moduleSetting("ridersCanMoveFreely", false));
  const offset = freeMove
    ? mountFlag.offset ?? DEFAULT_SEAT_OFFSET
    : seatOffsetFor(mountDoc, riderDoc, index, count, mode);

  const mountCenter = tokenCenter(mountDoc);
  const nextCenter = {
    x: mountCenter.x + Number(offset.x ?? 0),
    y: mountCenter.y + Number(offset.y ?? 0)
  };
  const next = topLeftFromCenter(riderDoc, nextCenter);

  if (options.syncElevation !== false) next.elevation = mountHeight(mountDoc, riderDoc, mountFlag);
  if (tokenOption(mountDoc, "syncRotation", false)) {
    next.rotation = Number(mountDoc.rotation ?? 0) + Number(mountFlag.rotationOffset ?? 0);
  }

  const scale = Number(tokenConfig(mountDoc).ridersScale ?? moduleSetting("riderScale", 1) ?? 1);
  if (scale > 0 && scale !== 1) {
    next.texture = foundry.utils.mergeObject(foundry.utils.deepClone(riderDoc.texture ?? {}), {
      scaleX: scale,
      scaleY: scale
    }, { inplace: false });
  }

  await riderDoc.update(next, { animate: false, animation: { duration: 0 }, [MODULE_ID]: { syncing: true } });
  if (!freeMove) {
    const currentMountFlag = getMountFlag(riderDoc);
    if (currentMountFlag?.mountId === mountDoc.id) await riderDoc.setFlag(MODULE_ID, FLAG_MOUNT, { ...currentMountFlag, offset });
  }
  return true;
}

async function syncMount(mountDoc) {
  if (!rideableEnabled()) return;
  const riders = mountedRiders(mountDoc);
  for (let i = 0; i < riders.length; i++) {
    await syncRiderToMount(riders[i], mountDoc, i, riders.length);
  }
}

function scheduleMountSync(mountDoc) {
  if (!rideableEnabled()) return;
  const scene = sceneOf(mountDoc);
  if (!scene || !mountDoc?.id) return;
  const key = `${scene.id}.${mountDoc.id}`;
  if (pendingMountSyncs.has(key)) clearTimeout(pendingMountSyncs.get(key));
  const timeoutId = setTimeout(async () => {
    pendingMountSyncs.delete(key);
    const freshMountDoc = tokenById(scene, mountDoc.id);
    if (freshMountDoc) await syncMount(freshMountDoc);
  }, 75);
  pendingMountSyncs.set(key, timeoutId);
}

async function mountRider(riderDoc, mountDoc, options = {}) {
  const check = canMount(riderDoc, mountDoc, options);
  if (!check.ok) {
    ui.notifications?.warn(check.reason);
    return false;
  }

  const previousMountFlag = getMountFlag(riderDoc);
  if (previousMountFlag?.mountId && previousMountFlag.mountId !== mountDoc.id) {
    await removeRiderFromMount(tokenById(sceneOf(riderDoc), previousMountFlag.mountId), riderDoc.id);
  }

  const mode = riderMode(options);
  const freeMove = Boolean(options.freeMove ?? tokenConfig(mountDoc).ridersCanMoveFreely ?? moduleSetting("ridersCanMoveFreely", false));
  const offset = options.keepRelativePosition || freeMove
    ? {
        x: tokenCenter(riderDoc).x - tokenCenter(mountDoc).x,
        y: tokenCenter(riderDoc).y - tokenCenter(mountDoc).y
      }
    : DEFAULT_SEAT_OFFSET;

  const effectIds = await applyRideEffect(riderDoc, mode);
  await riderDoc.setFlag(MODULE_ID, FLAG_MOUNT, {
    mountId: mountDoc.id,
    sceneId: sceneOf(mountDoc).id,
    mode,
    freeMove,
    piloting: Boolean(options.Piloted ?? options.piloted ?? tokenConfig(mountDoc).pilotedByDefault ?? false),
    offset,
    rotationOffset: Number(options.rotationOffset ?? tokenConfig(mountDoc).ridersRotationalOffset ?? 0),
    effectIds,
    previous: {
      x: riderDoc.x,
      y: riderDoc.y,
      elevation: riderDoc.elevation ?? 0,
      rotation: riderDoc.rotation ?? 0
    }
  });

  await setRiderList(mountDoc, [...getRiderIds(mountDoc), riderDoc.id]);
  await syncMount(mountDoc);
  ui.notifications?.info(`${riderDoc.name} 已骑乘 ${mountDoc.name}。`);
  return true;
}

async function dismountRider(riderDoc, options = {}) {
  if (!rideableEnabled()) return false;
  const mountFlag = getMountFlag(riderDoc);
  if (!mountFlag?.mountId) {
    ui.notifications?.warn(`${riderDoc?.name ?? "这个 Token"} 当前没有骑乘。`);
    return false;
  }

  const scene = sceneOf(riderDoc);
  const mountDoc = tokenById(scene, mountFlag.mountId);
  await removeRiderFromMount(mountDoc, riderDoc.id);
  await clearMountFlag(riderDoc);
  await removeRideEffects(riderDoc);

  if (options.placeBeside !== false && mountDoc) {
    const size = gridSize();
    const next = {
      x: Math.round(Number(mountDoc.x ?? 0) + Number(mountDoc.width ?? 1) * size + size / 4),
      y: Math.round(Number(mountDoc.y ?? 0)),
      elevation: mountDoc.elevation ?? riderDoc.elevation ?? 0
    };
    await riderDoc.update(next, { [MODULE_ID]: { dismounting: true } });
  }

  if (!options.deferSync && mountDoc && getRiderIds(mountDoc).length) scheduleMountSync(mountDoc);
  ui.notifications?.info(`${riderDoc.name} 已下马。`);
  return true;
}

async function unmountAllRiders(mountDoc) {
  const riders = mountedRiders(mountDoc);
  for (const riderDoc of riders) await dismountRider(riderDoc, { deferSync: true });
  if (mountDoc && getRiderIds(mountDoc).length) scheduleMountSync(mountDoc);
  return riders.length;
}

async function mountSelectedToTarget(options = {}) {
  let riders = controlledTokenDocs();
  let targets = targetedTokenDocs();
  if (!targets.length && options.hovered) targets = [hoveredTokenDoc()].filter(Boolean);
  if (!riders.length) {
    ui.notifications?.warn("请先选择一个或多个骑手 Token。");
    return false;
  }
  if (targets.length !== 1) {
    ui.notifications?.warn("请准确指定一个坐骑 Token 为目标。");
    return false;
  }
  const mountDoc = targets[0];
  riders = riders.filter(riderDoc => riderDoc.id !== mountDoc.id);
  for (const riderDoc of riders) await mountRider(riderDoc, mountDoc, options);
  return true;
}

async function mountSelectedOnHudToken(mountTokenOrDoc, options = {}) {
  const mountDoc = mountTokenOrDoc?.document ?? mountTokenOrDoc;
  const riders = controlledTokenDocs().filter(tokenDoc => tokenDoc.id !== mountDoc?.id);
  if (!mountDoc || !riders.length) {
    ui.notifications?.warn("请先选择骑手 Token，再打开坐骑 Token 的 HUD。");
    return false;
  }
  for (const riderDoc of riders) await mountRider(riderDoc, mountDoc, options);
  return true;
}

async function dismountSelected() {
  const riders = controlledTokenDocs();
  if (!riders.length) {
    ui.notifications?.warn("请先选择已经骑乘的骑手 Token。");
    return false;
  }
  for (const riderDoc of riders) await dismountRider(riderDoc);
  return true;
}

async function toggleMountSelected(options = {}) {
  const selected = controlledTokenDocs();
  if (!selected.length) return false;
  const anyMounted = selected.some(tokenDoc => getMountFlag(tokenDoc)?.mountId);
  return anyMounted ? dismountSelected() : mountSelectedToTarget(options);
}

async function mountMany(riderDocs, mountDoc, options = {}) {
  const results = [];
  for (const riderDoc of (Array.isArray(riderDocs) ? riderDocs : [riderDocs])) {
    results.push(await mountRider(riderDoc, mountDoc, options));
  }
  return results;
}

async function dismountMany(riderDocs) {
  const results = [];
  for (const riderDoc of (Array.isArray(riderDocs) ? riderDocs : [riderDocs])) {
    results.push(await dismountRider(riderDoc));
  }
  return results;
}
async function setTokenConfig(tokenDoc, config = {}) {
  if (!tokenDoc) return false;
  await tokenDoc.setFlag(MODULE_ID, FLAG_CONFIG, { ...tokenConfig(tokenDoc), ...config });
  return true;
}

async function clearScene(scene = currentScene()) {
  if (!rideableEnabled()) return;
  if (!scene) return;
  for (const tokenDoc of scene.tokens) {
    if (getMountFlag(tokenDoc)) {
      await clearMountFlag(tokenDoc);
      await removeRideEffects(tokenDoc);
    }
    if (getRiderIds(tokenDoc).length) await tokenDoc.unsetFlag(MODULE_ID, FLAG_RIDERS);
    if (tokenDoc.getFlag(MODULE_ID, FLAG_FOLLOW)) await tokenDoc.unsetFlag(MODULE_ID, FLAG_FOLLOW);
  }
  ui.notifications?.info("当前场景的骑乘关系已清除。");
}

async function repairScene(scene = currentScene()) {
  if (!rideableEnabled()) return;
  if (!scene) return;
  for (const tokenDoc of scene.tokens) {
    const mountFlag = getMountFlag(tokenDoc);
    if (!mountFlag?.mountId) continue;
    const mountDoc = tokenById(scene, mountFlag.mountId);
    if (!mountDoc) {
      await clearMountFlag(tokenDoc);
      continue;
    }
    if (!getRiderIds(mountDoc).includes(tokenDoc.id)) await setRiderList(mountDoc, [...getRiderIds(mountDoc), tokenDoc.id]);
  }
  for (const tokenDoc of scene.tokens) if (getRiderIds(tokenDoc).length) await syncMount(tokenDoc);
  ui.notifications?.info("当前场景的骑乘关系已重新同步。");
}

async function followToken(followerDoc, targetDoc, options = {}) {
  if (!rideableEnabled()) return false;
  if (!followerDoc || !targetDoc || followerDoc.id === targetDoc.id) return false;
  await followerDoc.setFlag(MODULE_ID, FLAG_FOLLOW, {
    targetId: targetDoc.id,
    sceneId: sceneOf(targetDoc).id,
    distance: Number(options.distance ?? moduleSetting("followDistance", gridDistance()) ?? gridDistance())
  });
  return true;
}

async function stopFollowing(followerDoc) {
  if (!followerDoc) return false;
  await followerDoc.unsetFlag(MODULE_ID, FLAG_FOLLOW);
  return true;
}

async function syncFollowers(targetDoc) {
  if (!rideableEnabled()) return;
  if (!moduleSetting("enableFollowing", false)) return;
  const scene = sceneOf(targetDoc);
  const followers = scene.tokens.filter(tokenDoc => tokenDoc.getFlag(MODULE_ID, FLAG_FOLLOW)?.targetId === targetDoc.id);
  const targetCenter = tokenCenter(targetDoc);
  for (let i = 0; i < followers.length; i++) {
    const follower = followers[i];
    const distance = Number(follower.getFlag(MODULE_ID, FLAG_FOLLOW)?.distance ?? gridDistance());
    const px = distance / gridDistance() * gridSize();
    const angle = Math.PI + (i - (followers.length - 1) / 2) * 0.5;
    const nextCenter = { x: targetCenter.x + Math.cos(angle) * px, y: targetCenter.y + Math.sin(angle) * px };
    await follower.update(topLeftFromCenter(follower, nextCenter), { animate: false, animation: { duration: 0 }, [MODULE_ID]: { following: true } });
  }
}

async function handleIndependentRiderMovement(riderDoc, changes, options) {
  if (!rideableEnabled()) return;
  const mountFlag = getMountFlag(riderDoc);
  if (!mountFlag?.mountId) return;
  const scene = sceneOf(riderDoc);
  const mountDoc = tokenById(scene, mountFlag.mountId);
  if (!mountDoc) {
    await clearMountFlag(riderDoc);
    return;
  }

  const behavior = mountFlag.freeMove ? "free" : moduleSetting("riderMovement", "free");
  if (behavior === "free") {
    setTimeout(async () => {
      const freshRider = tokenById(scene, riderDoc.id);
      const freshMount = tokenById(scene, mountDoc.id);
      const freshFlag = getMountFlag(freshRider);
      if (!freshRider || !freshMount || freshFlag?.mountId !== freshMount.id) return;
      const riderCenter = tokenCenter(freshRider);
      const mountCenter = tokenCenter(freshMount);
      await freshRider.setFlag(MODULE_ID, FLAG_MOUNT, {
        ...freshFlag,
        freeMove: true,
        offset: { x: riderCenter.x - mountCenter.x, y: riderCenter.y - mountCenter.y }
      });
    }, 100);
    return;
  }

  if (behavior === "prevent") {
    scheduleMountSync(mountDoc);
    return;
  }

  if (behavior === "dismount") {
    await dismountRider(riderDoc, { placeBeside: false });
    return;
  }

  if (behavior === "moveMount" || mountFlag.piloting) {
    const dx = Number(changes.x ?? riderDoc.x) - Number(mountFlag.lastX ?? mountDoc.x);
    const dy = Number(changes.y ?? riderDoc.y) - Number(mountFlag.lastY ?? mountDoc.y);
    await mountDoc.update({ x: Number(mountDoc.x ?? 0) + dx, y: Number(mountDoc.y ?? 0) + dy }, { [MODULE_ID]: { movingMount: true } });
    scheduleMountSync(mountDoc);
  }
}

function addTokenHudButton(html, title, iconClass, onClick) {
  const root = globalThis.jQuery && html instanceof globalThis.jQuery ? html[0] : html;
  if (!root?.querySelector) return;
  const column = root.querySelector(".col.right") ?? root.querySelector(".right") ?? root;
  const button = document.createElement("div");
  button.className = "control-icon cf-ride-link-hud-button";
  button.title = title;
  button.innerHTML = `<i class="${iconClass}"></i>`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  column.appendChild(button);
}

function registerSettings() {
  const register = (key, data) => game.settings.register(MODULE_ID, key, { scope: "world", config: true, ...data });
  register("enableRideableRules", { name: "【骑乘】启用骑乘房规", hint: "关闭后，骑乘 HUD、快捷键、跟随同步和 Rideable 兼容 API 都不会执行骑乘操作。", type: Boolean, default: true });
  register("rideableByDefault", { name: "【骑乘】默认所有 Token 可作为坐骑", hint: "关闭后，需要用 API 或 Token 配置单独标记可骑乘。", type: Boolean, default: true });
  register("enforceSizeRestriction", { name: "【骑乘】强制体型限制", hint: "开启后，骑手只能骑乘符合体型差要求的 Token。默认开启。", type: Boolean, default: true });
  register("requiredSizeDifference", { name: "【骑乘】坐骑至少大几个体型", hint: "1 表示坐骑至少比骑手大一个体型。", type: Number, default: 1, range: { min: 0, max: 5, step: 1 } });
  register("sizeRuleMode", { name: "【骑乘】体型规则模式", hint: "至少模式更宽松；精确模式要求体型差刚好等于上面的数值。", type: String, choices: { atLeast: "至少达到体型差", exact: "必须刚好等于体型差" }, default: "atLeast" });
  register("maxRiders", { name: "【骑乘】每个坐骑最多骑手数", hint: "0 表示不限制；默认 2。", type: Number, default: 2, range: { min: 0, max: 8, step: 1 } });
  register("riderPlacement", { name: "【骑乘】骑手站位", type: String, choices: { center: "居中", row: "横排", circle: "环绕" }, default: "circle" });
  register("riderElevationOffset", { name: "【骑乘】高度加值", hint: "骑手高度 = 坐骑高度 + 此数值 + 额外高度。", type: Number, default: 1, range: { min: 0, max: 20, step: 1 } });
  register("ridersCanMoveFreely", { name: "【骑乘】默认允许骑手自由移动", hint: "开启后，骑手可在坐骑上调整相对位置，坐骑移动时保留偏移。", type: Boolean, default: false });
  register("riderMovement", { name: "【骑乘】骑手主动移动时", type: String, choices: { free: "记录为自由偏移", prevent: "拉回坐骑位置", dismount: "自动下马", moveMount: "推动坐骑移动" }, default: "free" });
  register("syncRotation", { name: "【骑乘】同步旋转", type: Boolean, default: false });
  register("mountingDistance", { name: "【骑乘】距离限制", hint: "0 表示 GM 不受距离限制；非 GM 会检查距离。", type: Number, default: 0, range: { min: 0, max: 120, step: 5 } });
  register("preventEnemyRiding", { name: "【骑乘】禁止敌对 Token 骑乘", type: Boolean, default: false });
  register("applyMountedEffect", { name: "【骑乘】自动添加骑乘效应", type: Boolean, default: true });
  register("applyGrappledEffect", { name: "【骑乘】擒抱模式自动添加效应", type: Boolean, default: true });
  register("riderScale", { name: "【骑乘】骑手缩放倍率", type: Number, default: 1, range: { min: 0.25, max: 2, step: 0.05 } });
  register("enableFollowing", { name: "【骑乘】启用跟随功能", type: Boolean, default: false });
  register("followDistance", { name: "【骑乘】跟随距离", type: Number, default: 5, range: { min: 0, max: 120, step: 5 } });
}
function activateRideLinkApi() {
  const api = {
    mountRider,
    dismountRider,
    unmountAllRiders,
    mountSelectedToTarget,
    mountSelectedOnHudToken,
    dismountSelected,
    toggleMountSelected,
    syncMount,
    scheduleMountSync,
    repairScene,
    clearScene,
    setTokenConfig,
    followToken,
    stopFollowing,
    syncFollowers,
    flags: { moduleId: MODULE_ID, mount: FLAG_MOUNT, riders: FLAG_RIDERS, config: FLAG_CONFIG, follow: FLAG_FOLLOW }
  };
  game.rideableSimple = api;
  game.cangfanRideLink = api;
  game.Rideable = {
    MountSelected: (pTargetHovered = false) => mountSelectedToTarget({ hovered: pTargetHovered }),
    MountSelectedFamiliar: (pTargetHovered = false) => mountSelectedToTarget({ hovered: pTargetHovered, Familiar: true }),
    GrappleTargeted: (pTargetHovered = false) => mountSelectedToTarget({ hovered: pTargetHovered, Grappled: true }),
    UnMountSelected: () => dismountSelected(),
    Mount: (pselectedTokens, pTarget, pRidingOptions = {}) => mountMany(pselectedTokens, pTarget, pRidingOptions),
    UnMount: (pTokens) => dismountMany(pTokens),
    UnMountallRiders: (pRidden) => unmountAllRiders(pRidden),
    MountbyID: (pselectedTokens, pTarget, pRidingOptions = {}, pSceneID = null) => {
      const scene = game.scenes.get(pSceneID) ?? currentScene();
      const target = tokenById(scene, pTarget);
      return mountMany((Array.isArray(pselectedTokens) ? pselectedTokens : [pselectedTokens]).map(id => tokenById(scene, id)), target, pRidingOptions);
    },
    UnMountbyID: (pTokens, pSceneID = null) => {
      const scene = game.scenes.get(pSceneID) ?? currentScene();
      return dismountMany((Array.isArray(pTokens) ? pTokens : [pTokens]).map(id => tokenById(scene, id)));
    },
    UnMountallRidersbyID: (pRidden, pSceneID = null) => unmountAllRiders(tokenById(game.scenes.get(pSceneID) ?? currentScene(), pRidden))
  };
  console.log(`${MODULE_ID} | 苍梵界骑乘房规 ready`);
}

Hooks.once("init", registerSettings);
if (game?.ready) activateRideLinkApi();
else Hooks.once("ready", activateRideLinkApi);

Hooks.on("renderTokenHUD", (hud, html) => {
  const tokenDoc = hud.object?.document;
  if (!tokenDoc || !game.user?.isGM || !rideableEnabled()) return;
  addTokenHudButton(html, "让选中的 Token 骑乘此 Token", "fas fa-horse", () => mountSelectedOnHudToken(tokenDoc));
  addTokenHudButton(html, "让此 Token 下马", "fas fa-unlink", () => dismountRider(tokenDoc));
  addTokenHudButton(html, "移除此 Token 上的全部骑手", "fas fa-users-slash", () => unmountAllRiders(tokenDoc));
});

Hooks.on("updateToken", async (tokenDoc, changes, options) => {
  if (!rideableEnabled() || options?.[MODULE_ID]?.syncing || options?.[MODULE_ID]?.dismounting || options?.[MODULE_ID]?.following || options?.[MODULE_ID]?.movingMount) return;
  const changedPosition = "x" in changes || "y" in changes || "elevation" in changes || "rotation" in changes;
  if (!changedPosition) return;

  if (mountedRiders(tokenDoc).length) {
    scheduleMountSync(tokenDoc);
    await syncFollowers(tokenDoc);
    return;
  }

  if (getMountFlag(tokenDoc)?.mountId) await handleIndependentRiderMovement(tokenDoc, changes, options);
  await syncFollowers(tokenDoc);
});

Hooks.on("deleteToken", async tokenDoc => {
  const scene = sceneOf(tokenDoc);
  for (const riderId of getRiderIds(tokenDoc)) {
    const riderDoc = tokenById(scene, riderId);
    if (riderDoc) {
      await clearMountFlag(riderDoc);
      await removeRideEffects(riderDoc);
    }
  }
  const mountFlag = getMountFlag(tokenDoc);
  if (mountFlag?.mountId) await removeRiderFromMount(tokenById(scene, mountFlag.mountId), tokenDoc.id);
});

Hooks.on("canvasReady", () => {
  if (!rideableEnabled()) return;
  for (const tokenDoc of canvas.scene?.tokens ?? []) {
    if (getRiderIds(tokenDoc).length) scheduleMountSync(tokenDoc);
  }
});

window.addEventListener("keydown", event => {
  if (event.defaultPrevented || event.repeat) return;
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (["input", "textarea", "select"].includes(tag)) return;
  if (!rideableEnabled()) return;
  if (event.key?.toLowerCase() === "m") {
    event.preventDefault();
    mountSelectedToTarget({ hovered: true });
  }
  if (event.key?.toLowerCase() === "n") {
    event.preventDefault();
    dismountSelected();
  }
});





