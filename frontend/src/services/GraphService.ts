import MsalService from './MsalService';
import axios from 'axios';

const GRAPH_API_ENDPOINT = 'https://graph.microsoft.com/v1.0';
const inboxEmailAdress = import.meta.env.VITE_INBOX_EMAIL_ADRESS || '';
const inboxEmailAdress2 = import.meta.env.VITE_INBOX_EMAIL_ADRESS2 || '';
const inboxEmailAdress3 = import.meta.env.VITE_INBOX_EMAIL_ADRESS3 || '';
const inboxEmailAdress4 = import.meta.env.VITE_INBOX_EMAIL_ADRESS4 || '';

const inboxEmailList = [inboxEmailAdress, inboxEmailAdress2, inboxEmailAdress3, inboxEmailAdress4];

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
  // getAuthenticatedClient: async () => {
  //   const token = await MsalService.getAccessToken();

  //   if (!token) {
  //     throw new Error('Keine Authentifizierung möglich. Bitte melden Sie sich an.');
  //   }

  //   return axios.create({
  //     baseURL: GRAPH_API_ENDPOINT,
  //     headers: {
  //       Authorization: `Bearer ${token}`,
  //       'Content-Type': 'application/json',
  //     },
  //   });
  // },
  getAuthenticatedClient: async () => {
    const token = await MsalService.getAccessToken();

    if (!token) {
      throw new Error('Keine Authentifizierung möglich. Bitte melden Sie sich an.');
    }

    const client = axios.create({
      baseURL: GRAPH_API_ENDPOINT,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // simple 429 retry with Retry-After support (up to 3 tries)
    client.interceptors.response.use(undefined, async (error) => {
      const cfg = error.config || {};
      const status = error?.response?.status;
      if (status === 429 && !cfg.__retryCount) cfg.__retryCount = 0;

      if (status === 429 && cfg.__retryCount < 3) {
        cfg.__retryCount++;
        const ra = Number(error.response?.headers?.['retry-after']);
        const delayMs = !Number.isNaN(ra) ? ra * 1000 : 1000 * Math.pow(2, cfg.__retryCount); // 1s, 2s, 4s
        await new Promise(r => setTimeout(r, delayMs));
        return client(cfg);
      }
      return Promise.reject(error);
    });

    return client;
  },


  /**
   * Ruft die Mails im Posteingang ab
   */
  // getInboxMails: async (maxResults = 50) => {
  //   try {
  //     GraphService.ensureSyncStart();
  //     const client = await GraphService.getAuthenticatedClient();

  //     // restore deltaLink once if memory is empty
  //     if (!GraphService.deltaLink && typeof window !== 'undefined') {
  //       GraphService.deltaLink = window.localStorage.getItem(STORAGE_KEYS.DELTA_LINK);
  //     }

  //     const syncStart = new Date(GraphService.syncWindowStartUtc!);
  //     const keepIfNewer = (m: any) => {
  //       if(m.hasOwnProperty('receivedDateTime')){
  //         return (new Date(m.receivedDateTime) >= syncStart);
  //       } else {
  //         return true;
  //       }
  //     }
        

  //     let items: any[] = [];
  //     let url: string | null = GraphService.deltaLink;

  //     while (true) {
  //       let res;
  //       if (url) {
  //         console.log("if(url) "+ url)
  //         res = await client.get(url);
  //       } else {
  //         // CHANGED: same filter, but now driven by env/ensureSyncStart value
  //         const filter = encodeURIComponent(
  //           `receivedDateTime ge ${GraphService.syncWindowStartUtc}`
  //         );
  //         // const firstUrl = `/users/${inboxEmailAdress}/mailFolders/inbox/messages/delta?$top=${maxResults}&$filter=${filter}`;
  //         const firstUrl = `/users/${inboxEmailAdress}/mailFolders/inbox/messages/delta?$top=${maxResults}`;
  //         console.log('Initial delta GET:', firstUrl);
  //         res = await client.get(firstUrl);
  //       }
  //       console.log(res)
  //       const data = res.data ?? {};
  //       console.log(data)
  //       const batch = Array.isArray(data.value) ? data.value : [];
  //       // const filtered = batch.filter(keepIfNewer);
  //       // items = items.concat(filtered);
  //       // const filtered = batch.filter(keepIfNewer);
  //       items = items.concat(batch);

  //       if (data['@odata.nextLink']) {
  //         url = data['@odata.nextLink'];
  //         continue;
  //       }

  //       GraphService.deltaLink = data['@odata.deltaLink'] ?? null;
  //       try {
  //         if (GraphService.deltaLink) {
  //           window.localStorage.setItem(STORAGE_KEYS.DELTA_LINK, GraphService.deltaLink);
  //         } else {
  //           window.localStorage.removeItem(STORAGE_KEYS.DELTA_LINK);
  //         }
  //       } catch {}
  //       break;
  //     }

  //     return items;
  //   } catch (err: any) {
  //     if (err?.response?.status === 410) {
  //       console.warn('Delta token expired (410). Resetting and retrying once.');
  //       GraphService.deltaLink = null;
  //       try {
  //         window.localStorage.removeItem(STORAGE_KEYS.DELTA_LINK);
  //       } catch {}
  //       return await GraphService.getInboxMails(maxResults);
  //     }
  //     console.error('Fehler beim Abrufen der E-Mails:', err);
  //     throw err;
  //   }
  // },

  // REPLACE ONLY THIS METHOD inside GraphService

/**
 * Ruft die Mails im Posteingang ab (VOLLSCAN, kein Delta)
 */
  getInboxMails: async (maxResults = 50) => {
    try {
      const client = await GraphService.getAuthenticatedClient();

      // what we need for the list view; attachments expanded later on demand
      const SELECT_FIELDS = [
        'id','subject','from','toRecipients','ccRecipients','bccRecipients',
        'bodyPreview','receivedDateTime','lastModifiedDateTime',
        'hasAttachments','parentFolderId', 'conversationId'
      ].join(',');

      // inside getInboxMails
      let filterPart = '';
      if (ENV_SYNC_START_UTC) {
        const d = new Date(ENV_SYNC_START_UTC);
        if (!Number.isNaN(d.getTime())) {
          filterPart = `&$filter=receivedDateTime ge ${d.toISOString()}`;
        }
      }

      let items: any[] = [];
      for(const inbox of inboxEmailList){
        if (inbox === "") {
          continue;
        }
        console.log("getting emails for: " + inbox)

        let url =
          `/users/${inbox}/mailFolders/inbox/messages` +
          `?$select=${encodeURIComponent(SELECT_FIELDS)}` +
          `&$orderby=receivedDateTime desc` +
          `&$top=${maxResults}` +
          filterPart;

        
        // ask Graph nicely to send up to maxResults per page
        const headers = { Prefer: `odata.maxpagesize=${maxResults}` };

        while (url) {
          const res = await client.get(url, { headers });
          const data = res.data ?? {};
          const batch = Array.isArray(data.value) ? data.value : [];
          items.push(...batch);

          // stop early if we already have a comfortable amount (e.g., 200 total)
          if (items.length >= 200) break;

          url = data['@odata.nextLink'] ?? null;
        }
      }
        

      return items;
    } catch (err) {
      console.error('Fehler beim Abrufen der E-Mails (Full Load):', err);
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

  async markMessageRead(messageId: string, mailbox: string) {
    const client = await GraphService.getAuthenticatedClient();
    const encodedId = encodeURIComponent(messageId);
    await client.patch(
      `/users/${mailbox}/messages/${encodedId}`,
      { isRead: true }
      // optionally: , { headers: { 'If-Match': etag } }
    );
  },
  
  /** Create a folder under root (MsgFolderRoot) and return its id */
  async createFolder(mailbox: string, displayName: string): Promise<string> {
    const client = await GraphService.getAuthenticatedClient();
    const { data } = await client.post(`/users/${mailbox}/mailFolders`, { displayName });
    return data?.id as string;
  },

  async findFolderIdByName(mailbox: string, displayName: string): Promise<string | null> {
    const client = await GraphService.getAuthenticatedClient();
    // Use $filter to avoid listing everything
    const { data } = await client.get(
      `/users/${mailbox}/mailFolders?$filter=displayName eq '${encodeURIComponent(displayName)}'&$top=1`
    );
    const hit = Array.isArray(data?.value) ? data.value[0] : null;
    return hit?.id ?? null;
  },

    /** Ensure the folder exists under root; return its id */
  async ensureFolder(mailbox: string, displayName: string): Promise<string> {
    const existing = await GraphService.findFolderIdByName(mailbox, displayName);
    if (existing) return existing;
    return await GraphService.createFolder(mailbox, displayName);
  },

  /** Move a message to destination folder id */
  async moveMessage(messageId: string, mailbox: string, destinationFolderId: string) {
    const client = await GraphService.getAuthenticatedClient();
    const encodedId = encodeURIComponent(messageId);
    await client.post(`/users/${mailbox}/messages/${encodedId}/move`, { destinationId: destinationFolderId });
  },


  /**
   * Ruft eine bestimmte E-Mail mit vollständigem HTML-Body anhand ihrer ID ab
   */
  getEmailContent: async (emailId: string, to_recipients:string) => {
    try {
      if (to_recipients === "info@stadtwerke-itzehoe.de"){
        to_recipients = "service@sw-itzehoe.de"
      }
      const client = await GraphService.getAuthenticatedClient();
      const encodedEmailId = encodeURIComponent(emailId);
      const response = await client.get(
        `/users/${to_recipients}/messages/${encodedEmailId}?$select=id,subject,bodyPreview,body,uniqueBody,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,attachments&$expand=attachments`
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
    replyAdresses: string[] = [],
    fromEmail: string
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
        `/users/${fromEmail}/sendMail`,
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
  getAttachmentContent: async (messageId: string, attachmentId: string, to_recipients:string) => {
    try {
      const token = await MsalService.getAccessToken();
      const encodedMessageId = encodeURIComponent(messageId);
      const encodedAttachmentId = encodeURIComponent(attachmentId);

      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users/${to_recipients}/messages/${encodedMessageId}/attachments/${encodedAttachmentId}/$value`,
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

  /**
 * Turn a message (from getEmailContent) into safe HTML with inline images working.
 * Falls back to fetching attachment bytes if contentBytes is missing.
 */
  async buildRenderableEmailHtml(message: any) {
    let html = message?.body?.content || '';
    const atts: any[] = Array.isArray(message?.attachments) ? message.attachments : [];

    // Map Content-ID -> data URL
    const cidToUrl = new Map<string, string>();

    // Normalize helper (your service already strips <> and `cid:` sometimes; be defensive)
    const cleanCid = (cid?: string) =>
      (cid || '')
        .replace(/^</, '')
        .replace(/>$/, '')
        .replace(/^cid:/i, '');

    for (const att of atts) {
      if (!att?.isInline) continue;

      const cid = cleanCid(att?.contentId);
      if (!cid) continue;

      let dataUrl: string | null = null;

      // Prefer inline contentBytes if present on expanded attachment
      if (att?.contentBytes) {
        dataUrl = `data:${att.contentType || 'application/octet-stream'};base64,${att.contentBytes}`;
      } else {
        // Fallback: fetch raw bytes with your existing API and convert to base64
        try {
          const arrayBuf = await GraphService.getAttachmentContent(message.id, att.id);
          const bytes = new Uint8Array(arrayBuf);
          // Convert to base64 in-browser
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          const b64 = btoa(binary);
          dataUrl = `data:${att.contentType || 'application/octet-stream'};base64,${b64}`;
        } catch (e) {
          console.warn('Could not fetch inline attachment bytes', { id: att?.id, cid, e });
          dataUrl = null;
        }
      }

      if (dataUrl) cidToUrl.set(cid, dataUrl);
    }

    // Replace all src="cid:..." (single or double quotes)
    html = html.replace(
      /\s(src)\s*=\s*(['"])cid:([^'"]+)\2/gi,
      (m, attr, quote, rawCid) => {
        const key = cleanCid(rawCid);
        const url = cidToUrl.get(key);
        return url ? ` ${attr}=${quote}${url}${quote}` : m; // leave as-is if we don't have it
      }
    );

    // Some mails use Content-Location instead of CID or include angle brackets in src
    html = html.replace(
      /\s(src)\s*=\s*(['"])\s*<cid:([^>]+)>\s*\2/gi,
      (m, attr, quote, rawCid) => {
        const key = cleanCid(rawCid);
        const url = cidToUrl.get(key);
        return url ? ` ${attr}=${quote}${url}${quote}` : m;
      }
    );

    // Now inject `html` into your viewer (ideally via a sanitizer like DOMPurify)
    return html;
  }

};

export default GraphService;
