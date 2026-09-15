import { useCallback, useEffect, useState } from "react";
import { Send, Loader2, MessageCircle, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/avatar";

type Comment = {
  id: string;
  body: string;
  author_name: string;
  user_id: string;
  created_at: string;
};

/** Seção de comentários reais, ligada a uma "chave" (curso ou módulo). */
export function Comments({ slug }: { slug: string }) {
  const { session, profile, isAdmin } = useAuth();
  const userId = session?.user?.id;
  const authorName = profile?.full_name || profile?.email?.split("@")[0] || "Aluno";

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("comments")
      .select("id, body, author_name, user_id, created_at")
      .eq("course_slug", slug)
      .order("created_at", { ascending: false });
    setComments((data as Comment[]) ?? []);
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !userId) return;
    setPosting(true);
    const { error } = await supabase
      .from("comments")
      .insert({ course_slug: slug, user_id: userId, author_name: authorName, body });
    setPosting(false);
    if (!error) {
      setText("");
      load();
    }
  };

  const remove = async (id: string) => {
    await supabase.from("comments").delete().eq("id", id);
    load();
  };

  return (
    <section className="px-6 py-10 md:px-10">
      <h2 className="font-display text-xl font-bold">
        Comentários {loading ? "" : `(${comments.length})`}
      </h2>

      <form onSubmit={submit} className="mt-6 rounded-xl border border-border bg-surface p-5">
        <label className="mb-3 block text-sm font-semibold">Deixe sua dúvida ou feedback:</label>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva seu comentário aqui..."
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={posting || !text.trim()}
            className="inline-flex items-center gap-2 rounded-lg gradient-gold px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar
          </button>
        </div>
      </form>

      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando comentários…
          </div>
        ) : comments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface/50 py-10 text-center">
            <MessageCircle className="mx-auto h-6 w-6 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">Ainda não há comentários. Seja o primeiro!</p>
          </div>
        ) : (
          comments.map((c) => {
            const canDelete = isAdmin || c.user_id === userId;
            return (
              <div key={c.id} className="flex gap-4">
                <Avatar name={c.author_name} className="h-10 w-10" />
                <div className="flex-1 rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-primary">{c.author_name}</div>
                    {canDelete && (
                      <button
                        onClick={() => remove(c.id)}
                        className="text-muted-foreground transition hover:text-red-400"
                        title="Apagar comentário"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{c.body}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
