import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { HostProvider } from './context/HostContext.tsx';
import { PasscodeProvider } from './context/PasscodeContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <PasscodeProvider>
        <HostProvider>
          <App />
        </HostProvider>
      </PasscodeProvider>
    </BrowserRouter>
  </StrictMode>,
);
