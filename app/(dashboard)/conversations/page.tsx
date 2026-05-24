import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mapDbConversation } from "@/lib/conversations-mapper";
import { ConversationsShell } from "@/components/conversations/conversations-shell";

export default async function ConversationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const conversations = (rows ?? []).map(mapDbConversation);

  return (
    <ConversationsShell
      initialConversations={conversations}
      userId={user.id}
    />
  );
}
