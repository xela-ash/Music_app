import { useEffect, useState } from "react";

type ApiResponse = { message: string };

export default function App() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://localhost:4000/")
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>MusicApp MVP</h1>
      <p>Backend says:</p>

      {error && <pre>{error}</pre>}
      {data ? <pre>{JSON.stringify(data, null, 2)}</pre> : <p>Loading…</p>}
    </main>
  );
}
