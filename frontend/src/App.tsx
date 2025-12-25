import { useState } from "react";
import "./App.css";

export default function App() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const createUser = async () => {
    setError("");
    try {
      const res = await fetch("http://localhost:4000/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>MusicApp MVP</h1>

      <input
        placeholder="Enter email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ padding: 8, width: 300 }}
      />

      <br /><br />

      <button onClick={createUser}>Create User</button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {result && (
        <pre style={{ marginTop: 20 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
