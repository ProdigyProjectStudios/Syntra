import {
  BLUEPRINT_SECTIONS,
  type BlueprintMutation,
  type BlueprintUpdateInput,
} from "@workspace/consultation";

export type PendingBlueprintOperation = { id: number } & (
  | { kind: "regenerate"; input: BlueprintMutation }
  | { kind: "update"; input: BlueprintUpdateInput }
);
interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Recovery metadata is private to this tab; only read it after an owned Blueprint
 * fetch succeeds. A receipt retry always uses the original ID and complete body. */
export function createBlueprintOperationStore(
  scope: string,
  storage: () => StoragePort = () => sessionStorage,
) {
  const key = (id: number) =>
    `syntra.blueprint.pending.v1:${encodeURIComponent(scope)}:${id}`;
  const decode = (raw: string, id: number): PendingBlueprintOperation => {
    const value = JSON.parse(raw) as PendingBlueprintOperation;
    if (
      raw.length > 16000 ||
      !value ||
      value.id !== id ||
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !["update", "regenerate"].includes(value.kind) ||
      !value.input ||
      !Number.isSafeInteger(value.input.version) ||
      value.input.version < 0 ||
      typeof value.input.requestId !== "string" ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(value.input.requestId)
    )
      throw new Error(
        "The original Blueprint change could not be read. No new change was sent.",
      );
    if (value.kind === "update") {
      const edit = value.input.edit;
      if (
        !edit ||
        !BLUEPRINT_SECTIONS.some((section) => section.id === edit.section) ||
        typeof edit.itemId !== "string" ||
        edit.itemId.length > 160 ||
        (edit.title !== undefined &&
          (typeof edit.title !== "string" || edit.title.length > 160)) ||
        (edit.detail !== undefined &&
          (typeof edit.detail !== "string" || edit.detail.length > 1200)) ||
        (edit.remove !== undefined && typeof edit.remove !== "boolean") ||
        (edit.details !== undefined &&
          (!Array.isArray(edit.details) ||
            edit.details.length > 6 ||
            edit.details.some(
              (note) =>
                !note ||
                typeof note.label !== "string" ||
                note.label.length > 60 ||
                typeof note.value !== "string" ||
                note.value.length > 300,
            )))
      ) {
        throw new Error(
          "The original Blueprint change could not be read. No new change was sent.",
        );
      }
    }
    return value;
  };
  const load = (id: number) => {
    const raw = storage().getItem(key(id));
    return raw ? decode(raw, id) : null;
  };
  return {
    load,
    save(operation: PendingBlueprintOperation) {
      const raw = JSON.stringify(operation);
      decode(raw, operation.id);
      const existing = load(operation.id);
      if (existing && JSON.stringify(existing) !== raw)
        throw new Error(
          "Recover the earlier Blueprint change before making another edit.",
        );
      storage().setItem(key(operation.id), raw);
      if (storage().getItem(key(operation.id)) !== raw)
        throw new Error(
          "This tab could not preserve the change for safe retry. No Blueprint change was sent.",
        );
    },
    clear(id: number, requestId: string) {
      if (load(id)?.input.requestId === requestId) {
        storage().removeItem(key(id));
        if (load(id))
          throw new Error(
            "The Blueprint is saved, but its retry record could not be cleared. Recover the saved change before editing again.",
          );
      }
    },
  };
}
