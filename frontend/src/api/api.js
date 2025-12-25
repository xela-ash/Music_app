const API_BASE = "http://localhost:4000";

export async function createUser(payload) {
  const res = await fetch(`${API_BASE}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create user");
  return data;
}

export async function listUsers() {
  const res = await fetch(`${API_BASE}/users`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to list users");
  return data.users;
}