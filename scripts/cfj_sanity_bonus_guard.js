const MODULE_ID = "cfj-sanity-system";

Hooks.on("preUpdateActor", (_actor, changes) => {
  if (!hasProperty(changes, "system.abilities.san.value")) return;
  ensureSanBonusChange(changes);
});

function ensureSanBonusChange(changes) {
  const checkPath = "system.abilities.san.bonuses.check";
  const savePath = "system.abilities.san.bonuses.save";
  if (isBlank(getProperty(changes, checkPath))) setProperty(changes, checkPath, "0");
  if (isBlank(getProperty(changes, savePath))) setProperty(changes, savePath, "0");
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function getProperty(source, path) {
  return foundry.utils.getProperty(source, path);
}

function setProperty(source, path, value) {
  return foundry.utils.setProperty(source, path, value);
}

function hasProperty(source, path) {
  return foundry.utils.hasProperty(source, path);
}
