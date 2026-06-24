# 狼人杀游戏 - Code Wiki

## 项目概述

本项目是一个基于 React + TypeScript + Vite 构建的狼人杀桌面游戏应用。采用单设备多人游戏模式，无需法官、无需卡牌，通过设备传递和语音播报实现完整的游戏流程。

### 核心特性

- **单设备多人游戏**：通过设备传递机制实现多人参与
- **无需法官**：自动引导游戏流程，语音播报提示
- **隐私保护**：防偷窥设计，加密存储角色信息
- **离线运行**：纯前端实现，无需网络连接
- **游戏存档**：支持暂停恢复，加密存储游戏状态
- **语音播报**：普通话语音提示，增强游戏体验

---

## 项目架构

### 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.3.1 | UI 框架 |
| TypeScript | 5.8.3 | 类型安全 |
| Vite | 6.3.5 | 构建工具 |
| Zustand | 5.0.3 | 状态管理 |
| React Router | 7.3.0 | 路由管理 |
| Tailwind CSS | 3.4.17 | 样式系统 |
| Framer Motion | 11.0.0 | 动画效果 |
| Lucide React | 0.511.0 | 图标库 |
| CryptoJS | 4.2.0 | 数据加密 |

### 目录结构

```
src/
├── App.tsx                 # 应用入口，路由配置
├── main.tsx                # React 根组件挂载
├── index.css               # 全局样式
├── vite-env.d.ts           # Vite 类型声明
│
├── components/             # UI 组件
│   ├── common/             # 通用组件
│   │   ├── Button.tsx      # 按钮组件
│   │   ├── Card.tsx        # 卡片容器
│   │   ├── Modal.tsx       # 模态框
│   │   └── Timer.tsx       # 计时器
│   │
│   ├── game/               # 游戏相关组件
│   │   └── PlayerCard.tsx  # 玩家卡片
│   │
│   └── role/               # 角色相关组件
│   │   ├── RoleCard.tsx    # 角色卡片
│   │   └── RoleReveal.tsx  # 角色揭示
│
├── data/                   # 静态数据
│   ├── roles.ts            # 角色定义与配置
│   └── messages.ts         # 语音播报文本
│
├── hooks/                  # 自定义 Hooks
│   ├── useSpeech.ts        # 语音播报 Hook
│   ├── useTimer.ts         # 计时器 Hook
│
├── lib/                    # 工具库
│   └── utils.ts            # 通用工具函数
│
├── pages/                  # 页面组件
│   ├── Home.tsx            # 首页
│   ├── Setup.tsx           # 游戏配置页
│   ├── Players.tsx         # 玩家登记页
│   ├── Assign.tsx          # 角色分配页
│   ├── Game.tsx            # 游戏主页面
│   └── Result.tsx          # 结果展示页
│
├── store/                  # 状态管理
│   └── gameStore.ts        # 游戏状态 Store
│
├── types/                  # 类型定义
│   └── index.ts            # 全局类型定义
│
└── utils/                  # 工具函数
    ├── crypto.ts           # 加密/解密工具
    ├── storage.ts          # 本地存储工具
```

---

## 核心模块详解

### 1. 状态管理模块 (gameStore.ts)

使用 Zustand 实现全局状态管理，是整个应用的核心数据层。

#### 状态结构

```typescript
interface GameState {
  // 游戏配置
  playerCount: number;           // 玩家总数
  roleConfig: RoleConfig;        // 角色配置

  // 玩家信息
  players: Player[];             // 玩家列表
  currentPlayerIndex: number;    // 当前玩家索引

  // 游戏进程
  phase: GamePhase;              // 游戏阶段
  round: number;                 // 当前回合
  nightPhase: NightPhase | null; // 夜晚阶段
  nightActions: NightAction[];   // 夜晚行动记录
  dayActions: DayAction[];       // 白天行动记录

  // 当前回合状态
  currentNightActions: NightAction[];
  currentVotes: Record<string, string>;
  currentSpeakerIndex: number;

  // 游戏结果
  winner: Camp | null;           // 获胜阵营
  gameLog: GameLogEntry[];       // 游戏日志

  // 特殊角色状态
  witchHasAntidote: boolean;     // 女巫解药状态
  witchHasPoison: boolean;       // 女巫毒药状态
  hunterCanShoot: boolean;       // 猎人开枪状态
  idiotRevealed: boolean;        // 白痴翻牌状态
}
```

#### 核心方法

| 方法名 | 功能描述 |
|--------|----------|
| `initGame()` | 初始化游戏，设置玩家数量和角色配置 |
| `setPlayers()` | 设置玩家列表，进入角色分配阶段 |
| `startGame()` | 开始游戏，进入第一夜 |
| `startNightPhase()` | 开始夜晚阶段 |
| `setNightPhase()` | 设置当前夜晚阶段（狼人/预言家/女巫等） |
| `executeNightAction()` | 执行夜晚行动，记录行动结果 |
| `endNightPhase()` | 结束夜晚阶段，处理死亡，进入白天 |
| `startDayPhase()` | 开始白天阶段 |
| `submitVote()` | 提交投票 |
| `endVotePhase()` | 结束投票阶段，处理出局 |
| `checkGameEnd()` | 检查游戏结束条件 |
| `endGame()` | 结束游戏，设置获胜者 |
| `resetGame()` | 重置游戏状态 |

#### 自动保存机制

```typescript
// 每次状态变更后自动保存到 localStorage（加密）
const autoSave = (state: GameState) => {
  try {
    saveGameState(state);
  } catch (e) {
    console.error('自动保存失败', e);
  }
};
```

---

### 2. 类型定义模块 (types/index.ts)

定义了整个应用使用的所有 TypeScript 类型。

#### 核心类型

```typescript
// 角色类型
type RoleType = 'werewolf' | 'villager' | 'seer' | 'witch' | 'hunter' | 'idiot' | 'wolfKing';

// 阵营
type Camp = 'werewolf' | 'villager';

// 游戏阶段
type GamePhase = 'setup' | 'assign' | 'night' | 'day' | 'vote' | 'result';

// 夜晚阶段
type NightPhase = 'werewolf' | 'seer' | 'witch' | 'hunter' | 'other';

// 玩家接口
interface Player {
  id: string;
  name: string;
  role: RoleType;
  isAlive: boolean;
  hasUsedAbility: boolean;
  seatNumber: number;
}

// 角色配置
interface RoleConfig {
  werewolf: number;
  villager: number;
  seer: number;
  witch: number;
  hunter: number;
  idiot: number;
  wolfKing: number;
}

// 夜晚行动
interface NightAction {
  round: number;
  phase: NightPhase;
  actorId: string;
  actorRole: RoleType;
  targetId: string | null;
  actionType: 'kill' | 'check' | 'save' | 'poison' | 'shoot';
  result?: { success: boolean; message?: string };
}

// 游戏设置
interface GameSettings {
  soundEnabled: boolean;      // 语音开关
  volume: number;             // 音量
  speechRate: number;         // 语速
  antiPeekMode: boolean;      // 防偷窥模式
  timerEnabled: boolean;      // 计时器开关
  speechTime: number;         // 发言时间（秒）
  actionTime: number;         // 行动时间（秒）
}
```

---

### 3. 角色数据模块 (data/roles.ts)

定义了所有游戏角色的属性和行为。

#### 角色定义

| 角色 | 阵营 | 夜晚行动 | 白天行动 | 技能描述 |
|------|------|----------|----------|----------|
| 狼人 (werewolf) | 狼人 | ✓ | - | 每晚选择一名玩家击杀 |
| 狼王 (wolfKing) | 狼人 | ✓ | ✓ | 死亡时可开枪带走一人 |
| 村民 (villager) | 好人 | - | - | 无特殊技能 |
| 预言家 (seer) | 好人 | ✓ | - | 每晚查验一名玩家身份 |
| 女巫 (witch) | 好人 | ✓ | - | 拥有解药和毒药各一瓶 |
| 猎人 (hunter) | 好人 | - | ✓ | 死亡时可开枪带走一人 |
| 白痴 (idiot) | 好人 | - | ✓ | 被投票出局时翻牌免死 |

#### 推荐配置

```typescript
// 根据玩家数量自动推荐角色配置
const RECOMMENDED_CONFIGS: RecommendedConfig[] = [
  { playerCount: 4, werewolf: 1, villager: 2, seer: 1, witch: 0, hunter: 0, idiot: 0, wolfKing: 0 },
  { playerCount: 5, werewolf: 1, villager: 2, seer: 1, witch: 1, hunter: 0, idiot: 0, wolfKing: 0 },
  { playerCount: 6, werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, idiot: 0, wolfKing: 0 },
  { playerCount: 7, werewolf: 2, villager: 3, seer: 1, witch: 1, hunter: 0, idiot: 0, wolfKing: 0 },
  { playerCount: 8, werewolf: 2, villager: 3, seer: 1, witch: 1, hunter: 1, idiot: 0, wolfKing: 0 },
  { playerCount: 9, werewolf: 3, villager: 3, seer: 1, witch: 1, hunter: 1, idiot: 0, wolfKing: 0 },
  { playerCount: 10, werewolf: 3, villager: 3, seer: 1, witch: 1, hunter: 1, idiot: 1, wolfKing: 0 }
];
```

#### 核心函数

```typescript
// 获取角色列表（根据配置生成）
function getRoleList(config: Record<RoleType, number>): RoleType[]

// Fisher-Yates 洗牌算法（随机分配角色）
function shuffleArray<T>(array: T[]): T[]

// 生成唯一 ID
function generateId(): string

// 获取推荐配置
function getRecommendedConfig(playerCount: number): RecommendedConfig
```

---

### 4. 语音播报模块 (data/messages.ts + hooks/useSpeech.ts)

#### 语音文本定义

```typescript
const SPEECH_MESSAGES = {
  // 游戏开始
  GAME_START: '游戏开始，请各位玩家准备好。',

  // 夜晚阶段
  NIGHT_START: '天黑请闭眼。',
  WEREWOLF_WAKE: '狼人请睁眼，请选择要击杀的目标。',
  SEER_WAKE: '预言家请睁眼，请选择要查验的玩家。',
  WITCH_WAKE: '女巫请睁眼。',
  NIGHT_END: '天亮了。',

  // 白天阶段
  DAY_START: '天亮了，请各位玩家睁眼。',
  ANNOUNCE_DEATH: (names: string[]) => names.length > 0 ? `昨晚${names.join('、')}死亡。` : '昨晚是平安夜，无人死亡。',
  VOTE_START: '现在开始投票环节，请各位玩家选择要投票的对象。',
  VOTE_RESULT: (name: string) => `${name}被投票出局。`,
  VOTE_TIE: '平票，请再次投票。',

  // 特殊技能
  IDIOT_REVEAL: '白痴翻牌免死，但失去投票权。',
  HUNTER_SHOOT: '猎人开枪！',
  WOLF_KING_REVENGE: '狼王复仇！',

  // 设备传递
  HANDOFF: (name: string) => `请将设备传递给${name}`,
  TIME_UP: '时间到。',
  TIME_WARNING: '还剩10秒。'
};
```

#### useSpeech Hook

```typescript
export const useSpeech = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  // 加载中文语音
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const chineseVoice = voices.find(v => v.lang.includes('zh'));
      setVoice(chineseVoice || voices[0]);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // 播报文本（返回 Promise，支持异步等待）
  const speak = useCallback((text: string): Promise<void> => {
    if (!settings.soundEnabled || !text) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.rate = settings.speechRate;
      utterance.volume = settings.volume;
      utterance.lang = 'zh-CN';

      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }, [settings, voice]);

  return { speak, stop, isSpeaking };
};
```

---

### 5. 加密存储模块 (utils/crypto.ts + storage.ts)

#### 加密机制

```typescript
// 使用 AES 加密，密钥基于设备指纹生成
const getEncryptionKey = (): string => {
  const deviceFingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width.toString(),
    screen.height.toString(),
    new Date().getTimezoneOffset().toString()
  ].join('-');

  return CryptoJS.SHA256('werewolf-game-' + deviceFingerprint).toString();
};

// 加密数据
export const encryptData = (data: string): string => {
  return CryptoJS.AES.encrypt(data, getEncryptionKey()).toString();
};

// 解密数据
export const decryptData = (encrypted: string): string => {
  const bytes = CryptoJS.AES.decrypt(encrypted, getEncryptionKey());
  return bytes.toString(CryptoJS.enc.Utf8);
};
```

#### 存储接口

```typescript
// 保存游戏状态（加密）
export const saveGameState = (state: GameState): void

// 加载游戏状态（解密）
export const loadGameState = (): GameState | null

// 清除游戏状态
export const clearGameState = (): void

// 检查是否有保存的游戏
export const hasSavedGame = (): boolean
```

---

### 6. 计时器模块 (hooks/useTimer.ts)

```typescript
interface UseTimerOptions {
  initialTime: number;       // 初始时间（秒）
  onTimeUp?: () => void;     // 时间结束回调
  onWarning?: () => void;    // 警告回调（默认10秒）
  warningTime?: number;      // 警告时间阈值
}

export const useTimer = (options: UseTimerOptions) => {
  const [time, setTime] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);

  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);
  const reset = useCallback((newTime?: number) => {
    setTime(newTime || initialTime);
    setIsRunning(false);
  }, [initialTime]);

  // 自动倒计时
  useEffect(() => {
    if (isRunning && time > 0) {
      const timer = setInterval(() => {
        const newTime = time - 1;
        setTime(newTime);

        if (newTime === warningTime) onWarning?.();
        if (newTime === 0) {
          setIsRunning(false);
          onTimeUp?.();
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [isRunning, time]);

  return { time, isRunning, start, pause, reset };
};
```

---

## 页面流程详解

### 1. 首页 (Home.tsx)

**功能**：
- 展示游戏介绍和规则
- 角色介绍卡片
- 开始新游戏/继续游戏入口

**关键代码**：

```typescript
// 检查是否有存档
const savedGame = hasSavedGame();

// 继续游戏：恢复存档状态
const handleContinueGame = () => {
  const savedState = loadGameState();
  if (savedState) {
    useGameStore.setState({ ...savedState, settings });
    navigate('/game');
  } else {
    alert('存档已失效,请开始新游戏');
    navigate('/setup');
  }
};
```

---

### 2. 游戏配置页 (Setup.tsx)

**功能**：
- 设置玩家数量（4-10人）
- 配置角色比例
- 高级设置（语音、计时器、防偷窥）

**关键逻辑**：

```typescript
// 自动推荐配置
useEffect(() => {
  const recommended = getRecommendedConfig(playerCount);
  setRoleConfig({
    werewolf: recommended.werewolf,
    villager: recommended.villager,
    seer: recommended.seer,
    witch: recommended.witch,
    hunter: recommended.hunter,
    idiot: recommended.idiot,
    wolfKing: recommended.wolfKing
  });
}, [playerCount]);

// 验证配置有效性
const isValidConfig = () => {
  const total = getTotalRoles();
  const werewolves = getWerewolfCount();
  const villagers = getVillagerCount();

  return total === playerCount && werewolves > 0 && villagers > werewolves;
};
```

---

### 3. 玩家登记页 (Players.tsx)

**功能**：
- 登记玩家姓名
- 随机排序座位
- 快速添加默认玩家名

**关键代码**：

```typescript
// 创建玩家对象
const handleNext = () => {
  const players: Player[] = playerNames.map((name, index) => ({
    id: generateId(),
    name,
    role: 'villager', // 临时角色，后续分配
    isAlive: true,
    hasUsedAbility: false,
    seatNumber: index + 1
  }));

  setPlayers(players);
  navigate('/assign');
};
```

---

### 4. 角色分配页 (Assign.tsx)

**功能**：
- 随机分配角色
- 依次让玩家查看身份
- 防偷窥机制

**关键逻辑**：

```typescript
// 分配角色
useEffect(() => {
  const roles = getRoleList(roleConfig);
  const shuffledRoles = shuffleArray(roles);

  const assigned = players.map((player, index) => ({
    ...player,
    role: shuffledRoles[index]
  }));

  setAssignedPlayers(assigned);
}, [players, roleConfig]);

// 确认流程
const handlePlayerConfirm = () => {
  setShowRoleReveal(false);

  if (currentPlayerIndex < assignedPlayers.length - 1) {
    setCurrentPlayerIndex(prev => prev + 1);
  } else {
    setAllConfirmed(true);
    setPlayers(assignedPlayers);
  }
};
```

---

### 5. 游戏主页面 (Game.tsx) ⭐核心

这是整个应用最复杂的页面，处理完整的游戏流程。

#### 夜晚阶段流程

```typescript
// 自动触发夜晚行动
useEffect(() => {
  if (phase !== 'night' || !nightPhase) return;
  if (showHandoff || showRoleReveal || actionPlayerId) return;

  const key = `${round}-${nightPhase}`;
  if (triggeredPhaseRef.current === key) return;

  triggeredPhaseRef.current = key;

  // 延迟触发，确保状态稳定
  const timeoutId = window.setTimeout(async () => {
    const currentState = useGameStore.getState();
    const player = findActionPlayer(currentState.nightPhase, currentState.players);

    if (!player) {
      // 无对应角色，跳到下一阶段
      await goToNextNightPhase();
      return;
    }

    setActionPlayerId(player.id);
    setShowHandoff(true);

    // 语音播报
    if (currentState.nightPhase === 'werewolf') {
      await speak(SPEECH_MESSAGES.WEREWOLF_WAKE);
    } else if (currentState.nightPhase === 'seer') {
      await speak(SPEECH_MESSAGES.SEER_WAKE);
    }
  }, 600);
}, [phase, nightPhase, round]);
```

#### 夜晚行动执行

```typescript
const executeAction = async () => {
  if (!currentActionPlayer || !selectedTarget) return;
  const target = players.find(p => p.id === selectedTarget);

  if (nightPhase === 'werewolf') {
    // 狼人击杀
    executeNightAction({
      round: currentRound,
      phase: 'werewolf',
      actorId: currentActionPlayer.id,
      actorRole: currentActionPlayer.role,
      targetId: selectedTarget,
      actionType: 'kill'
    });
    await speak(SPEECH_MESSAGES.WEREWOLF_SLEEP);
  } else if (nightPhase === 'seer') {
    // 预言家查验
    const isWerewolf = ROLES[target.role].camp === 'werewolf';
    setSeerResult({ name: target.name, isWerewolf });
    await speak(SPEECH_MESSAGES.SEER_RESULT(isWerewolf));
  } else if (nightPhase === 'witch') {
    // 女巫行动
    if (witchChoice === 'antidote') useWitchAntidote(selectedTarget);
    else if (witchChoice === 'poison') useWitchPoison(selectedTarget);
  }

  completeAction();
};
```

#### 白天阶段流程

```typescript
// 投票传递机制（与夜晚阶段相同模式）
useEffect(() => {
  if (phase !== 'vote') return;
  if (votingPlayers.length === 0) return;

  const currentVoter = votingPlayers[currentVoterIndex];
  if (!currentVoter || showVoteHandoff || selectedVoteTarget) return;

  const key = `vote-${round}-${currentVoter.id}`;
  if (voteHandoffTriggeredRef.current === key) return;

  voteHandoffTriggeredRef.current = key;

  const timeoutId = window.setTimeout(() => {
    setShowVoteHandoff(true);
  }, 400);
}, [phase, currentVoterIndex]);
```

#### 投票结果处理

```typescript
const finishVote = () => {
  const counts: Record<string, number> = {};
  Object.values(votes).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  const max = Math.max(...Object.values(counts), 0);
  const topVoted = Object.keys(counts).filter(id => counts[id] === max);

  // 平票处理
  if (topVoted.length > 1) {
    speak(SPEECH_MESSAGES.VOTE_TIE);
    setVotes({});
    setCurrentVoterIndex(0);
    setPhase('vote');
    return;
  }

  const eliminatedId = topVoted[0];
  const eliminated = players.find(p => p.id === eliminatedId);

  // 白痴翻牌免死
  if (eliminated.role === 'idiot' && !idiotRevealed) {
    useGameStore.getState().idiotReveal();
    speak(SPEECH_MESSAGES.IDIOT_REVEAL);
    startNightPhase();
    return;
  }

  // 处理出局
  speak(SPEECH_MESSAGES.VOTE_RESULT(eliminated.name));
  useGameStore.getState().submitVote(eliminatedId, eliminatedId);
  useGameStore.getState().endVotePhase();

  // 检查猎人/狼王技能
  if (eliminated.role === 'hunter' && hunterCanShoot) {
    setPhase('hunterShoot');
    return;
  }

  if (eliminated.role === 'wolfKing') {
    setPhase('wolfKingShoot');
    return;
  }

  // 检查游戏结束
  if (checkGameEnd()) navigate('/result');
  else startNightPhase();
};
```

---

### 6. 结果展示页 (Result.tsx)

**功能**：
- 展示获胜阵营
- 游戏统计（存活/死亡人数）
- 玩家身份揭示
- 游戏回顾日志

**关键代码**：

```typescript
// 统计数据
const werewolfCount = players.filter(p => ROLES[p.role].camp === 'werewolf').length;
const villagerCount = players.filter(p => ROLES[p.role].camp === 'villager').length;
const aliveWerewolves = players.filter(p => p.isAlive && ROLES[p.role].camp === 'werewolf').length;
const aliveVillagers = players.filter(p => p.isAlive && ROLES[p.role].camp === 'villager').length;

// 清理存档
const handleNewGame = () => {
  clearGameState();
  gameStore.resetGame();
  navigate('/');
};
```

---

## 组件详解

### 通用组件

#### Button (components/common/Button.tsx)

```typescript
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
  size: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

// 样式定义
const variants = {
  primary: 'bg-gradient-to-r from-purple-600 to-purple-700 text-white',
  secondary: 'bg-gray-700 text-gray-100 border border-gray-600',
  danger: 'bg-red-600 text-white',
  ghost: 'bg-transparent text-gray-300'
};
```

#### Card (components/common/Card.tsx)

```typescript
interface CardProps {
  variant: 'default' | 'elevated' | 'bordered';
  padding: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

// 样式定义
const variants = {
  default: 'bg-gray-800/50 backdrop-blur-sm',
  elevated: 'bg-gray-800 shadow-xl',
  bordered: 'bg-gray-800/50 border border-gray-700'
};
```

#### Timer (components/common/Timer.tsx)

```typescript
interface TimerProps {
  time: number;
  isRunning: boolean;
  variant: 'default' | 'warning' | 'danger';
  showProgress?: boolean;
  totalTime?: number;
}

// 自动变色逻辑
const getVariant = () => {
  if (time <= 10) return 'danger';    // 红色闪烁
  if (time <= 30) return 'warning';   // 黄色警告
  return variant;
};
```

### 游戏组件

#### PlayerCard (components/game/PlayerCard.tsx)

```typescript
interface PlayerCardProps {
  player: Player;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  showRole?: boolean;     // 是否显示角色
  showStatus?: boolean;   // 是否显示存活状态
  size: 'sm' | 'md' | 'lg';
}

// 状态指示器
{showStatus && (
  <div className="absolute top-2 right-2">
    {!player.isAlive ? (
      <div className="w-4 h-4 bg-red-500 rounded-full" />
    ) : (
      <div className="w-4 h-4 bg-green-500 rounded-full" />
    )}
  </div>
)}
```

#### PlayerList (components/game/PlayerCard.tsx)

```typescript
interface PlayerListProps {
  players: Player[];
  onSelect?: (player: Player) => void;
  selectedId?: string;
  disabledIds?: string[];
  showRole?: boolean;
  layout: 'grid' | 'horizontal';
}

// 布局切换
<div className={clsx(
  layout === 'grid' ? 'grid grid-cols-3 gap-3' : 'flex gap-3 overflow-x-auto'
)}>
```

#### RoleCard (components/role/RoleCard.tsx)

```typescript
interface RoleCardProps {
  roleType: RoleType;
  onClick?: () => void;
  selected?: boolean;
  size: 'sm' | 'md' | 'lg';
  showDetails?: boolean;
}

// 阵营颜色
const campColors = {
  werewolf: 'from-red-900/80 to-red-800/80 border-red-700',
  villager: 'from-blue-900/80 to-blue-800/80 border-blue-700'
};
```

---

## 游戏规则逻辑

### 胜利条件

```typescript
// 狼人胜利：狼人数量 >= 好人数量
if (aliveWerewolves.length >= aliveVillagers.length) {
  endGame('werewolf');
  return true;
}

// 好人胜利：所有狼人被消灭
if (aliveWerewolves.length === 0) {
  endGame('villager');
  return true;
}
```

### 角色技能触发

#### 女巫

```typescript
// 女巫盲救机制（不显示被杀者名字）
{witchHasAntidote && (
  <div className="p-3 bg-green-900/20 rounded-lg">
    <div className="text-sm text-green-400">使用解药</div>
    <div className="text-xs text-gray-400">选择一名玩家使用解药（盲救）</div>
    <PlayerList players={players.filter(p => p.isAlive)}
      onSelect={(p) => { setWitchChoice('antidote'); setSelectedTarget(p.id); }}
      selectedId={witchChoice === 'antidote' ? selectedTarget : undefined} />
  </div>
)}
```

#### 猎人/狼王开枪

```typescript
// 猎人死亡触发
if (eliminatedPlayer.role === 'hunter' && hunterCanShoot) {
  setPhase('hunterShoot');
  // 等待选择目标
  if (hunterTarget) {
    hunterShoot(hunterTarget);
    speak(SPEECH_MESSAGES.HUNTER_SHOOT);
  }
}

// 狼王死亡触发
if (eliminatedPlayer.role === 'wolfKing') {
  setPhase('wolfKingShoot');
  // 等待选择目标
  if (wolfKingTarget) {
    wolfKingShoot(wolfKingTarget);
    speak(SPEECH_MESSAGES.WOLF_KING_REVENGE);
  }
}
```

#### 白痴翻牌

```typescript
// 白痴被投票出局时翻牌免死
if (eliminated.role === 'idiot' && !idiotRevealed) {
  useGameStore.getState().idiotReveal();
  speak(SPEECH_MESSAGES.IDIOT_REVEAL);
  // 白痴失去投票权，但不死亡
  useGameStore.setState({ phase: 'night', round: round + 1 });
  startNightPhase();
  return;
}
```

---

## 依赖关系图

```
┌─────────────────────────────────────────────────────────────┐
│                         App.tsx                              │
│  (路由配置: Home, Setup, Players, Assign, Game, Result)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Pages (页面层)                          │
│  Home → Setup → Players → Assign → Game → Result            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Components (组件层)                        │
│  Button, Card, Timer, Modal, PlayerCard, RoleCard           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Hooks (逻辑层)                            │
│  useSpeech (语音), useTimer (计时), useGameStore (状态)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Store (数据层)                           │
│  gameStore (Zustand): 游戏状态、配置、玩家、行动记录         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Utils (工具层)                           │
│  crypto (加密), storage (存储), roles (角色数据)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Types (类型层)                           │
│  Player, Role, GameState, NightAction, GameSettings         │
└─────────────────────────────────────────────────────────────┘
```

---

## 项目运行方式

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问地址
http://localhost:5173
```

### 构建生产版本

```bash
# TypeScript 类型检查 + Vite 构建
npm run build

# 预览生产版本
npm run preview
```

### 其他命令

```bash
# ESLint 代码检查
npm run lint

# TypeScript 类型检查（不生成文件）
npm run check
```

---

## 配置文件说明

### vite.config.ts

```typescript
export default defineConfig({
  build: {
    sourcemap: 'hidden',  // 生产版本隐藏 sourcemap
  },
  plugins: [
    react({
      babel: {
        plugins: ['react-dev-locator'],  // 开发定位插件
      },
    }),
    traeBadgePlugin({      // TRAE Badge 插件
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
    }),
    tsconfigPaths()        // 支持 tsconfig 路径别名
  ],
});
```

### tailwind.config.js

```typescript
export default {
  darkMode: "class",       // 类名控制暗色模式
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,        // 容器居中
    },
    extend: {},            // 扩展主题
  },
  plugins: [],
};
```

### tsconfig.json

- 配置路径别名：`@/` 映射到 `src/`
- 启用严格类型检查
- 支持 React JSX

---

## 关键设计决策

### 1. 单设备多人游戏模式

**挑战**：如何保证隐私？

**解决方案**：
- 设备传递机制：每次行动前显示传递界面
- 防偷窥模式：角色揭示时要求确认身份
- 加密存储：角色信息加密保存，防止浏览器调试查看

### 2. 状态管理选择

**为什么选择 Zustand？**
- 轻量级（比 Redux 简单）
- 无需 Provider 包裹
- 支持 TypeScript
- 易于调试（console.log 即可）

### 3. 夜晚阶段自动触发机制

**挑战**：React StrictMode 双重调用导致重复触发

**解决方案**：
```typescript
// 使用 ref 存储触发标记，防止重复
const triggeredPhaseRef = useRef<string>('');

const key = `${round}-${nightPhase}`;
if (triggeredPhaseRef.current === key) return;
triggeredPhaseRef.current = key;

// 使用 ref 存储 timeout ID，防止 StrictMode 清除
const nightActionTimeoutRef = useRef<number | null>(null);
nightActionTimeoutRef.current = timeoutId;

// 不在 cleanup 中清除 timeout（StrictMode 会清除）
return () => {};
```

### 4. 语音播报异步处理

**挑战**：语音播报需要等待完成再执行下一步

**解决方案**：
```typescript
// useSpeech 返回 Promise
const speak = useCallback((text: string): Promise<void> => {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}, []);

// 使用 async/await 等待语音完成
await speak(SPEECH_MESSAGES.WEREWOLF_WAKE);
// 然后执行下一步
setShowHandoff(true);
```

---

## 性能优化

### 1. 组件懒加载

```typescript
// 使用 React.lazy 懒加载页面组件（可选优化）
const Home = React.lazy(() => import('./pages/Home'));
const Setup = React.lazy(() => import('./pages/Setup'));
```

### 2. 状态订阅优化

```typescript
// 只订阅需要的字段，避免整个 store 重渲染
const phase = useGameStore(state => state.phase);
const players = useGameStore(state => state.players);

// 而不是
const gameStore = useGameStore();  // 任何字段变化都会重渲染
```

### 3. useCallback 缓存函数

```typescript
// 缓存回调函数，避免子组件不必要重渲染
const handleSelectTarget = useCallback((player: Player) => {
  if (!currentActionPlayer || !player.isAlive) return;
  setSelectedTarget(player.id);
}, [currentActionPlayer]);
```

---

## 测试建议

### 单元测试

```typescript
// 测试角色分配逻辑
describe('getRoleList', () => {
  it('should generate correct role list', () => {
    const config = { werewolf: 2, villager: 3, seer: 1, witch: 1, hunter: 0, idiot: 0, wolfKing: 0 };
    const roles = getRoleList(config);
    expect(roles.length).toBe(7);
    expect(roles.filter(r => r === 'werewolf').length).toBe(2);
  });
});

// 测试洗牌算法
describe('shuffleArray', () => {
  it('should return array with same elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(arr);
    expect(shuffled.length).toBe(arr.length);
    expect(shuffled.sort()).toEqual(arr.sort());
  });
});
```

### 集成测试

```typescript
// 测试完整游戏流程
describe('Game Flow', () => {
  it('should complete a full game cycle', async () => {
    // 初始化游戏
    initGame(6, { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, idiot: 0, wolfKing: 0 });

    // 设置玩家
    setPlayers([
      { id: '1', name: 'Player 1', role: 'werewolf', isAlive: true, seatNumber: 1 },
      // ...
    ]);

    // 开始游戏
    startGame();

    // 验证状态
    expect(phase).toBe('night');
    expect(round).toBe(1);
  });
});
```

---

## 未来扩展方向

### 1. 多语言支持

```typescript
// 添加语言配置
const LANGUAGES = {
  zh: { ...SPEECH_MESSAGES },
  en: { GAME_START: 'Game starts, please prepare.', ... }
};
```

### 2. 更多角色

```typescript
// 添加新角色类型
type RoleType = 'werewolf' | 'villager' | 'seer' | 'witch' | 'hunter' | 'idiot' | 'wolfKing'
  | 'guard'      // 守卫：每晚守护一名玩家
  | 'cupid'      //丘比特：连接两名玩家为情侣
  | 'thief';     // 盗贼：游戏开始前交换角色
```

### 3. 在线多人模式

```typescript
// 使用 WebSocket 实现多人在线
const socket = io('https://werewolf-server.com');

socket.emit('join-game', { gameId, playerId });
socket.on('game-state', (state) => useGameStore.setState(state));
```

### 4. AI 法官模式

```typescript
// 使用 AI 分析玩家发言，提供推理建议
const analyzeSpeech = async (speech: string) => {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    body: JSON.stringify({ speech })
  });
  return response.json(); // { suspicionLevel: 0.8, reasoning: '...' }
};
```

---

## 总结

本项目是一个完整的狼人杀桌面游戏实现，采用现代化的前端技术栈（React + TypeScript + Vite），实现了：

1. **完整的游戏流程**：从配置、角色分配、夜晚行动、白天投票到结果展示
2. **隐私保护机制**：设备传递、防偷窥、加密存储
3. **语音播报系统**：自动引导游戏流程
4. **状态持久化**：支持暂停恢复
5. **响应式设计**：适配不同屏幕尺寸

核心亮点：
- Zustand 状态管理简洁高效
- 自定义 Hooks 封装语音和计时逻辑
- React StrictMode 兼容的自动触发机制
- 加密存储保护游戏数据

项目代码结构清晰，类型定义完整，易于维护和扩展。