# Tasks

- [x] Task 1: 复查夜晚死亡逻辑（gameStore.ts executeNightAction）
  - [x] 验证狼人杀人时 deadTonight 正确添加目标
  - [x] 验证女巫救人时 deadTonight 正确移除目标
  - [x] 验证女巫毒人时 deadTonight 正确添加目标
  - [x] 验证多次操作不会互相覆盖（使用 get() 获取最新状态）

- [x] Task 2: 复查女巫技能逻辑（Game.tsx 女巫行动UI）
  - [x] 验证解药只能救狼人击杀目标
  - [x] 验证毒药可毒任意玩家（除自己）
  - [x] 验证解药和毒药各只能使用一次

- [x] Task 3: 复查狼人投票逻辑（Game.tsx processWerewolfVoteResult）
  - [x] 验证单狼人投票正确处理
  - [x] 验证多狼人投票一致正确处理
  - [x] 验证多狼人投票平票正确处理（随机选择）

- [x] Task 4: 复查预言家查验逻辑（Game.tsx handleSeerCheck）
  - [x] 验证查验狼人/狼王返回"狼人"
  - [x] 验证查验好人返回"好人"

- [x] Task 5: 复查猎人开枪逻辑（gameStore.ts hunterShoot）
  - [x] 验证猎人夜晚死亡可开枪
  - [x] 验证猎人白天被投票出局可开枪
  - [x] 验证猎人只能开枪一次

- [x] Task 6: 复查狼王开枪逻辑（gameStore.ts wolfKingShoot）
  - [x] 验证狼王夜晚死亡可开枪
  - [x] 验证狼王白天被投票出局可开枪

- [x] Task 7: 复查白痴翻牌逻辑（gameStore.ts endVotePhase）
  - [x] 验证白痴被投票出局翻牌免死
  - [x] 验证白痴翻牌后失去投票权
  - [x] 验证白痴夜晚死亡不能翻牌

- [x] Task 8: 复查白天投票逻辑（Game.tsx DayPhase finishVote）
  - [x] 验证单人最高票正确出局
  - [x] 验证平票正确处理（重新投票）

- [x] Task 9: 复查游戏结束判定（gameStore.ts checkGameEnd）
  - [x] 验证狼人胜利条件正确
  - [x] 验证好人胜利条件正确

- [x] Task 10: 复查多人联机模式逻辑（server/index.js）
  - [x] 验证服务端隐私过滤正确
  - [x] 验证狼人投票同步正确
  - [x] 验证女巫看到狼人击杀目标
  - [x] 修复拼写错误 onlineVotedWaves -> onlineVotedWolves

# Task Dependencies
- 所有任务已完成