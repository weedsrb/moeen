import type { MessagingProvider } from "./interface";
import { WhatsAppProvider } from "./whatsapp";
import { InstagramProvider } from "./instagram";

export type { MessagingProvider, MessageResult, ParsedMessage } from "./interface";
export { WhatsAppProvider } from "./whatsapp";
export { InstagramProvider, isWindowExpiredError } from "./instagram";

/**
 * Credentials passed opaquely per platform. Each provider reads the keys it
 * needs:
 *   - whatsapp:  { phoneNumberId, accessToken }
 *   - instagram: { igUserId, accessToken }
 */
export type ProviderCredentials = Record<string, string>;

/**
 * Resolve a MessagingProvider for a given platform. This is the single
 * dispatch point that keeps the webhook, send route, and AI pipeline
 * channel-agnostic — callers never `new` a concrete provider directly.
 */
export function getProvider(
  platform: string,
  credentials: ProviderCredentials
): MessagingProvider {
  switch (platform) {
    case "whatsapp":
      return new WhatsAppProvider(
        credentials.phoneNumberId,
        credentials.accessToken
      );
    case "instagram":
      return new InstagramProvider(
        credentials.igUserId,
        credentials.accessToken
      );
    default:
      throw new Error(`Unsupported messaging platform: ${platform}`);
  }
}
