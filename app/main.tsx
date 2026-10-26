import { createRoot } from 'react-dom/client';
import Cockpit from './cockpit';
import './globals.css';
import { installAudioCounter } from '../lib/perf-monitor';

// Zählt aktive Audioquellen für die Diagnoseanzeige (F3); kostet praktisch nichts.
installAudioCounter();

// Ohne StrictMode: Die Szene erzeugt WebGL- und Audio-Kontexte, die nicht doppelt
// aufgebaut werden sollen.
createRoot(document.getElementById('root')!).render(<Cockpit />);
