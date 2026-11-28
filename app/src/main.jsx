import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { initGlassCards } from './glass.js';
import './styles.css';

initGlassCards();

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
