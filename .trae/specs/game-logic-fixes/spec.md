# 游戏逻辑规则修复 Spec

## Why
狼人杀游戏存在多个规则漏洞和逻辑问题，影响游戏公平性和用户体验。需要修复P0-P2级别的12个问题，确保游戏符合标准狼人杀规则。

## What Changes
- **P0 Critical（必须立即修复）**
  - 女巫自救规则：明确女巫被狼人杀时可以自救
  - 同守同杀规则：明确采用"救人优先"规则
  - 猎人被毒规则：被女巫毒死不能开枪

- **P1 Major（本周修复）**
  - 狼王开枪次数限制：添加状态标记防止重复开枪
  - 女巫用药限制：一晚只能用一瓶药（救人或毒人）
  - 预言家查验UI：添加颜色和图标区分
  - 游戏结束判定：每次死亡后立即检查

- **P2 Minor（可优化）**
  - 角色配置推荐：调整4人局配置
  - 投票平票处理：添加最大轮数限制
  - 多人联机超时：添加投票超时机制

## Impact
- Affected code: src/store/gameStore.ts, src/pages/Game.tsx, src/data/roles.ts, server/index.js
- Affected specs: 无前置依赖

---

## ADDED Requirements

### Requirement: 女巫自救规则
系统应支持女巫自救功能。

#### Scenario: 女巫被狼人杀时自救
- **WHEN** 狼人击杀目标为女巫本人
- **THEN** 女巫行动界面显示"自救"选项，使用解药后女巫存活

### Requirement: 猎人被毒死不能开枪
系统应区分死亡原因，被女巫毒死的猎人不能开枪。

#### Scenario: 猎人被女巫毒死
- **WHEN** 猎人被女巫使用毒药杀死
- **THEN** 猎人不能触发开枪技能

#### Scenario: 猎人被狼人杀可以开枪
- **WHEN** 猎人被狼人击杀
- **THEN** 猎人可以触发开枪技能

### Requirement: 狼王开枪次数限制
狼王只能开枪一次。

#### Scenario: 狼王开枪后状态更新
- **WHEN** 狼王使用开枪技能
- **THEN** wolfKingCanShoot 变为 false，后续死亡不能再次开枪

### Requirement: 女巫一晚只能用一瓶药
女巫每晚只能使用解药或毒药其中一瓶。

#### Scenario: 女巫使用解药后不能使用毒药
- **WHEN** 女巫在同一晚使用解药救人
- **THEN** 女巫不能在同一晚使用毒药

#### Scenario: 女巫使用毒药后不能使用解药
- **WHEN** 女巫在同一晚使用毒药杀人
- **THEN** 女巫不能在同一晚使用解药

### Requirement: 预言家查验结果视觉区分
预言家查验结果应有清晰的视觉区分。

#### Scenario: 查验狼人显示红色
- **WHEN** 预言家查验狼人或狼王
- **THEN** 结果显示红色背景和狼人图标

#### Scenario: 查验好人显示绿色
- **WHEN** 预言家查验好人阵营角色
- **THEN** 结果显示绿色背景和好人图标

### Requirement: 游戏结束即时判定
每次玩家死亡后立即检查游戏结束条件。

#### Scenario: 猎人开枪后立即检查游戏结束
- **WHEN** 猎人开枪带走一名玩家
- **THEN** 系统立即检查游戏结束条件

### Requirement: 投票平票最大轮数限制
投票平票最多重新投票2轮，第3轮随机淘汰。

#### Scenario: 平票重新投票2轮后随机淘汰
- **WHEN** 投票连续2轮出现平票
- **THEN** 第3轮随机淘汰一名平票玩家

### Requirement: 多人联机投票超时机制
在线玩家投票超时自动跳过。

#### Scenario: 狼人投票超时
- **WHEN** 在线狼人30秒内未投票
- **THEN** 自动跳过该狼人的投票

## MODIFIED Requirements

### Requirement: 死亡原因记录
executeNightAction 应记录死亡原因（kill/poison）。

**修改内容**：
- kill 类型死亡：狼人击杀，猎人可以开枪
- poison 类型死亡：女巫毒杀，猎人不能开枪

### Requirement: 女巫行动界面
女巫行动界面改为单选模式。

**修改内容**：
- 显示"选择使用解药或毒药"提示
- 使用一瓶药后立即进入下一阶段

## REMOVED Requirements

### Requirement: 女巫可同时使用两瓶药
**Reason**: 不符合标准狼人杀规则，女巫一晚只能用一瓶药
**Migration**: 修改女巫行动界面为单选模式