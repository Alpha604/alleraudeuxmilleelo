import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {FirebaseErrorBoundary} from './components/FirebaseErrorBoundary.tsx';
import {enforceHttpsIfNeeded} from './utils/security.ts';
import './index.css';

enforceHttpsIfNeeded();

createRoot(document.getElementById('root')!).render(
  <FirebaseErrorBoundary>
    <App />
  </FirebaseErrorBoundary>
);
