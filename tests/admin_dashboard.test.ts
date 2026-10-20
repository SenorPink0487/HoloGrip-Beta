import assert from 'node:assert/strict';

// Non-destructive smoke check. CRUD and authorization tests run in Rust against
// the isolated virtuallab_test database; never create fixtures in the user's data.
const base = process.env.ADMIN_TEST_API_URL || 'http://127.0.0.1:8080';
let reachable = false;
try { reachable = (await fetch(`${base}/health`)).ok; } catch { /* optional local service */ }
if (reachable) {
  for (const endpoint of ['overview', 'users', 'classes', 'security']) {
    const response = await fetch(`${base}/api/v1/admin/${endpoint}`);
    assert.equal(response.status, 401, `${endpoint} must reject anonymous access`);
  }
  console.log('✅ Admin API rejects anonymous access.');
} else {
  console.log('Admin smoke check skipped: no local backend. Run cargo test --manifest-path server/Cargo.toml for isolated integration tests.');
}
