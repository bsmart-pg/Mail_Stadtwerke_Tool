import React, { useState, useEffect, useRef } from 'react';
import { 
  XMarkIcon, 
  ArrowPathIcon, 
  EnvelopeIcon, 
  UserIcon, 
  CalendarIcon,
  PaperClipIcon,
  ArrowUturnLeftIcon
} from '@heroicons/react/24/outline';
import GraphService from '../services/GraphService';
import SupabaseService from '../services/SupabaseService';

const baseURL = import.meta.env.VITE_API_BASE;

if (!baseURL) {
  throw new Error('backend URL müssen in den Umgebungsvariablen definiert sein.');
}




// Normalize/clean a Content-ID value
const cleanCid = (cid?: string) =>
  (cid || '')
    .trim()
    .replace(/^</, '')
    .replace(/>$/, '')
    .replace(/^cid:/i, '');

// Convert base64 (Graph contentBytes) → Blob
const base64ToBlob = (b64: string, type = 'application/octet-stream') => {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
};

// Replace only cid: src attributes (case-insensitive, single/double quotes)
const replaceCidSrcs = (html: string, lookup: Record<string, string>) =>
  html.replace(/\s(src)\s*=\s*(['"])cid:([^'"]+)\2/gi, (m, attr, quote, rawCid) => {
    const key = cleanCid(rawCid);
    const url =
      lookup[key] ||
      lookup[`<${key}>`] || // some HTML bodies include angle brackets
      lookup[key.split('@')[0]]; // sometimes the body uses only the left part
    return url ? ` ${attr}=${quote}${url}${quote}` : m;
  });

interface EmailDetailProps {
  emailId: string;
  messageId: string;
  to_recipient: string;
  status: string; 
  onClose: () => void;
  onAnalysisComplete?: (result: { customerNumber?: string; category?: string }) => void;
}

interface Attachment {
  id: string;
  name: string;
  contentType: string;
  contentId?: string;
  size: number;
}

interface EmailData {
  body: {
    contentType: string;
    content: string;
  };
  subject?: string;
  from?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
  toRecipients?: Array<{
    emailAddress: {
      name?: string;
      address: string;
    };
  }>;
  receivedDateTime: string;
  hasAttachments: boolean;
  attachments?: Attachment[];
}

const EmailDetail: React.FC<EmailDetailProps> = ({ emailId, messageId, to_recipient,onClose, onAnalysisComplete }) => {
  const [email, setEmail] = useState<EmailData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [attachmentUrls, setAttachmentUrls] = useState<{[key: string]: string}>({});
  const [processedContent, setProcessedContent] = useState<string>('');
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const imageUrlsRef = useRef<{[key: string]: string}>({});
  const analyzedImagesRef = useRef<Set<string>>(new Set());
  const blobUrlsRef = useRef<string[]>([]);
  const prevMessageIdRef = useRef<string | null>(null);
  const [processedFolderId, setProcessedFolderId] = useState<string | null>(null);


  useEffect(() => {
    const loadProcessedFolder = async () => {
      try {
        const folderId = await GraphService.ensureFolder(
          to_recipient,
          'Verarbeitet_von_BSMART'
        );
        setProcessedFolderId(folderId);
      } catch {
        setProcessedFolderId(null);
      }
    };

    loadProcessedFolder();
  }, [to_recipient]);

  // Einzelner useEffect für E-Mail-Inhalt und Anhänge
  // useEffect(() => {
  //   const processEmail = async () => {
  //     if (!email?.body?.content || !email?.attachments) return;

  //     try {
  //       // 1. Zuerst alle Inline-Bilder aus dem HTML extrahieren
  //       const imgRegex = /<img[^>]+src=["'](?:cid:)?([^"']+)["'][^>]*>/gi;
  //       const content = email.body.content;
  //       const imgMatches = [...content.matchAll(imgRegex)];
        
  //       console.log('Gefundene Bilder:', imgMatches.length);

  //       // 2. Alle Anhänge parallel verarbeiten
  //       const attachmentPromises = email.attachments.map(async (attachment) => {
  //         try {
  //           const response = await GraphService.getAttachmentContent(messageId, attachment.id);
  //           const blob = new Blob([response], { type: attachment.contentType });
  //           const url = URL.createObjectURL(blob);

  //           // ✅ NEU: Immer URL für die Buttons merken – egal ob inline oder nicht
  //           setAttachmentUrls(prev => ({ ...prev, [attachment.id]: url }));

  //           // ⬇️ Ab hier: nur Inline-spezifisch weitermachen, wie bisher
  //           if (!attachment.contentId) {
  //             // kein Inline-Anhang → nichts für cid-Mapping zurückgeben
  //             return null;
  //           }

  //           const cleanId = attachment.contentId.replace(/[<>]/g, '').replace(/^cid:/, '');

  //           // (optional) Bildanalyse nur für Images lassen wie gehabt …
  //           if (attachment.contentType.startsWith('image/') && !analyzedImagesRef.current.has(attachment.id)) {
  //             // ... dein Analysecode unverändert ...
  //           }

  //           // Für das spätere Ersetzen im HTML zurückgeben
  //           return {
  //             originalId: attachment.contentId,
  //             cleanId,
  //             url
  //           };
  //         } catch (error) {
  //           console.error('Fehler beim Laden des Anhangs:', error);
  //           return null;
  //         }
  //       });


  //       // 3. Warte auf alle Anhänge
  //       const processedAttachments = (await Promise.all(attachmentPromises)).filter(Boolean);

  //       // 4. Erstelle URL-Map für Inline-Bilder
  //       const urlMap = processedAttachments.reduce((acc, item) => {
  //         if (!item) return acc;
  //         const { originalId, cleanId, url } = item;
          
  //         // Speichere alle möglichen Varianten
  //         acc[originalId] = url;
  //         acc[cleanId] = url;
  //         acc[`cid:${cleanId}`] = url;
  //         acc[cleanId.split('@')[0]] = url;
  //         acc[`<${cleanId}>`] = url;
  //         acc[`<cid:${cleanId}>`] = url;
          
  //         return acc;
  //       }, {} as {[key: string]: string});

  //       // Speichere URLs in der Ref
  //       imageUrlsRef.current = urlMap;

  //       // 5. HTML verarbeiten und Bilder ersetzen
  //       let processedHtml = content;
  //       for (const match of imgMatches) {
  //         const [fullMatch, cidMatch] = match;
  //         const cleanCid = cidMatch.replace(/[<>]/g, '').replace(/^cid:/, '');
          
  //         // Suche URL in allen Varianten
  //         const imageUrl = urlMap[cidMatch] || urlMap[cleanCid] || urlMap[`cid:${cleanCid}`] || 
  //                         urlMap[cleanCid.split('@')[0]] || urlMap[`<${cleanCid}>`] || 
  //                         urlMap[`<cid:${cleanCid}>`];

  //         if (imageUrl) {
  //           const newImgTag = `<img src="${imageUrl}" alt="Inline-Bild" style="max-width: 100%; height: auto;" />`;
  //           processedHtml = processedHtml.replace(fullMatch, newImgTag);
  //           console.log('Bild ersetzt:', cleanCid);
  //         } else {
  //           console.log('Keine URL gefunden für:', cleanCid);
  //         }
  //       }

  //       // 6. Verarbeiteten Inhalt setzen
  //       setProcessedContent(processedHtml);

  //     } catch (error) {
  //       console.error('Fehler bei der E-Mail-Verarbeitung:', error);
  //       setError('Fehler bei der Verarbeitung der E-Mail');
  //     }
  //   };

  //   if (email?.body?.content) {
  //     processEmail();
  //   }

  //   // Cleanup
  //   return () => {
  //     Object.values(imageUrlsRef.current).forEach(url => {
  //       try {
  //         URL.revokeObjectURL(url);
  //       } catch (error) {
  //         console.error('Fehler beim Freigeben der URL:', error);
  //       }
  //     });
  //   };
  // }, [email, messageId, onAnalysisComplete]);
useEffect(() => {
  // if switching to another message, revoke previous blob URLs once
  if (prevMessageIdRef.current && prevMessageIdRef.current !== messageId) {
    for (const u of blobUrlsRef.current) {
      try { URL.revokeObjectURL(u); } catch {}
    }
    blobUrlsRef.current = [];
  }
  prevMessageIdRef.current = messageId;

  let cancelled = false;

  // show raw HTML immediately for this message (prevents “empty → filled” flicker)
  if (email?.body?.content && processedContent !== email.body.content) {
    setProcessedContent(email.body.content);
  }

  const atts = Array.isArray(email?.attachments) ? email!.attachments! : [];
  if (!email?.body?.content || atts.length === 0) return;

  const replaceOneCid = (html: string, cid: string, url: string) => {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const c = esc(cid);
    return html
      .replace(new RegExp(String.raw`\s(src)\s*=\s*(['"])cid:${c}\2`, 'gi'),
               (_m, attr, quote) => ` ${attr}=${quote}${url}${quote}`)
      .replace(new RegExp(String.raw`\s(src)\s*=\s*(['"])\s*<cid:${c}>\2`, 'gi'),
               (_m, attr, quote) => ` ${attr}=${quote}${url}${quote}`);
  };

  const run = async () => {
    setAnalyzing(true);

    for (const att of atts) {
      if (cancelled) break;
      try {
        // build a blob URL for this attachment
        let urlForButtons: string | null = null;

        if ((att as any)?.contentBytes) {
          const blob = base64ToBlob((att as any).contentBytes, att.contentType);
          urlForButtons = URL.createObjectURL(blob);
        } else {
          const buf = await GraphService.getAttachmentContent(messageId, att.id, to_recipient);
          const blob = new Blob([buf], { type: att.contentType });
          urlForButtons = URL.createObjectURL(blob);
        }
        if (!urlForButtons) continue;

        // keep for later revocation
        blobUrlsRef.current.push(urlForButtons);

        // update only this attachment’s URL (no full replace)
        setAttachmentUrls(prev => (
          prev[att.id] === urlForButtons ? prev : { ...prev, [att.id]: urlForButtons }
        ));

        // if inline, progressively patch just this CID in the HTML
        if (att.contentId) {
          const cid = cleanCid(att.contentId);
          setProcessedContent(prev => prev ? replaceOneCid(prev, cid, urlForButtons!) : prev);
        }
      } catch (e) {
        console.warn('Attachment failed', att?.id, e);
      }
    }

    if (!cancelled) setAnalyzing(false);
  };

  run();

  // IMPORTANT: do not revoke here (StrictMode fake-unmount runs this immediately in dev)
  return () => { cancelled = true; };
}, [messageId, email]);


// Revoke *once* on component unmount:
useEffect(() => {
  return () => {
    for (const u of blobUrlsRef.current) {
      try { URL.revokeObjectURL(u); } catch {}
    }
    blobUrlsRef.current = [];
  };
}, []);

  // E-Mail laden
  useEffect(() => {
    const fetchEmailContent = async () => {
      try {
        setLoading(true);
        setError('');

        let emailData;

        // 📂 weitergeleitete Mails → Verarbeitet_von_BSMART
        if (
          status === 'WEITERGELEITET' &&
          processedFolderId
        ) {
          emailData = await GraphService.getEmailFromProcessedFolder(
            messageId,
            to_recipient,
            processedFolderId
          );
        }
        // 📥 alle anderen → Inbox
        else {
          emailData = await GraphService.getEmailContent(
            messageId,
            to_recipient
          );
        }

        setEmail(emailData);

      } catch (error: any) {
        console.error('Fehler beim Laden des E-Mail-Inhalts:', error);

        if (error?.response?.status === 404) {
          setError('Die E-Mail existiert nicht mehr in Outlook.');
          return;
        }

        setError('Fehler beim Laden des E-Mail-Inhalts');
      } finally {
        setLoading(false);
      }
    };


    if (messageId) {
      fetchEmailContent();
    }
  }, [messageId, to_recipient, status, processedFolderId]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // const renderAttachments = () => {
  //   if (!email?.hasAttachments || !email?.attachments) {
  //     return null;
  //   }

  //   return (
  //     <div className="mt-4 p-3 border border-gray-200 rounded-md">
  //       <h3 className="text-sm font-medium mb-2 flex items-center">
  //         <PaperClipIcon className="h-4 w-4 mr-1" />
  //         Anhänge ({email.attachments.length})
  //       </h3>
  //       <div className="grid grid-cols-1 gap-4">
  //         {email.attachments.map((attachment: Attachment, index: number) => {
  //           const url = attachmentUrls[attachment.id];

  //           // ✅ Define helpers here (JS land), not inside JSX tags
  //           const rawType = attachment.contentType || '';
  //           const mime = rawType.split(';')[0].trim();
  //           const isImage = rawType.startsWith('image/');
  //           const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(attachment.name || '');
              
  //           if (!url) {
  //             return null;
  //           }

  //           return (
  //             <div key={index} className="flex flex-col p-4 bg-gray-50 rounded-lg">
  //               <div className="flex items-center justify-between mb-2">
  //                 <div className="flex items-center">
  //                   <PaperClipIcon className="h-4 w-4 mr-2 text-gray-500" />
  //                   <span className="text-sm font-medium">{attachment.name}</span>
  //                 </div>
  //                 <div className="flex items-center space-x-4">

  //                   {((isImage || isPdf)) && (
  //                     <button
  //                       onClick={() => window.open(url, '_blank')}
  //                       className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
  //                     >
  //                       Anzeigen
  //                     </button>
  //                   )}

  //                   <button
  //                     onClick={async () => {
  //                       try {
  //                         const content = await GraphService.getAttachmentContent(messageId, attachment.id);
  //                         const blob = new Blob([content], { type: attachment.contentType });
  //                         const downloadUrl = URL.createObjectURL(blob);
  //                         const a = document.createElement('a');
  //                         a.href = downloadUrl;
  //                         a.download = attachment.name;
  //                         document.body.appendChild(a);
  //                         a.click();
  //                         document.body.removeChild(a);
  //                         URL.revokeObjectURL(downloadUrl);
  //                       } catch (error) {
  //                         console.error('Fehler beim Herunterladen:', error);
  //                       }
  //                     }}
  //                     className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
  //                   >
  //                     <ArrowUturnLeftIcon className="h-4 w-4 mr-1" />
  //                     Herunterladen
  //                   </button>
  //                 </div>
  //               </div>
  //               {isImage && (
  //                 <img 
  //                   src={url} 
  //                   alt={attachment.name}
  //                   className="mt-2 max-w-full h-auto rounded-lg"
  //                   style={{ maxHeight: '300px' }}
  //                 />
  //               )}
  //             </div>
  //           );
  //         })}
  //       </div>
  //     </div>
  //   );
  // };
  const renderAttachments = () => {
  if (!email?.hasAttachments || !email?.attachments) {
    return null;
  }

  return (
    <div className="mt-4 p-3 border border-gray-200 rounded-md">
      <h3 className="text-sm font-medium mb-2 flex items-center">
        <PaperClipIcon className="h-4 w-4 mr-1" />
        Anhänge ({email.attachments.length})
      </h3>
      <div className="grid grid-cols-1 gap-4">
        {email.attachments.map((attachment: Attachment, index: number) => {
          const url = attachmentUrls[attachment.id];

          const rawType = attachment.contentType || '';
          const mime = rawType.split(';')[0].trim();
          const isImage = rawType.startsWith('image/');
          const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(attachment.name || '');

          return (
            <div key={index} className="flex flex-col p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <PaperClipIcon className="h-4 w-4 mr-2 text-gray-500" />
                  <span className="text-sm font-medium">{attachment.name}</span>
                </div>
                <div className="flex items-center space-x-4">

                  {/* Anzeigen only if we already have a blob URL AND it's previewable */}
                  {url && (isImage || isPdf) && (
                    <button
                      onClick={() => window.open(url, '_blank')}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      Anzeigen
                    </button>
                  )}

                  {/* Herunterladen is ALWAYS available (it fetches from Graph on click) */}
                  <button
                    onClick={async () => {
                      try {
                        const content = await GraphService.getAttachmentContent(messageId, attachment.id, to_recipient);
                        const blob = new Blob([content], { type: attachment.contentType });
                        const downloadUrl = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = downloadUrl;
                        a.download = attachment.name;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(downloadUrl);
                      } catch (error) {
                        console.error('Fehler beim Herunterladen:', error);
                      }
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    <ArrowUturnLeftIcon className="h-4 w-4 mr-1" />
                    Herunterladen
                  </button>
                </div>
              </div>

              {/* Inline preview only if we have a URL AND it's an image */}
              {url && isImage && (
                <img
                  src={url}
                  alt={attachment.name}
                  className="mt-2 max-w-full h-auto rounded-lg"
                  style={{ maxHeight: '300px' }}
                />
              )}

              {/* Optional: tiny placeholder while we’re building the blob URL */}
              {!url && (isImage || isPdf) && (
                <div className="text-xs text-gray-500 italic">Vorschau wird vorbereitet…</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};


  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-white p-8 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
          <div className="flex justify-center py-10">
            <ArrowPathIcon className="w-10 h-10 text-primary animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-white p-8 rounded-lg shadow-xl max-w-4xl w-full">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Fehler</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-gray-200"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
          <div className="text-red-500">{error}</div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!email) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b flex justify-between items-center z-10">
          <div className="flex items-center">
            <button
              onClick={onClose}
              className="mr-3 p-1 rounded-full hover:bg-gray-200"
              title="Zurück zur Übersicht"
            >
              <ArrowUturnLeftIcon className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-semibold truncate max-w-lg">
              {email.subject || 'Kein Betreff'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200"
            title="Schließen"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6">
          <div className="mb-6 space-y-3 border-b pb-5">
            <div className="flex items-start">
              <UserIcon className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
              <div>
                <div className="font-medium">Von:</div>
                <div>
                  {email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Unbekannt'}
                  {email.from?.emailAddress?.name && email.from?.emailAddress?.address && (
                    <span className="text-gray-500 ml-1">
                      &lt;{email.from.emailAddress.address}&gt;
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-start">
              <EnvelopeIcon className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
              <div>
                <div className="font-medium">An:</div>
                <div>
                  {email.toRecipients?.map((recipient: any, index: number) => (
                    <div key={index}>
                      {recipient.emailAddress.name || recipient.emailAddress.address}
                      {recipient.emailAddress.name && recipient.emailAddress.address && (
                        <span className="text-gray-500 ml-1">
                          &lt;{recipient.emailAddress.address}&gt;
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex items-start">
              <CalendarIcon className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
              <div>
                <div className="font-medium">Datum:</div>
                <div>{formatDate(email.receivedDateTime)}</div>
              </div>
            </div>
          </div>
          
          {/* <div className="prose max-w-none">
            {email?.body?.contentType === 'html' ? (
              <div 
                dangerouslySetInnerHTML={{ 
                  __html: processedContent || email.body.content
                }} 
              />
            ) : (
              <pre className="whitespace-pre-wrap font-sans">{email?.body?.content}</pre>
            )}
          </div> */}

              <div className="prose max-w-none">
                {email?.body?.contentType === 'html' ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: processedContent || email.body.content
                    }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans">{email?.body?.content}</pre>
                )}
              </div>


          
          {renderAttachments()}
        </div>
      </div>
    </div>
  );
};

export default EmailDetail; 