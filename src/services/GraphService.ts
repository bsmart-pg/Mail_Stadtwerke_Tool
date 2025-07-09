import MsalService from './MsalService';
import axios from 'axios';

const GRAPH_API_ENDPOINT = 'https://graph.microsoft.com/v1.0';

/**
 * Service für die Microsoft Graph API
 */
export const GraphService = {
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
        'Content-Type': 'application/json'
      }
    });
  },
  
  /**
   * Ruft die Mails im Posteingang ab
   */
  getInboxMails: async (maxResults = 50) => {
    try {
      const client = await GraphService.getAuthenticatedClient();
      const response = await client.get(`/me/mailFolders/inbox/messages?$top=${maxResults}&$orderby=receivedDateTime desc`);
      return response.data.value;
    } catch (error) {
      console.error('Fehler beim Abrufen der E-Mails:', error);
      throw error;
    }
  },
  
  /**
   * Ruft eine bestimmte E-Mail anhand ihrer ID ab
   */
  getEmail: async (emailId: string) => {
    try {
      const client = await GraphService.getAuthenticatedClient();
      // URL-kodiere die E-Mail-ID
      const encodedEmailId = encodeURIComponent(emailId);
      const response = await client.get(`/me/messages/${encodedEmailId}`);
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
      // URL-kodiere die E-Mail-ID
      const encodedEmailId = encodeURIComponent(emailId);
      // $select Parameter hinzufügen, um den vollständigen HTML-Body zu erhalten und $expand für Anhänge
      const response = await client.get(`/me/messages/${encodedEmailId}?$select=id,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,attachments&$expand=attachments`);
      
      // Markiere Inline-Anhänge und bereinige Content-IDs
      if (response.data.attachments) {
        response.data.attachments = response.data.attachments.map((attachment: any) => {
          // Bereinige die Content-ID
          let contentId = attachment.contentId || '';
          
          // Entferne nur die spitzen Klammern, aber behalte den Rest der ID
          contentId = contentId.replace(/^</, '').replace(/>$/, '');
          
          // Entferne optional das "cid:" Präfix
          contentId = contentId.replace(/^cid:/, '');
          
          // Bestimme, ob es sich um einen echten Inline-Anhang handelt
          const isInline = !!contentId; // Wenn eine Content-ID vorhanden ist, ist es ein Inline-Anhang
          
          console.log('Verarbeite Anhang:', {
            name: attachment.name,
            originalContentId: attachment.contentId,
            cleanedContentId: contentId,
            isInline,
            size: attachment.size,
            contentType: attachment.contentType
          });
          
          return {
            ...attachment,
            contentId,
            isInline
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
  sendEmail: async (subject: string, body: string, toRecipients: string[], mailattachments: Array<Object> = []) => {
    try {
      const client = await GraphService.getAuthenticatedClient();
      
      if (!client) {
        throw new Error('Nicht authentifiziert. Bitte melden Sie sich an.');
      }
      
      // HTML-Formatierung für den Text erstellen
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
      
      // E-Mail-Format vorbereiten
      const mailBody = {
        message: {
          subject,
          body: {
            contentType: 'html',
            content: htmlBody
          },
          toRecipients: toRecipients.map(recipient => ({
            emailAddress: {
              address: recipient
            }
          })),
          attachments: mailattachments,
          importance: 'normal',
          internetMessageHeaders: [
            {
              name: 'X-Custom-Header',
              value: 'Stadtwerke-Kundenservice'
            },
            {
              name: 'X-Priority',
              value: '3'
            }
          ]
        },
        saveToSentItems: true
      };
      
      // E-Mail senden
      console.log('Sende E-Mail an:', toRecipients);
      const response = await client.post('/me/sendMail', mailBody);
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
        `https://graph.microsoft.com/v1.0/me/messages/${encodedMessageId}/attachments/${encodedAttachmentId}/$value`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.arrayBuffer();
    } catch (error) {
      console.error(`Fehler beim Abrufen des Anhangs ${attachmentId}:`, error);
      throw error;
    }
  }
};

export default GraphService; 