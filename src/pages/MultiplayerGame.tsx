import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Moon, Sun, Users, Target, Shield, Skull, Crown, Eye,
  FlaskConical, ArrowLeft, Wifi, WifiOff, Hourglass
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { PlayerList } from '../components/game/PlayerCard';
import { RoleReveal } from '../components/role/RoleReveal';
import { useSocket } from '../hooks/useSocket';
import { ROLES } from '../data/roles';

export const MultiplayerGame: React.FC = () => {
  const navigate = useNavigate();
  const socket = useSocket({ autoConnect: true });
  
  const state = socket.viewState;
  const myTurnInfo = socket.myTurnInfo;
  const roleInfo = socket.roleInfo;
  const seerResult = socket.seerResult;
  const passThroughRequired = socket.passThroughRequired;
  const isHost = state?.isMyRoomHost;

  // 本地 UI 状态
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [witchChoice, setWitchChoice] = useState<'antidote' | 'poison' | 'none' | null>(null);
  const [showRoleConfirm, setShowRoleConfirm] = useState(false);

  // 游戏结束时跳转结果页
  useEffect(() => {
    if (state?.type === 'result' || state?.phase === 'result') {
      // 延迟一点让玩家看到结果
      const timer = setTimeout(() => navigate('/multiplayer/result'), 2000);
      return () => clearTimeout(timer);
    }
  }, [state?.type, state?.phase, navigate]);

  // 如果还没进入游戏状态，显示等待
  if (!state || state.type === 'lobby') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Hourglass className="w-12 h-12 text-purple-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-300">等待游戏开始...</p>
        </div>
      </div>
    );
  }

  const phase = state.phase;
  const round = state.round || 1;
  const players = state.players || [];
  const myPlayerId = state.myPlayerId;
  const myRole = state.myRole;
  const myIsAlive = state.myIsAlive !== false;
  const alivePlayers = players.filter((p: any) => p.isAlive);

  // 获取当前玩家的信息
  const me = players.find((p: any) => p.id === myPlayerId);

  // ========== 处理行动提交 ==========

  // 狼人投票击杀
  const handleWerewolfVote = () => {
    if (!selectedTarget) return;
    socket.werewolfVote(selectedTarget);
    setSelectedTarget(null);
    socket.clearMyTurn();
  };

  // 女巫使用药水
  const handleWitchAction = () => {
    if (!selectedTarget && witchChoice !== 'none') return;
    
    if (witchChoice === 'antidote' && selectedTarget) {
      socket.witchUse('antidote', selectedTarget);
    } else if (witchChoice === 'poison' && selectedTarget) {
      socket.witchUse('poison', selectedTarget);
    } else if (witchChoice === 'none') {
      socket.witchUse('antidote'); // 不使用
    }
    
    setWitchChoice(null);
    setSelectedTarget(null);
    socket.clearMyTurn();
  };

  // 预言家查验
  const handleSeerCheck = () => {
    if (!selectedTarget) return;
    socket.seerCheck(selectedTarget);
    setSelectedTarget(null);
    // 等待服务端返回查验结果（通过 seerResult）
  };

  // 确认预言家结果并继续
  const handleSeerConfirm = () => {
    socket.clearSeerResult();
    socket.clearMyTurn();
  };

  // 投票
  const handleVote = () => {
    if (!selectedTarget) return;
    socket.vote(selectedTarget);
    setSelectedTarget(null);
    socket.clearMyTurn();
  };

  // 发言下一位
  const handleSpeechNext = () => {
    socket.speechNext();
  };

  // 猎人开枪
  const handleHunterShoot = () => {
    if (!selectedTarget) return;
    socket.hunterShoot(selectedTarget);
    setSelectedTarget(null);
    socket.clearMyTurn();
  };

  // 猎人放弃
  const handleHunterSkip = () => {
    socket.hunterSkip();
    socket.clearMyTurn();
  };

  // 狼王开枪
  const handleWolfKingShoot = () => {
    if (!selectedTarget) return;
    socket.wolfKingShoot(selectedTarget);
    setSelectedTarget(null);
    socket.clearMyTurn();
  };

  // 狼王放弃
  const handleWolfKingSkip = () => {
    socket.wolfKingSkip();
    socket.clearMyTurn();
  };

  // 房主代离线玩家操作
  const handlePassThroughAction = (pt: any) => {
    // 根据角色和阶段选择操作
    if (pt.role === 'werewolf' || pt.role === 'wolfKing') {
      if (selectedTarget) {
        socket.passThroughAction(pt.playerId, 'werewolf_vote', { targetId: selectedTarget });
        setSelectedTarget(null);
      }
    } else if (pt.role === 'witch') {
      if (witchChoice === 'antidote' && selectedTarget) {
        socket.passThroughAction(pt.playerId, 'witch_action', { type: 'antidote', targetId: selectedTarget });
      } else if (witchChoice === 'poison' && selectedTarget) {
        socket.passThroughAction(pt.playerId, 'witch_action', { type: 'poison', targetId: selectedTarget });
      }
      setWitchChoice(null);
      setSelectedTarget(null);
    } else if (pt.role === 'seer') {
      if (selectedTarget) {
        socket.passThroughAction(pt.playerId, 'seer_check', { targetId: selectedTarget });
        setSelectedTarget(null);
      }
    } else if (pt.phase === 'vote') {
      if (selectedTarget) {
        socket.passThroughAction(pt.playerId, 'vote', { targetId: selectedTarget });
        setSelectedTarget(null);
      }
    } else if (pt.phase === 'hunter_shoot') {
      if (selectedTarget) {
        socket.passThroughAction(pt.playerId, 'hunter_shoot', { targetId: selectedTarget });
        setSelectedTarget(null);
      }
    } else if (pt.phase === 'wolf_king_shoot') {
      if (selectedTarget) {
        socket.passThroughAction(pt.playerId, 'wolf_king_shoot', { targetId: selectedTarget });
        setSelectedTarget(null);
      }
    }
  };

  // ===================== RENDER =====================

  // ===== 夜晚阶段 =====
  if (phase === 'night') {
    return (
      <div className="min-h-screen bg-gray-900 px-4 py-8">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6 max-w-md mx-auto">
          <span className="text-sm text-gray-500">第 {round} 夜</span>
          <div className="flex items-center gap-2">
            <Wifi className={`w-3.5 h-3.5 ${socket.isConnected ? 'text-green-400' : 'text-red-400'}`} />
            <span className="text-xs text-gray-500">{myRole ? `${ROLES[myRole]?.name}` : ''}</span>
          </div>
        </div>

        {/* 角色确认弹窗（游戏开始时首次显示） */}
        {roleInfo && showRoleConfirm && (
          <RoleReveal
            player={{ id: myPlayerId || '', name: me?.name || '', role: roleInfo.role as any, isAlive: true, hasUsedAbility: false, seatNumber: me?.seatNumber || 0 }}
            onComplete={() => setShowRoleConfirm(false)}
            antiPeekMode={true}
          />
        )}

        {/* 轮到我的行动界面 */}
        {myTurnInfo && myIsAlive && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto">
            <Card variant="bordered" className="mb-4 border-purple-700/50 bg-purple-950/20">
              <div className="text-center mb-4">
                <Moon className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <div className="text-lg font-bold text-gray-100">轮到你行动了</div>
                <div className="text-sm text-gray-400">{me?.name} · {ROLES[myRole || 'villager']?.name}</div>
              </div>

              {/* 狼人击杀 */}
              {(myTurnInfo.phase === 'werewolf' || myTurnInfo.availableActions?.type === 'kill') && 
               (myRole === 'werewolf' || myRole === 'wolfKing') && (
                <div>
                  <p className="text-sm text-gray-400 text-center mb-3">选择要击杀的目标</p>
                  <PlayerList
                    players={alivePlayers.filter((p: any) => p.id !== myPlayerId)}
                    onSelect={(p) => setSelectedTarget(p.id)}
                    selectedId={selectedTarget}
                    layout="grid"
                  />
                  {selectedTarget && (
                    <Button variant="primary" onClick={handleWerewolfVote} className="w-full mt-4">
                      确认击杀
                    </Button>
                  )}
                </div>
              )}

              {/* 女巫行动 */}
              {(myTurnInfo.phase === 'witch' || myTurnInfo.availableActions?.type === 'witch_action') && 
               myRole === 'witch' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400 text-center">女巫行动选择</p>
                  
                  {state.werewolfKillTarget && (
                    <div className="p-2 bg-red-900/20 rounded-lg border border-red-700/50 text-center">
                      <span className="text-xs text-red-400">今晚被杀：</span>
                      <span className="text-sm text-red-300 ml-1">{state.werewolfKillTarget}</span>
                    </div>
                  )}

                  {state.witchHasAntidote && (
                    <div className="p-2 bg-green-900/20 rounded-lg border border-green-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <FlaskConical className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-green-400">解药</span>
                      </div>
                      <PlayerList
                        players={alivePlayers}
                        onSelect={(p) => { setWitchChoice('antidote'); setSelectedTarget(p.id); }}
                        selectedId={witchChoice === 'antidote' ? selectedTarget : undefined}
                        layout="grid"
                      />
                    </div>
                  )}

                  {state.witchHasPoison && (
                    <div className="p-2 bg-red-900/20 rounded-lg border border-red-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <FlaskConical className="w-4 h-4 text-red-400" />
                        <span className="text-sm text-red-400">毒药</span>
                      </div>
                      <PlayerList
                        players={alivePlayers.filter((p: any) => p.id !== myPlayerId)}
                        onSelect={(p) => { setWitchChoice('poison'); setSelectedTarget(p.id); }}
                        selectedId={witchChoice === 'poison' ? selectedTarget : undefined}
                        layout="grid"
                      />
                    </div>
                  )}

                  <Button variant="ghost" onClick={() => { setWitchChoice('none'); handleWitchAction(); }} className="w-full">
                    不使用技能
                  </Button>

                  {witchChoice && witchChoice !== 'none' && selectedTarget && (
                    <Button variant="primary" onClick={handleWitchAction} className="w-full">
                      确认行动
                    </Button>
                  )}
                </div>
              )}

              {/* 预言家查验 */}
              {(myTurnInfo.phase === 'seer' || myTurnInfo.availableActions?.type === 'check') && 
               myRole === 'seer' && !seerResult && (
                <div>
                  <p className="text-sm text-gray-400 text-center mb-3">选择要查验的玩家</p>
                  <PlayerList
                    players={alivePlayers.filter((p: any) => p.id !== myPlayerId)}
                    onSelect={(p) => setSelectedTarget(p.id)}
                    selectedId={selectedTarget}
                    layout="grid"
                  />
                  {selectedTarget && (
                    <Button variant="primary" onClick={handleSeerCheck} className="w-full mt-4">
                      确认查验
                    </Button>
                  )}
                </div>
              )}

              {/* 预言家查验结果 */}
              {seerResult && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className="p-4 rounded-lg border text-center"
                  style={{
                    backgroundColor: seerResult.isWerewolf ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                    borderColor: seerResult.isWerewolf ? 'rgba(239,68,68,0.5)' : 'rgba(59,130,246,0.5)'
                  }}>
                  <Eye className={`w-8 h-8 mb-2 mx-auto ${seerResult.isWerewolf ? 'text-red-400' : 'text-blue-400'}`} />
                  <div className="text-lg mb-1">{seerResult.targetName}</div>
                  <div className={`text-xl font-bold ${seerResult.isWerewolf ? 'text-red-400' : 'text-blue-400'}`}>
                    {seerResult.isWerewolf ? '狼人' : '好人'}
                  </div>
                  <Button variant="primary" onClick={handleSeerConfirm} className="w-full mt-4">
                    我已记住，继续
                  </Button>
                </motion.div>
              )}

              {/* 猎人开枪 */}
              {myTurnInfo.phase === 'hunter_shoot' && (
                <div>
                  <p className="text-sm text-gray-400 text-center mb-3">你已死亡，可以开枪带走一人</p>
                  <PlayerList
                    players={alivePlayers.filter((p: any) => p.id !== myPlayerId)}
                    onSelect={(p) => setSelectedTarget(p.id)}
                    selectedId={selectedTarget}
                    layout="grid"
                  />
                  <div className="flex gap-2 mt-4">
                    <Button variant="ghost" onClick={handleHunterSkip} className="flex-1">放弃开枪</Button>
                    {selectedTarget && <Button variant="primary" onClick={handleHunterShoot} className="flex-1">开枪</Button>}
                  </div>
                </div>
              )}

              {/* 狼王复仇 */}
              {myTurnInfo.phase === 'wolf_king_shoot' && (
                <div>
                  <p className="text-sm text-gray-400 text-center mb-3">你已死亡，可以开枪复仇</p>
                  <PlayerList
                    players={alivePlayers.filter((p: any) => p.id !== myPlayerId)}
                    onSelect={(p) => setSelectedTarget(p.id)}
                    selectedId={selectedTarget}
                    layout="grid"
                  />
                  <div className="flex gap-2 mt-4">
                    <Button variant="ghost" onClick={handleWolfKingSkip} className="flex-1">放弃开枪</Button>
                    {selectedTarget && <Button variant="primary" onClick={handleWolfKingShoot} className="flex-1">开枪</Button>}
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {/* 等待其他人行动 */}
        {!myTurnInfo && (
          <div className="max-w-md mx-auto">
            <Card variant="bordered">
              <div className="text-center py-8">
                <Moon className="w-12 h-12 text-purple-400 mb-4 mx-auto animate-pulse" />
                <div className="text-xl font-bold text-gray-100 mb-2">第 {round} 夜</div>
                <div className="text-sm text-gray-400">
                  {state.nightPhase === 'werewolf' ? '狼人行动中...' :
                   state.nightPhase === 'witch' ? '女巫行动中...' :
                   state.nightPhase === 'seer' ? '预言家行动中...' :
                   '夜晚进行中...'}
                </div>
                {myIsAlive && (
                  <p className="text-xs text-gray-500 mt-2">请闭眼等待</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* 房主：传设备提示（混合模式） */}
        {isHost && passThroughRequired.length > 0 && (
          <div className="max-w-md mx-auto mt-4 space-y-2">
            {passThroughRequired.map((pt: any, idx: number) => (
              <Card key={`${pt.playerId}-${idx}`} variant="bordered" className="border-yellow-700/50 bg-yellow-950/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <WifiOff className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm text-gray-200">{pt.playerName} 需要传设备</span>
                    <span className="text-xs text-gray-500">({ROLES[pt.role]?.name})</span>
                  </div>
                </div>
                
                {/* 代操作UI */}
                <div className="mt-3">
                  {(pt.role === 'werewolf' || pt.role === 'wolfKing') && (
                    <div>
                      <p className="text-xs text-gray-400 mb-2">代{pt.playerName}(狼人)选择击杀目标:</p>
                      <PlayerList
                        players={alivePlayers.filter((p: any) => p.id !== pt.playerId)}
                        onSelect={(p) => setSelectedTarget(p.id)}
                        selectedId={selectedTarget}
                        layout="grid"
                      />
                      {selectedTarget && (
                        <Button size="sm" onClick={() => handlePassThroughAction(pt)} className="w-full mt-2">
                          代为击杀
                        </Button>
                      )}
                    </div>
                  )}

                  {pt.role === 'witch' && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400">代{pt.playerName}(女巫)行动:</p>
                      <div className="flex gap-1 flex-wrap">
                        <button
                          onClick={() => { setWitchChoice('antidote'); setSelectedTarget(null); }}
                          className={`px-2 py-1 text-xs rounded ${witchChoice === 'antidote' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                        >
                          解药
                        </button>
                        <button
                          onClick={() => { setWitchChoice('poison'); setSelectedTarget(null); }}
                          className={`px-2 py-1 text-xs rounded ${witchChoice === 'poison' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                        >
                          毒药
                        </button>
                      </div>
                      {(witchChoice === 'antidote' || witchChoice === 'poison') && (
                        <>
                          <PlayerList
                            players={witchChoice === 'antidote' ? alivePlayers : alivePlayers.filter((p: any) => p.id !== pt.playerId)}
                            onSelect={(p) => setSelectedTarget(p.id)}
                            selectedId={selectedTarget}
                            layout="grid"
                          />
                          {selectedTarget && (
                            <Button size="sm" onClick={() => handlePassThroughAction(pt)} className="w-full mt-2">
                              代为使用{witchChoice === 'antidote' ? '解药' : '毒药'}
                            </Button>
                          )}
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => socket.passThroughAction(pt.playerId, 'witch_action', { type: 'none' })} className="w-full mt-1">
                        代为跳过
                      </Button>
                    </div>
                  )}

                  {pt.role === 'seer' && (
                    <div>
                      <p className="text-xs text-gray-400 mb-2">代{pt.playerName}(预言家)选择查验对象:</p>
                      <PlayerList
                        players={alivePlayers.filter((p: any) => p.id !== pt.playerId)}
                        onSelect={(p) => setSelectedTarget(p.id)}
                        selectedId={selectedTarget}
                        layout="grid"
                      />
                      {selectedTarget && (
                        <Button size="sm" onClick={() => handlePassThroughAction(pt)} className="w-full mt-2">
                          代为查验
                        </Button>
                      )}
                    </div>
                  )}

                  {pt.phase === 'vote' && (
                    <div>
                      <p className="text-xs text-gray-400 mb-2">代{pt.playerName}投票:</p>
                      <PlayerList
                        players={alivePlayers.filter((p: any) => p.id !== pt.playerId)}
                        onSelect={(p) => setSelectedTarget(p.id)}
                        selectedId={selectedTarget}
                        layout="grid"
                      />
                      {selectedTarget && (
                        <Button size="sm" onClick={() => handlePassThroughAction(pt)} className="w-full mt-2">
                          代为投票
                        </Button>
                      )}
                    </div>
                  )}

                  {pt.phase === 'hunter_shoot' && (
                    <div>
                      <p className="text-xs text-gray-400 mb-2">代{pt.playerName}(猎人)选择开枪目标:</p>
                      <PlayerList
                        players={alivePlayers.filter((p: any) => p.id !== pt.playerId)}
                        onSelect={(p) => setSelectedTarget(p.id)}
                        selectedId={selectedTarget}
                        layout="grid"
                      />
                      <div className="flex gap-1 mt-2">
                        <Button size="sm" variant="ghost" onClick={() => socket.passThroughAction(pt.playerId, 'hunter_skip')} className="flex-1">代为跳过</Button>
                        {selectedTarget && <Button size="sm" onClick={() => handlePassThroughAction(pt)} className="flex-1">代为开枪</Button>}
                      </div>
                    </div>
                  )}

                  {pt.phase === 'wolf_king_shoot' && (
                    <div>
                      <p className="text-xs text-gray-400 mb-2">代{pt.playerName}(狼王)选择开枪目标:</p>
                      <PlayerList
                        players={alivePlayers.filter((p: any) => p.id !== pt.playerId)}
                        onSelect={(p) => setSelectedTarget(p.id)}
                        selectedId={selectedTarget}
                        layout="grid"
                      />
                      <div className="flex gap-1 mt-2">
                        <Button size="sm" variant="ghost" onClick={() => socket.passThroughAction(pt.playerId, 'wolf_king_skip')} className="flex-1">代为跳过</Button>
                        {selectedTarget && <Button size="sm" onClick={() => handlePassThroughAction(pt)} className="flex-1">代为开枪</Button>}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* 死亡状态 */}
        {!myIsAlive && !myTurnInfo && (
          <div className="max-w-md mx-auto mt-4">
            <Card variant="bordered" className="border-red-900/30 bg-red-950/10">
              <div className="text-center py-3">
                <Skull className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-400">你已死亡</p>
                <p className="text-xs text-gray-500 mt-1">请安静观战</p>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // ===== 白天阶段 =====
  if (phase === 'day' || phase === 'vote') {
    const deadPlayers = players.filter((p: any) => !p.isAlive);
    const currentSpeakerIdx = state.currentSpeakerIndex || 0;
    const currentSpeaker = alivePlayers[currentSpeakerIdx];

    return (
      <div className="min-h-screen bg-gray-900 px-4 py-8">
        <div className="max-w-md mx-auto">
          {/* 头部 */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Sun className="w-5 h-5 text-yellow-400" />
              <span className="text-lg font-bold text-gray-100">第 {round} 天</span>
            </div>
            <span className="text-xs text-gray-500">{myRole ? ROLES[myRole]?.name : ''}</span>
          </div>

          {/* 死亡公布 */}
          <Card variant="bordered" className="mb-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">昨晚情况公布</h3>
            {deadPlayers.length > 0 ? (
              <div className="space-y-2">
                {deadPlayers.map((p: any) => (
                  <div key={p.id} className="p-2 bg-red-900/20 rounded-lg flex items-center gap-2">
                    <Skull className="w-4 h-4 text-red-400" />
                    <span className="text-red-400">{p.name}</span>
                    <span className="text-xs text-gray-500">死亡</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-green-400 text-center py-2">平安夜，无人死亡</p>
            )}
          </Card>

          {/* 发言阶段 */}
          {phase === 'day' && (
            <Card variant="bordered" className="mb-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">发言环节</h3>
              
              {currentSpeaker && (
                <div className="text-center py-4">
                  <div className="text-xl font-bold text-gray-100 mb-1">{currentSpeaker.name}</div>
                  <div className="text-sm text-gray-400 mb-4">正在发言...</div>
                  
                  {currentSpeaker.id === myPlayerId && myIsAlive ? (
                    <Button variant="primary" onClick={handleSpeechNext} className="w-full">
                      我说完了，下一位
                    </Button>
                  ) : (
                    <p className="text-xs text-gray-500">等待 {currentSpeaker.name} 发言完毕</p>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* 投票阶段 */}
          {phase === 'vote' && (
            <Card variant="bordered" className="mb-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">投票环节</h3>
              
              {/* 轮到我投票 */}
              {myTurnInfo && myIsAlive && myTurnInfo.phase === 'vote' && (
                <div>
                  <p className="text-sm text-gray-400 text-center mb-3">
                    {me?.name}，请选择要投票的玩家
                  </p>
                  <PlayerList
                    players={alivePlayers.filter((p: any) => p.id !== myPlayerId)}
                    onSelect={(p) => setSelectedTarget(p.id)}
                    selectedId={selectedTarget}
                    layout="grid"
                  />
                  {selectedTarget && (
                    <Button variant="primary" onClick={handleVote} className="w-full mt-4">
                      确认投票
                    </Button>
                  )}
                </div>
              )}

              {/* 等待投票 */}
              {!myTurnInfo && phase === 'vote' && (
                <div className="text-center py-4">
                  <Target className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">投票进行中...</p>
                  {myIsAlive && <p className="text-xs text-gray-500 mt-1">等待轮到你投票</p>}
                </div>
              )}

              {/* 投票结果 */}
              {state.voteResult && !state.voteResult.tie && (
                <div className="mt-4 p-3 bg-yellow-900/20 rounded-lg border border-yellow-700/50">
                  <p className="text-sm text-yellow-400 text-center">
                    {state.voteResult.eliminated} ({state.voteResult.role}) 被投票出局
                  </p>
                </div>
              )}

              {/* 平票重投 */}
              {state.voteResult?.tie && (
                <div className="mt-4 p-3 bg-orange-900/20 rounded-lg border border-orange-700/50 text-center">
                  <p className="text-sm text-orange-400">平票！重新投票</p>
                </div>
              )}
            </Card>
          )}

          {/* 存活玩家列表 */}
          <Card variant="bordered">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">存活玩家</h3>
            <div className="grid grid-cols-2 gap-2">
              {alivePlayers.map((p: any) => (
                <div key={p.id} className={`p-2 rounded-lg text-center text-sm ${
                  p.id === myPlayerId ? 'bg-purple-900/30 border border-purple-700/30' : 'bg-gray-800/50'
                }`}>
                  <span className={p.id === myPlayerId ? 'text-purple-300' : 'text-gray-200'}>
                    {p.name}
                  </span>
                  {p.id === myPlayerId && <span className="text-xs text-gray-500 ml-1">(你)</span>}
                  <div className="flex items-center justify-center gap-1 mt-1">
                    {p.isOnline !== false ? (
                      <Wifi className="w-3 h-3 text-green-400" />
                    ) : (
                      <WifiOff className="w-3 h-3 text-red-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return null;
};
