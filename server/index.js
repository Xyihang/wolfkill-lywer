/**
 * 狼人杀多人游戏服务端
 * 
 * 职责：
 * 1. 房间管理（创建/加入/离开）
 * 2. 玩家管理（上线/离线/准备状态）
 * 3. 游戏状态权威源（所有状态变更经过服务端验证）
 * 4. 隐私保护（每个客户端只收到该玩家应该看到的信息）
 * 5. 混合模式支持（在线玩家直接操作 + 离线玩家传设备）
 */

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ==================== 数据存储 ====================
const rooms = new Map(); // roomId → Room

// ==================== 工具函数 ====================
function generateId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 角色定义
const ROLES = {
  werewolf: { name: '狼人', camp: 'werewolf', actionOrder: 1 },
  wolfKing: { name: '狼王', camp: 'werewolf', actionOrder: 1 },
  villager: { name: '村民', camp: 'villager', actionOrder: 99 },
  seer: { name: '预言家', camp: 'villager', actionOrder: 2 },
  witch: { name: '女巫', camp: 'villager', actionOrder: 3 },
  hunter: { name: '猎人', camp: 'villager', actionOrder: 99 },
  idiot: { name: '白痴', camp: 'villager', actionOrder: 99 }
};

// 夜晚阶段对应的角色
function getRolesForPhase(phase) {
  switch (phase) {
    case 'werewolf': return ['werewolf', 'wolfKing'];
    case 'witch': return ['witch'];
    case 'seer': return ['seer'];
    default: return [];
  }
}

// 分配角色
function assignRoles(players, roleConfig) {
  const roleList = [];
  for (const [role, count] of Object.entries(roleConfig)) {
    for (let i = 0; i < count; i++) {
      roleList.push(role);
    }
  }
  
  const shuffledRoles = shuffleArray(roleList);
  players.forEach((player, idx) => {
    player.role = shuffledRoles[idx] || null;
  });
  
  return players;
}

// 检查游戏结束
function checkGameEnd(room) {
  if (!room.gameState) return null;
  
  const alivePlayers = room.gameState.players.filter(p => p.isAlive);
  const aliveWerewolves = alivePlayers.filter(p => 
    ['werewolf', 'wolfKing'].includes(p.role)
  );
  const aliveVillagers = alivePlayers.filter(p => 
    !['werewolf', 'wolfKing'].includes(p.role)
  );
  
  if (aliveWerewolves.length >= aliveVillagers.length) {
    return 'werewolf';
  }
  if (aliveWerewolves.length === 0) {
    return 'villager';
  }
  return null;
}

// 构建每个客户端可见的视图状态（隐私保护核心！）
function buildViewState(room, socketId) {
  const player = room.players.find(p => p.socketId === socketId);
  const isHost = player?.isHost || false;
  const gs = room.gameState;
  
  if (!gs) {
    // 游戏未开始，返回房间信息
    return {
      type: 'lobby',
      roomId: room.id,
      roomName: room.name,
      status: room.status,
      hostName: room.players.find(p => p.isHost)?.name || '',
      config: room.config,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isReady: p.isReady,
        isOnline: p.isOnline,
      })),
      myPlayerId: player?.id,
      isMyRoomHost: isHost,
    };
  }
  
  // 游戏进行中/已结束
  return {
    type: gs.phase === 'result' ? 'result' : 'game',
    phase: gs.phase,
    round: gs.round,
    nightPhase: gs.nightPhase,
    
    // 玩家列表（隐藏角色信息，除非游戏结束）
    players: gs.players.map(p => ({
      id: p.id,
      name: p.name,
      seatNumber: p.seatNumber,
      isAlive: p.isAlive,
      isOnline: room.players.find(rp => rp.id === p.id)?.isOnline ?? true,
      // 只在游戏结束时暴露角色
      ...(gs.phase === 'result' ? { role: p.role } : {}),
    })),
    
    // 仅自己可见的私密信息
    myPlayerId: player?.id,
    myRole: player?.role,
    myIsAlive: gs.players.find(p => p.id === player?.id)?.isAlive ?? true,
    
    // 房主额外可见：需要传设备的玩家列表
    pendingPassThrough: isHost ? room.pendingPassThrough || [] : undefined,
    
    // 当前夜晚阶段信息（仅相关玩家可见）
    currentNightPhase: gs.nightPhase,
    werewolfKillTarget: gs.werewolfKillTarget ? 
      gs.players.find(p => p.id === gs.werewolfKillTarget)?.name : undefined,
    
    // 女巫药水状态（仅女巫可见）
    witchHasAntidote: player?.role === 'witch' ? gs.witchHasAntidote : undefined,
    witchHasPoison: player?.role === 'witch' ? gs.witchHasPoison : undefined,
    
    // 投票结果（白天投票结束后公开）
    voteResult: gs.lastVoteResult,
    
    // 死亡公布
    deadTonightNames: gs.deadTonight?.map(id => 
      gs.players.find(p => p.id === id)?.name
    ).filter(Boolean),
    
    // 游戏结束时全部揭示
    winner: gs.winner,
    fullReveal: gs.phase === 'result' ? gs.players.map(p => ({
      id: p.id, name: p.name, role: p.role, isAlive: p.isAlive
    })) : undefined,
    
    // 日志
    gameLog: gs.gameLog || [],
  };
}

// 向房间内所有客户端广播更新
function broadcastRoomUpdate(room) {
  room.players.forEach(p => {
    if (p.isOnline && p.socketId) {
      const viewState = buildViewState(room, p.socketId);
      io.to(p.socketId).emit('state:update', viewState);
    }
  });
}

// 向特定玩家发送个人通知
function sendPersonalEvent(socketId, event, data) {
  io.to(socketId).emit(event, data);
}

// ==================== 房间管理 ====================

function createRoom(socket, data) {
  const { name, config } = data;
  const roomId = generateId();
  const playerId = generateId();
  
  const room = {
    id: roomId,
    name: name || '狼人杀游戏',
    hostId: playerId,
    status: 'waiting',
    config: {
      playerCount: config?.playerCount || 8,
      roleConfig: config?.roleConfig || { werewolf: 2, villager: 3, seer: 1, witch: 1, hunter: 1 },
      settings: config?.settings || {},
    },
    players: [{
      id: playerId,
      name: data.hostName || '房主',
      socketId: socket.id,
      isOnline: true,
      isHost: true,
      isReady: false,
      role: null,
      isAlive: true,
      seatNumber: 1,
    }],
    gameState: null,
    pendingPassThrough: [],  // 需要传设备的玩家队列
    nightActionBuffer: {},   // 夜晚行动缓冲区
  };
  
  rooms.set(roomId, room);
  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.playerId = playerId;
  
  const viewState = buildViewState(room, socket.id);
  socket.emit('room:created', { roomId, playerId, state: viewState });
  
  console.log(`[Server] Room created: ${roomId} by ${data.hostName || '房主'}`);
}

function joinRoom(socket, data) {
  const { roomId, playerName } = data;
  const room = rooms.get(roomId);
  
  if (!room) {
    socket.emit('error', { message: '房间不存在' });
    return;
  }
  
  if (room.status !== 'waiting') {
    socket.emit('error', { message: '游戏已经开始，无法加入' });
    return;
  }
  
  if (room.players.length >= room.config.playerCount) {
    socket.emit('error', { message: '房间已满' });
    return;
  }
  
  // 检查是否是重连（同一玩家名重新连接）
  const existingPlayer = room.players.find(
    p => p.name === playerName && !p.isOnline
  );
  
  let playerId;
  if (existingPlayer) {
    // 重连
    existingPlayer.socketId = socket.id;
    existingPlayer.isOnline = true;
    playerId = existingPlayer.id;
    console.log(`[Server] Player rejoined: ${playerName}`);
  } else {
    // 新玩家
    playerId = generateId();
    room.players.push({
      id: playerId,
      name: playerName,
      socketId: socket.id,
      isOnline: true,
      isHost: false,
      isReady: false,
      role: null,
      isAlive: true,
      seatNumber: room.players.length + 1,
    });
    console.log(`[Server] Player joined: ${playerName} to room ${roomId}`);
  }
  
  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.playerId = playerId;
  
  const viewState = buildViewState(room, socket.id);
  socket.emit('room:joined', { roomId, playerId, state: viewState });
  
  // 通知其他玩家
  socket.to(roomId).emit('player:joined', {
    id: playerId,
    name: playerName,
    isOnline: true,
    isReady: false,
  });
  
  broadcastRoomUpdate(room);
}

function leaveRoom(socket) {
  const roomId = socket.data.roomId;
  const playerId = socket.data.playerId;
  
  if (!roomId || !rooms.has(roomId)) return;
  
  const room = rooms.get(roomId);
  const player = room.players.find(p => p.id === playerId);
  
  if (player) {
    player.isOnline = false;
    player.socketId = null;
    
    socket.leave(roomId);
    socket.to(roomId).emit('player:left', { playerId, playerName: player.name });
    
    console.log(`[Server] Player left: ${player.name} from room ${roomId}`);
    
    // 如果是房主离开且游戏未开始，解散房间
    if (player.isHost && room.status === 'waiting') {
      io.to(roomId).emit('room:closed', { message: '房主已关闭房间' });
      rooms.delete(roomId);
      console.log(`[Server] Room closed: ${roomId}`);
      return;
    }
    
    broadcastRoomUpdate(room);
  }
}

function toggleReady(socket) {
  const roomId = socket.data.roomId;
  const playerId = socket.data.playerId;
  const room = rooms.get(roomId);
  
  if (!room) return;
  
  const player = room.players.find(p => p.id === playerId);
  if (player) {
    player.isReady = !player.isReady;
    socket.emit('player:ready', { playerId, isReady: player.isReady });
    socket.to(roomId).emit('player:ready', { playerId, isReady: player.isReady, playerName: player.name });
    broadcastRoomUpdate(room);
  }
}

// ==================== 游戏逻辑 ====================

function startGame(socket) {
  const roomId = socket.data.roomId;
  const room = rooms.get(roomId);
  
  if (!room) {
    socket.emit('error', { message: '房间不存在' });
    return;
  }
  
  const hostPlayer = room.players.find(p => p.isHost && p.id === socket.data.playerId);
  if (!hostPlayer) {
    socket.emit('error', { message: '只有房主可以开始游戏' });
    return;
  }
  
  // 检查所有玩家是否都准备好了
  const notReady = room.players.filter(p => !p.isReady && p.isOnline);
  if (notReady.length > 0) {
    socket.emit('error', { message: `还有 ${notReady.length} 位玩家未准备` });
    return;
  }
  
  // 分配角色
  assignRoles(room.players, room.config.roleConfig);
  
  // 初始化游戏状态
  room.gameState = {
    phase: 'night',
    round: 1,
    nightPhase: 'werewolf',
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      isAlive: true,
      hasUsedAbility: false,
      seatNumber: p.seatNumber,
    })),
    nightActions: [],
    dayActions: [],
    currentNightActions: [],
    currentVotes: {},
    currentSpeakerIndex: 0,
    winner: null,
    gameLog: [{ id: generateId(), round: 1, phase: 'night', timestamp: new Date().toISOString(), eventType: 'other', description: '游戏开始，第一夜' }],
    deadTonight: [],
    witchHasAntidote: true,
    witchHasPoison: true,
    hunterCanShoot: true,
    pendingHunterShoot: false,
    hunterTarget: null,
    pendingWolfKingShoot: false,
    wolfKingTarget: null,
    idiotRevealed: false,
    werewolfVotes: {},       // 狼人投票记录
    werewolfKillTarget: null,
    lastVoteResult: null,
  };
  
  room.status = 'playing';
  
  // 向每个人发送自己的角色（隐私发送！）
  room.players.forEach(p => {
    if (p.isOnline && p.socketId) {
      sendPersonalEvent(p.socketId, 'role:reveal', { role: p.role, roleName: ROLES[p.role]?.name });
    }
  });
  
  // 广播游戏开始
  broadcastRoomUpdate(room);
  io.to(roomId).emit('phase:change', { phase: 'night', round: 1, nightPhase: 'werewolf' });
  
  // 开始处理夜晚第一阶段（狼人）
  processNightPhase(room, 'werewolf');
  
  console.log(`[Server] Game started in room ${roomId}, ${room.players.length} players`);
}

// 处理夜晚某个阶段
function processNightPhase(room, phase) {
  const gs = room.gameState;
  if (!gs) return;
  
  gs.nightPhase = phase;
  gs.currentNightActions = [];
  
  const targetRoles = getRolesForPhase(phase);
  const targets = gs.players.filter(p => p.isAlive && targetRoles.includes(p.role));
  
  console.log(`[Server] Night phase: ${phase}, target roles: ${targetRoles.join(',')}, targets: ${targets.map(t => t.name).join(',')}`);
  
  if (targets.length === 0) {
    // 没有该角色的存活玩家，跳到下一阶段
    console.log(`[Server] No players for phase ${phase}, skipping`);
    setTimeout(() => goToNextNightPhase(room), 500);
    return;
  }
  
  // 区分在线和离线玩家
  for (const target of targets) {
    const roomPlayer = room.players.find(p => p.id === target.id);
    if (roomPlayer?.isOnline) {
      // 在线玩家 → 直接发送轮到你行动
      sendPersonalEvent(roomPlayer.socketId, 'your:turn', {
        phase,
        round: gs.round,
        availableActions: getAvailableActions(phase, target.role),
      });
    } else {
      // 离线玩家 → 加入待传设备队列
      room.pendingPassThrough.push({
        playerId: target.id,
        playerName: target.name,
        phase,
        role: target.role,
      });
      // 通知房主
      const hostSocketId = room.players.find(p => p.isHost)?.socketId;
      if (hostSocketId) {
        sendPersonalEvent(hostSocketId, 'pass_through_required', {
          playerId: target.id,
          playerName: target.name,
          phase,
          role: target.role,
        });
      }
    }
  }
  
  // 广播阶段变更
  io.to(room.id).emit('phase:change', { phase: `night:${phase}`, round: gs.round });
  broadcastRoomUpdate(room);
}

function getAvailableActions(phase, role) {
  switch (phase) {
    case 'werewolf':
      if (role === 'werewolf' || role === 'wolfKing') {
        return { type: 'kill', description: '选择要击杀的目标' };
      }
      break;
    case 'witch':
      if (role === 'witch') {
        return { type: 'witch_action', description: '选择使用解药或毒药' };
      }
      break;
    case 'seer':
      if (role === 'seer') {
        return { type: 'check', description: '选择要查验的玩家' };
      }
      break;
  }
  return null;
}

// 进入下一个夜晚阶段
function goToNextNightPhase(room) {
  const gs = room.gameState;
  if (!gs) return;
  
  const phases = ['werewolf', 'witch', 'seer'];
  const currentIndex = phases.indexOf(gs.nightPhase || 'werewolf');
  const nextPhaseIndex = currentIndex + 1;
  
  // 找下一个有对应存活玩家的阶段
  while (nextPhaseIndex < phases.length) {
    const nextPhase = phases[nextPhaseIndex];
    const roles = getRolesForPhase(nextPhase);
    const hasPlayer = gs.players.some(p => p.isAlive && roles.includes(p.role));
    
    if (hasPlayer) {
      processNightPhase(room, nextPhase);
      return;
    }
    // 没有该角色，继续找下一个
    gs.nightPhase = nextPhase;
  }
  
  // 所有夜晚阶段完成，结束夜晚
  finishNightPhase(room);
}

// 结束夜晚阶段
function finishNightPhase(room) {
  const gs = room.gameState;
  if (!gs) return;
  
  console.log(`[Server] Finishing night ${gs.round}`);
  
  // 处理死亡
  const deadPlayers = gs.deadTonight || [];
  gs.players = gs.players.map(p =>
    deadPlayers.includes(p.id) ? { ...p, isAlive: false } : p
  );
  
  // 记录日志
  deadPlayers.forEach(playerId => {
    const player = gs.players.find(p => p.id === playerId);
    if (player) {
      gs.gameLog.push({
        id: generateId(),
        round: gs.round,
        phase: 'night',
        timestamp: new Date().toISOString(),
        eventType: 'death',
        description: `${player.name}(${ROLES[player.role].name})在夜晚死亡`,
        players: [playerId],
      });
    }
  });
  
  // 保存夜晚行动
  gs.nightActions = [...(gs.nightActions || []), ...gs.currentNightActions.map(a => ({ ...a, round: gs.round }))];
  
  // 重置夜晚临时状态
  gs.phase = 'day';
  gs.nightPhase = null;
  gs.currentNightActions = [];
  gs.deadTonight = [];
  gs.werewolfVotes = {};
  gs.werewolfKillTarget = null;
  
  // 检查游戏结束
  const winner = checkGameEnd(room);
  if (winner) {
    endGame(room, winner);
    return;
  }
  
  // 检查死亡的猎人和狼王
  const deadHunter = deadPlayers.find(id => {
    const p = gs.players.find(player => player.id === id);
    return p && p.role === 'hunter' && gs.hunterCanShoot;
  });
  
  if (deadHunter) {
    gs.pendingHunterShoot = true;
    gs.hunterTarget = null;
    const hunterPlayer = room.players.find(p => p.id === deadHunter);
    if (hunterPlayer?.isOnline) {
      sendPersonalEvent(hunterPlayer.socketId, 'your:turn', { phase: 'hunter_shoot', description: '你已死亡，可以开枪带走一人' });
    } else {
      room.pendingPassThrough.push({ playerId: deadHunter, playerName: hunterPlayer?.name, phase: 'hunter_shoot', role: 'hunter' });
      const hostSocketId = room.players.find(p => p.isHost)?.socketId;
      if (hostSocketId) {
        sendPersonalEvent(hostSocketId, 'pass_through_required', { playerId: deadHunter, playerName: hunterPlayer?.name, phase: 'hunter_shoot', role: 'hunter' });
      }
    }
    broadcastRoomUpdate(room);
    return;
  }
  
  const deadWolfKing = deadPlayers.find(id => {
    const p = gs.players.find(player => player.id === id);
    return p && p.role === 'wolfKing';
  });
  
  if (deadWolfKing) {
    gs.pendingWolfKingShoot = true;
    gs.wolfKingTarget = null;
    const wkPlayer = room.players.find(p => p.id === deadWolfKing);
    if (wkPlayer?.isOnline) {
      sendPersonalEvent(wkPlayer.socketId, 'your:turn', { phase: 'wolf_king_shoot', description: '你已死亡，可以开枪复仇' });
    } else {
      room.pendingPassThrough.push({ playerId: deadWolfKing, playerName: wkPlayer?.name, phase: 'wolf_king_shoot', role: 'wolfKing' });
      const hostSocketId = room.players.find(p => p.isHost)?.socketId;
      if (hostSocketId) {
        sendPersonalEvent(hostSocketId, 'pass_through_required', { playerId: deadWolfKing, playerName: wkPlayer?.name, phase: 'wolf_king_shoot', role: 'wolfKing' });
      }
    }
    broadcastRoomUpdate(room);
    return;
  }
  
  // 开始白天阶段
  startDayPhase(room);
}

// 开始白天阶段
function startDayPhase(room) {
  const gs = room.gameState;
  if (!gs) return;
  
  gs.phase = 'day';
  gs.currentSpeakerIndex = 0;
  gs.currentVotes = {};
  
  gs.gameLog.push({
    id: generateId(),
    round: gs.round,
    phase: 'day',
    timestamp: new Date().toISOString(),
    eventType: 'other',
    description: `第${gs.round}天白天开始`,
  });
  
  broadcastRoomUpdate(room);
  io.to(room.id).emit('phase:change', { phase: 'day', round: gs.round });
}

// ==================== 客户端事件处理 ====================

// 狼人击杀投票
function handleWerewolfVote(socket, data) {
  const { targetId } = data;
  const room = rooms.get(socket.data.roomId);
  const gs = room?.gameState;
  if (!room || !gs || gs.phase !== 'night' || gs.nightPhase !== 'werewolf') {
    socket.emit('error', { message: '现在不是狼人行动时间' });
    return;
  }
  
  const voter = gs.players.find(p => p.id === socket.data.playerId);
  if (!voter || !['werewolf', 'wolfKing'].includes(voter.role)) {
    socket.emit('error', { message: '你不是狼人' });
    return;
  }
  if (!voter.isAlive) {
    socket.emit('error', { message: '你已经死亡' });
    return;
  }
  
  // 记录投票
  gs.werewolfVotes[socket.data.playerId] = targetId;
  
  // 通知其他狼人有人投票了（不透露是谁投的谁，只说又有一票）
  const otherWolves = room.players.filter(p => {
    const gp = gs.players.find(g => g.id === p.id);
    return gp && ['werewolf', 'wolfKing'].includes(gp.role) && gp.isAlive && p.id !== socket.data.playerId && p.isOnline;
  });
  
  otherWolves.forEach(wolf => {
    const targetName = gs.players.find(p => p.id === targetId)?.name;
    sendPersonalEvent(wolf.socketId, 'wolf_vote_update', {
      voteCount: Object.keys(gs.werewolfVotes).length,
      targetName,
    });
  });
  
  socket.emit('action:ok', { message: '投票已提交' });
  
  // 检查所有狼人是否都已投票
  const aliveWolves = gs.players.filter(p => ['werewolf', 'wolfKing'].includes(p.role) && p.isAlive);
  const votedWolves = Object.keys(gs.werewolfVotes);
  const allVoted = aliveWolves.every(w => votedWolves.includes(w.id)) ||
                   aliveWolves.every(w => !room.players.find(rp => rp.id === w.id)?.isOnline || votedWolves.includes(w.id));
  
  // 对于在线的狼人，检查是否都投了
  const onlineAliveWolves = aliveWolves.filter(w => room.players.find(rp => rp.id === w.id)?.isOnline);
  const onlineVotedWolves = onlineAliveWolves.filter(w => votedWolves.includes(w.id));
  
  if (onlineVotedWaves.length === onlineAliveWolves.length) {
    // 所有在线狼人都投完了，处理结果
    resolveWerewolfVote(room);
  }
}

// 解决狼人投票
function resolveWerewolfVote(room) {
  const gs = room.gameState;
  if (!gs) return;
  
  const votes = gs.werewolfVotes;
  const voteCounts = {};
  Object.values(votes).forEach(targetId => {
    voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
  });
  
  const maxVotes = Math.max(...Object.values(voteCounts), 0);
  const topVoted = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);
  
  let finalTargetId;
  if (topVoted.length === 1) {
    finalTargetId = topVoted[0];
  } else {
    // 平票随机选
    finalTargetId = topVoted[Math.floor(Math.random() * topVoted.length)];
  }
  
  gs.werewolfKillTarget = finalTargetId;
  
  // 执行击杀（先标记，等女巫阶段可能救人）
  gs.deadTonight = [...(gs.deadTonight || []), finalTargetId];
  
  gs.currentNightActions.push({
    round: gs.round,
    phase: 'werewolf',
    actorId: 'werewolves',
    actorRole: 'werewolf',
    targetId: finalTargetId,
    actionType: 'kill',
    result: { success: true, message: '狼人击杀目标确定' },
  });
  
  console.log(`[Server] Werewolf vote resolved, target: ${finalTargetId}`);
  
  // 进入女巫阶段
  setTimeout(() => processNightPhase(room, 'witch'), 500);
}

// 女巫行动
function handleWitchAction(socket, data) {
  const { type, targetId } = data;
  const room = rooms.get(socket.data.roomId);
  const gs = room?.gameState;
  if (!room || !gs || gs.phase !== 'night' || gs.nightPhase !== 'witch') {
    socket.emit('error', { message: '现在不是女巫行动时间' });
    return;
  }
  
  const player = gs.players.find(p => p.id === socket.data.playerId);
  if (!player || player.role !== 'witch') {
    socket.emit('error', { message: '你不是女巫' });
    return;
  }
  
  if (type === 'antidote') {
    if (!gs.witchHasAntidote) {
      socket.emit('error', { message: '解药已使用' });
      return;
    }
    gs.witchHasAntidote = false;
    // 移除被杀目标
    gs.deadTonight = (gs.deadTonight || []).filter(id => id !== targetId);
    gs.werewolfKillTarget = null;
    gs.currentNightActions.push({
      round: gs.round, phase: 'witch', actorId: player.id, actorRole: 'witch',
      targetId, actionType: 'save', result: { success: true, message: '女巫使用解药救人' },
    });
  } else if (type === 'poison') {
    if (!gs.witchHasPoison) {
      socket.emit('error', { message: '毒药已使用' });
      return;
    }
    gs.witchHasPoison = false;
    gs.deadTonight = [...(gs.deadTonight || []), targetId];
    gs.currentNightActions.push({
      round: gs.round, phase: 'witch', actorId: player.id, actorRole: 'witch',
      targetId, actionType: 'poison', result: { success: true, message: '女巫使用毒药杀人' },
    });
  }
  
  socket.emit('action:ok', { message: '行动完成' });
  
  // 女巫行动完毕，进入下一阶段
  setTimeout(() => goToNextNightPhase(room), 500);
}

// 预言家查验
function handleSeerCheck(socket, data) {
  const { targetId } = data;
  const room = rooms.get(socket.data.roomId);
  const gs = room?.gameState;
  if (!room || !gs || gs.phase !== 'night' || gs.nightPhase !== 'seer') {
    socket.emit('error', { message: '现在不是预言家行动时间' });
    return;
  }
  
  const player = gs.players.find(p => p.id === socket.data.playerId);
  if (!player || player.role !== 'seer') {
    socket.emit('error', { message: '你不是预言家' });
    return;
  }
  
  const target = gs.players.find(p => p.id === targetId);
  if (!target) return;
  
  const isWerewolf = ['werewolf', 'wolfKing'].includes(target.role);
  
  // 只告诉预言家结果
  sendPersonalEvent(socket.id, 'seer:result', {
    targetName: target.name,
    isWerewolf,
  });
  
  gs.currentNightActions.push({
    round: gs.round, phase: 'seer', actorId: player.id, actorRole: 'seer',
    targetId, actionType: 'check', result: { success: true, message: isWerewolf ? '狼人' : '好人' },
  });
  
  // 预言家查验完毕后进入下一阶段
  setTimeout(() => goToNextNightPhase(room), 1000); // 给预言家看结果的时间
}

// 白天发言下一位
function handleSpeechNext(socket) {
  const room = rooms.get(socket.data.roomId);
  const gs = room?.gameState;
  if (!room || !gs || gs.phase !== 'day') return;
  
  gs.currentSpeakerIndex++;
  const alivePlayers = gs.players.filter(p => p.isAlive);
  
  if (gs.currentSpeakerIndex >= alivePlayers.length) {
    // 发言结束，进入投票
    startVotePhase(room);
  } else {
    broadcastRoomUpdate(room);
    const currentSpeaker = alivePlayers[gs.currentSpeakerIndex];
    if (currentSpeaker) {
      const speakerRoomPlayer = room.players.find(p => p.id === currentSpeaker.id);
      if (speakerRoomPlayer?.isOnline) {
        sendPersonalEvent(speakerRoomPlayer.socketId, 'your:turn', {
          phase: 'speech',
          description: '轮到你发言',
          playerName: currentSpeaker.name,
        });
      }
    }
    io.to(room.id).emit('speaker:change', { index: gs.currentSpeakerIndex, name: alivePlayers[gs.currentSpeakerIndex]?.name });
  }
}

// 开始投票阶段
function startVotePhase(room) {
  const gs = room.gameState;
  if (!gs) return;
  
  gs.phase = 'vote';
  gs.currentVotes = {};
  
  broadcastRoomUpdate(room);
  io.to(room.id).emit('phase:change', { phase: 'vote', round: gs.round });
  
  // 依次通知每位存活玩家投票
  const votingPlayers = gs.players.filter(p => p.isAlive && !(p.role === 'idiot' && gs.idiotRevealed));
  votingPlayers.forEach((p, idx) => {
    const rp = room.players.find(r => r.id === p.id);
    if (rp?.isOnline) {
      setTimeout(() => {
        sendPersonalEvent(rp.socketId, 'your:turn', {
          phase: 'vote',
          description: '请投票',
          playerIndex: idx + 1,
          totalPlayers: votingPlayers.length,
        });
      }, idx * 200); // 错开一点时间
    } else {
      // 离线玩家需要传设备
      setTimeout(() => {
        room.pendingPassThrough.push({ playerId: p.id, playerName: p.name, phase: 'vote', role: p.role });
        const hostSocketId = room.players.find(h => h.isHost)?.socketId;
        if (hostSocketId) {
          sendPersonalEvent(hostSocketId, 'pass_through_required', { playerId: p.id, playerName: p.name, phase: 'vote', role: p.role });
        }
      }, idx * 200);
    }
  });
}

// 投票提交
function handleVote(socket, data) {
  const { targetId } = data;
  const room = rooms.get(socket.data.roomId);
  const gs = room?.gameState;
  if (!room || !gs || gs.phase !== 'vote') {
    socket.emit('error', { message: '现在不是投票时间' });
    return;
  }
  
  const voter = gs.players.find(p => p.id === socket.data.playerId);
  if (!voter || !voter.isAlive) {
    socket.emit('error', { message: '你不能投票' });
    return;
  }
  if (voter.role === 'idiot' && gs.idiotRevealed) {
    socket.emit('error', { message: '白痴翻牌后不能投票' });
    return;
  }
  
  gs.currentVotes[socket.data.playerId] = targetId;
  socket.emit('action:ok', { message: '投票成功' });
  
  // 检查是否所有人都投了票（只统计在线玩家）
  const votingPlayers = gs.players.filter(p => p.isAlive && !(p.role === 'idiot' && gs.idiotRevealed));
  const onlineVoters = votingPlayers.filter(p => room.players.find(rp => rp.id === p.id)?.isOnline);
  const votedCount = onlineVoters.filter(p => gs.currentVotes[p.id]).length;
  
  if (votedCount >= onlineVoters.length) {
    // 所有在线玩家都投完了，处理结果（离线玩家的投票由房主代操作）
    resolveVote(room);
  }
}

// 解决投票
function resolveVote(room) {
  const gs = room.gameState;
  if (!gs) return;
  
  const votes = gs.currentVotes;
  const voteCounts = {};
  Object.values(votes).forEach(targetId => {
    voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
  });
  
  const maxVotes = Math.max(...Object.values(voteCounts), 0);
  const topVoted = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);
  
  if (topVoted.length > 1) {
    // 平票，重新投票
    gs.currentVotes = {};
    gs.lastVoteResult = { tie: true };
    broadcastRoomUpdate(room);
    io.to(room.id).emit('vote:result', { tie: true, message: '平票，重新投票' });
    startVotePhase(room);
    return;
  }
  
  const eliminatedId = topVoted[0];
  const eliminated = gs.players.find(p => p.id === eliminatedId);
  if (!eliminated) return;
  
  // 检查白痴技能
  if (eliminated.role === 'idiot' && !gs.idiotRevealed) {
    gs.idiotRevealed = true;
    gs.gameLog.push({
      id: generateId(), round: gs.round, phase: 'day', timestamp: new Date().toISOString(),
      eventType: 'action', description: `${eliminated.name}(白痴)翻牌免死`,
    });
    gs.lastVoteResult = { eliminated: eliminated.name, survived: true, reason: '白痴翻牌' };
    broadcastRoomUpdate(room);
    io.to(room.id).emit('vote:result', { eliminated: eliminated.name, survived: true, reason: 'idiot' });
    
    // 进入下一夜
    gs.round++;
    setTimeout(() => {
      gs.phase = 'night';
      processNightPhase(room, 'werewolf');
    }, 1500);
    return;
  }
  
  // 处理出局
  eliminated.isAlive = false;
  gs.lastVoteResult = { eliminated: eliminated.name, role: ROLES[eliminated.role].name };
  gs.dayActions = [...(gs.dayActions || []), { round: gs.round, actionType: 'vote', votes, eliminatedId }];
  gs.gameLog.push({
    id: generateId(), round: gs.round, phase: 'day', timestamp: new Date().toISOString(),
    eventType: 'death', description: `${eliminated.name}(${ROLES[eliminated.role].name})被投票出局`, players: [eliminatedId],
  });
  
  broadcastRoomUpdate(room);
  io.to(room.id).emit('vote:result', { eliminated: eliminated.name, role: ROLES[eliminated.role].name });
  
  // 检查特殊技能
  setTimeout(() => {
    if (eliminated.role === 'hunter' && gs.hunterCanShoot) {
      gs.pendingHunterShoot = true;
      gs.hunterTarget = null;
      const hp = room.players.find(p => p.id === eliminated.id);
      if (hp?.isOnline) {
        sendPersonalEvent(hp.socketId, 'your:turn', { phase: 'hunter_shoot', description: '你被投票出局，可以开枪' });
      } else {
        room.pendingPassThrough.push({ playerId: eliminated.id, playerName: hp?.name, phase: 'hunter_shoot', role: 'hunter' });
      }
      broadcastRoomUpdate(room);
      return;
    }
    
    if (eliminated.role === 'wolfKing') {
      gs.pendingWolfKingShoot = true;
      gs.wolfKingTarget = null;
      const wp = room.players.find(p => p.id === eliminated.id);
      if (wp?.isOnline) {
        sendPersonalEvent(wp.socketId, 'your:turn', { phase: 'wolf_king_shoot', description: '你被投票出局，可以复仇' });
      } else {
        room.pendingPassThrough.push({ playerId: eliminated.id, playerName: wp?.name, phase: 'wolf_king_shoot', role: 'wolfKing' });
      }
      broadcastRoomUpdate(room);
      return;
    }
    
    // 正常进入下一夜
    proceedToNextRound(room);
  }, 1500);
}

// 猎人开枪
function handleHunterShoot(socket, data) {
  const { targetId } = data;
  const room = rooms.get(socket.data.roomId);
  const gs = room?.gameState;
  if (!room || !gs || !gs.pendingHunterShoot) {
    socket.emit('error', { message: '现在不能开枪' });
    return;
  }
  
  const hunter = gs.players.find(p => p.id === socket.data.playerId);
  if (!hunter || hunter.role !== 'hunter') {
    socket.emit('error', { message: '你不是猎人' });
    return;
  }
  
  const target = gs.players.find(p => p.id === targetId);
  if (!target) return;
  
  target.isAlive = false;
  gs.hunterCanShoot = false;
  gs.pendingHunterShoot = false;
  gs.hunterTarget = null;
  
  gs.gameLog.push({
    id: generateId(), round: gs.round, phase: 'day', timestamp: new Date().toISOString(),
    eventType: 'death', description: `猎人开枪带走了${target.name}(${ROLES[target.role].name})`, players: [targetId],
  });
  
  socket.emit('action:ok', { message: '开枪成功' });
  broadcastRoomUpdate(room);
  
  // 检查游戏结束
  const winner = checkGameEnd(room);
  if (winner) {
    endGame(room, winner);
  } else {
    proceedToNextRound(room);
  }
}

// 狼王开枪
function handleWolfKingShoot(socket, data) {
  const { targetId } = data;
  const room = rooms.get(socket.data.roomId);
  const gs = room?.gameState;
  if (!room || !gs || !gs.pendingWolfKingShoot) {
    socket.emit('error', { message: '现在不能开枪' });
    return;
  }
  
  const wk = gs.players.find(p => p.id === socket.data.playerId);
  if (!wk || wk.role !== 'wolfKing') {
    socket.emit('error', { message: '你不是狼王' });
    return;
  }
  
  const target = gs.players.find(p => p.id === targetId);
  if (!target) return;
  
  target.isAlive = false;
  gs.pendingWolfKingShoot = false;
  gs.wolfKingTarget = null;
  
  gs.gameLog.push({
    id: generateId(), round: gs.round, phase: 'day', timestamp: new Date().toISOString(),
    eventType: 'death', description: `狼王开枪带走了${target.name}(${ROLES[target.role].name})`, players: [targetId],
  });
  
  socket.emit('action:ok', { message: '开枪成功' });
  broadcastRoomUpdate(room);
  
  const winner = checkGameEnd(room);
  if (winner) {
    endGame(room, winner);
  } else {
    proceedToNextRound(room);
  }
}

// 跳过开枪
function handleSkipShoot(socket, data) {
  const { role } = data; // 'hunter' | 'wolfKing'
  const room = rooms.get(socket.data.roomId);
  const gs = room?.gameState;
  if (!room || !gs) return;
  
  if (role === 'hunter' && gs.pendingHunterShoot) {
    gs.pendingHunterShoot = false;
    gs.hunterTarget = null;
    gs.hunterCanShoot = false;
    gs.gameLog.push({
      id: generateId(), round: gs.round, phase: 'day', timestamp: new Date().toISOString(),
      eventType: 'action', description: '猎人放弃开枪',
    });
  } else if (role === 'wolfKing' && gs.pendingWolfKingShoot) {
    gs.pendingWolfKingShoot = false;
    gs.wolfKingTarget = null;
    gs.gameLog.push({
      id: generateId(), round: gs.round, phase: 'day', timestamp: new Date().toISOString(),
      eventType: 'action', description: '狼王放弃开枪',
    });
  }
  
  socket.emit('action:ok', { message: '已跳过' });
  broadcastRoomUpdate(room);
  
  const winner = checkGameEnd(room);
  if (winner) {
    endGame(room, winner);
  } else {
    proceedToNextRound(room);
  }
}

// 进入下一轮
function proceedToNextRound(room) {
  const gs = room.gameState;
  if (!gs) return;
  
  gs.round++;
  gs.phase = 'night';
  gs.nightPhase = 'werewolf';
  
  setTimeout(() => {
    processNightPhase(room, 'werewolf');
  }, 1000);
  
  broadcastRoomUpdate(room);
}

// 游戏结束
function endGame(room, winner) {
  const gs = room.gameState;
  if (!gs) return;
  
  gs.phase = 'result';
  gs.winner = winner;
  room.status = 'finished';
  
  gs.gameLog.push({
    id: generateId(), round: gs.round, phase: 'day', timestamp: new Date().toISOString(),
    eventType: 'result', description: winner === 'werewolf' ? '狼人阵营获胜' : '好人阵营获胜',
  });
  
  console.log(`[Server] Game over! Winner: ${winner}`);
  
  broadcastRoomUpdate(room);
  io.to(room.id).emit('game:over', { winner, fullReveal: gs.players.map(p => ({ id: p.id, name: p.name, role: p.role, isAlive: p.isAlive })) });
}

// ==================== 传设备模式（房主代操作）====================

// 房主代离线玩家提交行动
function handlePassThroughAction(socket, data) {
  const { playerId, action, actionData } = data;
  const room = rooms.get(socket.data.roomId);
  const gs = room?.gameState;
  if (!room || !gs) return;
  
  const hostPlayer = room.players.find(p => p.socketId === socket.id);
  if (!hostPlayer?.isHost) {
    socket.emit('error', { message: '只有房主可以代操作' });
    return;
  }
  
  // 从待处理队列中移除
  room.pendingPassThrough = room.pendingPassThrough.filter(pt => pt.playerId !== playerId);
  
  // 根据行动类型处理
  switch (action) {
    case 'werewolf_vote':
      // 代狼人投票 — 临时将 socket.data.playerId 设为目标玩家
      const originalPlayerId = socket.data.playerId;
      socket.data.playerId = playerId;
      handleWerewolfVote(socket, actionData);
      socket.data.playerId = originalPlayerId;
      break;
      
    case 'witch_action':
      socket.data.playerId = playerId;
      handleWitchAction(socket, actionData);
      socket.data.playerId = hostPlayer.id;
      break;
      
    case 'seer_check':
      socket.data.playerId = playerId;
      handleSeerCheck(socket, actionData);
      socket.data.playerId = hostPlayer.id;
      break;
      
    case 'vote':
      socket.data.playerId = playerId;
      handleVote(socket, actionData);
      socket.data.playerId = hostPlayer.id;
      break;
      
    case 'hunter_shoot':
      socket.data.playerId = playerId;
      handleHunterShoot(socket, actionData);
      socket.data.playerId = hostPlayer.id;
      break;
      
    case 'hunter_skip':
      socket.data.playerId = playerId;
      handleSkipShoot(socket, { role: 'hunter' });
      socket.data.playerId = hostPlayer.id;
      break;
      
    case 'wolf_king_shoot':
      socket.data.playerId = playerId;
      handleWolfKingShoot(socket, actionData);
      socket.data.playerId = hostPlayer.id;
      break;
      
    case 'wolf_king_skip':
      socket.data.playerId = playerId;
      handleSkipShoot(socket, { role: 'wolfKing' });
      socket.data.playerId = hostPlayer.id;
      break;
  }
  
  broadcastRoomUpdate(room);
}

// 断线处理
function handleDisconnect(socket) {
  const roomId = socket.data.roomId;
  const playerId = socket.data.playerId;
  
  console.log(`[Server] Client disconnected: ${socket.id}`);
  
  if (roomId && rooms.has(roomId)) {
    leaveRoom(socket);
  }
}

// ==================== 启动服务 ====================

io.on('connection', (socket) => {
  console.log(`[Server] Client connected: ${socket.id}`);
  
  // 房间管理
  socket.on('room:create', (data) => createRoom(socket, data));
  socket.on('room:join', (data) => joinRoom(socket, data));
  socket.on('room:leave', () => leaveRoom(socket));
  socket.on('player:ready', () => toggleReady(socket));
  
  // 游戏控制
  socket.on('game:start', () => startGame(socket));
  
  // 夜晚行动
  socket.on('night:wolf_vote', (data) => handleWerewolfVote(socket, data));
  socket.on('night:witch_use', (data) => handleWitchAction(socket, data));
  socket.on('night:seer_check', (data) => handleSeerCheck(socket, data));
  
  // 白天行动
  socket.on('day:speech_next', () => handleSpeechNext(socket));
  socket.on('day:vote', (data) => handleVote(socket, data));
  
  // 特殊技能
  socket.on('skill:hunter_shoot', (data) => handleHunterShoot(socket, data));
  socket.on('skill:hunter_skip', () => handleSkipShoot(socket, { role: 'hunter' }));
  socket.on('skill:wolf_king_shoot', (data) => handleWolfKingShoot(socket, data));
  socket.on('skill:wolf_king_skip', () => handleSkipShoot(socket, { role: 'wolfKing' }));
  
  // 传设备模式（房主代操作）
  socket.on('pass_through:action', (data) => handlePassThroughAction(socket, data));
  
  // 断线
  socket.on('disconnect', () => handleDisconnect(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('========================================');
  console.log('  狼人杀多人游戏服务端已启动');
  console.log(`  本地访问: http://localhost:${PORT}`);
  console.log(`  局域网访问: http://<你的IP地址>:${PORT}`);
  console.log('========================================');
  console.log('');
});
