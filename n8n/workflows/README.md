# Versioned n8n workflow exports

Only credential-free workflow JSON belongs here. Each workflow must call Muin's
protected internal automation API, use an idempotency key supplied by Muin, and
remain inactive (`active: false`) in Git. Do not export credential objects,
Supabase keys, Instagram tokens, Resend secrets, or customer message bodies.
