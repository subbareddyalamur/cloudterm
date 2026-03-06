import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

test.describe('API Endpoints - Instance Discovery', () => {
  test('GET /instances returns JSON', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/instances`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('GET /scan-status returns scan status', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/scan-status`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
  });

  test('GET /fleet-stats returns stats', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/fleet-stats`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('GET /fleet-summary returns summary', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/fleet-summary`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('GET /scan-instances triggers scan', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/scan-instances`);
    // May return 200 or error if already scanning
    expect([200, 409, 500]).toContain(res.status());
  });

  test('GET /rdp-mode returns mode', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/rdp-mode`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('mode');
    expect(['native', 'guacamole']).toContain(body.mode);
  });
});

test.describe('API Endpoints - Recordings', () => {
  test('GET /recordings returns list', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/recordings`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

test.describe('API Endpoints - AWS Accounts', () => {
  let createdAccountId: string = '';

  test('GET /aws-accounts returns list', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/aws-accounts`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body) || body === null).toBe(true);
  });

  test('POST /aws-accounts creates account', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/aws-accounts`, {
      data: {
        name: 'API Test Account',
        access_key_id: 'AKIAIOSFODNN7EXAMPLE',
        secret_access_key: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('name', 'API Test Account');
    expect(body.secret_access_key).toContain('****');
    createdAccountId = body.id;
  });

  test('POST /aws-accounts rejects missing access key', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/aws-accounts`, {
      data: { name: 'Bad Account', secret_access_key: 'something' }
    });
    expect(res.status()).toBe(400);
  });

  test('POST /aws-accounts rejects missing secret key', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/aws-accounts`, {
      data: { name: 'Bad Account', access_key_id: 'AKIAIOSFODNN7EXAMPLE' }
    });
    expect(res.status()).toBe(400);
  });

  test('POST /aws-accounts with session token', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/aws-accounts`, {
      data: {
        name: 'Token Account',
        access_key_id: 'ASIAIOSFODNN7EXAMPLE',
        secret_access_key: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        session_token: 'FwoGZXIvYXdzEBYaDHqa0AP6MiMV+nMnRSLIAfCGleJB+EXAMPLE',
      }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.session_token).toBe('****');
  });

  test('DELETE /aws-accounts/:id removes account', async ({ request }) => {
    // First create one
    const createRes = await request.post(`${BASE_URL}/aws-accounts`, {
      data: {
        name: 'Delete Test',
        access_key_id: 'AKIAIOSFODNN7EXAMPLE',
        secret_access_key: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      }
    });
    const { id } = await createRes.json();

    const delRes = await request.delete(`${BASE_URL}/aws-accounts/${id}`);
    expect(delRes.status()).toBe(200);
  });

  test('DELETE /aws-accounts/:id returns 404 for nonexistent', async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/aws-accounts/nonexistent-id`);
    expect(res.status()).toBe(404);
  });
});

test.describe('API Endpoints - Audit & Preferences', () => {
  test('GET /audit-log returns audit data', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/audit-log`);
    expect(res.status()).toBe(200);
  });

  test('GET /preferences returns preferences', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/preferences`);
    expect(res.status()).toBe(200);
  });

  test('PUT /preferences saves preferences', async ({ request }) => {
    const res = await request.put(`${BASE_URL}/preferences`, {
      data: { test_key: 'test_value' }
    });
    expect(res.status()).toBe(200);
  });
});

test.describe('API Endpoints - Port Forwarding', () => {
  test('GET /active-tunnels returns list', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/active-tunnels`);
    // May fail if forwarder sidecar is not running
    expect([200, 500, 502]).toContain(res.status());
  });
});

test.describe('API Endpoints - Session Export', () => {
  test('POST /export-session rejects missing session_id', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/export-session`, {
      data: {}
    });
    expect([400, 500]).toContain(res.status());
  });
});

test.describe('API Endpoints - Broadcast', () => {
  test('POST /broadcast-command with no instances returns error', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/broadcast-command`, {
      data: { command: 'echo test', instance_ids: [] }
    });
    expect([400, 500]).toContain(res.status());
  });
});

test.describe('API Endpoints - Static Assets', () => {
  test('GET /static/js/app.js is served', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/static/js/app.js`);
    expect(res.status()).toBe(200);
    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('javascript');
  });

  test('GET / serves the main page', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('CloudTerm');
  });
});

test.describe('API Endpoints - WebSocket', () => {
  test('GET /ws upgrades to WebSocket', async ({ page }) => {
    await page.goto(BASE_URL);
    const wsConnected = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const ws = new WebSocket(`ws://${window.location.host}/ws`);
        ws.onopen = () => { ws.close(); resolve(true); };
        ws.onerror = () => resolve(false);
        setTimeout(() => resolve(false), 3000);
      });
    });
    expect(wsConnected).toBe(true);
  });
});
