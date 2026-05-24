import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mapDbContact } from "@/lib/contacts-mapper";
import { ContactsShell } from "@/components/contacts/contacts-shell";

export default async function ContactsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("contacts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const contacts = (rows ?? []).map(mapDbContact);

  return <ContactsShell initialContacts={contacts} />;
}
