export interface DisplayEmail {
  id: string;
  message_id: string;
  sender_email: string;
  sender_name: string | null;
  subject: string;
  received_date: Date;
  content: string;
  status: string;
  customer_number: string | null;
  category: string | null;
  created_at: Date;
  updated_at: Date;
  // Display-spezifische Felder
  sender: string;
  date: string;
  hasAttachments?: boolean;
  attachments?: Array<{
    id: string;
    name: string;
    contentType: string;
    contentId?: string;
    size: number;
  }>;
} 