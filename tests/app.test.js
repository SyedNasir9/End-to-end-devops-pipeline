const request = require('supertest');
const app = require('../server');

describe('Application Tests', () => {
  test('Health endpoint should return 200', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');  // match server response
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('version');
  });

  test('Root endpoint should return HTML', async () => {
    const res = await request(app).get('/').expect(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  test('Metrics JSON endpoint should return JSON', async () => {
    const res = await request(app).get('/metrics-json').expect(200);
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('memory');
    expect(res.body).toHaveProperty('timestamp');
  });
});
