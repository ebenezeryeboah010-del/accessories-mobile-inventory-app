const assert = require("assert");

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:4173";

async function main() {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "ceo@mobilehub.test", password: "password123" }),
  });
  assert.strictEqual(login.status, 200, "CEO login should succeed");

  const auth = await login.json();
  assert.ok(auth.token, "login should return a token");

  const inventory = await fetch(`${baseUrl}/api/inventory`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  assert.strictEqual(inventory.status, 200, "inventory should load");

  const inventoryJson = await inventory.json();
  assert.ok(Array.isArray(inventoryJson.items), "items should be an array");
  assert.ok(Array.isArray(inventoryJson.categories), "categories should be an array");

  const analytics = await fetch(`${baseUrl}/api/analytics`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  assert.strictEqual(analytics.status, 200, "analytics should load");

  console.log("API smoke test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
