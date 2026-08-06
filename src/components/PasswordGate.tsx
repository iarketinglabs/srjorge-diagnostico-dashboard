import { useState, type FormEvent } from "react";
import { decryptContent, fetchEncryptedPayload, WrongPasswordError, type DashboardContent } from "../lib/decrypt";

const SESSION_KEY = "srjorge-dashboard-unlocked";

type Props = {
  onUnlock: (content: DashboardContent) => void;
};

export function PasswordGate({ onUnlock }: Props) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attempt(pw: string) {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchEncryptedPayload();
      const content = await decryptContent(pw, payload);
      sessionStorage.setItem(SESSION_KEY, pw);
      onUnlock(content);
    } catch (err) {
      if (err instanceof WrongPasswordError) {
        setError("Senha incorreta. Tente novamente.");
      } else {
        setError("Erro ao carregar o painel. Tente recarregar a página.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    void attempt(password.trim());
  }

  return (
    <div className="gate-shell">
      <div className="poster-card-cyan gate-card">
        <p className="eyebrow">Acesso restrito</p>
        <h1 className="font-display gate-title">
          Painel de Diagnóstico <span className="script-red">Sr. Jorge</span>
        </h1>
        <p className="gate-copy">
          Este painel contém informações confidenciais do diagnóstico estratégico. Insira a senha
          fornecida pela Atomica para continuar.
        </p>
        <form onSubmit={handleSubmit} className="field gate-form">
          <label htmlFor="dashboard-password">Senha</label>
          <input
            id="dashboard-password"
            className="field-control"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? "true" : "false"}
            disabled={loading}
          />
          {error && <span className="error-text">{error}</span>}
          <button type="submit" className="atomica-button" disabled={loading || !password.trim()}>
            {loading ? "Verificando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export async function tryAutoUnlock(): Promise<DashboardContent | null> {
  const cached = sessionStorage.getItem(SESSION_KEY);
  if (!cached) return null;
  try {
    const payload = await fetchEncryptedPayload();
    return await decryptContent(cached, payload);
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}
