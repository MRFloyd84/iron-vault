import { createRoot } from 'react-dom/client';
import Cockpit from './cockpit';
import './globals.css';

// Ohne StrictMode: Die Szene erzeugt WebGL- und Audio-Kontexte, die nicht doppelt
// aufgebaut werden sollen.
createRoot(document.getElementById('root')!).render(<Cockpit />);
