const API_BASE = "http://localhost:4000";

export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text(); // IMPORTANT: read raw text first
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text); // this will show the HTML error instead of "Unexpected token <"
  }

  if (!res.ok) {
    throw new Error(data?.error || "Request failed");
  }
  return data;
}