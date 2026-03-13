import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Boot audio pipeline
import './audio.js';

const container = document.getElementById('root');
createRoot(container).render(<App />);
