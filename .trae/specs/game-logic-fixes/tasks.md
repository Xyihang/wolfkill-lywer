# Tasks

## P0 Critical（必须立即修复）

- [x] Task 1: 女巫自救规则实现
  - [x] 1.1: 在女巫行动界面，检测狼人击杀目标是否为女巫本人
  - [x] 1.2: 如果是女巫本人，显示"自救"选项（使用解药救自己）
  - [x] 1.3: 自救后 witchHasAntidote 变为 false

- [x] Task 2: 猎人被毒死不能开枪
  - [x] 2.1: 在 executeNightAction 中记录死亡原因（actionType: kill/poison）
  - [x] 2.2: 在 endNightPhase 中检查猎人的死亡原因
  - [x] 2.3: 只有 kill 类型死亡才能触发猎人开枪

- [x] Task 3: 同守同杀规则明确化（当前已正确实现，只需文档说明）
  - [x] 3.1: 在游戏说明中明确"救人优先"规则
  - [x] 3.2: 验证当前代码逻辑正确（女巫救人从 deadTonight 移除目标）

## P1 Major（本周修复）

- [x] Task 4: 狼王开枪次数限制
  - [x] 4.1: 在 initialState 中添加 wolfKingCanShoot: true
  - [x] 4.2: 在 wolfKingShoot 函数中设置 wolfKingCanShoot: false
  - [x] 4.3: 在 endNightPhase/endVotePhase 中检查 wolfKingCanShoot 状态

- [x] Task 5: 女巫一晚只能用一瓶药
  - [x] 5.1: 添加 witchUsedTonight 状态标记
  - [x] 5.2: 女巫行动界面改为单选模式（解药或毒药）
  - [x] 5.3: 使用一瓶药后设置 witchUsedTonight: true 并跳过后续选择
  - [x] 5.4: 夜晚结束时重置 witchUsedTonight: false

- [x] Task 6: 预言家查验结果视觉区分
  - [x] 6.1: 查验狼人时显示红色背景和狼人图标
  - [x] 6.2: 查验好人时显示绿色背景和好人图标
  - [x] 6.3: 添加动画效果增强视觉反馈

- [x] Task 7: 游戏结束即时判定
  - [x] 7.1: 在 hunterShoot 后立即调用 checkGameEnd
  - [x] 7.2: 在 wolfKingShoot 后立即调用 checkGameEnd
  - [x] 7.3: 在开枪界面添加"游戏结束"提示

## P2 Minor（可优化）

- [x] Task 8: 投票平票最大轮数限制
  - [x] 8.1: 添加 voteTieCount 状态计数器
  - [x] 8.2: 平票时 voteTieCount++
  - [x] 8.3: voteTieCount >= 2 时随机淘汰一名平票玩家
  - [x] 8.4: 投票成功后重置 voteTieCount: 0

# Task Dependencies
- 所有任务已完成