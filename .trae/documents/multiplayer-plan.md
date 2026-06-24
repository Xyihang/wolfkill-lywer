# 狼人杀多人在线联机方案（局域网版）

## 一、需求概述

**核心目标**：让游戏支持多人在线模式——有手机的玩家用自己手机参与游戏（同一局域网/WiFi 下），没有手机的玩家仍然通过传递设备的方式参与。

**关键约束**：
- 不上传到 GitHub（本地开发）
- 局域网部署，不需要云服务器
- 保持现有单设备模式完整可用
- 新增联机模式作为可选功能
- 角色隐私保护不能降低

## 二、当前架构分析

### 2.1 现状

| 模块 | 文件 | 职责 | 行数 |
|------|------|------|------|
| 状态管理 | `src/store/gameStore.ts` | Zustand 单一 store | ~709 |
| 游戏主页面 | `src/pages/Game.tsx` | 夜晚/白天完整状态机 + UI | ~1097 |
| 类型定义 | `src/types/index.ts` | Player/Role/GamePhase 等 14+ 类型 | ~148 |

### 2.2 当前数据流

```
单设备模式：
  Game.tsx (UI) ←→ gameStore (Zustand) ←→ localStorage (加密存储)
  
  所有操作都在同一台设备上完成，通过"传递设备"机制让不同玩家轮流操作。
```

## 三、技术方案：Socket.io 局域网服务端

### 3.1 架构设计

```
                    ┌──────────────────────┐
                    │   房主电脑/手机        │
                    │  运行 Socket.io 服务   │
                    │  (局域网 IP:3000)     │
                    └──────────┬───────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
     ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
     │  玩家A 手机   │   │  玩家B 手机   │   │  共享平板    │
     │  (WiFi连接)  │   │  (WiFi连接)  │   │  (传设备用)  │
     └─────────────┘   └─────────────┘   └─────────────┘
     
     同一 WiFi/局域网下，所有设备通过 房主IP:端口 连接
```

### 3.2 为什么选 Socket.io

| 对比项 | Socket.io | WebRTC (PeerJS) | HTTP 轮询 |
|--------|-----------|-----------------|----------|
| 局域网稳定性 | ✅ 非常稳定 | ⚠️ NAT穿透问题少但仍有 | ✅ 稳定 |
| 房间管理 | ✅ 内置 | ❌ 需自己实现 | ❌ 需自己实现 |
| 实时性 | ✅ 即时 | ✅ 即时 | ❌ 有延迟 |
| 断线重连 | ✅ 自动 | ⚠️ 需自己处理 | ✅ 简单 |
| 服务端依赖 | ✅ 轻量 Node.js | ❌ 无需服务端 | ✅ 轻量 |
| 部署复杂度 | 低（npm start） | 中 | 低 |

**结论**：局域网下 Socket.io 最合适，服务端只需一行命令启动。

## 四、详细设计方案

### 4.1 新增文件清单

```
新增文件：
├── server/
│   ├── index.js              # Socket.io 服务端（~200 行）
│   └── package.json          # 服务端依赖
│
├── src/
│   ├── hooks/
│   │   └── useSocket.ts          # Socket.io 连接 Hook
│   │
│   ├── pages/
│   │   ├── Lobby.tsx             # 房间大厅（创建/加入房间）
│   │   └── MultiplayerGame.tsx   # 多人游戏页面
│   │
│   └── components/
│       └── multiplayer/
│           ├── RoomCard.tsx          # 房间卡片组件
│           ├── WaitingRoom.tsx       # 等待室组件
│           └── PlayerStatus.tsx      # 在线状态指示器

修改文件：
├── package.json                 # 添加 socket.io-client 依赖
├── src/App.tsx                  # 添加 Lobby 路由
├── src/pages/Home.tsx           # 添加"多人模式"入口
└── src/pages/Game.tsx           # 提取可复用组件（NightPhaseUI 等）
```

### 4.2 服务端设计 (`server/index.js`)

```javascript
// 核心职责：
// 1. 房间管理（创建/加入/离开）
// 2. 玩家管理（上线/离线/准备状态）
// 3. 游戏状态权威源（所有状态变更经过服务端验证）
// 4. 消息广播（向正确的玩家发送正确的信息）

// 房间数据结构：
const rooms = new Map(); // roomId → Room

// Room 结构：
{
  id: 'room-abc123',
  hostId: 'socket-xxx',
  name: '张三的游戏',
  status: 'waiting', // waiting | playing | finished
  
  config: {
    playerCount: 8,
    roleConfig: { werewolf: 2, villager: 3, seer: 1, witch: 1, hunter: 1 },
    settings: { ... }
  },
  
  players: [
    {
      id: 'player-1',
      name: '张三',
      socketId: 'socket-xxx',
      isOnline: true,
      isHost: true,
      isReady: true,
      role: null,         // 游戏开始后分配
      isAlive: true,
      seatNumber: 1
    }
  ],
  
  gameState: null  // 游戏开始后初始化
}
```

### 4.3 客户端事件协议

```typescript
// ====== 客户端 → 服务端 ======
enum ClientEvents {
  // 房间
  CREATE_ROOM = 'room:create',       // { name, config }
  JOIN_ROOM = 'room:join',           // { roomId, playerName }
  LEAVE_ROOM = 'room:leave',
  READY_TOGGLE = 'player:ready',
  KICK_PLAYER = 'player:kick',       // 仅房主
  
  // 游戏控制
  START_GAME = 'game:start',         // 仅房主
  
  // 夜晚行动
  NIGHT_ACTION = 'night:action',     // { actionType, targetId }
  WEREWOLF_VOTE = 'night:wolf_vote',// { targetId }
  SEER_CHECK = 'night:seer_check',  // { targetId }
  WITCH_USE = 'night:witch_use',    // { type: 'antidote'|'poison', targetId }
  
  // 白天行动
  SPEECH_NEXT = 'day:speech_next',
  VOTE_SUBMIT = 'day:vote',         // { targetId }
  
  // 特殊技能
  HUNTER_SHOOT = 'skill:hunter_shoot',  // { targetId }
  HUNTER_SKIP = 'skill:hunter_skip',
  WOLF_KING_SHOOT = 'skill:wolf_king_shoot', // { targetId }
  WOLF_KING_SKIP = 'skill:wolf_king_skip',
  IDIOT_REVEAL = 'skill:idiot_reveal',
}

// ====== 服务端 → 客户端 ======
enum ServerEvents {
  // 房间响应
  ROOM_CREATED = 'room:created',     // { room, playerId }
  ROOM_JOINED = 'room:joined',      // { room, players }
  PLAYER_JOINED = 'player:joined',  // { player }
  PLAYER_LEFT = 'player:left',      // { playerId }
  PLAYER_READY = 'player:ready',    // { playerId, isReady }
  ERROR = 'error',                  // { message }
  
  // 游戏流程
  GAME_STARTED = 'game:started',    // { gameState, myPlayerInfo }
  PHASE_CHANGE = 'phase:change',    // { phase, round, nightPhase? }
  
  // 个人通知
  YOUR_TURN = 'your:turn',          // { phase, availableActions }
  WAIT_FOR_OTHERS = 'wait:others',  // { message }
  SHOW_ROLE = 'role:reveal',        // { role } 仅发给对应玩家
  
  // 结果通知
  NIGHT_RESULT = 'night:result',    // 死亡名单（公开）
  VOTE_RESULT = 'vote:result',      // 投票结果
  ACTION_CONFIRMED = 'action:ok',   // 操作成功确认
  
  // 游戏结束
  GAME_OVER = 'game:over',          // { winner, finalState }
}
```

### 4.4 隐私保护策略（核心！）

```typescript
// 服务端只向每个客户端发送该玩家应该看到的信息
function buildViewState(room: Room, socketId: string): ViewState {
  const player = room.players.find(p => p.socketId === socketId);
  const isHost = player?.isHost;
  
  return {
    // ========== 所有可见 ==========
    phase: room.gameState.phase,
    round: room.gameState.round,
    
    // 玩家列表（隐藏角色信息！）
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      seatNumber: p.seatNumber,
      isAlive: p.gameStatePlayer?.isAlive ?? true,
      isOnline: p.isOnline,
      role: undefined,              // ❌ 不暴露角色
    })),
    
    // ========== 仅自己可见 ==========
    myPlayerId: player?.id,
    myRole: player?.role,           // ✅ 只有自己的角色
    myIsAlive: player?.gameStatePlayer?.isAlive,
    
    // ========== 房主额外可见 ==========
    offlinePlayers: isHost 
      ? room.players.filter(p => !p.isOnline).map(p => ({ id: p.id, name: p.name }))
      : undefined,
      
    // ========== 阶段性公开 ==========
    deathAnnouncement: room.lastDeathAnnouncement,  // 死讯公布时
    voteResult: room.lastVoteResult,                // 投票结束时
    
    // ========== 游戏结束时全部公开 ==========
    fullReveal: room.status === 'finished'
      ? room.players.map(p => ({ id: p.id, name: p.name, role: p.role }))
      : undefined,
  };
}
```

### 4.5 混合模式核心逻辑

```typescript
// 关键：区分在线玩家和需要传设备的玩家
interface PlayerDeviceStatus {
  player: RoomPlayer;
  mode: 'online';      // 有自己的设备，直接操作
  mode: 'pass-through'; // 没设备，需要房主代操作或传设备
}

// 夜晚阶段 - 服务端判断每个目标玩家的设备状态
function processNightPhase(room: Room, phase: NightPhase) {
  const targetRoles = getRolesForPhase(phase);  // e.g., ['werewolf', 'wolfKing']
  const targets = room.players.filter(p => 
    p.isAlive && targetRoles.includes(p.role!)
  );
  
  for (const target of targets) {
    if (target.isOnline) {
      // 在线玩家 → 直接发送 "your:turn"
      io.to(target.socketId).emit('your:turn', { 
        phase, 
        actions: getAvailableActions(phase, target.role!) 
      });
    } else {
      // 离线玩家 → 标记为待传设备，通知房主
      room.pendingPassThrough.push({
        playerId: target.id,
        playerName: target.name,
        phase,
      });
      io.to(room.hostId).emit('pass_through_required', {
        player: { id: target.id, name: target.name },
        phase,
      });
    }
  }
}
```

### 4.6 页面流程

```
首页(Home.tsx)
  ↓ 点击 [多人游戏]
  ├─ 显示服务端启动指引（首次）/ 直接进入大厅
  ↓
大厅(Lobby.tsx)
  ├─ 输入房间号加入 OR 创建新房间
  ↓
等待室(WaitingRoom.tsx)
  ├─ 房主：设置人数/角色/高级选项
  ├─ 所有玩家：输入名字 → 准备就绪
  ├─ 显示已加入玩家列表 + 在线状态
  └─ 房主点击 [开始游戏]
↓
多人游戏(MultiplayerGame.tsx)
  ├─ 与 Game.tsx 类似的状态机
  ├─ 但状态来自 Socket.io 同步
  ├─ 在线玩家：直接在自己手机上操作
  └─ 离线玩家：房主设备显示传设备界面（复用现有 Handoff 组件）
↓
结果页(Result.tsx) — 复用现有，增加身份揭示
```

### 4.7 服务端代码结构

```javascript
// server/index.js (~250 行)

const { Server } = require('socket.io');
const http = require('http');

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: '*' }
});

// ==================== 数据存储 ====================
const rooms = new Map();

// ==================== 房间管理 ====================
function createRoom(socket, { name, config }) { ... }
function joinRoom(socket, { roomId, playerName }) { ... }
function leaveRoom(socket) { ... }

// ==================== 游戏逻辑 ====================
function startGame(roomId) { ... }
function handleNightAction(roomId, playerId, action) { ... }
function handleVote(roomId, voterId, targetId) { ... }
function checkGameEnd(room) { ... }

// ==================== 工具函数 ====================
function assignRoles(players, config) { ... }  // 复用 roles.ts 逻辑
function filterStateForPlayer(room, socketId) { ... }
function broadcastRoomUpdate(room) { ... }

// ==================== 事件监听 ====================
io.on('connection', (socket) => {
  console.log('[Server] Client connected:', socket.id);
  
  socket.on('room:create', (...) => createRoom(socket, ...));
  socket.on('room:join', (...) => joinRoom(socket, ...));
  socket.on('room:leave', () => leaveRoom(socket));
  socket.on('player:ready', (...) => toggleReady(socket, ...));
  socket.on('game:start', (...) => startGame(...));
  socket.on('night:action', (...) => handleNightAction(...));
  socket.on('day:vote', (...) => handleVote(...));
  socket.on('disconnect', () => handleDisconnect(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  console.log(`[Server] LAN access: http://<YOUR_LOCAL_IP>:${PORT}`);
});
```

## 五、实施步骤

### Step 1：搭建服务端基础
1. 创建 `server/package.json`
2. 创建 `server/index.js`（Socket.io 服务端）
3. 实现房间创建/加入/离开基础功能
4. 测试：两个浏览器标签能同时连入同一房间

### Step 2：客户端连接层
5. 安装 `socket.io-client`
6. 创建 `src/hooks/useSocket.ts`
7. 创建 `src/pages/Lobby.tsx`（房间大厅）
8. 创建 `src/components/multiplayer/WaitingRoom.tsx`（等待室）
9. 更新 `src/App.tsx` 添加路由
10. 更新 `src/pages/Home.tsx` 添加入口按钮

### Step 3：游戏状态同步
11. 创建 `src/pages/MultiplayerGame.tsx`（基于 Game.tsx 改造）
12. 服务端实现游戏开始逻辑（角色分配）
13. 实现夜晚阶段状态同步和行动分发
14. 实现白天阶段发言/投票同步
15. 实现隐私过滤（每人只能看到自己的角色）

### Step 4：混合模式（在线+传设备）
16. 服务端实现在线/离线玩家识别
17. 房主端的传设备 UI（复用现有 Handoff 组件）
18. 离线玩家的行动代提交逻辑
19. 断线重连处理

### Step 5：完善与测试
20. 特殊技能适配（猎人开枪、狼王复仇、白痴翻牌）
21. 游戏结果页适配（身份揭示）
22. 音效/语音播报适配
23. 多设备实际测试

## 六、使用方式（最终用户视角）

```bash
# 1. 房主启动服务端
cd server
npm install
npm start
# 显示: Server running on http://192.168.1.100:3000

# 2. 房主打开浏览器访问 http://localhost:3000
#    （或手机访问 http://192.168.1.100:3000）

# 3. 其他玩家在同一 WiFi 下用手机访问 http://192.168.1.100:3000

# 4. 加入房间号，开始游戏！
```

## 七、假设与决策

| 决策项 | 决策 | 原因 |
|--------|------|------|
| 通信方式 | Socket.io | 成熟稳定，局域网下零延迟 |
| 服务端运行位置 | 房主的任一设备 | 不需要云服务器 |
| 监听地址 | 0.0.0.0 | 允许局域网内其他设备访问 |
| 身份认证 | 无（房间号+昵称） | 局域网环境足够安全 |
| 状态权威 | 服务端 | 避免多客户端不一致 |
| 单人模式保留 | ✅ 完整保留 | 用户可自由选择模式 |

## 八、验证方式

1. **Step 1 验证**：启动服务端 → 两个标签创建/加入房间 → 玩家列表正确显示
2. **Step 2 验证**：完整走通 创建→加入→准备→开始 流程
3. **Step 3 验证**：两台设备（或两个标签）完成一轮完整的夜晚+白天
4. **隐私验证**：玩家A的屏幕看不到玩家B的角色信息
5. **混合模式验证**：3 个在线玩家 + 2 个模拟离线玩家，验证传设备流程
