import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getVariables,
  saveVariable,
  deleteVariable,
  type ProductVariable,
} from "@/lib/shop.functions";
import { ConfirmDialog } from "./ConfirmDialog";

// Splits on commas (Arabic or Latin) and newlines, so "Red, Blue" or "أحمر، أزرق" both work.
function parseValues(raw: string): string[] {
  return raw
    .split(/[,\n،]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

type Draft = { id?: string; name: string; valuesText: string };

const emptyDraft: Draft = { name: "", valuesText: "" };

export function VariablesPanel({ phone }: { phone: string }) {
  const fetchVariables = useServerFn(getVariables);
  const save = useServerFn(saveVariable);
  const remove = useServerFn(deleteVariable);

  const [items, setItems] = useState<ProductVariable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function load() {
    try {
      const rows = await fetchVariables();
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل المتغيرات");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNew() {
    setDraft(emptyDraft);
    setEditing("new");
  }

  function startEdit(v: ProductVariable) {
    setDraft({ id: v.id, name: v.name, valuesText: v.option_values.join(", ") });
    setEditing(v.id);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const option_values = parseValues(draft.valuesText);
    setBusy(true);
    try {
      await save({
        data: {
          phone,
          variable: { ...(draft.id ? { id: draft.id } : {}), name: draft.name, option_values },
        },
      });
      setEditing(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    const id = deleteTarget;
    setDeleteTarget(null);
    if (!id) return;
    try {
      await remove({ data: { phone, id } });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "تعذّر الحذف");
    }
  }

  if (error) return <p className="py-10 text-center text-destructive">{error}</p>;
  if (!items) return <p className="py-10 text-center text-muted-foreground">جارِ التحميل...</p>;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        عرّفي هنا قوائم خيارات قابلة لإعادة الاستخدام، مثل اللون أو المقاس، بكتابة اسم المتغير وقيمه
        مفصولة بفواصل.
      </p>

      {editing === "new" && (
        <VariableForm
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={handleSubmit}
        />
      )}

      {!editing && (
        <button
          onClick={startNew}
          className="rounded-full px-6 py-2.5 text-sm font-medium text-primary-foreground"
          style={{ backgroundImage: "var(--gradient-pink)" }}
        >
          + إضافة متغير جديد
        </button>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((v) =>
          editing !== "new" && editing === v.id ? (
            <VariableForm
              key={v.id}
              draft={draft}
              setDraft={setDraft}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSubmit={handleSubmit}
            />
          ) : (
            <article key={v.id} className="rounded-3xl bg-card p-4 shadow-[var(--shadow-card)]">
              <h4 className="text-ink">{v.name}</h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {v.option_values.map((val, i) => (
                  <span key={i} className="rounded-full bg-muted px-3 py-1 text-xs text-ink">
                    {val}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => startEdit(v)}
                  className="flex-1 rounded-full border border-primary px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  تعديل
                </button>
                <button
                  onClick={() => setDeleteTarget(v.id)}
                  className="rounded-full border border-destructive px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
                >
                  حذف
                </button>
              </div>
            </article>
          ),
        )}
      </div>

      {items.length === 0 && !editing && (
        <p className="py-10 text-center text-muted-foreground">لا توجد متغيرات بعد</p>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="حذف هذا المتغير نهائيًا؟"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function VariableForm({
  draft,
  setDraft,
  busy,
  onCancel,
  onSubmit,
}: {
  draft: Draft;
  setDraft: (updater: (d: Draft) => Draft) => void;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)]"
    >
      <label className="block">
        <span className="mb-1 block text-sm text-muted-foreground">اسم المتغير</span>
        <input
          autoFocus
          required
          placeholder="مثال: اللون"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-muted-foreground">القيم (مفصولة بفواصل)</span>
        <input
          required
          placeholder="مثال: أحمر، أزرق"
          value={draft.valuesText}
          onChange={(e) => setDraft((d) => ({ ...d, valuesText: e.target.value }))}
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-primary"
        />
      </label>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full px-6 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          style={{ backgroundImage: "var(--gradient-pink)" }}
        >
          {busy ? "جارِ الحفظ..." : "حفظ"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-border px-6 py-2.5 text-sm text-ink"
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}
