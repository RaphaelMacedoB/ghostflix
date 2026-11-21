// Ghostflix — interface em React organizada em MVC:
//   models/      dados e regras (API, filmes, progresso, preferências, legendas)
//   controllers/ estado e lógica (biblioteca em tempo real, player, avisos)
//   views/       componentes React que só desenham o estado e repassam ações
import { createRoot } from 'react-dom/client';
import App from './views/App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);
