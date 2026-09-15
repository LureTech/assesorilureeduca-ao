import { supabase } from "./supabase";
import { compressPostImage, type CompressedImage } from "./image-compress";

/** Limites do feed. Os mesmos números estão como constraint/trigger no banco. */
export const MAX_POST_LENGTH = 500;
export const MAX_COMMENT_LENGTH = 300;
export const POSTS_PER_DAY = 10;
export const PAGE_SIZE = 20;

export const CATEGORIES = ["Conquista", "Dúvida", "Networking", "Case", "Insight"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Post = {
  id: string;
  user_id: string;
  author_name: string;
  author_avatar: string | null;
  category: Category;
  body: string;
  image_url: string | null;
  image_path: string | null;
  image_w: number | null;
  image_h: number | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  /** Preenchido no cliente a partir das curtidas do usuário. */
  liked?: boolean;
};

export type PostComment = {
  id: string;
  post_id: string;
  user_id: string;
  author_name: string;
  author_avatar: string | null;
  body: string;
  created_at: string;
};

export type CommunityStats = {
  members: number;
  posts_today: number;
  posts_total: number;
  my_posts_24h: number;
  tags: { tag: string; n: number }[];
};

const POST_COLUMNS =
  "id, user_id, author_name, author_avatar, category, body, image_url, image_path, image_w, image_h, likes_count, comments_count, created_at";

/** "há 12 min", "há 3h", "ontem"… no capricho e sem biblioteca. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/**
 * Uma página do feed. As curtidas do usuário vêm numa segunda consulta só dos
 * posts visíveis — mais barato que juntar tudo numa view.
 */
export async function listPosts(opts: {
  category?: Category | "Todos";
  before?: string | null;
  userId?: string;
}): Promise<Post[]> {
  let query = supabase
    .from("community_posts")
    .select(POST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (opts.category && opts.category !== "Todos") query = query.eq("category", opts.category);
  if (opts.before) query = query.lt("created_at", opts.before);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const posts = (data as Post[]) ?? [];
  if (!posts.length || !opts.userId) return posts;

  const { data: likes } = await supabase
    .from("community_post_likes")
    .select("post_id")
    .eq("user_id", opts.userId)
    .in(
      "post_id",
      posts.map((p) => p.id),
    );

  const curtidos = new Set((likes ?? []).map((l: { post_id: string }) => l.post_id));
  return posts.map((p) => ({ ...p, liked: curtidos.has(p.id) }));
}

export async function loadStats(): Promise<CommunityStats | null> {
  const { data, error } = await supabase.rpc("community_stats");
  if (error) return null;
  return data as CommunityStats;
}

/** Comprime a imagem e sobe pra pasta do usuário. Devolve URL e dimensões. */
export async function uploadPostImage(
  file: File,
  userId: string,
): Promise<{
  url: string;
  path: string;
  width: number;
  height: number;
  compressed: CompressedImage;
}> {
  const compressed = await compressPostImage(file);
  const ext = compressed.file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("community").upload(path, compressed.file, {
    cacheControl: "31536000",
    contentType: compressed.file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("community").getPublicUrl(path);
  return {
    url: data.publicUrl,
    path,
    width: compressed.width,
    height: compressed.height,
    compressed,
  };
}

export type NewPost = {
  body: string;
  category: Category;
  image?: { url: string; path: string; width: number; height: number } | null;
};

export async function createPost(
  input: NewPost,
  author: { id: string; name: string; avatar: string | null },
): Promise<Post> {
  const { data, error } = await supabase
    .from("community_posts")
    .insert({
      user_id: author.id,
      author_name: author.name,
      author_avatar: author.avatar,
      category: input.category,
      body: input.body.trim(),
      image_url: input.image?.url ?? null,
      image_path: input.image?.path ?? null,
      image_w: input.image?.width ?? null,
      image_h: input.image?.height ?? null,
    })
    .select(POST_COLUMNS)
    .single();

  if (error) throw new Error(traduzErro(error.message));
  return data as Post;
}

/** Apaga o post e, junto, a imagem no storage — senão vira lixo pago. */
export async function deletePost(post: Post): Promise<void> {
  const { error } = await supabase.from("community_posts").delete().eq("id", post.id);
  if (error) throw new Error(error.message);
  if (post.image_path) {
    await supabase.storage.from("community").remove([post.image_path]);
  }
}

/** Liga/desliga a curtida. O contador é mantido por trigger no banco. */
export async function toggleLike(postId: string, userId: string, curtido: boolean): Promise<void> {
  if (curtido) {
    const { error } = await supabase
      .from("community_post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("community_post_likes")
      .insert({ post_id: postId, user_id: userId });
    // Curtida duplicada (clique rápido) não é erro de verdade.
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  }
}

export async function listComments(postId: string): Promise<PostComment[]> {
  const { data, error } = await supabase
    .from("community_post_comments")
    .select("id, post_id, user_id, author_name, author_avatar, body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as PostComment[]) ?? [];
}

export async function createComment(
  postId: string,
  body: string,
  author: { id: string; name: string; avatar: string | null },
): Promise<PostComment> {
  const { data, error } = await supabase
    .from("community_post_comments")
    .insert({
      post_id: postId,
      user_id: author.id,
      author_name: author.name,
      author_avatar: author.avatar,
      body: body.trim(),
    })
    .select("id, post_id, user_id, author_name, author_avatar, body, created_at")
    .single();
  if (error) throw new Error(traduzErro(error.message));
  return data as PostComment;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from("community_post_comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** As mensagens dos gatilhos já vêm em português; o resto vira algo legível. */
function traduzErro(message: string): string {
  if (message.includes("community_posts_body_len")) {
    return `O texto passou de ${MAX_POST_LENGTH} caracteres.`;
  }
  if (message.includes("community_posts_not_empty")) {
    return "Escreva alguma coisa ou anexe uma imagem.";
  }
  if (message.includes("row-level security")) {
    return "Sua sessão expirou. Entre de novo.";
  }
  return message;
}
