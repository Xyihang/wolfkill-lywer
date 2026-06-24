import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// 服务端事件类型（简化版）
interface ServerToClientEvents {
  'state:update': (state: any) => void;
  'room:created': (data: any) => void;
  'room:joined': (data: any) => void;
  'player:joined': (data: any) => void;
  'player:left': (data: any) => void;
  'player:ready': (data: any) => void;
  'room:closed': (data: any) => void;
  'error': (data: { message: string }) => void;
  'phase:change': (data: any) => void;
  'your:turn': (data: any) => void;
  'role:reveal': (data: { role: string; roleName: string }) => void;
  'seer:result': (data: { targetName: string; isWerewolf: boolean }) => void;
  'wolf_vote_update': (data: any) => void;
  'vote:result': (data: any) => void;
  'action:ok': (data: { message: string }) => void;
  'game:over': (data: any) => void;
  'pass_through_required': (data: any) => void;
  'speaker:change': (data: any) => void;
}

// 客户端事件类型（简化版）
interface ClientToServerEvents {
  'room:create': (data: { name?: string; hostName?: string; config?: any }) => void;
  'room:join': (data: { roomId: string; playerName: string }) => void;
  'room:leave': () => void;
  'player:ready': () => void;
  'game:start': () => void;
  'night:wolf_vote': (data: { targetId: string }) => void;
  'night:witch_use': (data: { type: 'antidote' | 'poison'; targetId?: string }) => void;
  'night:seer_check': (data: { targetId: string }) => void;
  'day:speech_next': () => void;
  'day:vote': (data: { targetId: string }) => void;
  'skill:hunter_shoot': (data: { targetId: string }) => void;
  'skill:hunter_skip': () => void;
  'skill:wolf_king_shoot': (data: { targetId: string }) => void;
  'skill:wolf_king_skip': () => void;
  'pass_through:action': (data: { playerId: string; action: string; actionData?: any }) => void;
}

export type { ServerToClientEvents, ClientToServerEvents };

interface UseSocketOptions {
  serverUrl?: string;
  autoConnect?: boolean;
}

interface UseSocketReturn {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  isConnected: boolean;
  viewState: any; // 当前视图状态（隐私过滤后的）
  myTurnInfo: any | null; // 轮到我的行动信息
  roleInfo: { role: string; roleName: string } | null;
  seerResult: { targetName: string; isWerewolf: boolean } | null;
  passThroughRequired: any[]; // 需要传设备的玩家列表
  error: string | null;
  
  // 房间操作
  createRoom: (data: { name?: string; hostName?: string; config?: any }) => void;
  joinRoom: (roomId: string, playerName: string) => void;
  leaveRoom: () => void;
  toggleReady: () => void;
  startGame: () => void;
  
  // 游戏动作
  werewolfVote: (targetId: string) => void;
  witchUse: (type: 'antidote' | 'poison', targetId?: string) => void;
  seerCheck: (targetId: string) => void;
  speechNext: () => void;
  vote: (targetId: string) => void;
  hunterShoot: (targetId: string) => void;
  hunterSkip: () => void;
  wolfKingShoot: (targetId: string) => void;
  wolfKingSkip: () => void;
  
  // 传设备模式（房主代操作）
  passThroughAction: (playerId: string, action: string, actionData?: any) => void;
  
  // 清除临时状态
  clearMyTurn: () => void;
  clearSeerResult: () => void;
  clearError: () => void;
}

export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const { serverUrl = window.location.origin, autoConnect = false } = options;
  
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [viewState, setViewState] = useState<any>(null);
  const [myTurnInfo, setMyTurnInfo] = useState<any>(null);
  const [roleInfo, setRoleInfo] = useState<{ role: string; roleName: string } | null>(null);
  const [seerResult, setSeerResult] = useState<{ targetName: string; isWerewolf: boolean } | null>(null);
  const [passThroughRequired, setPassThroughRequired] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 初始化连接
  useEffect(() => {
    const socket = io(serverUrl, {
      autoConnect,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      setIsConnected(false);
    });

    // 状态更新（核心！每次收到服务端推送都更新）
    socket.on('state:update', (state) => {
      console.log('[Socket] State updated, phase:', state?.phase);
      setViewState(state);
    });

    // 个人通知：轮到你行动
    socket.on('your:turn', (data) => {
      console.log('[Socket] Your turn:', data);
      setMyTurnInfo(data);
    });

    // 角色揭示（私密发送）
    socket.on('role:reveal', (data) => {
      console.log('[Socket] Role revealed:', data);
      setRoleInfo(data);
    });

    // 预言家查验结果
    socket.on('seer:result', (data) => {
      console.log('[Socket] Seer result:', data);
      setSeerResult(data);
    });

    // 传设备请求（仅房主）
    socket.on('pass_through_required', (data) => {
      console.log('[Socket] Pass through required:', data);
      setPassThroughRequired(prev => [...prev, data]);
    });

    // 错误处理
    socket.on('error', (data) => {
      console.error('[Socket] Error:', data.message);
      setError(data.message);
    });

    return () => {
      socket.disconnect();
    };
  }, [serverUrl, autoConnect]);

  // 手动连接
  const connect = useCallback(() => {
    socketRef.current?.connect();
  }, []);

  // ====== 房间操作 ======
  const createRoom = useCallback((data: { name?: string; hostName?: string; config?: any }) => {
    socketRef.current?.emit('room:create', data);
  }, []);

  const joinRoom = useCallback((roomId: string, playerName: string) => {
    setError(null);
    socketRef.current?.emit('room:join', { roomId, playerName });
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('room:leave');
    setViewState(null);
    setMyTurnInfo(null);
    setRoleInfo(null);
    setSeerResult(null);
    setPassThroughRequired([]);
  }, []);

  const toggleReady = useCallback(() => {
    socketRef.current?.emit('player:ready');
  }, []);

  const startGame = useCallback(() => {
    socketRef.current?.emit('game:start');
  }, []);

  // ====== 夜晚行动 ======
  const werewolfVote = useCallback((targetId: string) => {
    socketRef.current?.emit('night:wolf_vote', { targetId });
  }, []);

  const witchUse = useCallback((type: 'antidote' | 'poison', targetId?: string) => {
    socketRef.current?.emit('night:witch_use', { type, targetId });
  }, []);

  const seerCheck = useCallback((targetId: string) => {
    socketRef.current?.emit('night:seer_check', { targetId });
  }, []);

  // ====== 白天行动 ======
  const speechNext = useCallback(() => {
    socketRef.current?.emit('day:speech_next');
  }, []);

  const vote = useCallback((targetId: string) => {
    socketRef.current?.emit('day:vote', { targetId });
  }, []);

  // ====== 特殊技能 ======
  const hunterShoot = useCallback((targetId: string) => {
    socketRef.current?.emit('skill:hunter_shoot', { targetId });
  }, []);

  const hunterSkip = useCallback(() => {
    socketRef.current?.emit('skill:hunter_skip');
  }, []);

  const wolfKingShoot = useCallback((targetId: string) => {
    socketRef.current?.emit('skill:wolf_king_shoot', { targetId });
  }, []);

  const wolfKingSkip = useCallback(() => {
    socketRef.current?.emit('skill:wolf_king_skip');
  }, []);

  // ====== 传设备模式 ======
  const passThroughAction = useCallback((playerId: string, action: string, actionData?: any) => {
    socketRef.current?.emit('pass_through:action', { playerId, action, actionData });
    // 从待处理列表中移除
    setPassThroughRequired(prev => prev.filter(pt => pt.playerId !== playerId));
  }, []);

  // ====== 清除临时状态 ======
  const clearMyTurn = useCallback(() => setMyTurnInfo(null), []);
  const clearSeerResult = useCallback(() => setSeerResult(null), []);
  const clearError = useCallback(() => setError(null), []);

  return {
    socket: socketRef.current,
    isConnected,
    viewState,
    myTurnInfo,
    roleInfo,
    seerResult,
    passThroughRequired,
    error,
    
    createRoom,
    joinRoom,
    leaveRoom,
    toggleReady,
    startGame,
    
    werewolfVote,
    witchUse,
    seerCheck,
    speechNext,
    vote,
    hunterShoot,
    hunterSkip,
    wolfKingShoot,
    wolfKingSkip,
    
    passThroughAction,
    
    clearMyTurn,
    clearSeerResult,
    clearError,
  };
}
