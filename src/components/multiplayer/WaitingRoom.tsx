import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Crown, CheckCircle, Circle, Play, ArrowLeft, Wifi, WifiOff } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { useSocket } from '../../hooks/useSocket';

export const WaitingRoom: React.FC = () => {
  const navigate = useNavigate();
  const socket = useSocket({ autoConnect: true });

  const state = socket.viewState;
  const isHost = state?.isMyRoomHost;
  const players = state?.players || [];
  const roomStatus = state?.status;

  // 游戏开始后跳转到多人游戏页面
  React.useEffect(() => {
    if (state?.type === 'game') {
      navigate('/multiplayer/game');
    }
    if (state?.type === 'result') {
      navigate('/multiplayer/result');
    }
  }, [state?.type, state?.phase, navigate]);

  // 房间关闭
  React.useEffect(() => {
    // 监听房间关闭事件
    socket.socket?.on('room:closed', () => {
      alert('房主已关闭房间');
      socket.leaveRoom();
      navigate('/multiplayer/lobby');
    });
  }, [socket, navigate]);

  const handleReady = () => {
    socket.toggleReady();
  };

  const handleStartGame = () => {
    if (players.length < 4) {
      alert('至少需要4名玩家才能开始游戏');
      return;
    }
    
    const allOnlineReady = players.filter(p => p.isOnline).every(p => p.isReady);
    if (!allOnlineReady) {
      alert('还有玩家未准备就绪');
      return;
    }
    
    socket.startGame();
  };

  const handleLeave = () => {
    if (confirm('确定离开房间？')) {
      socket.leaveRoom();
      navigate('/multiplayer/lobby');
    }
  };

  const canStart = players.length >= 4 && 
    players.filter(p => p.isOnline).length >= 2 &&
    players.filter(p => p.isOnline).every(p => p.isReady);

  return (
    <div className="min-h-screen bg-gray-900 px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" size="sm" onClick={handleLeave}>
            <ArrowLeft className="w-4 h-4 mr-1" /> 离开
          </Button>
          <div className="flex items-center gap-2">
            <Wifi className={`w-4 h-4 ${socket.isConnected ? 'text-green-400' : 'text-red-400'}`} />
            <span className="text-xs text-gray-400">{socket.isConnected ? '已连接' : '断开'}</span>
          </div>
        </div>

        {/* 房间信息 */}
        <Card variant="bordered" className="mb-4">
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-100 mb-1">{state?.roomName || '狼人杀游戏'}</h2>
            <div className="text-sm text-gray-400">
              房间号：<span className="font-mono text-purple-400">{state?.roomId}</span>
            </div>
            <div className="flex items-center justify-center gap-3 mt-2 text-xs text-gray-500">
              <span>{players.length} / {state?.config?.playerCount || '?'} 人</span>
              <span>{roomStatus === 'waiting' ? '等待中' : roomStatus === 'playing' ? '游戏中' : '已结束'}</span>
            </div>
          </div>
        </Card>

        {/* 玩家列表 */}
        <Card variant="bordered" className="mb-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> 玩家列表
          </h3>
          
          <div className="space-y-2">
            {players.map((p: any) => (
              <div 
                key={p.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  p.id === state?.myPlayerId ? 'bg-purple-900/30 border border-purple-700/50' : 'bg-gray-800/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {p.isHost && <Crown className="w-4 h-4 text-yellow-400" />}
                  <span className={`font-medium ${p.id === state?.myPlayerId ? 'text-purple-300' : 'text-gray-200'}`}>
                    {p.name}
                    {p.id === state?.myPlayerId && <span className="text-xs text-gray-500 ml-1">(你)</span>}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* 在线状态 */}
                  {p.isOnline ? (
                    <Wifi className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-red-400" />
                  )}
                  
                  {/* 准备状态 */}
                  {p.isReady ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : (
                    <Circle className="w-4 h-4 text-gray-500" />
                  )}
                  
                  {/* 房主标记 */}
                  {p.isHost && (
                    <span className="text-xs text-yellow-400 bg-yellow-900/30 px-1.5 py-0.5 rounded">房主</span>
                  )}
                </div>
              </div>
            ))}
            
            {/* 空位提示 */}
            {Array.from({ length: ((state?.config?.playerCount || 8) - players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/20 border border-dashed border-gray-700">
                <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-500">?</div>
                <span className="text-sm text-gray-500">等待加入...</span>
              </div>
            ))}
          </div>
        </Card>

        {/* 操作按钮 */}
        {isHost ? (
          <Button
            variant="primary"
            size="lg"
            onClick={handleStartGame}
            disabled={!canStart}
            className="w-full"
          >
            <Play className="w-5 h-5 mr-2" />
            开始游戏
            {!canStart && players.length >= 2 && !players.filter(p => p.isOnline).every(p => p.isReady) && (
              <span className="ml-2 text-xs opacity-70">（等待所有人准备）</span>
            )}
          </Button>
        ) : (
          <Button
            variant={players.find((p: any) => p.id === state?.myPlayerId)?.isReady ? 'ghost' : 'primary'}
            size="lg"
            onClick={handleReady}
            className="w-full"
          >
            {players.find((p: any) => p.id === state?.myPlayerId)?.isReady ? (
              <>取消准备</>
            ) : (
              <><CheckCircle className="w-5 h-5 mr-2" /> 准备就绪</>
            )}
          </Button>
        )}

        {!canStart && players.length < 4 && (
          <p className="text-center text-xs text-gray-500 mt-2">至少需要 4 名玩家才能开始</p>
        )}
      </motion.div>
    </div>
  );
};
