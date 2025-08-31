import MsalService from './MsalService';
import axios from 'axios';

const GRAPH_API_ENDPOINT = 'https://graph.microsoft.com/v1.0';
const inboxEmailAdress = import.meta.env.VITE_INBOX_EMAIL_ADRESS || '';

// NEW: optional cutoff from env (ISO 8601)
const ENV_SYNC_START_UTC =
  (import.meta.env as any)?.VITE_GRAPH_SYNC_START_UTC
    ? String((import.meta.env as any).VITE_GRAPH_SYNC_START_UTC).trim()
    : '';

const STORAGE_KEYS = {
  SYNC_START_UTC: 'graph.syncStartUtc',
  DELTA_LINK: 'graph.deltaLink',
};

/**
 * Service für die Microsoft Graph API
 */
export const GraphService = {
  deltaLink: null as string | null,
  syncWindowStartUtc: null as string | null,

  ensureSyncStart() {
    if (!GraphService.syncWindowStartUtc) {
      // NEW: prefer env var if present and valid
      if (ENV_SYNC_START_UTC) {
        const envDate = new Date(ENV_SYNC_START_UTC);
        if (!Number.isNaN(envDate.getTime())) {
          GraphService.syncWindowStartUtc = envDate.toISOString();
          // Also persist so subsequent loads behave consistently
          try {
            window.localStorage.setItem(
              STORAGE_KEYS.SYNC_START_UTC,
              GraphService.syncWindowStartUtc
            );
          } catch {}
          console.log('Sync window start (from ENV, UTC):', GraphService.syncWindowStartUtc);
          return;
        } else {
          console.warn(
            'VITE_GRAPH_SYNC_START_UTC is not a valid date. Falling back to stored / now.'
          );
        }
      }

      // try restore from storage next
      const stored =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.SYNC_START_UTC)
          : null;

      if (stored) {
        GraphService.syncWindowStartUtc = stored;
      } else {
        // fallback: "now"
        const d = new Date();
        d.setMilliseconds(0);
        GraphService.syncWindowStartUtc = d.toISOString();
        try {
          window.localStorage.setItem(
            STORAGE_KEYS.SYNC_START_UTC,
            GraphService.syncWindowStartUtc
          );
        } catch {}
      }
      console.log('Sync window start (UTC):', GraphService.syncWindowStartUtc);
    }
  },

  resetDelta() {
    GraphService.deltaLink = null;
    GraphService.syncWindowStartUtc = null;
    try {
      window.localStorage.removeItem(STORAGE_KEYS.DELTA_LINK);
      window.localStorage.removeItem(STORAGE_KEYS.SYNC_START_UTC);
    } catch {}
  },

  /**
   * Erstellt einen HTTP-Client mit dem aktuellen Access Token
   */
  getAuthenticatedClient: async () => {
    const token = await MsalService.getAccessToken();

    if (!token) {
      throw new Error('Keine Authentifizierung möglich. Bitte melden Sie sich an.');
    }

    return axios.create({
      baseURL: GRAPH_API_ENDPOINT,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  },

  /**
   * Ruft die Mails im Posteingang ab
   */
  getInboxMails: async (maxResults = 50) => {
    try {
      GraphService.ensureSyncStart();
      const client = await GraphService.getAuthenticatedClient();

      // restore deltaLink once if memory is empty
      if (!GraphService.deltaLink && typeof window !== 'undefined') {
        GraphService.deltaLink = window.localStorage.getItem(STORAGE_KEYS.DELTA_LINK);
      }

      const syncStart = new Date(GraphService.syncWindowStartUtc!);
      const keepIfNewer = (m: any) => {
        if(m.hasOwnProperty('receivedDateTime')){
          return (new Date(m.receivedDateTime) >= syncStart);
        } else {
          return true;
        }
      }
        

      let items: any[] = [];
      let url: string | null = GraphService.deltaLink;

      while (true) {
        let res;
        if (url) {
          console.log("if(url) "+ url)
          res = await client.get(url);
        } else {
          // CHANGED: same filter, but now driven by env/ensureSyncStart value
          const filter = encodeURIComponent(
            `receivedDateTime ge ${GraphService.syncWindowStartUtc}`
          );
          const firstUrl = `/users/${inboxEmailAdress}/mailFolders/inbox/messages/delta?$top=${maxResults}&$filter=${filter}`;
          console.log('Initial delta GET:', firstUrl);
          res = await client.get(firstUrl);
        }
        console.log(res)
        const data = res.data ?? {};
        console.log(data)
        const batch = Array.isArray(data.value) ? data.value : [];
        const filtered = batch.filter(keepIfNewer);
        items = items.concat(filtered);

        if (data['@odata.nextLink']) {
          url = data['@odata.nextLink'];
          continue;
        }

        GraphService.deltaLink = data['@odata.deltaLink'] ?? null;
        try {
          if (GraphService.deltaLink) {
            window.localStorage.setItem(STORAGE_KEYS.DELTA_LINK, GraphService.deltaLink);
          } else {
            window.localStorage.removeItem(STORAGE_KEYS.DELTA_LINK);
          }
        } catch {}
        break;
      }

      return items;
    } catch (err: any) {
      if (err?.response?.status === 410) {
        console.warn('Delta token expired (410). Resetting and retrying once.');
        GraphService.deltaLink = null;
        try {
          window.localStorage.removeItem(STORAGE_KEYS.DELTA_LINK);
        } catch {}
        return await GraphService.getInboxMails(maxResults);
      }
      console.error('Fehler beim Abrufen der E-Mails:', err);
      throw err;
    }
  },

  /**
   * Ruft eine bestimmte E-Mail anhand ihrer ID ab
   */
  getEmail: async (emailId: string) => {
    try {
      const client = await GraphService.getAuthenticatedClient();
      const encodedEmailId = encodeURIComponent(emailId);
      const response = await client.get(
        `/users/${inboxEmailAdress}/messages/${encodedEmailId}`
      );
      return response.data;
    } catch (error) {
      console.error(`Fehler beim Abrufen der E-Mail mit ID ${emailId}:`, error);
      throw error;
    }
  },

  /**
   * Ruft eine bestimmte E-Mail mit vollständigem HTML-Body anhand ihrer ID ab
   */
  getEmailContent: async (emailId: string) => {
    try {
      const client = await GraphService.getAuthenticatedClient();
      const encodedEmailId = encodeURIComponent(emailId);
      const response = await client.get(
        `/users/${inboxEmailAdress}/messages/${encodedEmailId}?$select=id,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,attachments&$expand=attachments`
      );

      if (response.data.attachments) {
        response.data.attachments = response.data.attachments.map((attachment: any) => {
          let contentId = attachment.contentId || '';
          contentId = contentId.replace(/^</, '').replace(/>$/, '');
          contentId = contentId.replace(/^cid:/, '');
          const isInline = !!contentId;

          console.log('Verarbeite Anhang:', {
            name: attachment.name,
            originalContentId: attachment.contentId,
            cleanedContentId: contentId,
            isInline,
            size: attachment.size,
            contentType: attachment.contentType,
          });

          return {
            ...attachment,
            contentId,
            isInline,
          };
        });
      }

      return response.data;
    } catch (error) {
      console.error(`Fehler beim Abrufen des E-Mail-Inhalts mit ID ${emailId}:`, error);
      throw error;
    }
  },

  /**
   * Sendet eine E-Mail über Microsoft Graph API
   */
  sendEmail: async (
    subject: string,
    body: string,
    toRecipients: string[],
    mailattachments: Array<Object> = [],
    replyAdresses: string[] = []
  ) => {
    try {
      const client = await GraphService.getAuthenticatedClient();

      if (!client) {
        throw new Error('Nicht authentifiziert. Bitte melden Sie sich an.');
      }

      const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { padding: 20px; max-width: 600px; }
            .signature { margin-top: 20px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            ${body}
            <div class="signature">
              <p>Diese E-Mail wurde über das E-Mail-Verwaltungssystem der Stadtwerke gesendet.</p>
            </div>
          </div>
        </body>
        </html>
      `;
      let mailBody
      if (replyAdresses.length > 0) {
        mailBody = {
          message: {
            subject,
            body: {
              contentType: 'html',
              content: htmlBody,
            },
            toRecipients: toRecipients.map((recipient) => ({
              emailAddress: { address: recipient },
            })),
            replyTo: replyAdresses.map((replyAddress) => ({
              emailAddress: { address: replyAddress },
            })),
            attachments: mailattachments,
            importance: 'normal',
            internetMessageHeaders: [
              { name: 'X-Custom-Header', value: 'Stadtwerke-Kundenservice' },
              { name: 'X-Priority', value: '3' },
            ],
          },
          saveToSentItems: true,
        };
      } else {
        mailBody = {
          message: {
            subject,
            body: {
              contentType: 'html',
              content: htmlBody,
            },
            toRecipients: toRecipients.map((recipient) => ({
              emailAddress: { address: recipient },
            })),
            attachments: mailattachments,
            importance: 'normal',
            internetMessageHeaders: [
              { name: 'X-Custom-Header', value: 'Stadtwerke-Kundenservice' },
              { name: 'X-Priority', value: '3' },
            ],
          },
          saveToSentItems: true,
        };
      }
      

      console.log('Sende E-Mail an:', toRecipients);
      const response = await client.post(
        `/users/${inboxEmailAdress}/sendMail`,
        mailBody
      );
      console.log('E-Mail erfolgreich gesendet');

      return response.data;
    } catch (error) {
      console.error('Fehler beim Senden der E-Mail:', error);
      throw error;
    }
  },

  /**
   * Ruft Informationen über den aktuellen Benutzer ab
   */
  getUserInfo: async () => {
    try {
      const client = await GraphService.getAuthenticatedClient();
      const response = await client.get('/me');
      return response.data;
    } catch (error) {
      console.error('Fehler beim Abrufen der Benutzerinformationen:', error);
      throw error;
    }
  },

  /**
   * Lädt den Inhalt eines Anhangs herunter
   */
  getAttachmentContent: async (messageId: string, attachmentId: string) => {
    try {
      const token = await MsalService.getAccessToken();
      const encodedMessageId = encodeURIComponent(messageId);
      const encodedAttachmentId = encodeURIComponent(attachmentId);

      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users/${inboxEmailAdress}/messages/${encodedMessageId}/attachments/${encodedAttachmentId}/$value`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      console.error(`Fehler beim Abrufen des Anhangs ${attachmentId}:`, error);
      throw error;
    }
  },
};

export default GraphService;
