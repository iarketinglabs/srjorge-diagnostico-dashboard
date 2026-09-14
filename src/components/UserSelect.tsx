import { USERS, initials, setCurrentUser, type UserName } from "../lib/user";

type Props = {
  onSelect: (user: UserName) => void;
};

export function UserSelect({ onSelect }: Props) {
  function pick(user: UserName) {
    setCurrentUser(user);
    onSelect(user);
  }

  return (
    <div className="gate-shell">
      <div className="poster-card-cyan gate-card">
        <p className="eyebrow">Identificação</p>
        <h1 className="font-display gate-title">
          Quem é <span className="script-red">você</span>?
        </h1>
        <p className="gate-copy">
          Selecione seu nome para assinar comentários e checks de validação neste painel.
        </p>
        <div className="user-select-list">
          {USERS.map((user) => (
            <button key={user} type="button" className="user-select-btn" onClick={() => pick(user)}>
              <span className="user-select-avatar" aria-hidden="true">
                {initials(user)}
              </span>
              {user}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
