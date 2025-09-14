// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const client = require('prom-client'); // optional if using Prom client

const app = express();
const PORT = process.env.PORT || 3000;

// enable CORS in case dashboard served from different origin
app.use(cors());

// serve dashboard and static assets
app.use(express.static(path.join(__dirname, 'public')));

// health endpoint (used by Jenkins)
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.APP_VERSION || '1.0.0'
    });
});

// status endpoint (dashboard-friendly JSON)
app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    uptime_seconds: process.uptime(),
    memory: process.memoryUsage(),
    deploy_tag: process.env.APP_VERSION || process.env.DEPLOY_TAG || null,
    timestamp: Date.now()
  });
});

// Prometheus-style metrics (if you use prom-client)
client.collectDefaultMetrics();
const deployCounter = new client.Counter({
  name: 'app_deploy_total',
  help: 'Number of times the app started (increment on start)'
});
deployCounter.inc();

// JSON metrics for CI/CD or local testing
app.get('/metrics-json', (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: Date.now()
  });
});


app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// fallback route serves index
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
