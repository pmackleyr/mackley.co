import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(() => new Response(JSON.stringify({
  error: "Legacy payment intents are disabled. Use the provider-review Checkout Session."
}), {
  status: 410,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  }
}));
