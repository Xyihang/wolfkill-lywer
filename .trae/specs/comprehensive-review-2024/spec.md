# 全面复查所有更改和代码 Spec

## Why
用户报告疑似bug："狼人只杀了一个女巫没动结果死了两个人"，已修复两个关键bug：
1. Zustand异步set导致的状态覆盖问题
2. 女巫解药逻辑不符合规则

需要全面复查所有代码，确保没有其他潜在问题。

## What Changes
- 复查夜晚死亡逻辑（deadTonight状态管理）
- 复查女巫技能逻辑（解药/毒药）
- 复查狼人投票逻辑
- 复查预言家查验逻辑
- 复查猎人/狼王开枪逻辑
- 复查白痴翻牌逻辑
- 复查白天投票逻辑
- 复查游戏结束判定逻辑
- 复查多人联机模式逻辑

## Impact
- Affected code: src/store/gameStore.ts, src/pages/Game.tsx, src/pages/MultiplayerGame.tsx, server/index.js
- Affected specs: 无前置依赖

---

## ADDED Requirements

### Requirement: 夜晚死亡逻辑正确性验证
系统应确保夜晚死亡逻辑正确处理所有情况。

#### Scenario: 狼人杀人后女巫救人
- **WHEN** 狼人杀玩家A，女巫使用解药救A
- **THEN** A不应出现在死亡名单中

#### Scenario: 狼人杀人后女巫毒人
- **WHEN** 狼人杀玩家A，女巫毒玩家B
- **THEN** A和B都应出现在死亡名单中

#### Scenario: 狼人杀人女巫救人后女巫毒人
- **WHEN** 狼人杀A，女巫救A，女巫毒B
- **THEN** 只有B死亡

#### Scenario: 女巫自救
- **WHEN** 狼人杀女巫，女巫使用解药自救
- **THEN** 女巫存活

### Requirement: 女巫技能规则符合性
系统应确保女巫技能符合标准狼人杀规则。

#### Scenario: 解药只能救狼人杀的目标
- **WHEN** 女巫使用解药
- **THEN** 只能救当晚被狼人击杀的玩家，不能救其他玩家

#### Scenario: 毒药可毒任意玩家
- **WHEN** 女巫使用毒药
- **THEN** 可以毒任意存活玩家（除自己外）

#### Scenario: 解药和毒药各只能使用一次
- **WHEN** 女巫使用解药或毒药
- **THEN** witchHasAntidote或witchHasPoison变为false，不可再次使用

### Requirement: 狼人投票逻辑正确性
系统应确保狼人投票逻辑正确。

#### Scenario: 单狼人投票
- **WHEN** 只有一个狼人存活
- **THEN** 该狼人的投票直接决定击杀目标

#### Scenario: 多狼人投票一致
- **WHEN** 多个狼人投票给同一目标
- **THEN** 该目标被击杀

#### Scenario: 多狼人投票平票
- **WHEN** 多个狼人投票出现平票
- **THEN** 随机选择一个平票目标击杀

### Requirement: 预言家查验逻辑正确性
系统应确保预言家查验逻辑正确。

#### Scenario: 查验狼人
- **WHEN** 预言家查验狼人或狼王
- **THEN** 结果显示"狼人"

#### Scenario: 查验好人
- **WHEN** 预言家查验村民、预言家、女巫、猎人、白痴
- **THEN** 结果显示"好人"

### Requirement: 猎人开枪逻辑正确性
系统应确保猎人开枪逻辑正确。

#### Scenario: 猎人夜晚死亡
- **WHEN** 猎人在夜晚死亡（被狼人杀或女巫毒）
- **THEN** 猎人可选择开枪带走一人或放弃

#### Scenario: 猎人白天被投票出局
- **WHEN** 猎人白天被投票出局
- **THEN** 猎人可选择开枪带走一人或放弃

#### Scenario: 猎人只能开枪一次
- **WHEN** 猎人已开枪
- **THEN** hunterCanShoot变为false，后续死亡不能再次开枪

### Requirement: 狼王开枪逻辑正确性
系统应确保狼王开枪逻辑正确。

#### Scenario: 狼王夜晚死亡
- **WHEN** 狼王在夜晚死亡
- **THEN** 狼王可选择开枪带走一人或放弃

#### Scenario: 狼王白天被投票出局
- **WHEN** 狼王白天被投票出局
- **THEN** 狼王可选择开枪带走一人或放弃

### Requirement: 白痴翻牌逻辑正确性
系统应确保白痴翻牌逻辑正确。

#### Scenario: 白痴被投票出局
- **WHEN** 白痴白天被投票出局且未翻牌
- **THEN** 白痴翻牌免死，失去投票权，继续存活

#### Scenario: 白痴翻牌后再次被投票
- **WHEN** 白痴已翻牌后再次被投票出局
- **THEN** 白痴正常死亡（不再免死）

#### Scenario: 白痴夜晚死亡
- **WHEN** 白痴夜晚被狼人杀或女巫毒
- **THEN** 白痴正常死亡，不能翻牌免死

### Requirement: 白天投票逻辑正确性
系统应确保白天投票逻辑正确。

#### Scenario: 单人最高票
- **WHEN** 投票结果有唯一最高票者
- **THEN** 该玩家被投票出局

#### Scenario: 平票处理
- **WHEN** 投票结果出现平票
- **THEN** 重新投票

### Requirement: 游戏结束判定正确性
系统应确保游戏结束判定正确。

#### Scenario: 狼人胜利
- **WHEN** 存活狼人数量 >= 存活好人数量
- **THEN** 狼人阵营获胜

#### Scenario: 好人胜利
- **WHEN** 所有狼人被消灭
- **THEN** 好人阵营获胜

### Requirement: 多人联机模式逻辑正确性
系统应确保多人联机模式逻辑正确。

#### Scenario: 服务端隐私过滤
- **WHEN** 服务端向客户端发送游戏状态
- **THEN** 每个客户端只能看到自己可见的信息（角色、投票等）

#### Scenario: 狼人投票同步
- **WHEN** 多个狼人玩家在线投票
- **THEN** 所有狼人能看到其他狼人的投票

#### Scenario: 女巫看到狼人击杀目标
- **WHEN** 女巫行动阶段
- **THEN** 女巫能看到狼人击杀目标

## MODIFIED Requirements
无

## REMOVED Requirements
无