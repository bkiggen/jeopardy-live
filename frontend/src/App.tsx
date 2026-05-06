import { Navigate, Route, Routes } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { Room } from './pages/Room';
import { Admin } from './pages/Admin';

export type LastAdjust = {
  playerId: number;
  playerName: string;
  delta: number;
};

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/r/:code" element={<Room />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
