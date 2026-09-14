import { useEffect, useState } from "react";
import { fetchValidationsForDoc, setValidationCheck, USERS, type Validation } from "../lib/validation";
import { initials, type UserName } from "../lib/user";

type Props = {
  docPath: string;
  currentUser: UserName | null;
};

export function DocValidationChecks({ docPath, currentUser }: Props) {
  const [checks, setChecks] = useState<Validation[]>([]);
  const [loading, setLoading] = useState<UserName | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchValidationsForDoc(docPath)
      .then((rows) => {
        if (!cancelled) setChecks(rows);
      })
      .catch(() => {
        if (!cancelled) setChecks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [docPath]);

  async function toggle(user: UserName) {
    if (currentUser !== user) return;
    const existing = checks.find((c) => c.user_name === user);
    const nextChecked = !existing?.checked;
    setLoading(user);
    try {
      await setValidationCheck(docPath, user, nextChecked);
      setChecks((prev) => {
        const others = prev.filter((c) => c.user_name !== user);
        return [...others, { id: existing?.id ?? user, doc_path: docPath, user_name: user, checked: nextChecked, checked_at: new Date().toISOString() }];
      });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="validation-checks">
      <span className="validation-checks-label">Validação:</span>
      {USERS.map((user) => {
        const checked = checks.find((c) => c.user_name === user)?.checked ?? false;
        const isMine = currentUser === user;
        return (
          <button
            key={user}
            type="button"
            className={`validation-check-btn ${checked ? "is-checked" : ""} ${isMine ? "is-mine" : ""}`}
            onClick={() => toggle(user)}
            disabled={!isMine || loading === user}
            title={isMine ? `Marcar validação de ${user}` : `Somente ${user} pode marcar este check`}
          >
            <span className="validation-check-avatar">{initials(user)}</span>
            {checked ? "✓" : ""}
          </button>
        );
      })}
    </div>
  );
}
