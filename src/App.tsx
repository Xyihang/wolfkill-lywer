import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Home } from "@/pages/Home";
import { Setup } from "@/pages/Setup";
import { Players } from "@/pages/Players";
import { Assign } from "@/pages/Assign";
import { Game } from "@/pages/Game";
import { Result } from "@/pages/Result";
import { Lobby } from "@/pages/Lobby";
import { WaitingRoom } from "@/components/multiplayer/WaitingRoom";
import { MultiplayerGame } from "@/pages/MultiplayerGame";

export default function App() {
  return (
    <Router>
      <Routes>
        {/* 单人模式 */}
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/players" element={<Players />} />
        <Route path="/assign" element={<Assign />} />
        <Route path="/game" element={<Game />} />
        <Route path="/result" element={<Result />} />
        
        {/* 多人模式 */}
        <Route path="/multiplayer/lobby" element={<Lobby />} />
        <Route path="/multiplayer/waiting" element={<WaitingRoom />} />
        <Route path="/multiplayer/game" element={<MultiplayerGame />} />
        
        <Route path="*" element={<div className="min-h-screen flex items-center justify-center text-gray-400">页面不存在</div>} />
      </Routes>
    </Router>
  );
}