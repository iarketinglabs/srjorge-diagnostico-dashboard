// Estado global mínimo de "há edição não salva", separado do DocumentEditor
// (carregado sob demanda) para que a navegação do App possa consultá-lo.
let unsavedEdits = false;

export function setUnsavedEdits(value: boolean) {
  unsavedEdits = value;
}

export function confirmDiscardEdits(): boolean {
  if (!unsavedEdits) return true;
  const ok = window.confirm("Há alterações não salvas neste documento. Descartá-las?");
  if (ok) unsavedEdits = false;
  return ok;
}
