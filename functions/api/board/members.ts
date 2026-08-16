interface Env {
  DB: D1Database;
}

// Powers the "recent arrivals" strip — real data only, capped small.
// Email is never returned to the client.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT username, avatar_id FROM board_members ORDER BY id DESC LIMIT 24'
  ).all<{ username: string; avatar_id: string }>();
  return Response.json({ members: results ?? [] });
};
