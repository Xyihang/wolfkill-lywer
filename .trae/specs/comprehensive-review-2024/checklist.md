# Checklist

## 夜晚死亡逻辑
- [x] executeNightAction: 狼人杀人正确添加到 deadTonight
- [x] executeNightAction: 女巫救人正确从 deadTonight 移除
- [x] executeNightAction: 女巫毒人正确添加到 deadTonight
- [x] executeNightAction: 多次操作不互相覆盖（使用 get() 获取最新状态）

## 女巫技能逻辑
- [x] Game.tsx: 解药只能救狼人击杀目标（werewolfKillTarget）
- [x] Game.tsx: 毒药可毒任意玩家（除自己）
- [x] gameStore.ts: 解药使用后 witchHasAntidote 变为 false
- [x] gameStore.ts: 毒药使用后 witchHasPoison 变为 false

## 狼人投票逻辑
- [x] processWerewolfVoteResult: 单狼人投票正确处理
- [x] processWerewolfVoteResult: 多狼人投票一致正确处理
- [x] processWerewolfVoteResult: 多狼人投票平票随机选择正确

## 预言家查验逻辑
- [x] handleSeerCheck: 查验狼人/狼王返回 isWerewolf=true
- [x] handleSeerCheck: 查验好人返回 isWerewolf=false

## 猎人开枪逻辑
- [x] endNightPhase: 猎人夜晚死亡设置 pendingHunterShoot
- [x] endVotePhase: 猎人白天被投票出局设置 pendingHunterShoot
- [x] hunterShoot: 开枪后 hunterCanShoot 变为 false

## 狼王开枪逻辑
- [x] endNightPhase: 狼王夜晚死亡设置 pendingWolfKingShoot（L328-338）
- [x] endVotePhase: 狼王白天被投票出局设置 pendingWolfKingShoot

## 白痴翻牌逻辑
- [x] endVotePhase: 白痴被投票出局翻牌免死
- [x] idiotReveal: 翻牌后 idiotRevealed 变为 true
- [x] DayPhase: 白痴翻牌后失去投票权（votingPlayers 过滤）
- [x] endNightPhase: 白痴夜晚死亡不触发翻牌

## 白天投票逻辑
- [x] finishVote: 单人最高票正确出局
- [x] finishVote: 平票正确处理（重新投票）

## 游戏结束判定
- [x] checkGameEnd: 狼人胜利条件正确（狼人数量 >= 好人数量）
- [x] checkGameEnd: 好人胜利条件正确（狼人数量 = 0）

## 多人联机模式
- [x] server/index.js: buildViewState 隐私过滤正确
- [x] server/index.js: 狼人投票同步正确
- [x] server/index.js: 女巫看到 werewolfKillTarget
- [x] server/index.js: 修复拼写错误 onlineVotedWaves -> onlineVotedWolves（L701）