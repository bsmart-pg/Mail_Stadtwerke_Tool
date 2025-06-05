import React, { useState, useEffect } from 'react';
import { 
  MagnifyingGlassIcon, 
  FunnelIcon,
  TagIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import MsalService from '../services/MsalService';
import GraphService from '../services/GraphService';
import EmailDetail from '../components/EmailDetail';
import EmailEditor from '../components/EmailEditor';
import { saveEmailData, saveSettings, updateRequestStatus, getStoredData, getEmailsWithStatus, updateEmailAnalysis } from '../services/SupabaseService';
import { IncomingEmail, EMAIL_STATUS, EmailStatus } from '../types/supabase';
import { v4 as uuidv4 } from 'uuid';
import { openAIService } from '../services/OpenAIService';
import { analysisService } from '../services/AnalysisService';

// Lokale Email-Interface für die Anzeige
interface DisplayEmail extends IncomingEmail {
  sender: string;
  date: string;
  hasAttachments?: boolean;
  customer_number: string | null;
  category: string | null;
  // Überschreibe die Typen für bessere Kompatibilität
  all_customer_numbers: string[] | null;
  all_categories: string[] | null;
  forwarding_completed: boolean;
}

const Emails: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('alle');
  const [emails, setEmails] = useState<DisplayEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [outlookConnected, setOutlookConnected] = useState(false);
  
  // Information über den angemeldeten Benutzer
  const [loggedInUser, setLoggedInUser] = useState({
    displayName: '',
    email: 'atug@bsmarthh.onmicrosoft.com'
  });
  
  // Einstellungen für automatische Antworten
  const [settings, setSettings] = useState<{
    autoReply: boolean;
    replyCount: number;
    defaultReplyTemplate: string;
  }>({
    autoReply: false,
    replyCount: 0,
    defaultReplyTemplate: 'Sehr geehrte(r) Frau/Herr,\n\nVielen Dank für Ihre Nachricht. Für eine schnellere Bearbeitung Ihres Anliegens benötigen wir Ihre Kundennummer.\n\nBitte teilen Sie uns diese mit, indem Sie auf diese E-Mail antworten.\n\nMit freundlichen Grüßen\nIhr Stadtwerke-Team'
  });
  
  // Protokoll für gesendete automatische Antworten
  const [sentReplies, setSentReplies] = useState<{[emailId: string]: boolean}>({});
  
  // Zustand für die Detailansicht einer E-Mail
  const [selectedEmail, setSelectedEmail] = useState<DisplayEmail | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  
  // Zustand für den E-Mail-Editor
  const [emailEditorOpen, setEmailEditorOpen] = useState(false);
  const [emailToEdit, setEmailToEdit] = useState<DisplayEmail | null>(null);
  
  // Einstellungen beim Laden der Komponente abrufen (simuliert)
  useEffect(() => {
    // In einer vollständigen Implementierung würden die Einstellungen
    // aus einer Datenbank oder dem lokalen Speicher geladen werden
    const loadSettings = () => {
      // Hier könnten die Einstellungen aus localStorage geladen werden
      const savedSettings = localStorage.getItem('emailSettings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    };
    
    loadSettings();
  }, []);

  // Beim Laden der Komponente prüfen, ob der Benutzer angemeldet ist und E-Mails laden
  useEffect(() => {
    const checkAuthAndLoadEmails = async () => {
      try {
        // MSAL-Redirect-Antwort verarbeiten, falls vorhanden
        await MsalService.handleRedirectResponse();
        
        // Prüfen, ob ein Benutzer angemeldet ist
        const isLoggedIn = MsalService.isLoggedIn();
        setOutlookConnected(isLoggedIn);
        
        if (isLoggedIn) {
          // Benutzerinformationen abrufen
          try {
            const userInfo = await GraphService.getUserInfo();
            setLoggedInUser({
              displayName: userInfo.displayName || '',
              email: userInfo.mail || userInfo.userPrincipalName || 'atug@bsmarthh.onmicrosoft.com'
            });
            
            // E-Mails laden
            await loadEmails();
          } catch (error) {
            console.error('Fehler beim Abrufen der Benutzerinformationen:', error);
            
            // Versuchen, den MSAL-Status zurückzusetzen und erneut anzumelden
            if (error instanceof Error && 
                (error.message.includes('Authentifizierung') || 
                 error.message.includes('keine Authentifizierung möglich'))) {
              console.log('Authentifizierungsproblem erkannt, versuche Neuanmeldung...');
              setError('Authentifizierungsproblem erkannt. Bitte melden Sie sich erneut an.');
              setOutlookConnected(false);
            }
          }
        }
      } catch (error) {
        console.error('Fehler beim Prüfen des Authentifizierungsstatus:', error);
        setError('Fehler beim Prüfen des Authentifizierungsstatus. Bitte laden Sie die Seite neu.');
      }
    };
    
    checkAuthAndLoadEmails();
  }, []);

  // Regelmäßige Aktualisierung für Analyse-Fortschritt
  useEffect(() => {
    if (!outlookConnected) return;

    const interval = setInterval(async () => {
      try {
        // Lade nur die existierenden E-Mails aus der Datenbank (ohne neue von Outlook)
        const existingEmails = await getEmailsWithStatus();
        
        const displayEmails: DisplayEmail[] = existingEmails.map(email => ({
          ...email,
          sender: email.sender_email,
          date: new Date(email.received_date).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          hasAttachments: email.hasAttachments || false,
          attachments: email.attachments || [],
          customer_number: email.customer_number ?? null,
          category: email.category ?? null
        }));

        // Sortiere nach Empfangsdatum
        displayEmails.sort((a, b) => 
          new Date(b.received_date).getTime() - new Date(a.received_date).getTime()
        );

        setEmails(displayEmails);
      } catch (error) {
        console.error('Fehler beim Aktualisieren der E-Mail-Liste:', error);
      }
    }, 5000); // Alle 5 Sekunden aktualisieren

    return () => clearInterval(interval);
  }, [outlookConnected]);
  
  // Funktion zum Öffnen einer E-Mail in der Detailansicht
  const handleEmailClick = (emailId: string, messageId: string) => {
    setSelectedEmail(emails.find(e => e.id === emailId) || null);
    setSelectedMessageId(messageId);
  };
  
  // Funktion zum Schließen der Detailansicht
  const handleCloseEmailDetail = () => {
    setSelectedEmail(null);
    setSelectedMessageId(null);
  };
  
  const handleStatusUpdate = async (emailId: string, newStatus: EmailStatus) => {
    try {
      setEmails(prevEmails =>
        prevEmails.map(email =>
          email.id === emailId ? { ...email, status: newStatus } : email
        )
      );
      await updateRequestStatus(emailId, newStatus);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Status:', error);
    }
  };

  const sendAutomaticReply = async (email: DisplayEmail, replyText: string) => {
    try {
      if (!settings.autoReply || sentReplies[email.id]) {
        return;
      }

      await GraphService.sendEmail(
        `RE: ${email.subject || ''}`,
        replyText,
        [email.sender_email]
      );

      setSentReplies(prev => ({...prev, [email.id]: true}));
      await handleStatusUpdate(email.id, EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT);

    } catch (error) {
      console.error('Fehler beim Senden der automatischen Antwort:', error);
    }
  };

  const analyzeEmailContent = async (subject: string, body: string): Promise<{ customerNumber: string | null; category: string | null }> => {
    try {
      const prompt = `Analysiere den folgenden E-Mail-Text und extrahiere die Kundennummer (falls vorhanden) und ordne die E-Mail einer der folgenden Kategorien zu:
- Zählerstandsmeldungen
- Abschlagsänderung
- Bankverbindungen zur Abbuchung/SEPA/Einzugsermächtigung
- Bankverbindung für Guthaben
- Nicht definiert (wenn keine andere Kategorie passt)

Betreff: ${subject}
Inhalt: ${body}

Antworte ausschließlich im folgenden JSON-Format:
{
  "customerNumber": "gefundene Nummer oder null wenn keine gefunden",
  "category": "eine der oben genannten Kategorien"
}`;

      const response = await openAIService.analyzeText(prompt);
      
      try {
        const result = JSON.parse(response);
        console.log('ChatGPT Analyse Ergebnis:', result);
        
        // Validiere die Kategorie
        const validCategories = [
          'Zählerstandsmeldungen',
          'Abschlagsänderung',
          'Bankverbindungen zur Abbuchung/SEPA/Einzugsermächtigung',
          'Bankverbindung für Guthaben',
          'Nicht definiert'
        ];
        
        if (!validCategories.includes(result.category)) {
          result.category = 'Nicht definiert';
        }
        
        return {
          customerNumber: result.customerNumber,
          category: result.category
        };
      } catch (error) {
        console.error('Fehler beim Parsen der ChatGPT-Antwort:', error);
        return { customerNumber: null, category: 'Nicht definiert' };
      }
    } catch (error) {
      console.error('Fehler bei der ChatGPT-Analyse:', error);
      return { customerNumber: null, category: 'Nicht definiert' };
    }
  };

  const processOutlookEmail = async (outlookEmail: any, existingEmail: IncomingEmail | null): Promise<DisplayEmail> => {
    try {
      // Wenn die E-Mail bereits existiert, gib sie einfach zurück
      if (existingEmail) {
        console.log('E-Mail existiert bereits:', outlookEmail.subject);
        return {
          ...existingEmail,
          sender: existingEmail.sender_email,
          date: new Date(existingEmail.received_date).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          hasAttachments: outlookEmail.hasAttachments || false,
          attachments: outlookEmail.attachments || [],
          customer_number: existingEmail.customer_number ?? null,
          category: existingEmail.category ?? null
        };
      }

      console.log('Verarbeite neue E-Mail:', outlookEmail.subject);

      // Erstelle das E-Mail-Objekt OHNE sofortige Analyse
      const processedEmail: DisplayEmail = {
        id: uuidv4(),
        message_id: outlookEmail.id,
        sender_email: outlookEmail.from?.emailAddress?.address || '',
        sender_name: outlookEmail.from?.emailAddress?.name || null,
        subject: outlookEmail.subject || '',
        content: outlookEmail.bodyPreview || '',
        received_date: new Date(outlookEmail.receivedDateTime),
        customer_number: null, // Wird durch Hintergrund-Analyse gesetzt
        category: null, // Wird durch Hintergrund-Analyse gesetzt
        status: EMAIL_STATUS.FEHLENDE_KUNDENNUMMER, // Standardstatus, wird durch Analyse aktualisiert
        created_at: new Date(),
        updated_at: new Date(),
        hasAttachments: outlookEmail.hasAttachments || false,
        attachments: outlookEmail.attachments || [],
        forwarded: false,
        analysis_completed: false, // Neue Felder für mehrstufige Analyse
        text_analysis_result: null,
        image_analysis_result: null,
        sender: outlookEmail.from?.emailAddress?.address || '',
        date: new Date(outlookEmail.receivedDateTime).toLocaleDateString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        all_customer_numbers: null,
        all_categories: null,
        forwarding_completed: false
      };

      console.log('Speichere E-Mail in Datenbank:', processedEmail.id);

      // Speichere die E-Mail SOFORT in der Datenbank (ohne Analyse)
      const savedEmail = await saveEmailData({
        id: processedEmail.id,
        message_id: processedEmail.message_id,
        sender_email: processedEmail.sender_email,
        sender_name: processedEmail.sender_name,
        subject: processedEmail.subject,
        received_date: processedEmail.received_date,
        content: processedEmail.content,
        status: processedEmail.status,
        customer_number: processedEmail.customer_number,
        category: processedEmail.category,
        created_at: processedEmail.created_at,
        updated_at: processedEmail.updated_at,
        forwarded: processedEmail.forwarded,
        analysis_completed: processedEmail.analysis_completed,
        text_analysis_result: processedEmail.text_analysis_result,
        image_analysis_result: processedEmail.image_analysis_result
      });

      if (!savedEmail) {
        throw new Error('Fehler beim Speichern der E-Mail in der Datenbank');
      }

      console.log('E-Mail erfolgreich gespeichert, starte Hintergrund-Analyse...');

      // Starte die Hintergrund-Analyse (läuft asynchron)
      analysisService.startBackgroundAnalysis(savedEmail.id, savedEmail.message_id)
        .catch(error => {
          console.error('Fehler bei Hintergrund-Analyse:', error);
        });

      // Gib die E-Mail sofort zurück (ohne auf Analyse zu warten)
      return {
        ...savedEmail,
        sender: savedEmail.sender_email,
        date: new Date(savedEmail.received_date).toLocaleDateString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        hasAttachments: outlookEmail.hasAttachments || false,
        attachments: outlookEmail.attachments || [],
        customer_number: savedEmail.customer_number ?? null,
        category: savedEmail.category ?? null
      };

    } catch (error) {
      console.error('Fehler beim Verarbeiten der E-Mail:', error);
      throw error;
    }
  };

  // E-Mails aus dem Outlook-Postfach laden
  const loadEmails = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Hole zuerst die existierenden E-Mails aus der Datenbank
      const existingEmails = await getEmailsWithStatus();
      console.log('Existierende E-Mails geladen:', existingEmails.length);
      
      const existingEmailsMap = new Map(
        existingEmails.map(email => [email.message_id, email])
      );
      
      // Hole dann die E-Mails aus Outlook
      const outlookEmails = await GraphService.getInboxMails(50);
      console.log('Outlook E-Mails geladen:', outlookEmails.length);
      
      const processedEmails: DisplayEmail[] = [];
      
      // Verarbeite jede E-Mail einzeln
      for (const outlookEmail of outlookEmails) {
        try {
          const existingEmail = existingEmailsMap.get(outlookEmail.id);
          
          // Wenn die E-Mail bereits existiert, füge sie direkt hinzu OHNE weitere Verarbeitung
          if (existingEmail) {
            console.log(`E-Mail ${existingEmail.id} existiert bereits - überspringe Verarbeitung`);
            
            processedEmails.push({
              ...existingEmail,
              sender: existingEmail.sender_email,
              date: new Date(existingEmail.received_date).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }),
              hasAttachments: outlookEmail.hasAttachments || false,
              attachments: outlookEmail.attachments || [],
              customer_number: existingEmail.customer_number ?? null,
              category: existingEmail.category ?? null
            });
            continue;
          }

          // NUR für neue E-Mails: Lade vollständigen Inhalt mit Bildern
          console.log(`Neue E-Mail gefunden: ${outlookEmail.subject} - lade vollständigen Inhalt...`);
          
          let fullEmail = outlookEmail;
          if (outlookEmail.hasAttachments) {
            console.log(`E-Mail ${outlookEmail.id} hat Anhänge, lade vollständigen Inhalt mit Bildern...`);
            fullEmail = await GraphService.getEmailContent(outlookEmail.id);
            
            // Für alle Bild-Attachments base64 sofort laden
            if (fullEmail.attachments && Array.isArray(fullEmail.attachments)) {
              console.log(`Gefundene Attachments: ${fullEmail.attachments.length}`);
              
              for (let i = 0; i < fullEmail.attachments.length; i++) {
                const att = fullEmail.attachments[i] as any;
                console.log(`Attachment ${i + 1}:`, {
                  name: att.name,
                  contentType: att.contentType,
                  hasId: !!att.id,
                  size: att.size
                });
                
                // Nur Bilder verarbeiten
                if (att.contentType && att.contentType.startsWith('image/') && att.id) {
                  try {
                    console.log(`Lade base64 für Bild-Attachment: ${att.name}`);
                    const buffer = await GraphService.getAttachmentContent(fullEmail.id, att.id);
                    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
                    att.contentBytes = base64;
                    console.log(`Base64 erfolgreich geladen für ${att.name}, Größe: ${base64.length} Zeichen`);
                  } catch (error) {
                    console.error(`Fehler beim Laden von base64 für Attachment ${att.name}:`, error);
                    att.contentBytes = null;
                  }
                } else if (att.contentType && att.contentType.startsWith('image/')) {
                  console.warn(`Bild-Attachment ${att.name} hat keine ID - kann nicht geladen werden`);
                  att.contentBytes = null;
                }
              }
              
              // Zähle erfolgreich geladene Bilder
              const loadedImages = fullEmail.attachments.filter((att: any) => 
                att.contentType?.startsWith('image/') && att.contentBytes
              ).length;
              const totalImages = fullEmail.attachments.filter((att: any) => 
                att.contentType?.startsWith('image/')
              ).length;
              
              console.log(`Bildanhänge für neue E-Mail geladen: ${loadedImages}/${totalImages}`);
            }
          }
          
          // Verarbeite nur neue E-Mails (mit vollständig geladenen Bildern)
          const processedEmail = await processOutlookEmail(fullEmail, null);
          
          // Füge die verarbeitete E-Mail zur Liste hinzu
          if (processedEmail) {
            processedEmails.push({
              ...processedEmail,
              sender: processedEmail.sender_email,
              date: new Date(processedEmail.received_date).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }),
              hasAttachments: fullEmail.hasAttachments || false,
              attachments: fullEmail.attachments || [],
              customer_number: processedEmail.customer_number ?? null,
              category: processedEmail.category ?? null
            });
          }
        } catch (error) {
          console.error(`Fehler beim Verarbeiten der E-Mail ${outlookEmail.id}:`, error);
          continue;
        }
      }

      // Sortiere die E-Mails nach Empfangsdatum (neueste zuerst)
      processedEmails.sort((a, b) => 
        new Date(b.received_date).getTime() - new Date(a.received_date).getTime()
      );

      console.log('Verarbeitete E-Mails:', processedEmails.length);
      setEmails(processedEmails);
      
    } catch (error) {
      console.error('Fehler beim Laden der E-Mails:', error);
      setError('Fehler beim Laden der E-Mails aus Outlook');
    } finally {
      setLoading(false);
    }
  };
  
  // Filter und Suche anwenden
  const filteredEmails = emails.filter(email => {
    const matchesSearch = searchTerm === '' || 
      (email.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
      email.sender.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (email.customer_number?.includes(searchTerm) ?? false);
    
    const matchesFilter = filterCategory === 'alle' || 
      (filterCategory === 'unkategorisiert' && email.status === EMAIL_STATUS.UNKATEGORISIERT) ||
      (filterCategory === 'ohne-kundennummer' && email.status === EMAIL_STATUS.FEHLENDE_KUNDENNUMMER) ||
      email.category === filterCategory;
    
    return matchesSearch && matchesFilter;
  });

  // Status-Icon basierend auf dem E-Mail-Status
  const getStatusIcon = (status: string, category?: string) => {
    switch(status) {
      case EMAIL_STATUS.KATEGORISIERT:
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case EMAIL_STATUS.UNKATEGORISIERT:
        return <ExclamationCircleIcon className="w-5 h-5 text-orange-500" />;
      case EMAIL_STATUS.FEHLENDE_KUNDENNUMMER:
        return <ExclamationCircleIcon className="w-5 h-5 text-red-500" />;
      case EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT:
        return <EnvelopeIcon className="w-5 h-5 text-blue-500" />;
      case EMAIL_STATUS.ANGEFRAGT:
        return <EnvelopeIcon className="w-5 h-5 text-yellow-500" />;
      default:
        return <EnvelopeIcon className="w-5 h-5 text-gray-500" />;
    }
  };

  // Manuelles Senden einer automatischen Antwort für eine bestimmte E-Mail
  const manualSendReply = async (emailId: string) => {
    try {
      const email = emails.find(e => e.id === emailId);
      if (!email) return;

      // Öffne den E-Mail-Editor statt die E-Mail direkt zu senden
      setEmailToEdit(email);
      setEmailEditorOpen(true);
      
    } catch (error) {
      console.error('Fehler beim Öffnen des E-Mail-Editors:', error);
      alert('Fehler beim Öffnen des E-Mail-Editors: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // Callback für erfolgreich gesendete E-Mail aus dem Editor
  const handleEmailSent = async () => {
    if (!emailToEdit) return;

    try {
      // Aktualisiere den Status in der Datenbank
      await handleStatusUpdate(emailToEdit.id, EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT);
      
      // Status lokal aktualisieren
      setEmails(prevEmails =>
        prevEmails.map(e =>
          e.id === emailToEdit.id
            ? { ...e, status: EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT }
            : e
        )
      );
      
      // Markiere die E-Mail als beantwortet
      setSentReplies(prev => ({...prev, [emailToEdit.id]: true}));
      
      alert('E-Mail wurde erfolgreich gesendet.');
      
      // Lade die E-Mails neu, um den aktualisierten Status zu erhalten
      await loadEmails();
    } catch (error) {
      console.error('Fehler beim Aktualisieren des E-Mail-Status:', error);
      alert('E-Mail wurde gesendet, aber Status konnte nicht aktualisiert werden.');
    }
  };

  // Callback für das Schließen des E-Mail-Editors
  const handleEmailEditorClose = () => {
    setEmailEditorOpen(false);
    setEmailToEdit(null);
  };

  useEffect(() => {
    const loadStoredData = async () => {
      try {
        const storedData = await getStoredData();
        if (storedData.emails) {
          const displayEmails: DisplayEmail[] = storedData.emails.map(email => ({
            ...email,
            sender: email.sender_email,
            date: new Date(email.received_date).toLocaleDateString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }),
            customer_number: email.customer_number ?? null,
            category: email.category ?? null
          }));

          // Setze die gesendeten Antworten basierend auf dem Status
          const newSentReplies: {[key: string]: boolean} = {};
          displayEmails.forEach(email => {
            if (email.status === EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT) {
              newSentReplies[email.id] = true;
            }
          });
          setSentReplies(newSentReplies);

          setEmails(displayEmails);
        }
        if (storedData.settings) {
          // Lade die Einstellungen für automatische Antworten
          const autoReplySettings = storedData.settings.find(s => s.setting_key === 'autoReply');
          const replyTemplateSettings = storedData.settings.find(s => s.setting_key === 'defaultReplyTemplate');
          
          setSettings(prev => ({
            ...prev,
            autoReply: autoReplySettings?.setting_value === 'true',
            defaultReplyTemplate: replyTemplateSettings?.setting_value || prev.defaultReplyTemplate
          }));
        }
      } catch (error) {
        console.error('Fehler beim Laden der gespeicherten Daten:', error);
      }
    };

    loadStoredData();
  }, []);

  const handleEmailReceived = async (email: Partial<DisplayEmail>) => {
    try {
      const savedEmail = await saveEmailData(email);
      if (savedEmail) {
        // Konvertiere das gespeicherte E-Mail-Objekt in ein DisplayEmail
        const displayEmail: DisplayEmail = {
          ...savedEmail,
          sender: savedEmail.sender_email,
          date: new Date(savedEmail.received_date).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          customer_number: savedEmail.customer_number ?? null,
          category: savedEmail.category ?? null
        };
        setEmails(prevEmails => [displayEmail, ...prevEmails]);
      }
    } catch (error) {
      console.error('Fehler beim Speichern der E-Mail:', error);
    }
  };

  const toggleAutoReply = async (enabled: boolean) => {
    try {
      await saveSettings('autoReply', enabled.toString());
      setSettings(prev => ({
        ...prev,
        autoReply: enabled
      }));
    } catch (error) {
      console.error('Fehler beim Speichern der Auto-Reply-Einstellungen:', error);
    }
  };

  const handleRequestSend = async (emailId: string) => {
    try {
      await updateRequestStatus(emailId, 'Angefragt');
      setEmails(prevEmails =>
        prevEmails.map(email =>
          email.id === emailId ? { ...email, status: 'Angefragt' } : email
        )
      );
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Anfrage-Status:', error);
    }
  };

  const handleAnalysisComplete = async (result: { customerNumber?: string | undefined; category?: string | undefined }) => {
    if (!selectedEmail) return;

    try {
      console.log('GPT-Analyse abgeschlossen:', result);
      
      await updateEmailAnalysis(selectedEmail.message_id, {
        customerNumber: result.customerNumber,
        category: result.category
      });

      // Aktualisiere die E-Mail-Liste
      setEmails(prevEmails => 
        prevEmails.map(email => 
          email.message_id === selectedEmail.message_id
            ? {
                ...email,
                customer_number: result.customerNumber ?? null,
                category: result.category ?? null
              }
            : email
        )
      );

      // Aktualisiere die ausgewählte E-Mail
      setSelectedEmail(prevEmail => 
        prevEmail
          ? {
              ...prevEmail,
              customer_number: result.customerNumber ?? null,
              category: result.category ?? null
            }
          : null
      );

      console.log('E-Mail erfolgreich aktualisiert');
    } catch (error) {
      console.error('Fehler beim Aktualisieren der E-Mail:', error);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">E-Mails</h1>
      
      {!outlookConnected ? (
        <div className="bg-white rounded-lg shadow p-6 mb-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Mit Outlook verbinden</h2>
          <p className="mb-6 text-gray-600">
            Um E-Mails anzeigen zu können, müssen Sie sich bei Ihrem Microsoft Outlook-Konto anmelden.
          </p>
          <button
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-blue-600"
            onClick={loadEmails}
          >
            E-Mails aktualisieren
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            {/* Anzeige des angemeldeten Benutzers */}
            <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6">
              <div className="flex items-center">
                <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                <span className="text-green-700 font-medium">Verbunden mit Outlook</span>
              </div>
              <div className="mt-2 ml-7">
                <p className="text-sm text-green-700">
                  Angemeldet als: <span className="font-medium">{loggedInUser.displayName}</span>
                </p>
                <p className="text-sm text-green-700">
                  E-Mail: <span className="font-medium">{loggedInUser.email}</span>
                </p>
                <p className="text-sm text-green-700 mt-2">
                  Automatische Antworten werden automatisch von Ihrem Microsoft-Konto versendet.
                </p>
              </div>
            </div>
            
            {/* Status der automatischen Antworten */}
            {settings.autoReply && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
                <div className="flex items-center">
                  <EnvelopeIcon className="h-5 w-5 text-blue-500 mr-2" />
                  <span className="text-blue-700 font-medium">Antwort-Modus: Manuell</span>
                </div>
                <p className="mt-2 text-sm text-blue-700 ml-7">
                  E-Mails ohne Kundennummer werden mit einem "Anfrage senden"-Button markiert.
                </p>
                <p className="mt-1 text-sm text-blue-700 ml-7">
                  {Object.keys(sentReplies).length} Antworten wurden in dieser Sitzung gesendet.
                </p>
                <div className="mt-3 ml-7">
                  <button
                    onClick={loadEmails}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    E-Mails aktualisieren
                  </button>
                </div>
              </div>
            )}
            
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
              <div className="relative mb-4 md:mb-0 md:w-1/2">
                <input
                  type="text"
                  placeholder="Suche nach Betreff, Absender oder Kundennummer..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <FunnelIcon className="w-5 h-5 text-gray-500 mr-2" />
                  <label htmlFor="category-filter" className="mr-2 text-gray-600">Filter:</label>
                  <select
                    id="category-filter"
                    className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                  >
                    <option value="alle">Alle E-Mails</option>
                    <option value="Zählerstandmeldungen">Zählerstandmeldungen</option>
                    <option value="Abschlagsänderung">Abschlagsänderung</option>
                    <option value="Bankverbindungen zur Abbuchung">Bankverbindungen zur Abbuchung</option>
                    <option value="Bankverbindung für Guthaben">Bankverbindung für Guthaben</option>
                    <option value="unkategorisiert">Unkategorisiert</option>
                    <option value="ohne-kundennummer">Ohne Kundennummer</option>
                  </select>
                </div>
                
                <button
                  className="p-2 rounded-md text-gray-600 hover:bg-gray-100 transition-colors duration-200"
                  onClick={loadEmails}
                  disabled={loading}
                  title="E-Mails aktualisieren"
                >
                  <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
                <div className="flex items-center text-red-600">
                  <ExclamationCircleIcon className="w-5 h-5 mr-2" />
                  <span>{error}</span>
                </div>
              </div>
            )}
            
            {loading ? (
              <div className="flex justify-center py-10">
                <ArrowPathIcon className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                {filteredEmails.length > 0 ? (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Betreff
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Absender
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Datum
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Kundennummer
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Kategorie
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Aktionen
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredEmails.map((email) => (
                        <tr 
                          key={email.id}
                          onClick={() => handleEmailClick(email.id, email.message_id)}
                          className="hover:bg-gray-50 cursor-pointer"
                        >
                          <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center">
                              {getStatusIcon(email.status, email.category === null ? undefined : email.category)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{email.subject}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{email.sender}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{email.date}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {email.customer_number ? (
                              <div className="space-y-1">
                                {/* Zeige alle Kundennummern an */}
                                {email.all_customer_numbers && email.all_customer_numbers.length > 0 ? (
                                  email.all_customer_numbers.map((customerNumber, index) => (
                                    <div key={index} className="text-sm text-gray-900">
                                      {customerNumber}
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-sm text-gray-900">{email.customer_number}</div>
                                )}
                              </div>
                            ) : email.status === EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT ? (
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                Angefragt
                              </span>
                            ) : email.analysis_completed === false ? (
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                Wird analysiert...
                              </span>
                            ) : (
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                Fehlt
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {email.category ? (
                              <div className="space-y-1">
                                {/* Zeige alle Kategorien an */}
                                {email.all_categories && email.all_categories.length > 0 ? (
                                  email.all_categories.map((category, index) => (
                                    <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-1 mb-1">
                                      <TagIcon className="mr-1 h-3 w-3" />
                                      {category}
                                    </span>
                                  ))
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    <TagIcon className="mr-1 h-3 w-3" />
                                    {email.category}
                                  </span>
                                )}
                                {/* Zeige Anzahl der Weiterleitungen */}
                                {email.all_customer_numbers && email.all_customer_numbers.length > 0 && 
                                 email.all_categories && email.all_categories.length > 0 && (
                                  <div className="text-xs text-blue-600 mt-1">
                                    {email.all_customer_numbers.length * email.all_categories.length} Weiterleitungen
                                  </div>
                                )}
                              </div>
                            ) : email.analysis_completed === false ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                Wird analysiert...
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                Nicht kategorisiert
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {!email.customer_number && !sentReplies[email.id] && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  manualSendReply(email.id);
                                }}
                                className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                              >
                                Anfrage senden
                              </button>
                            )}
                            {email.status === EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Kundennummer angefragt
                              </span>
                            )}
                            {sentReplies[email.id] && email.status !== EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Antwort gesendet
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-10">
                    <p className="text-gray-500">Keine E-Mails gefunden</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {filteredEmails.length > 0 && (
            <div className="flex justify-between items-center mb-8">
              <div className="text-sm text-gray-500">
                {filteredEmails.length} E-Mail{filteredEmails.length !== 1 ? 's' : ''} gefunden
              </div>
            </div>
          )}
        </>
      )}
      
      {/* E-Mail-Detailansicht */}
      {selectedEmail && selectedMessageId && (
        <EmailDetail
          emailId={selectedEmail.id}
          messageId={selectedMessageId}
          onClose={handleCloseEmailDetail}
          onAnalysisComplete={handleAnalysisComplete}
        />
      )}
      
      {/* E-Mail-Editor */}
      {emailToEdit && (
        <EmailEditor
          isOpen={emailEditorOpen}
          onClose={handleEmailEditorClose}
          onSend={handleEmailSent}
          recipientEmail={emailToEdit.sender_email}
          recipientName={emailToEdit.sender_name || undefined}
          originalSubject={emailToEdit.subject || ''}
          originalContent={emailToEdit.content || ''}
          originalDate={emailToEdit.date}
          originalSender={emailToEdit.sender}
          defaultTemplate={settings.defaultReplyTemplate}
        />
      )}
    </div>
  );
};

export default Emails; 