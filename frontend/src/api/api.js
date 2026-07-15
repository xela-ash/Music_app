const API_BASE = "http://localhost:4000";

async function parseResponse(res) {
  const text = await res.text(); // IMPORTANT: read raw text first
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || "Request failed"); // this will show the HTML error instead of "Unexpected token <"
  }

  if (!res.ok) {
    throw new Error((data && data.error) || "Request failed");
  }
  return data;
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiPost(path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(body),
  });

  return parseResponse(res);
}

export async function apiGet(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      ...authHeaders(token),
    },
  });

  return parseResponse(res);
}
