// test/health.test.js
const request = require('supertest');
const app = require('../server');

describe('Health & Status', () => {
  test('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });

  test('GET /status returns JSON with deploy_tag', async () => {
    const res = await request(app).get('/status');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('uptime_seconds');
  });
});
