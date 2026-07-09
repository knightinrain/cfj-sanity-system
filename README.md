# Cangfanjie Sanity System

`Cangfanjie Sanity System` is a Foundry VTT module for the Cangfanjie SAN / 理智 rules used with the dnd5e system.

It is built for table use, not just record keeping. The GM sets the SAN request and DC; players click the SAN check or SAN save on their own actor sheet. The module then handles SAN loss, current SAN, state effects, symptoms, short rests, and long rests.

## Manifest URL

Use this URL in Foundry's module installer:

```text
https://raw.githubusercontent.com/knightinrain/cfj-sanity-system/main/module.json
```

## Requirements

- Foundry VTT v13. Minimum target: v12.
- dnd5e system 5.x. Verified target: 5.2.5.
- Actor sheets must expose the `SAN` ability used by the campaign sheet.

## Installation

1. Open Foundry VTT Setup.
2. Go to **Add-on Modules**.
3. Click **Install Module**.
4. Paste the manifest URL above.
5. Install the module.
6. Open the world and enable **Cangfanjie Sanity System** in **Manage Modules**.
7. Refresh the world once after enabling.

The current manifest uses GitHub's branch zip as the download target. If Foundry refuses to install the module even though the manifest opens in a browser, create a GitHub Release zip with `module.json`, `scripts/`, and `styles/` at the zip root, then update the `download` field to that asset URL.

## Settings

The module appears in **Configure Settings / Game Settings** as **Cangfanjie Sanity System**.

Recommended table defaults:

- `默认 DC`: `15`
- `玩家必须等待 GM 发起`: enabled
- `理智显示资源栏`: `主资源栏`, unless the actor already uses it for another rule
- `短休自动处理理智`: enabled
- `长休自动处理理智`: enabled
- `自动生成裂解/崩溃症状`: enabled
- `显示 GM 明细`: enabled

If the actor already uses the primary resource field, change `理智显示资源栏` to `副资源栏`, `第三资源栏`, or `不写入资源栏` before installing SAN on that actor.

## What The Module Does

- Connects actor-sheet `SAN` checks and `SAN` saves to the sanity workflow.
- Lets the GM start a SAN request with DC, source, proficiency, and active deepening.
- Lets players roll from their actor sheet without seeing or editing the DC when GM request mode is enabled.
- Updates current SAN and the displayed SAN value on the actor.
- Applies the correct sanity state as an Active Effect.
- Rolls and applies symptoms when the actor enters 裂解 or 崩溃, if automatic symptoms are enabled.
- Removes 裂解 symptoms on short rest without immediately re-adding them.
- Restores 1 SAN and removes sanity symptoms on long rest without immediately re-adding them.

## SAN Loss

SAN loss is applied after a failed SAN save.

| Result | SAN Loss |
| --- | --- |
| Success | 0 |
| Failure | 1 |
| Failure by 5 or more | 2 |
| Failure by 10 or more, or natural 1 | 3 |
| Active deepening | +1 after the result above |

A natural 20 succeeds. A natural 1 uses the strongest failure loss.

## Sanity States

The module uses lost SAN to determine the current state.

| Lost SAN | State | Effect |
| --- | --- | --- |
| 0-1 | 稳定 | No effect. |
| 2-4 | 动摇 | 下一次同源相关检定或豁免的结果减去 1d4。 |
| 5-7 | 失衡 | 对同源理智豁免具有劣势；不能从同源现象获得优势。 |
| 8-10 | 裂解 | Gains 1 裂解 symptom when the actor enters this state. |
| 11+ or current SAN 0 | 崩溃 | Gains 1 崩溃 symptom when the actor enters this state. |

## Symptoms

Only 裂解 and 崩溃 use symptom effects. 动摇 and 失衡 only use their state effects.

The symptom themes are:

- 回避
- 失语
- 错误解释
- 生理排斥
- 过度专注
- 仪式依赖

Each symptom has separate 裂解 and 崩溃 text. 崩溃 symptoms are stronger and last longer.

## Rest Rules

- Short rest removes 裂解 symptoms, then recalculates the current sanity state.
- Long rest restores 1 current SAN, removes sanity symptoms, then recalculates the current sanity state.
- Long rest does not raise SAN above the actor's maximum SAN.
- Rest recalculation does not create a new symptom just because the actor is still in 裂解 or 崩溃.

## GM Workflow

1. Select target tokens or make sure online players have assigned characters.
2. Use the module's SAN request control.
3. Set DC, source, proficiency, and active deepening.
4. Send the request.
5. Players click SAN save or SAN check on their sheet.

Players should not set the DC during normal play when `玩家必须等待 GM 发起` is enabled.

## Verification Checklist

After enabling the module in a world, verify these points with a test actor and then delete the test actor:

- The module appears in Configure Settings.
- Generate SAN with `4d6kh3` and confirm the actor's SAN value changes.
- GM sends a SAN save request with a non-default DC.
- Player clicks the actor-sheet SAN save and cannot edit the DC.
- A failed save reduces current SAN and changes the visible state effect.
- Entering 裂解 or 崩溃 creates a visible symptom effect.
- Short rest removes 裂解 symptoms.
- Long rest restores 1 SAN and removes sanity symptoms.

## Notes

This module is made for the private Cangfanjie campaign rules. It intentionally keeps the visible state and symptom text on the actor as Active Effects, so players and the GM can inspect the result without reading chat history.
