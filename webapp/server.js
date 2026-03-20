/**
 * Task Manager Web App — Express server
 * Serves the UI and provides a REST API for task management.
 *
 * Run: node server.js
 * Port: 18799 (or PORT env var)
 */

const express = require('express');
const tasksRouter = require('./api/routes/tasks');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 18799;

// Parse JSON bodies
app.use(express.json());

// Serve static UI files
app.use(express.static(path.join(__dirname, 'ui')));

// CORS headers for development (Tailscale serve handles network-level access)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// API routes
app.use('/api/tasks', tasksRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'ui', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Task Manager Web App running on http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/tasks`);
  console.log(`   UI:  http://localhost:${PORT}/`);
});
