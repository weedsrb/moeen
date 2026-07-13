export async function signOut(): Promise<void> {
  await fetch("/api/auth/signout", { method: "POST" });
}
