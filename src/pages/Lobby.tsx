import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Plus, LogIn, Wifi, Settings, ArrowLeft } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { useSocket } from '../hooks/useSocket';

export const Lobby: React.FC = () => {
  const navigate = useNavigate();
  const socket = useSocket({ autoConnect: true });
  
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [roomName, setRoomName] = useState('');
  const [hostName, setHostName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');

  // 监听房间创建/加入成功
  React.useEffect(() => {
    if (socket.viewState?.type === 'lobby' || socket.viewState?.type === 'game') {
      navigate('/multiplayer/waiting');
    }
  }, [socket.viewState, navigate]);

  // 监听错误
  React.useEffect(() => {
    if (socket.error) {
      alert(socket.error);
      socket.clearError();
    }
  }, [socket.error, socket.clearError]);

  const handleCreate = () => {
    if (!hostName.trim()) return;
    socket.createRoom({
      name: roomName.trim() || undefined,
      hostName: hostName.trim(),
    });
  };

  const handleJoin = () => {
    if (!roomId.trim() || !playerName.trim()) return;
    socket.joinRoom(roomId.trim(), playerName.trim());
  };

  return (
    <div className="min-h-screen bg-gray-900 px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> 返回
          </Button>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Wifi className={`w-4 h-4 ${socket.isConnected ? 'text-green-400' : 'text-red-400'}`} />
            {socket.isConnected ? '已连接' : '未连接'}
          </div>
        </div>

        {/* 标题 */}
        <div className="text-center mb-8">
          <Users className="w-12 h-12 text-purple-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-100">多人游戏</h1>
          <p className="text-sm text-gray-400 mt-2">同一局域网下，多人在线联机</p>
        </div>

        {/* 主菜单 */}
        {mode === 'menu' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card variant="bordered" className="mb-4">
              <div className="space-y-3">
                <Button 
                  variant="primary" 
                  size="lg" 
                  className="w-full"
                  onClick={() => setMode('create')}
                >
                  <Plus className="w-5 h-5 mr-2" />
                  创建房间（我是房主）
                </Button>
                <Button 
                  variant="secondary" 
                  size="lg" 
                  className="w-full"
                  onClick={() => setMode('join')}
                >
                  <LogIn className="w-5 h-5 mr-2" />
                  加入房间
                </Button>
              </div>
            </Card>

            {/* 使用说明 */}
            <Card variant="bordered">
              <div className="flex items-start gap-3">
                <Settings className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-gray-400 space-y-1">
                  <p>1. 房主先启动服务端（server 目录）</p>
                  <p>2. 确保所有人在同一 WiFi 下</p>
                  <p>3. 房主创建房间，其他人输入房间号加入</p>
                  <p>4. 有手机的人用自己设备操作</p>
                  <p>5. 没手机的人由房主传设备操作</p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* 创建房间 */}
        {mode === 'create' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card variant="bordered">
              <h2 className="text-lg font-bold text-gray-100 mb-4">创建房间</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">你的昵称（房主）</label>
                  <input
                    type="text"
                    value={hostName}
                    onChange={e => setHostName(e.target.value)}
                    placeholder="输入昵称"
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                    maxLength={10}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">房间名称（可选）</label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={e => setRoomName(e.target.value)}
                    placeholder="给房间起个名字"
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                    maxLength={20}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setMode('menu')} className="flex-1">返回</Button>
                  <Button 
                    variant="primary" 
                    onClick={handleCreate} 
                    disabled={!hostName.trim() || !socket.isConnected}
                    className="flex-1"
                  >
                    创建并进入
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* 加入房间 */}
        {mode === 'join' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card variant="bordered">
              <h2 className="text-lg font-bold text-gray-100 mb-4">加入房间</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">房间号</label>
                  <input
                    type="text"
                    value={roomId}
                    onChange={e => setRoomId(e.target.value.toUpperCase())}
                    placeholder="输入房主提供的房间号"
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:border-purple-500 focus:outline-none uppercase font-mono tracking-wider"
                    maxLength={16}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">你的昵称</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={e => setPlayerName(e.target.value)}
                    placeholder="输入昵称"
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                    maxLength={10}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setMode('menu')} className="flex-1">返回</Button>
                  <Button 
                    variant="primary" 
                    onClick={handleJoin} 
                    disabled={!roomId.trim() || !playerName.trim() || !socket.isConnected}
                    className="flex-1"
                  >
                    加入房间
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};
