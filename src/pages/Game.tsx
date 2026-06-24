import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun, Users, Target, Shield, Skull, Crown, Eye, FlaskConical } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { Timer } from '../components/common/Timer';
import { PlayerList } from '../components/game/PlayerCard';
import { RoleReveal } from '../components/role/RoleReveal';
import { useGameStore } from '../store/gameStore';
import { useSpeech } from '../hooks/useSpeech';
import { useTimer } from '../hooks/useTimer';
import { ROLES, RoleType } from '../data/roles';
import { SPEECH_MESSAGES } from '../data/messages';
import { Player, NightPhase } from '../types';

// 夜晚行动阶段顺序
type NightActionPhase = 'werewolf' | 'witch' | 'seer';

export const Game: React.FC = () => {
  const navigate = useNavigate();
  const gameStore = useGameStore();
  const { speak } = useSpeech();

  // 夜晚阶段状态（方案三：每轮所有玩家依次传递）
  const [nightActionPhase, setNightActionPhase] = useState<NightActionPhase>('werewolf'); // 当前行动阶段
  const [nightPlayerIndex, setNightPlayerIndex] = useState(0); // 当前传递到第几个玩家
  const [showHandoff, setShowHandoff] = useState(false); // 显示传递界面
  const [showWaiting, setShowWaiting] = useState(false); // 显示随机等待界面（防时间推断）
  const [waitingTime, setWaitingTime] = useState(0); // 随机等待时间
  const [waitingElapsed, setWaitingElapsed] = useState(0); // 已等待时间
  const [showRoleReveal, setShowRoleReveal] = useState(false); // 显示角色确认
  const [showActionUI, setShowActionUI] = useState(false); // 显示行动界面
  const [showNoActionUI, setShowNoActionUI] = useState(false); // 显示无行动提示
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [witchChoice, setWitchChoice] = useState<'antidote' | 'poison' | 'none' | null>(null);
  const [seerResult, setSeerResult] = useState<{ name: string; isWerewolf: boolean } | null>(null);

  // 狼人投票状态
  const [werewolfVotes, setWerewolfVotes] = useState<Record<string, string>>({}); // 狼人投票记录
  const [werewolfKillTarget, setWerewolfKillTarget] = useState<string | null>(null); // 狼人最终击杀目标
  const [showDeathAnnouncement, setShowDeathAnnouncement] = useState(false); // 显示死亡公布
  const [killedPlayerName, setKilledPlayerName] = useState<string | null>(null); // 被杀玩家名字

  // 白天阶段状态
  const [showHunterShoot, setShowHunterShoot] = useState(false);
  const [showWolfKingShoot, setShowWolfKingShoot] = useState(false);

  // Refs
  const timerRef = useRef<{ pause: () => void; reset: () => void; start: () => void } | null>(null);
  const triggeredPhaseRef = useRef<string>('');
  const phaseRedirectHandledRef = useRef(false);
  const nightActionTimeoutRef = useRef<number | null>(null);
  const nightStartSpeechRef = useRef<string>(''); // 防止夜晚开始语音重复播报

  // Get store values
  const phase = useGameStore(state => state.phase);
  const round = useGameStore(state => state.round);
  const players = useGameStore(state => state.players);
  const endNightPhase = useGameStore(state => state.endNightPhase);
  const startNightPhase = useGameStore(state => state.startNightPhase);
  const checkGameEnd = useGameStore(state => state.checkGameEnd);
  const hunterShoot = useGameStore(state => state.hunterShoot);
  const skipHunterShoot = useGameStore(state => state.skipHunterShoot);
  const idiotRevealed = useGameStore(state => state.idiotRevealed);
  const witchHasAntidote = useGameStore(state => state.witchHasAntidote);
  const witchHasPoison = useGameStore(state => state.witchHasPoison);
  const witchUsedTonight = useGameStore(state => state.witchUsedTonight);
  const executeNightAction = useGameStore(state => state.executeNightAction);
  const useWitchAntidote = useGameStore(state => state.useWitchAntidote);
  const useWitchPoison = useGameStore(state => state.useWitchPoison);
  const settings = useGameStore(state => state.settings);

  // 获取所有存活玩家（用于夜晚依次传递）
  const alivePlayers = players.filter(p => p.isAlive);
  const currentPlayer = alivePlayers[nightPlayerIndex];

  // 获取当前行动阶段对应的角色
  const getPhaseRole = useCallback((phase: NightActionPhase): RoleType[] => {
    switch (phase) {
      case 'werewolf': return ['werewolf', 'wolfKing'];
      case 'witch': return ['witch'];
      case 'seer': return ['seer'];
    }
  }, []);

  // 判断玩家是否是当前行动阶段的角色
  const isCurrentPhaseRole = useCallback((player: Player, currentPhase: NightActionPhase): boolean => {
    const roles = getPhaseRole(currentPhase);
    return roles.includes(player.role);
  }, [getPhaseRole]);

  // 获取当前行动阶段的所有存活角色玩家
  const getPhasePlayers = useCallback((currentPlayers: Player[], currentPhase: NightActionPhase): Player[] => {
    const roles = getPhaseRole(currentPhase);
    return currentPlayers.filter(p => p.isAlive && roles.includes(p.role));
  }, [getPhaseRole]);

  // Redirect if not in a valid game phase
  const isValidPhase = ['night', 'day', 'result'].includes(phase);
  useEffect(() => {
    if (!isValidPhase) {
      if (!phaseRedirectHandledRef.current) {
        phaseRedirectHandledRef.current = true;
        navigate('/');
      }
    } else if (phase === 'result') {
      if (!phaseRedirectHandledRef.current) {
        phaseRedirectHandledRef.current = true;
        navigate('/result');
      }
    }
  }, [isValidPhase, phase, navigate]);
  if (!isValidPhase) return null;
  if (phase === 'result') return null;

  // Timer hook
  const timer = useTimer({
    initialTime: settings.actionTime,
    onTimeUp: () => {
      handlePlayerComplete();
    },
    onWarning: () => speak(SPEECH_MESSAGES.TIME_WARNING),
  });

  useEffect(() => {
    timerRef.current = { pause: timer.pause, reset: timer.reset, start: timer.start };
  }, [timer]);

  // Speech on phase change
  useEffect(() => {
    if (phase === 'night') speak(SPEECH_MESSAGES.NIGHT_START);
    else if (phase === 'day') speak(SPEECH_MESSAGES.DAY_START);
  }, [phase, round, speak]);

  // 移除夜晚开始时自动播报"狼人请睁眼"
  // 改为：只在玩家确认身份且是该阶段角色时才播报（此时只有该玩家能看到）

  // ========== 夜晚阶段自动触发 effect ==========
  useEffect(() => {
    if (phase !== 'night') return;

    // 如果已经在显示任何界面，不触发
    if (showHandoff || showWaiting || showRoleReveal || showActionUI || showNoActionUI || showDeathAnnouncement) return;

    const key = `night-${round}-${nightActionPhase}-${nightPlayerIndex}`;
    if (triggeredPhaseRef.current === key) return;
    triggeredPhaseRef.current = key;

    // 检查是否所有玩家都已传递完毕（当前行动阶段）
    if (nightPlayerIndex >= alivePlayers.length) {
      // 当前行动阶段的所有玩家已传递完毕
      handlePhaseComplete();
      return;
    }

    // 触发传递界面
    const timeoutId = window.setTimeout(async () => {
      console.log('[Night] Passing device to player:', currentPlayer?.name, 'index:', nightPlayerIndex, 'phase:', nightActionPhase);
      setShowHandoff(true);
      await speak(SPEECH_MESSAGES.HANDOFF(currentPlayer?.name || ''));
    }, 600);

    nightActionTimeoutRef.current = timeoutId;
    return () => {};
  }, [phase, round, nightActionPhase, nightPlayerIndex, showHandoff, showWaiting, showRoleReveal, showActionUI, showNoActionUI, showDeathAnnouncement, alivePlayers.length, currentPlayer, speak]);

  // 处理传递确认 - 如果当前玩家应该操作则直接显示身份，否则随机等待
  const handleHandoffConfirm = () => {
    setShowHandoff(false);

    // 判断是否是当前行动阶段的角色
    if (currentPlayer && isCurrentPhaseRole(currentPlayer, nightActionPhase)) {
      // 是当前行动阶段的角色，直接显示角色确认（无等待）
      setShowRoleReveal(true);
    } else {
      // 不是当前行动阶段的角色，随机等待0-2秒（防时间推断）
      const randomTime = Math.floor(Math.random() * 3);
      setWaitingTime(randomTime);
      setWaitingElapsed(0);
      setShowWaiting(true);
    }
  };

  // 等待倒计时 effect - 等待结束后显示"不到你行动"（只有不需要行动的玩家才会进入等待）
  useEffect(() => {
    if (!showWaiting) return;

    const intervalId = window.setInterval(() => {
      setWaitingElapsed(prev => {
        if (prev + 1 >= waitingTime) {
          clearInterval(intervalId);
          setShowWaiting(false);
          // 等待结束，显示"不到你行动"
          setShowNoActionUI(true);
          return prev;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [showWaiting, waitingTime]);

  // "不到你行动"界面自动跳过（等待1.5秒后自动进入下一个玩家）
  useEffect(() => {
    if (!showNoActionUI) return;

    const timeoutId = window.setTimeout(() => {
      handlePlayerComplete();
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [showNoActionUI]);

  // 处理角色确认
  const handleRoleConfirm = () => {
    setShowRoleReveal(false);
    
    if (!currentPlayer) return;

    // 判断是否是当前行动阶段的角色
    if (isCurrentPhaseRole(currentPlayer, nightActionPhase)) {
      // 是当前行动阶段的角色，显示行动界面
      setShowActionUI(true);
      if (settings.timerEnabled) {
        timer.reset();
        timer.start();
      }
      // 语音播报已经在阶段开始时完成，这里不再播报
    } else {
      // 不是当前行动阶段的角色，显示"不到你行动"
      setShowNoActionUI(true);
    }
  };

  // 处理玩家完成（无论是否有行动）
  const handlePlayerComplete = () => {
    timerRef.current?.pause();
    setSelectedTarget(null);
    setWitchChoice(null);
    setSeerResult(null);
    setShowActionUI(false);
    setShowNoActionUI(false);
    triggeredPhaseRef.current = '';

    // 进入下一个玩家
    if (nightPlayerIndex < alivePlayers.length - 1) {
      setNightPlayerIndex(prev => prev + 1);
    } else {
      // 当前行动阶段的所有玩家已传递完毕
      handlePhaseComplete();
    }
  };

  // 处理狼人投票
  const handleWerewolfVote = async () => {
    if (!currentPlayer || !selectedTarget) return;

    // 记录投票
    setWerewolfVotes(prev => ({ ...prev, [currentPlayer.id]: selectedTarget }));
    setSelectedTarget(null);
    setShowActionUI(false);
    triggeredPhaseRef.current = '';

    // 不播报角色相关语音，避免暴露当前阶段

    // 进入下一个玩家
    if (nightPlayerIndex < alivePlayers.length - 1) {
      setNightPlayerIndex(prev => prev + 1);
    } else {
      // 当前行动阶段的所有玩家已传递完毕
      handlePhaseComplete();
    }
  };

  // 处理预言家查验
  const handleSeerCheck = async () => {
    if (!currentPlayer || !selectedTarget) return;
    const target = players.find(p => p.id === selectedTarget);
    if (!target) return;

    const isWerewolf = ROLES[target.role].camp === 'werewolf';
    setSeerResult({ name: target.name, isWerewolf });
    // 不语音播报好人坏人，避免暴露信息

    // 记录行动
    executeNightAction({
      round: round,
      phase: 'seer',
      actorId: currentPlayer.id,
      actorRole: 'seer',
      targetId: selectedTarget,
      actionType: 'check',
      result: { success: true, message: isWerewolf ? '狼人' : '好人' }
    });
  };

  // 处理预言家确认结果
  const handleSeerConfirm = async () => {
    // 不播报角色相关语音，避免暴露当前阶段
    handlePlayerComplete();
  };

  // 处理女巫行动
  const handleWitchAction = async () => {
    if (!currentPlayer) return;

    if (witchChoice === 'antidote' && selectedTarget) {
      useWitchAntidote(selectedTarget);
    } else if (witchChoice === 'poison' && selectedTarget) {
      useWitchPoison(selectedTarget);
    }

    // 不播报角色相关语音，避免暴露当前阶段
    handlePlayerComplete();
  };

  // 处理当前行动阶段完成
  const handlePhaseComplete = () => {
    console.log('[Night] Phase complete:', nightActionPhase);

    // 狼人阶段完成：直接处理投票结果，不显示确认界面
    if (nightActionPhase === 'werewolf' && Object.keys(werewolfVotes).length > 0) {
      processWerewolfVoteResult();
      return;
    }

    // 进入下一个行动阶段
    goToNextActionPhase();
  };

  // 处理狼人投票结果（直接执行，不显示确认界面）
  const processWerewolfVoteResult = () => {
    const currentRound = useGameStore.getState().round;

    // 统计投票结果
    const voteCounts: Record<string, number> = {};
    Object.values(werewolfVotes).forEach(targetId => {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });

    // 找出最高票
    const maxVotes = Math.max(...Object.values(voteCounts), 0);
    const topVoted = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);

    let finalTargetId: string;

    if (topVoted.length === 1) {
      finalTargetId = topVoted[0];
    } else {
      // 平票：随机选择一个
      const randomIndex = Math.floor(Math.random() * topVoted.length);
      finalTargetId = topVoted[randomIndex];
      console.log('[Werewolf Vote] Tie detected, randomly selected:', finalTargetId);
    }

    const finalTarget = players.find(p => p.id === finalTargetId);
    if (!finalTarget) {
      setWerewolfVotes({});
      goToNextActionPhase();
      return;
    }

    // 记录狼人击杀目标（女巫阶段会用到）
    setWerewolfKillTarget(finalTargetId);

    // 执行击杀
    const firstWerewolf = getPhasePlayers(players, 'werewolf')[0];
    if (firstWerewolf) {
      executeNightAction({
        round: currentRound,
        phase: 'werewolf',
        actorId: firstWerewolf.id,
        actorRole: firstWerewolf.role,
        targetId: finalTargetId,
        actionType: 'kill'
      });
    }

    console.log('[Werewolf Vote] Final target:', finalTarget.name, 'with', maxVotes, 'votes');

    // 重置投票状态
    setWerewolfVotes({});
    
    // 进入女巫阶段
    goToNextActionPhase();
  };

  // 进入下一个行动阶段
  const goToNextActionPhase = async () => {
    // 重置玩家索引
    setNightPlayerIndex(0);
    triggeredPhaseRef.current = '';

    // 确定下一个行动阶段
    const nextPhase: NightActionPhase | null = 
      nightActionPhase === 'werewolf' ? 'witch' :
      nightActionPhase === 'witch' ? 'seer' :
      null;

    if (!nextPhase) {
      // 所有行动阶段完成，结束夜晚
      finishNightPhase();
      return;
    }

    // 检查下一个行动阶段是否有对应的存活角色
    const phasePlayers = getPhasePlayers(players, nextPhase);
    if (phasePlayers.length === 0) {
      // 没有对应角色，跳过这个阶段
      console.log('[Night] No players for phase:', nextPhase, 'skipping');
      setNightActionPhase(nextPhase);
      // 立即进入下一个阶段
      setTimeout(() => goToNextActionPhase(), 100);
      return;
    }

    console.log('[Night] Going to next phase:', nextPhase);
    
    // 不在阶段切换时播报语音，避免暴露当前角色阶段
    // 只有当玩家确认身份且是该阶段角色时，才在行动界面看到提示
    
    setNightActionPhase(nextPhase);
  };

  // 结束夜晚阶段
  const finishNightPhase = () => {
    // 先调用 store 的 endNightPhase（设置 phase: 'day'）
    endNightPhase();

    // 然后重置本地状态（不影响已切换到白天的 phase）
    setNightPlayerIndex(0);
    setNightActionPhase('werewolf');
    setWerewolfVotes({});
    setWerewolfKillTarget(null);
    triggeredPhaseRef.current = '';
  };

  // ===================== RENDER =====================

  // Night phase
  if (phase === 'night') {
    return (
      <div className="min-h-screen bg-gray-900 px-4 py-8">
        {/* 传递界面（通用提示语，不显示角色） */}
        {showHandoff && currentPlayer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50"
          >
            <div className="text-center max-w-sm">
              <Moon className="w-12 h-12 text-purple-400 mb-6 mx-auto" />
              <div className="text-xl text-gray-100 mb-4">请把设备交给</div>
              <div className="text-3xl font-bold text-purple-400 mb-8">{currentPlayer.name}</div>
              <Button variant="primary" size="lg" onClick={handleHandoffConfirm} className="w-full">我已收到设备</Button>
              <div className="mt-4 text-xs text-gray-500">请确保其他玩家无法看到屏幕内容</div>
            </div>
          </motion.div>
        )}

        {/* 随机等待界面（防时间推断） */}
        {showWaiting && currentPlayer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50"
          >
            <div className="text-center max-w-sm">
              <Moon className="w-12 h-12 text-gray-400 mb-6 mx-auto" />
              <div className="text-xl text-gray-100 mb-4">{currentPlayer.name}</div>
              <div className="text-sm text-gray-400 mb-8">正在确认身份...</div>
              
              {/* 倒计时进度条 */}
              <div className="w-full bg-gray-700 rounded-full h-2 mb-4">
                <div 
                  className="bg-purple-400 h-2 rounded-full transition-all duration-1000"
                  style={{ width: `${(waitingElapsed / waitingTime) * 100}%` }}
                ></div>
              </div>
              
              <div className="text-sm text-gray-500">
                {waitingTime - waitingElapsed} 秒
              </div>
            </div>
          </motion.div>
        )}

        {/* 角色确认界面 */}
        {showRoleReveal && currentPlayer && (
          <RoleReveal player={currentPlayer} onComplete={handleRoleConfirm} antiPeekMode={settings.antiPeekMode} />
        )}

        {/* 无行动提示界面 - 自动跳过 */}
        {showNoActionUI && currentPlayer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto">
            <Card variant="bordered" className="mb-6">
              <div className="text-center py-8">
                <Moon className="w-12 h-12 text-gray-400 mb-4 mx-auto" />
                <div className="text-lg text-gray-100 mb-2">{currentPlayer.name}</div>
                <div className="text-sm text-gray-400 mb-4">不到你行动，请闭眼等待</div>
                <div className="text-xs text-gray-500">自动继续...</div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* 行动界面 */}
        {showActionUI && currentPlayer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto">
            <Card variant="bordered" className="mb-6">
              <div className="text-center mb-4">
                <div className="text-lg text-gray-100 mb-2">{currentPlayer.name} 的行动</div>
                {settings.timerEnabled && (
                  <Timer time={timer.time} isRunning={timer.isRunning} showProgress totalTime={settings.actionTime} />
                )}
              </div>

              {/* 狼人投票 */}
              {(currentPlayer.role === 'werewolf' || currentPlayer.role === 'wolfKing') && (
                <>
                  {/* 显示其他狼人的投票 */}
                  {Object.keys(werewolfVotes).length > 0 && (
                    <div className="p-3 bg-red-900/20 rounded-lg border border-red-700/50 mb-4">
                      <div className="text-sm text-red-400 mb-2">其他狼人的投票</div>
                      <div className="space-y-1">
                        {Object.entries(werewolfVotes).map(([voterId, targetId]) => {
                          const voter = players.find(p => p.id === voterId);
                          const target = players.find(p => p.id === targetId);
                          if (!voter || !target) return null;
                          return (
                            <div key={voterId} className="flex justify-between items-center text-sm">
                              <span className="text-gray-300">{voter.name}</span>
                              <span className="text-gray-100">→</span>
                              <span className="text-red-400 font-medium">{target.name}</span>
                            </div>
                          );
                        })}
                      </div>
                      {(() => {
                        const voteCounts: Record<string, number> = {};
                        Object.values(werewolfVotes).forEach(targetId => {
                          voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
                        });
                        const maxVotes = Math.max(...Object.values(voteCounts), 0);
                        const topVoted = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);
                        
                        if (topVoted.length === 1 && maxVotes > 0) {
                          const topTarget = players.find(p => p.id === topVoted[0]);
                          if (topTarget) {
                            return (
                              <div className="text-xs text-yellow-400 mt-2 pt-2 border-t border-red-700/30">
                                当前最高票：{topTarget.name} ({maxVotes} 票)
                              </div>
                            );
                          }
                        }
                        return null;
                      })()}
                    </div>
                  )}

                  <div className="text-sm text-gray-400 mb-3">选择要击杀的目标</div>
                  <PlayerList
                    players={players.filter(p => p.isAlive && p.id !== currentPlayer.id)}
                    onSelect={(p) => setSelectedTarget(p.id)}
                    selectedId={selectedTarget}
                    layout="grid"
                  />
                  {selectedTarget && (
                    <Button variant="primary" onClick={handleWerewolfVote} className="w-full mt-4">
                      确认投票
                    </Button>
                  )}
                </>
              )}

              {/* 预言家查验 */}
              {currentPlayer.role === 'seer' && !seerResult && (
                <>
                  <div className="text-sm text-gray-400 mb-3">选择要查验的玩家</div>
                  <PlayerList
                    players={players.filter(p => p.isAlive && p.id !== currentPlayer.id)}
                    onSelect={(p) => setSelectedTarget(p.id)}
                    selectedId={selectedTarget}
                    layout="grid"
                  />
                  {selectedTarget && (
                    <Button variant="primary" onClick={handleSeerCheck} className="w-full mt-4">
                      确认查验
                    </Button>
                  )}
                </>
              )}

              {/* 预言家查验结果 */}
              {currentPlayer.role === 'seer' && seerResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className={`p-4 rounded-lg border ${
                    seerResult.isWerewolf
                      ? 'bg-red-900/40 border-red-500'
                      : 'bg-green-900/40 border-green-500'
                  }`}
                >
                  <div className="text-center">
                    <div className={`text-4xl mb-2`}>
                      {seerResult.isWerewolf ? '🐺' : '👥'}
                    </div>
                    <div className="text-lg mb-2">{seerResult.name}</div>
                    <div className={`text-xl font-bold ${
                      seerResult.isWerewolf ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {seerResult.isWerewolf ? '狼人阵营' : '好人阵营'}
                    </div>
                  </div>
                  <Button variant="primary" onClick={handleSeerConfirm} className="w-full mt-4">
                    我已记住，继续
                  </Button>
                </motion.div>
              )}

              {/* 女巫行动 */}
              {currentPlayer.role === 'witch' && (
                <div className="space-y-4">
                  {/* 如果今晚已经用过药，显示已完成提示 */}
                  {witchUsedTonight ? (
                    <div className="text-center py-8">
                      <FlaskConical className="w-12 h-12 text-gray-400 mb-4 mx-auto" />
                      <div className="text-lg text-gray-100 mb-2">今晚已使用药水</div>
                      <div className="text-sm text-gray-400 mb-4">女巫一晚只能使用一瓶药</div>
                      <Button variant="ghost" onClick={() => { setWitchChoice('none'); handleWitchAction(); }} className="w-full">
                        完成行动
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-gray-400 mb-3">女巫行动选择</div>

                      {/* 显示狼人击杀目标 */}
                      {werewolfKillTarget && (() => {
                        const killedTarget = players.find(p => p.id === werewolfKillTarget);
                        if (!killedTarget) return null;
                        return (
                          <div className="p-3 bg-red-900/20 rounded-lg border border-red-700/50 mb-4">
                            <div className="text-sm text-red-400 mb-2">今晚狼人击杀目标</div>
                            <div className="text-lg font-bold text-red-400">{killedTarget.name}</div>
                          </div>
                        );
                      })()}

                      {/* 解药：只能救狼人杀的目标 */}
                      {witchHasAntidote && werewolfKillTarget && (
                        <div className="p-3 bg-green-900/20 rounded-lg border border-green-700/50 mb-4">
                          <div className="flex items-center gap-2 mb-2">
                            <FlaskConical className="w-4 h-4 text-green-400" />
                            <div className="text-sm text-green-400">使用解药救人</div>
                          </div>
                          <div className="text-xs text-gray-400 mb-3">
                            解药只能救今晚被狼人击杀的玩家
                          </div>
                          <div className="flex gap-2">
                            {/* 自救按钮：狼人击杀目标是女巫本人 */}
                            {werewolfKillTarget === currentPlayer.id ? (
                              <Button
                                variant={witchChoice === 'antidote' ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => { setWitchChoice('antidote'); setSelectedTarget(currentPlayer.id); }}
                                className="flex-1"
                              >
                                自救（使用解药救自己）
                              </Button>
                            ) : (
                              <Button
                                variant={witchChoice === 'antidote' ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => { setWitchChoice('antidote'); setSelectedTarget(werewolfKillTarget); }}
                                className="flex-1"
                              >
                                救 {players.find(p => p.id === werewolfKillTarget)?.name}
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 毒药：可以毒任意玩家 */}
                      {witchHasPoison && (
                        <div className="p-3 bg-red-900/20 rounded-lg border border-red-700/50">
                          <div className="flex items-center gap-2 mb-2">
                            <FlaskConical className="w-4 h-4 text-red-400" />
                            <div className="text-sm text-red-400">使用毒药</div>
                          </div>
                          <div className="text-xs text-gray-400 mb-2">选择一名玩家使用毒药</div>
                          <PlayerList
                            players={players.filter(p => p.isAlive && p.id !== currentPlayer.id)}
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
                    </>
                  )}
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {/* 等待界面 - 使用通用提示，不暴露当前角色阶段 */}
        {!showHandoff && !showWaiting && !showRoleReveal && !showActionUI && !showNoActionUI && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto">
            <Card variant="bordered" className="mb-6">
              <div className="text-center py-8">
                <Moon className="w-12 h-12 text-purple-400 mb-4 mx-auto" />
                <div className="text-xl font-bold text-gray-100 mb-2">第 {round} 夜</div>
                <div className="text-sm text-gray-400">正在等待...</div>
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    );
  }

  // Day phase
  if (phase === 'day') {
    return <DayPhase players={players} round={round} speak={speak} navigate={navigate} checkGameEnd={checkGameEnd} startNightPhase={startNightPhase} idiotRevealed={idiotRevealed} />;
  }

  return null;
};

// Day phase component
const DayPhase: React.FC<{
  players: Player[];
  round: number;
  speak: (t: string) => Promise<void>;
  navigate: (p: string) => void;
  checkGameEnd: () => boolean;
  startNightPhase: () => void;
  idiotRevealed: boolean;
}> = ({ players, round, speak, navigate, checkGameEnd, startNightPhase, idiotRevealed }) => {
  const [phase, setPhase] = useState<'announce' | 'speech' | 'vote' | 'voteResult' | 'hunterShoot' | 'wolfKingShoot'>('announce');
  const [speakerIdx, setSpeakerIdx] = useState(0);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [hunterTarget, setHunterTarget] = useState<string | null>(null);
  const [wolfKingTarget, setWolfKingTarget] = useState<string | null>(null);
  const [eliminatedPlayer, setEliminatedPlayer] = useState<Player | null>(null);
  const [voteTieCount, setVoteTieCount] = useState(0);

  // 投票传递相关状态
  const [currentVoterIndex, setCurrentVoterIndex] = useState(0);
  const [showVoteHandoff, setShowVoteHandoff] = useState(false);
  const [selectedVoteTarget, setSelectedVoteTarget] = useState<string | null>(null);
  const voteHandoffTriggeredRef = useRef<string>('');

  const speakRef = useRef(speak);
  const navRef = useRef(navigate);
  useEffect(() => { speakRef.current = speak; }, [speak]);
  useEffect(() => { navRef.current = navigate; }, [navigate]);

  const alivePlayers = players.filter(p => p.isAlive);
  // 白痴翻牌后失去投票权
  const votingPlayers = alivePlayers.filter(p => !(p.role === 'idiot' && idiotRevealed));

  useEffect(() => {
    if (phase !== 'announce') return;
    const names = players.filter(p => !p.isAlive).map(p => p.name);
    speakRef.current(SPEECH_MESSAGES.ANNOUNCE_DEATH(names));
    setTimeout(() => {
      if (useGameStore.getState().checkGameEnd()) navRef.current('/result');
      else setPhase('speech');
    }, 2000);
  }, [phase, players]);

  const nextSpeaker = () => setSpeakerIdx(prev => prev < alivePlayers.length - 1 ? prev + 1 : (setPhase('vote'), prev));

  // 开始投票环节
  useEffect(() => {
    if (phase !== 'vote') return;
    setVotes({});
    setCurrentVoterIndex(0);
    setSelectedVoteTarget(null);
    setShowVoteHandoff(false);
    voteHandoffTriggeredRef.current = '';
  }, [phase]);

  // 投票传递自动触发
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

    return () => {};
  }, [phase, currentVoterIndex, showVoteHandoff, selectedVoteTarget, round, votingPlayers]);

  // 确认投票
  const confirmVote = () => {
    const currentVoter = votingPlayers[currentVoterIndex];
    if (!currentVoter || !selectedVoteTarget) return;

    setVotes(prev => ({ ...prev, [currentVoter.id]: selectedVoteTarget }));
    setSelectedVoteTarget(null);
    setShowVoteHandoff(false);
    voteHandoffTriggeredRef.current = '';

    if (currentVoterIndex < votingPlayers.length - 1) {
      setCurrentVoterIndex(prev => prev + 1);
    } else {
      setPhase('voteResult');
    }
  };

  // 公布投票结果并处理出局
  const finishVote = () => {
    const counts: Record<string, number> = {};
    Object.values(votes).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    const max = Math.max(...Object.values(counts), 0);
    const topVoted = Object.keys(counts).filter(id => counts[id] === max);

    // 平票处理
    if (topVoted.length > 1) {
      const newTieCount = voteTieCount + 1;
      setVoteTieCount(newTieCount);
      
      // 如果达到2轮平票，随机淘汰一名平票玩家
      if (newTieCount >= 2) {
        const randomIndex = Math.floor(Math.random() * topVoted.length);
        const eliminatedId = topVoted[randomIndex];
        const eliminated = players.find(p => p.id === eliminatedId);
        if (!eliminated) return;
        
        speak(SPEECH_MESSAGES.VOTE_TIE);
        setTimeout(() => {
          speak(`经过两轮平票，随机处决${eliminated.name}`);
        }, 1500);
        
        setEliminatedPlayer(eliminated);
        
        // 检查白痴技能
        if (eliminated.role === 'idiot' && !idiotRevealed) {
          useGameStore.getState().idiotReveal();
          speak(SPEECH_MESSAGES.IDIOT_REVEAL);
          useGameStore.setState({ phase: 'night', round: round + 1 });
          startNightPhase();
          return;
        }
        
        // 处理玩家出局
        setTimeout(() => {
          useGameStore.getState().submitVote(eliminatedId, eliminatedId);
          useGameStore.getState().endVotePhase();
          
          // 检查猎人技能
          if (eliminated.role === 'hunter' && useGameStore.getState().hunterCanShoot) {
            setPhase('hunterShoot');
            return;
          }
          
          // 检查狼王技能
          if (eliminated.role === 'wolfKing') {
            setPhase('wolfKingShoot');
            return;
          }
          
          if (useGameStore.getState().checkGameEnd()) navigate('/result');
          else {
            useGameStore.setState({ phase: 'night', round: round + 1 });
            startNightPhase();
          }
        }, 2500);
        return;
      }
      
      // 未达到2轮，重新投票
      speak(SPEECH_MESSAGES.VOTE_TIE);
      setVotes({});
      setCurrentVoterIndex(0);
      setSelectedVoteTarget(null);
      setShowVoteHandoff(false);
      voteHandoffTriggeredRef.current = '';
      setPhase('vote');
      return;
    }

    const eliminatedId = topVoted[0];
    const eliminated = players.find(p => p.id === eliminatedId);
    if (!eliminated) return;
    
    // 投票成功，重置平票计数
    setVoteTieCount(0);

    setEliminatedPlayer(eliminated);

    // 检查白痴技能
    if (eliminated.role === 'idiot' && !idiotRevealed) {
      useGameStore.getState().idiotReveal();
      speak(SPEECH_MESSAGES.IDIOT_REVEAL);
      useGameStore.setState({ phase: 'night', round: round + 1 });
      startNightPhase();
      return;
    }

    // 处理玩家出局
    speak(SPEECH_MESSAGES.VOTE_RESULT(eliminated.name));
    useGameStore.getState().submitVote(eliminatedId, eliminatedId);
    useGameStore.getState().endVotePhase();

    // 检查猎人技能
    if (eliminated.role === 'hunter' && useGameStore.getState().hunterCanShoot) {
      setPhase('hunterShoot');
      return;
    }

    // 检查狼王技能
    if (eliminated.role === 'wolfKing') {
      setPhase('wolfKingShoot');
      return;
    }

    if (useGameStore.getState().checkGameEnd()) navigate('/result');
    else {
      useGameStore.setState({ phase: 'night', round: round + 1 });
      startNightPhase();
    }
  };

  const handleHunterShoot = () => {
    if (!hunterTarget || !eliminatedPlayer) return;
    useGameStore.getState().hunterShoot(hunterTarget);
    speak(SPEECH_MESSAGES.HUNTER_SHOOT);
    setPhase('announce');
    if (!useGameStore.getState().checkGameEnd()) {
      startNightPhase();
    } else {
      navigate('/result');
    }
  };

  const handleWolfKingShoot = () => {
    if (!wolfKingTarget || !eliminatedPlayer) return;
    const target = players.find(p => p.id === wolfKingTarget);
    if (!target) return;
    const newPlayers = players.map(p => p.id === wolfKingTarget ? { ...p, isAlive: false } : p);
    useGameStore.setState({ players: newPlayers });
    speak(SPEECH_MESSAGES.WOLF_KING_REVENGE);
    useGameStore.getState().addLog({
      id: Math.random().toString(36).substring(2) + Date.now().toString(36),
      round: round,
      phase: 'day',
      timestamp: new Date(),
      eventType: 'death',
      description: `狼王开枪带走了${target.name}`,
      players: [wolfKingTarget]
    });
    setPhase('announce');
    if (!useGameStore.getState().checkGameEnd()) {
      startNightPhase();
    } else {
      navigate('/result');
    }
  };

  const skipShoot = () => {
    setPhase('announce');
    if (!useGameStore.getState().checkGameEnd()) {
      startNightPhase();
    } else {
      navigate('/result');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sun className="w-6 h-6 text-yellow-400" />
            <span className="text-xl font-bold text-gray-100">第 {round} 天</span>
          </div>
        </div>

        {phase === 'announce' && (
          <Card variant="bordered" className="mb-6">
            <div className="text-center">
              <div className="text-lg text-gray-100 mb-4">昨晚情况公布</div>
              {players.some(p => !p.isAlive) ? (
                players.filter(p => !p.isAlive).map(p => (
                  <div key={p.id} className="p-2 bg-red-900/20 rounded-lg">
                    <Skull className="w-4 h-4 text-red-400 inline mr-2" />
                    <span className="text-red-400">{p.name}</span> 死亡
                  </div>
                ))
              ) : <div className="text-green-400">平安夜，无人死亡</div>}
            </div>
          </Card>
        )}

        {phase === 'speech' && alivePlayers[speakerIdx] && (
          <Card variant="bordered" className="mb-6">
            <div className="text-center mb-4">
              <div className="text-sm text-gray-400 mb-2">发言环节</div>
              <div className="text-xl font-bold text-gray-100 mb-2">{alivePlayers[speakerIdx].name}</div>
              <div className="text-sm text-gray-400">座位号：{alivePlayers[speakerIdx].seatNumber}</div>
            </div>
            <Button variant="primary" onClick={nextSpeaker} className="w-full">
              {speakerIdx < alivePlayers.length - 1 ? '下一位发言' : '开始投票'}
            </Button>
          </Card>
        )}

        {phase === 'vote' && (
          <>
            {/* 投票传递界面 */}
            {showVoteHandoff && votingPlayers[currentVoterIndex] && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50"
              >
                <div className="text-center max-w-sm">
                  <Target className="w-12 h-12 text-yellow-400 mb-6 mx-auto" />
                  <div className="text-xl text-gray-100 mb-4">请把设备交给</div>
                  <div className="text-3xl font-bold text-yellow-400 mb-2">{votingPlayers[currentVoterIndex].name}</div>
                  <div className="text-sm text-gray-400 mb-8">第 {currentVoterIndex + 1} 位投票者 / 共 {votingPlayers.length} 位</div>
                  <Button variant="primary" size="lg" onClick={() => setShowVoteHandoff(false)} className="w-full">我已收到设备，开始投票</Button>
                  <div className="mt-4 text-xs text-gray-500">请确保其他玩家无法看到屏幕内容</div>
                </div>
              </motion.div>
            )}

            {!showVoteHandoff && votingPlayers[currentVoterIndex] && (
              <Card variant="bordered" className="mb-6">
                <div className="text-center mb-4">
                  <div className="text-sm text-gray-400 mb-1">投票环节</div>
                  <div className="text-lg text-gray-100 mb-1">{votingPlayers[currentVoterIndex].name} 的投票</div>
                  <div className="text-xs text-gray-500">({currentVoterIndex + 1}/{votingPlayers.length})</div>
                </div>
                <div className="text-sm text-gray-400 mb-3">请选择要投票的玩家</div>
                <PlayerList
                  players={alivePlayers.filter(p => p.id !== votingPlayers[currentVoterIndex].id)}
                  onSelect={(p) => setSelectedVoteTarget(p.id)}
                  selectedId={selectedVoteTarget}
                  layout="grid"
                />
                {selectedVoteTarget && (
                  <Button variant="primary" onClick={confirmVote} className="w-full mt-4">确认投票</Button>
                )}
              </Card>
            )}
          </>
        )}

        {phase === 'voteResult' && (
          <Card variant="bordered" className="mb-6">
            <div className="text-center mb-4">
              <div className="text-lg text-gray-100 mb-2">投票结果公布</div>
              <div className="text-sm text-gray-400 mb-4">所有玩家已投票完毕</div>
            </div>
            <div className="space-y-2 mb-4">
              {Object.entries(votes).map(([voterId, targetId]) => {
                const voter = players.find(p => p.id === voterId);
                const target = players.find(p => p.id === targetId);
                if (!voter || !target) return null;
                return (
                  <div key={voterId} className="flex justify-between items-center p-2 bg-gray-800/50 rounded-lg text-sm">
                    <span className="text-gray-300">{voter.name}</span>
                    <span className="text-gray-100">→</span>
                    <span className="text-red-400">{target.name}</span>
                  </div>
                );
              })}
            </div>
            <Button variant="primary" onClick={finishVote} className="w-full">公布处决结果</Button>
          </Card>
        )}

        {phase === 'hunterShoot' && eliminatedPlayer && (
          <Card variant="bordered" className="mb-6">
            <div className="text-center mb-4">
              <Target className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <div className="text-lg text-gray-100 mb-2">猎人开枪</div>
              <div className="text-sm text-gray-400">{eliminatedPlayer.name}（猎人）已出局，请选择带走的目标</div>
            </div>
            <PlayerList
              players={alivePlayers.filter(p => p.id !== eliminatedPlayer.id)}
              onSelect={(p) => setHunterTarget(p.id)}
              selectedId={hunterTarget}
              layout="grid"
            />
            <div className="flex gap-2 mt-4">
              <Button variant="ghost" onClick={skipShoot} className="flex-1">放弃开枪</Button>
              {hunterTarget && <Button variant="primary" onClick={handleHunterShoot} className="flex-1">确认开枪</Button>}
            </div>
          </Card>
        )}

        {phase === 'wolfKingShoot' && eliminatedPlayer && (
          <Card variant="bordered" className="mb-6">
            <div className="text-center mb-4">
              <Crown className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <div className="text-lg text-gray-100 mb-2">狼王复仇</div>
              <div className="text-sm text-gray-400">{eliminatedPlayer.name}（狼王）已出局，请选择带走的目标</div>
            </div>
            <PlayerList
              players={alivePlayers.filter(p => p.id !== eliminatedPlayer.id)}
              onSelect={(p) => setWolfKingTarget(p.id)}
              selectedId={wolfKingTarget}
              layout="grid"
            />
            <div className="flex gap-2 mt-4">
              <Button variant="ghost" onClick={skipShoot} className="flex-1">放弃开枪</Button>
              {wolfKingTarget && <Button variant="primary" onClick={handleWolfKingShoot} className="flex-1">确认开枪</Button>}
            </div>
          </Card>
        )}
      </motion.div>
    </div>
  );
};