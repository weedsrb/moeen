/** WhatsApp Cloud API types (Meta Graph API v21.0) */

// --- Inbound webhook payload ---

export interface WhatsAppWebhookPayload {
  object: "whatsapp_business_account";
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: WhatsAppChangeValue;
  field: "messages";
}

export interface WhatsAppChangeValue {
  messaging_product: "whatsapp";
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type:
    | "text"
    | "image"
    | "audio"
    | "document"
    | "video"
    | "reaction"
    | "location"
    | "contacts"
    | "interactive"
    | "button";
  text?: { body: string };
  image?: WhatsAppMedia;
  audio?: WhatsAppMedia;
  document?: WhatsAppMedia & { filename?: string };
  video?: WhatsAppMedia;
}

export interface WhatsAppMedia {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
}

export interface WhatsAppStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
}

// --- Outbound send response ---

export interface WhatsAppSendResponse {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface WhatsAppErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
}
