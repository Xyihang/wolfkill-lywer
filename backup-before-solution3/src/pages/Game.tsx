import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun, Users, Target, Shield, Skull, Crown } from 'lucide-react';
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

export const Game: React.FC = () => {
  const navigate = useNavigate();
  const gameStore = useGameStore();
  const { speak } = useSpeech();

  // UI state
  const [showHandoff, setShowHandoff] = useState(false);
  const [showRoleReveal, setShowRoleReveal] = useState(false);
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [witchChoice, setWitchChoice] = useState<'antidote' | 'poison' | 'none' | null>(null);
  const [seerResult, setSeerResult] = useState<{ name: string; isWerewolf: boolean } | null>(null);
  const [showHunterShoot, setShowHunterShoot] = useState(false);
  const [showWolfKingShoot, setShowWolfKingShoot] = useState(false);

  // 狼人投票状态
  const [werewolfVotes, setWerewolfVotes] = useState<Record<string, string>>({}); // 狼人投票记录
  const [currentWerewolfIndex, setCurrentWerewolfIndex] = useState(0); // 当前狼人索引
  const [showWerewolfVoteResult, setShowWerewolfVoteResult] = useState(false); // 显示投票结果
  const [showDeathAnnouncement, setShowDeathAnnouncement] = useState(false); // 显示死亡公布
  const [killedPlayerName, setKilledPlayerName] = useState<string | null>(null); // 被杀玩家名字
  const werewolfVoteTriggeredRef = useRef<string>(''); // 防止重复触发

  // Refs for timer access in handlers
  const timerRef = useRef<{ pause: () => void; reset: () => void; start: () => void } | null>(null);
  // Track which night phase we've already triggered action for
  const triggeredPhaseRef = useRef<string>('');
  // Track if we've already handled the phase redirect
  const phaseRedirectHandledRef = useRef(false);
  // Store timeout ID outside of effect cleanup to survive React StrictMode double-invocation
  const nightActionTimeoutRef = useRef<number | null>(null);

  // Get store values directly to avoid stale closures
  const phase = useGameStore(state => state.phase);
  const nightPhase = useGameStore(state => state.nightPhase);
  const round = useGameStore(state => state.round);
  const players = useGameStore(state => state.players);
  const setNightPhase = useGameStore(state => state.setNightPhase);
  const endNightPhase = useGameStore(state => state.endNightPhase);
  const startNightPhase = useGameStore(state => state.startNightPhase);
  const checkGameEnd = useGameStore(state => state.checkGameEnd);
  const pendingHunterShoot = useGameStore(state => state.pendingHunterShoot);
  const hunterShoot = useGameStore(state => state.hunterShoot);
  const skipHunterShoot = useGameStore(state => state.skipHunterShoot);
  const setHunterTarget = useGameStore(state => state.setHunterTarget);
  const confirmHunterShoot = useGameStore(state => state.confirmHunterShoot);
  const hunterTarget = useGameStore(state => state.hunterTarget);
  const idiotRevealed = useGameStore(state => state.idiotRevealed);
  const deadTonight = useGameStore(state => state.deadTonight);
  const witchHasAntidote = useGameStore(state => state.witchHasAntidote);
  const witchHasPoison = useGameStore(state => state.witchHasPoison);
  const executeNightAction = useGameStore(state => state.executeNightAction);
  const useWitchAntidote = useGameStore(state => state.useWitchAntidote);
  const useWitchPoison = useGameStore(state => state.useWitchPoison);
  const settings = useGameStore(state => state.settings);

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

  // Get current action player - use direct store values
  const findActionPlayer = useCallback((currentNightPhase: NightPhase | null, currentPlayers: Player[]): Player | null => {
    if (!currentNightPhase) return null;

    // Defensive check: ensure players array is valid
    if (!currentPlayers || currentPlayers.length === 0) {
      console.warn('[Werewolf] findActionPlayer called with empty players array');
      return null;
    }

    const map: Record<NightPhase, RoleType[]> = {
      werewolf: ['werewolf', 'wolfKing'],
      seer: ['seer'],
      witch: ['witch'],
      hunter: ['hunter'],
      other: [],
    };

    for (const role of map[currentNightPhase] || []) {
      // Find first alive player with matching role
      const p = currentPlayers.find(pl => pl.isAlive && pl.role === role);
      if (p) return p;
    }

    console.warn(`[Werewolf] No alive player found for night phase: ${currentNightPhase}`);
    console.warn(`[Werewolf] Available players:`, currentPlayers.map(p => ({ id: p.id, name: p.name, role: p.role, isAlive: p.isAlive })));
    return null;
  }, []);

  // 获取所有存活的狼人（用于狼人投票）
  const getAliveWerewolves = useCallback((currentPlayers: Player[]): Player[] => {
    if (!currentPlayers || currentPlayers.length === 0) return [];
    return currentPlayers.filter(p => p.isAlive && (p.role === 'werewolf' || p.role === 'wolfKing'));
  }, []);

  // Advance to next night phase
  const goToNextNightPhase = useCallback(async () => {
    const phases: NightPhase[] = ['werewolf', 'seer', 'witch', 'hunter', 'other'];
    const currentNightPhase = useGameStore.getState().nightPhase;
    const idx = phases.indexOf(currentNightPhase || 'werewolf');
    if (idx < phases.length - 1) {
      setNightPhase(phases[idx + 1]);
    } else {
      await speak(SPEECH_MESSAGES.NIGHT_END);
      endNightPhase();
    }
  }, [setNightPhase, endNightPhase, speak]);

  // Complete current action and advance
  const completeAction = useCallback(() => {
    timerRef.current?.pause();
    setSelectedTarget(null);
    setWitchChoice(null);
    setSeerResult(null);
    setActionPlayerId(null);
    setShowHandoff(false);
    setShowRoleReveal(false);
    triggeredPhaseRef.current = ''; // Reset to allow next phase trigger
    goToNextNightPhase();
  }, [goToNextNightPhase]);

  // Timer hook
  const timer = useTimer({
    initialTime: settings.actionTime,
    onTimeUp: completeAction,
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

  // ========== Core night-phase auto-trigger effect ==========
  // This effect handles automatically finding and triggering the next action player
  // when a new night phase begins.
  //
  // IMPORTANT: React StrictMode in dev mode double-invokes effects (mount→unmount→mount).
  // To survive this, we store the timeout ID in a ref that persists across unmount/remount,
  // so the actual action logic will execute even if StrictMode clears the first timeout.
  useEffect(() => {
    // Only run during night phase
    if (phase !== 'night') {
      return;
    }

    // Must have a valid night phase
    if (!nightPhase) {
      return;
    }

    // Don't trigger if we're already showing UI or have an action player
    if (showHandoff || showRoleReveal || actionPlayerId) {
      return;
    }

    // 狼人阶段使用特殊的投票机制，不在这里触发
    if (nightPhase === 'werewolf') {
      return;
    }

    // Create unique key for this specific round+phase combination
    const key = `${round}-${nightPhase}`;

    // Prevent duplicate triggers for the same phase
    if (triggeredPhaseRef.current === key) {
      return;
    }

    // Mark this phase as triggered
    triggeredPhaseRef.current = key;

    // Use a small delay to ensure state has fully propagated
    const timeoutId = window.setTimeout(async () => {
      try {
        // Get the absolute latest state from store to avoid stale closures
        const currentState = useGameStore.getState();

        console.log('[Werewolf] Looking for action player:', {
          nightPhase: currentState.nightPhase,
          playerCount: currentState.players.length,
          players: currentState.players.map(p => ({ name: p.name, role: p.role, isAlive: p.isAlive }))
        });

        const player = findActionPlayer(currentState.nightPhase, currentState.players);

        if (!player) {
          console.warn(`[Werewolf] No action player found for phase ${currentState.nightPhase}, skipping to next phase`);
          triggeredPhaseRef.current = '';
          await goToNextNightPhase();
          return;
        }

        console.log('[Werewolf] Found action player:', player.name, 'with role:', player.role);

        setActionPlayerId(player.id);
        setShowHandoff(true);

        // Play appropriate speech based on current night phase
        const np = currentState.nightPhase;
        if (np === 'seer') {
          await speak(SPEECH_MESSAGES.SEER_WAKE);
        } else if (np === 'witch') {
          await speak(SPEECH_MESSAGES.WITCH_WAKE);
        }
      } catch (error) {
        console.error('[Werewolf] Error in night phase auto-trigger:', error);
        triggeredPhaseRef.current = '';
        try {
          await goToNextNightPhase();
        } catch (advanceError) {
          console.error('[Werewolf] Failed to advance phase after error:', advanceError);
        }
      }
    }, 600);

    // Store in ref so it survives React StrictMode cleanup
    nightActionTimeoutRef.current = timeoutId;

    // Note: We intentionally do NOT clear the timeout on cleanup,
    // because React StrictMode's double-invocation would cancel our real timeout.
    // The ref-based deduplication (triggeredPhaseRef) prevents duplicate execution.
    return () => {};
  }, [phase, nightPhase, round, showHandoff, showRoleReveal, actionPlayerId, findActionPlayer, goToNextNightPhase, speak]);

  // ========== 狼人投票自动触发 effect ==========
  useEffect(() => {
    if (phase !== 'night' || nightPhase !== 'werewolf') return;

    // 获取所有存活的狼人
    const aliveWerewolves = getAliveWerewolves(players);
    if (aliveWerewolves.length === 0) {
      // 没有狼人，跳过
      triggeredPhaseRef.current = '';
      goToNextNightPhase();
      return;
    }

    // 如果已经在显示投票结果，不触发
    if (showWerewolfVoteResult) return;

    // 如果已经显示传递界面或角色揭示，不触发
    if (showHandoff || showRoleReveal) return;

    // 如果已经有选中的目标，不触发
    if (selectedTarget) return;

    const key = `werewolf-vote-${round}-${currentWerewolfIndex}`;
    if (werewolfVoteTriggeredRef.current === key) return;

    werewolfVoteTriggeredRef.current = key;

    const timeoutId = window.setTimeout(async () => {
      try {
        const currentState = useGameStore.getState();
        const werewolves = getAliveWerewolves(currentState.players);

        if (werewolves.length === 0) {
          triggeredPhaseRef.current = '';
          await goToNextNightPhase();
          return;
        }

        // 检查是否所有狼人都已投票
        if (currentWerewolfIndex >= werewolves.length) {
          // 所有狼人已投票，显示投票结果
          setShowWerewolfVoteResult(true);
          return;
        }

        const currentWerewolf = werewolves[currentWerewolfIndex];
        console.log('[Werewolf Vote] Current werewolf:', currentWerewolf.name, 'index:', currentWerewolfIndex);

        setActionPlayerId(currentWerewolf.id);
        setShowHandoff(true);
        await speak(SPEECH_MESSAGES.WEREWOLF_WAKE);
      } catch (error) {
        console.error('[Werewolf Vote] Error:', error);
        werewolfVoteTriggeredRef.current = '';
        try {
          await goToNextNightPhase();
        } catch (advanceError) {
          console.error('[Werewolf Vote] Failed to advance:', advanceError);
        }
      }
    }, 600);

    nightActionTimeoutRef.current = timeoutId;
    return () => {};
  }, [phase, nightPhase, round, currentWerewolfIndex, showHandoff, showRoleReveal, selectedTarget, showWerewolfVoteResult, players, getAliveWerewolves, goToNextNightPhase, speak]);

  // Current action player object
  const currentActionPlayer = players.find(p => p.id === actionPlayerId) || null;

  // Handlers
  const handleHandoffConfirm = () => {
    setShowHandoff(false);
    setShowRoleReveal(true);
    if (settings.timerEnabled) { timer.reset(); timer.start(); }
  };

  const handleRoleConfirm = () => setShowRoleReveal(false);

  const handleSelectTarget = (player: Player) => {
    if (!currentActionPlayer || !player.isAlive) return;
    if (nightPhase === 'werewolf' && player.id === currentActionPlayer.id) return;
    setSelectedTarget(player.id);
  };

  const executeAction = async () => {
    if (!currentActionPlayer || !selectedTarget) return;
    const target = players.find(p => p.id === selectedTarget);
    if (!target) return;

    const currentRound = useGameStore.getState().round;
    const currentNightPhase = nightPhase;

    if (currentNightPhase === 'werewolf') {
      // 狼人投票：记录投票而不是立即击杀
      setWerewolfVotes(prev => ({ ...prev, [currentActionPlayer.id]: selectedTarget }));
      setSelectedTarget(null);
      setActionPlayerId(null);
      setShowHandoff(false);
      setShowRoleReveal(false);
      werewolfVoteTriggeredRef.current = '';

      // 检查是否还有下一个狼人需要投票
      const aliveWerewolves = getAliveWerewolves(players);
      if (currentWerewolfIndex < aliveWerewolves.length - 1) {
        // 还有狼人需要投票
        setCurrentWerewolfIndex(prev => prev + 1);
      } else {
        // 所有狼人已投票，显示投票结果
        setShowWerewolfVoteResult(true);
      }

      await speak(SPEECH_MESSAGES.WEREWOLF_SLEEP);
      return;
    } else if (currentNightPhase === 'seer') {
      const isW = ROLES[target.role].camp === 'werewolf';
      setSeerResult({ name: target.name, isWerewolf: isW });
      await speak(SPEECH_MESSAGES.SEER_RESULT(isW));
      executeNightAction({ round: currentRound, phase: 'seer', actorId: currentActionPlayer.id, actorRole: 'seer', targetId: selectedTarget, actionType: 'check', result: { success: true, message: isW ? '狼人' : '好人' } });
      await speak(SPEECH_MESSAGES.SEER_SLEEP);
    } else if (currentNightPhase === 'witch') {
      if (witchChoice === 'antidote') useWitchAntidote(selectedTarget);
      else if (witchChoice === 'poison') useWitchPoison(selectedTarget);
      await speak(SPEECH_MESSAGES.WITCH_SLEEP);
    }

    completeAction();
  };

  // 处理狼人投票结果
  const handleWerewolfVoteResult = async () => {
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
      // 只有一个最高票
      finalTargetId = topVoted[0];
    } else {
      // 平票：随机选择一个
      const randomIndex = Math.floor(Math.random() * topVoted.length);
      finalTargetId = topVoted[randomIndex];
      console.log('[Werewolf Vote] Tie detected, randomly selected:', finalTargetId);
    }

    const finalTarget = players.find(p => p.id === finalTargetId);
    if (!finalTarget) {
      console.error('[Werewolf Vote] Final target not found');
      goToNextNightPhase();
      return;
    }

    // 执行击杀
    const firstWerewolf = getAliveWerewolves(players)[0];
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

    // 显示死亡公布界面
    setKilledPlayerName(finalTarget.name);
    setShowWerewolfVoteResult(false);
    setShowDeathAnnouncement(true);

    // 等待3秒后自动进入下一阶段
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 重置狼人投票状态
    setWerewolfVotes({});
    setCurrentWerewolfIndex(0);
    setShowDeathAnnouncement(false);
    setKilledPlayerName(null);
    werewolfVoteTriggeredRef.current = '';
    triggeredPhaseRef.current = '';

    // 进入下一阶段
    goToNextNightPhase();
  };

  // ===================== RENDER =====================

  // Night phase
  if (phase === 'night') {
    // 获取所有存活的狼人
    const aliveWerewolves = getAliveWerewolves(players);

    return (
      <div className="min-h-screen bg-gray-900 px-4 py-8">
        {showHandoff && currentActionPlayer && (
          <HandoffScreen player={currentActionPlayer} onConfirm={handleHandoffConfirm} />
        )}
        {showRoleReveal && currentActionPlayer && (
          <RoleReveal player={currentActionPlayer} onComplete={handleRoleConfirm} antiPeekMode={settings.antiPeekMode} />
        )}

        {/* 死亡公布界面 */}
        {showDeathAnnouncement && killedPlayerName && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50"
          >
            <div className="text-center max-w-sm">
              <Skull className="w-16 h-16 text-red-400 mb-6 mx-auto animate-pulse" />
              <div className="text-2xl text-gray-100 mb-4">狼人击杀目标</div>
              <div className="text-4xl font-bold text-red-400 mb-6">{killedPlayerName}</div>
              <div className="text-sm text-gray-400">即将进入下一阶段...</div>
            </div>
          </motion.div>
        )}

        {/* 狼人投票结果展示 */}
        {showWerewolfVoteResult && nightPhase === 'werewolf' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto">
            <Card variant="bordered" className="mb-6">
              <div className="text-center mb-4">
                <Target className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <div className="text-lg text-gray-100 mb-2">狼人投票结果</div>
                <div className="text-sm text-gray-400 mb-4">所有狼人已投票完毕</div>
              </div>

              {/* 投票明细 */}
              <div className="space-y-2 mb-4">
                {Object.entries(werewolfVotes).map(([voterId, targetId]) => {
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

              {/* 统计结果 */}
              <div className="p-3 bg-red-900/20 rounded-lg border border-red-700/50 mb-4">
                <div className="text-sm text-red-400 mb-2">投票统计</div>
                {(() => {
                  const voteCounts: Record<string, number> = {};
                  Object.values(werewolfVotes).forEach(targetId => {
                    voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
                  });
                  const maxVotes = Math.max(...Object.values(voteCounts), 0);
                  const topVoted = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);

                  return (
                    <div className="space-y-1">
                      {Object.entries(voteCounts).map(([targetId, count]) => {
                        const target = players.find(p => p.id === targetId);
                        if (!target) return null;
                        const isTop = voteCounts[targetId] === maxVotes;
                        return (
                          <div key={targetId} className={`flex justify-between text-sm ${isTop ? 'text-red-300 font-bold' : 'text-gray-400'}`}>
                            <span>{target.name}</span>
                            <span>{count} 票 {isTop && topVoted.length > 1 ? '(平票)' : isTop ? '(最高票)' : ''}</span>
                          </div>
                        );
                      })}
                      {topVoted.length > 1 && (
                        <div className="text-xs text-yellow-400 mt-2">平票将随机选择一人击杀</div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <Button variant="primary" onClick={handleWerewolfVoteResult} className="w-full">
                确认击杀目标
              </Button>
            </Card>
          </motion.div>
        )}

        {/* 正常行动界面 */}
        {!showWerewolfVoteResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Moon className="w-6 h-6 text-purple-400" />
                <span className="text-xl font-bold text-gray-100">第 {round} 夜</span>
              </div>
              <div className="text-sm text-gray-400">
                {nightPhase === 'werewolf' && aliveWerewolves.length > 1
                  ? `狼人投票 (${currentWerewolfIndex + 1}/${aliveWerewolves.length})`
                  : { werewolf: '狼人行动', seer: '预言家行动', witch: '女巫行动', hunter: '猎人行动', other: '其他角色行动' }[nightPhase!] || ''}
              </div>
            </div>

            {/* Action UI */}
            {currentActionPlayer && !showHandoff && !showRoleReveal && (
              <Card variant="bordered" className="mb-6">
                <div className="text-center mb-4">
                  <div className="text-lg text-gray-100 mb-2">
                    {nightPhase === 'werewolf' && aliveWerewolves.length > 1
                      ? `${currentActionPlayer.name} 的投票`
                      : `${currentActionPlayer.name} 的行动`}
                  </div>
                  {settings.timerEnabled && (
                    <Timer time={timer.time} isRunning={timer.isRunning} showProgress totalTime={settings.actionTime} />
                  )}
                </div>

                {/* 狼人投票时显示之前狼人的投票结果 */}
                {nightPhase === 'werewolf' && Object.keys(werewolfVotes).length > 0 && (
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
                    {/* 显示当前投票统计 */}
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

                {nightPhase !== 'witch' ? (
                  <>
                    <div className="text-sm text-gray-400 mb-3">
                      {nightPhase === 'werewolf' ? '选择要击杀的目标' : '选择目标玩家'}
                    </div>
                    {/* 狼人不能选择自己，但可以选择其他狼人 */}
                    <PlayerList
                      players={players.filter(p => p.isAlive && p.id !== currentActionPlayer.id)}
                      onSelect={handleSelectTarget}
                      selectedId={selectedTarget}
                      layout="grid"
                    />
                    {selectedTarget && (
                      <Button variant="primary" onClick={executeAction} className="w-full mt-4">
                        {nightPhase === 'werewolf' ? '确认投票' : '确认行动'}
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="text-sm text-gray-400 mb-3">女巫行动选择</div>
                    {/* 女巫盲救：不显示被杀者名字 */}
                    {witchHasAntidote && (
                      <div className="p-3 bg-green-900/20 rounded-lg border border-green-700/50 mb-4">
                        <div className="text-sm text-green-400 mb-2">使用解药</div>
                        <div className="text-xs text-gray-400 mb-2">选择一名玩家使用解药（盲救）</div>
                        <PlayerList players={players.filter(p => p.isAlive)}
                          onSelect={(p) => { setWitchChoice('antidote'); setSelectedTarget(p.id); }}
                          selectedId={witchChoice === 'antidote' ? selectedTarget : undefined} layout="grid" />
                      </div>
                    )}
                    {witchHasPoison && (
                      <div className="p-3 bg-red-900/20 rounded-lg border border-red-700/50">
                        <div className="text-sm text-red-400 mb-2">使用毒药</div>
                        <PlayerList players={players.filter(p => p.isAlive && p.id !== currentActionPlayer.id)}
                          onSelect={(p) => { setWitchChoice('poison'); setSelectedTarget(p.id); }}
                          selectedId={witchChoice === 'poison' ? selectedTarget : undefined} layout="grid" />
                      </div>
                    )}
                    <Button variant="ghost" onClick={() => { setWitchChoice('none'); completeAction(); }} className="w-full">不使用技能</Button>
                    {witchChoice && witchChoice !== 'none' && selectedTarget && (
                      <Button variant="primary" onClick={executeAction} className="w-full">确认行动</Button>
                    )}
                  </div>
                )}

                {seerResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-4 rounded-lg border"
                    style={{ backgroundColor: seerResult.isWerewolf ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)', borderColor: seerResult.isWerewolf ? 'rgba(239,68,68,0.5)' : 'rgba(59,130,246,0.5)' }}>
                    <div className="text-center">
                      <div className="text-lg mb-2">{seerResult.name}</div>
                      <div className={`text-xl font-bold ${seerResult.isWerewolf ? 'text-red-400' : 'text-blue-400'}`}>{seerResult.isWerewolf ? '狼人' : '好人'}</div>
                    </div>
                    <Button variant="primary" onClick={completeAction} className="w-full mt-4">我已记住，继续</Button>
                  </motion.div>
                )}
              </Card>
            )}

            {!currentActionPlayer && !showHandoff && (
              <Card variant="bordered" className="mb-6"><div className="text-center text-gray-400">正在等待下一个阶段...</div></Card>
            )}
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

// Handoff screen
const HandoffScreen: React.FC<{ player: Player; onConfirm: () => void }> = ({ player, onConfirm }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50">
    <div className="text-center max-w-sm">
      <Users className="w-12 h-12 text-purple-400 mb-6 mx-auto" />
      <div className="text-xl text-gray-100 mb-4">请将设备传递给</div>
      <div className="text-3xl font-bold text-purple-400 mb-8">{player.name}</div>
      <Button variant="primary" size="lg" onClick={onConfirm} className="w-full">我已收到设备</Button>
      <div className="mt-4 text-xs text-gray-500">请确保其他玩家无法看到屏幕内容</div>
    </div>
  </motion.div>
);

// 投票传递界面
const VoteHandoffScreen: React.FC<{ voter: Player; currentIndex: number; totalCount: number; onConfirm: () => void }> = ({ voter, currentIndex, totalCount, onConfirm }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50">
    <div className="text-center max-w-sm">
      <Target className="w-12 h-12 text-yellow-400 mb-6 mx-auto" />
      <div className="text-xl text-gray-100 mb-4">请将设备传递给</div>
      <div className="text-3xl font-bold text-yellow-400 mb-2">{voter.name}</div>
      <div className="text-sm text-gray-400 mb-8">第 {currentIndex} 位投票者 / 共 {totalCount} 位</div>
      <Button variant="primary" size="lg" onClick={onConfirm} className="w-full">我已收到设备，开始投票</Button>
      <div className="mt-4 text-xs text-gray-500">请确保其他玩家无法看到屏幕内容</div>
    </div>
  </motion.div>
);

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

  // 开始投票环节：重置状态，触发第一位投票者传递
  useEffect(() => {
    if (phase !== 'vote') return;
    setVotes({});
    setCurrentVoterIndex(0);
    setSelectedVoteTarget(null);
    setShowVoteHandoff(false);
    voteHandoffTriggeredRef.current = '';
  }, [phase]);

  // 投票传递自动触发（与夜晚阶段相同的模式）
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

  // 确认投票：记录当前玩家的票，进入下一位或公布结果
  const confirmVote = () => {
    const currentVoter = votingPlayers[currentVoterIndex];
    if (!currentVoter || !selectedVoteTarget) return;

    setVotes(prev => ({ ...prev, [currentVoter.id]: selectedVoteTarget }));
    setSelectedVoteTarget(null);
    setShowVoteHandoff(false);
    voteHandoffTriggeredRef.current = '';

    // 还有下一位投票者
    if (currentVoterIndex < votingPlayers.length - 1) {
      setCurrentVoterIndex(prev => prev + 1);
    } else {
      // 所有票已收集完毕，公布结果
      setPhase('voteResult');
    }
  };

  // 公布投票结果并处理出局
  const finishVote = () => {
    const counts: Record<string, number> = {};
    Object.values(votes).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    const max = Math.max(...Object.values(counts), 0);
    const topVoted = Object.keys(counts).filter(id => counts[id] === max);

    // 平票处理：重新投票
    if (topVoted.length > 1) {
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

    // 检查猎人技能（白天投票出局）
    if (eliminated.role === 'hunter' && useGameStore.getState().hunterCanShoot) {
      setPhase('hunterShoot');
      return;
    }

    // 检查狼王技能（白天投票出局）
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
    // 狼王开枪带走目标
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
              <VoteHandoffScreen
                voter={votingPlayers[currentVoterIndex]}
                currentIndex={currentVoterIndex + 1}
                totalCount={votingPlayers.length}
                onConfirm={() => setShowVoteHandoff(false)}
              />
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
