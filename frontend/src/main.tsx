import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { HostProvider } from './context/HostContext.tsx';
import { PasscodeProvider } from './context/PasscodeContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PasscodeProvider>
      <HostProvider>
        <App />
      </HostProvider>
    </PasscodeProvider>
  </StrictMode>,
);
