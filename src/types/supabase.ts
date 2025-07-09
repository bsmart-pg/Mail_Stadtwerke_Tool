export const EMAIL_STATUS = {
  NEU: 'neu',
  KATEGORISIERT: 'kategorisiert',
  UNKATEGORISIERT: 'unkategorisiert',
  FEHLENDE_KUNDENNUMMER: 'fehlende-kundennummer',
  KUNDENNUMMER_ANGEFRAGT: 'kundennummer-angefragt',
  ANGEFRAGT: 'Angefragt'
} as const;

export type EmailStatus = typeof EMAIL_STATUS[keyof typeof EMAIL_STATUS];

export interface IncomingEmail {
  id: string;
  message_id: string;
  sender_email: string;
  sender_name: string | null;
  subject: string | null;
  content: string | null;
  received_date: Date;
  customer_number: string | null;
  category: string | null;
  status: EmailStatus;
  created_at: Date;
  updated_at: Date;
  hasAttachments?: boolean;
  attachments?: any[];
  forwarded: boolean;
  analysis_completed: boolean;
  text_analysis_result: string | null;
  image_analysis_result: string | null;
  all_customer_numbers: string[] | null;
  all_categories: string[] | null;
  forwarding_completed: boolean;
}

export interface AutoReply {
  id: string;
  email_id: string;
  sent_date?: Date;
  reply_content?: string;
  status: 'nicht_gesendet' | 'gesendet' | 'fehlgeschlagen';
  created_at: Date;
  updated_at: Date;
}

export interface Setting {
  id: string;
  setting_key: string;
  setting_value?: string;
  created_at: Date;
  updated_at: Date;
}

export interface RequestStatus {
  id: string;
  email_id: string;
  status: string;
  requested_at: Date;
  updated_at: Date;
} 

export interface Category {
  id: string;
  created_at: Date;
  updated_at: Date;
  category_name: string;
  category_description: string;
}