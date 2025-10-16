import React, { useState, useEffect, useRef } from 'react';
import { 
  MagnifyingGlassIcon, 
  TagIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  ArrowPathIcon,
  XMarkIcon,
  PlusIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';
import MsalService from '../services/MsalService';
import GraphService from '../services/GraphService';
import EmailDetail from '../components/EmailDetail';
import EmailEditor from '../components/EmailEditor';
import { 
  saveEmailData,
  saveSettings,
  updateRequestStatus,
  getStoredData,
  getCategories,
  getEmailsWithStatus,
  getEmailByMessageId,
  updateEmailAnalysis,
  updateForwardingStatus,
  updateEmailCategories,
  deleteEmail,
  deleteForwardingStatus,
  deleteRequestStatus,
  updateEmailCustomerNumbers
} from '../services/SupabaseService';
import { IncomingEmail, EMAIL_STATUS, EmailStatus } from '../types/supabase';
import { v4 as uuidv4 } from 'uuid';
import { analysisService } from '../services/AnalysisService';

const PROCESSED_FOLDER_NAME = 'Verarbeitet_von_BSMART'; // change to whatever you like

const inboxEmailAdress = import.meta.env.VITE_INBOX_EMAIL_ADRESS || '';
const inboxEmailAdress2 = import.meta.env.VITE_INBOX_EMAIL_ADRESS2 || '';
const inboxEmailAdress3 = import.meta.env.VITE_INBOX_EMAIL_ADRESS3 || '';
const inboxEmailAdress4 = import.meta.env.VITE_INBOX_EMAIL_ADRESS4 || '';

const inboxEmailList = [inboxEmailAdress, inboxEmailAdress2, inboxEmailAdress3, inboxEmailAdress4];

const NORMALIZED_INBOX_SET = new Set(
  inboxEmailList.filter(Boolean).map(a => a.trim().toLowerCase())
);

const getPrimaryInboxRecipient = (toRecipients: any[]): string => {
  if (!Array.isArray(toRecipients)) return '';
  for (const r of toRecipients) {
    const raw = r?.emailAddress?.address;
    const addr = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (addr && NORMALIZED_INBOX_SET.has(addr)) {
      // return original casing
      return raw;
    }
  }
  // Fallback (optional): first recipient or empty string
  return toRecipients[0]?.emailAddress?.address || '';
};


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

const loadedData = await getCategories();

const categories = loadedData.map(
    cat => (cat.category_name)
  )

const statusOptions = [
  { value: 'alle', label: 'Alle' },
  { value: EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT, label: 'Rückfrage gesendet' },
  { value: EMAIL_STATUS.WEITERGELEITET, label: 'Weitergeleitet' },
  { value: "Unbearbeitet", label: 'Unbearbeitet' },
  { value: EMAIL_STATUS.FEHLENDE_KUNDENNUMMER, label: 'Fehlende Kundennummer' },
  { value: EMAIL_STATUS.AUSGEBLENDET, label: 'Ausgeblendet' }
  // Add any other statuses you use
];

const Emails: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('alle');
  const [filterStatus, setFilterStatus] = useState('alle');
  const [emails, setEmails] = useState<DisplayEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [outlookConnected, setOutlookConnected] = useState(false);
  
  // Filter: To-recipient (which mailbox received it)
  const [filterToRecipient, setFilterToRecipient] = useState<string>('alle');

  // Build selectable options from env inbox list (preserve original casing, skip empties)
  const inboxFilterOptions = ['alle', ...inboxEmailList.filter(Boolean)];

  
  // NEW: state for manual forwarding popover
  const [openManualForwardEmailId, setOpenManualForwardEmailId] = useState<string | null>(null);
  const [manualForwardRecipient, setManualForwardRecipient] = useState('');

  // Information über den angemeldeten Benutzer
  const [loggedInUser, setLoggedInUser] = useState({
    displayName: '',
    email: 'atug@bsmarthh.onmicrosoft.com'
  });
  
  // Einstellungen für automatische Antworten
  const [settings, setSettings] = useState<{
    autoReply: boolean;
    replyCount: number;
    forwardingEmail: string;
    defaultReplyTemplate: string;
    defaultUnrecognizableReplyTemplate: string;
  }>({
    autoReply: false,
    replyCount: 0,
    forwardingEmail: "blank",
    defaultReplyTemplate: 'Sehr geehrte(r) Frau/Herr,\n\nVielen Dank für Ihre Nachricht. Für eine schnellere Bearbeitung Ihres Anliegens benötigen wir Ihre Kundennummer.\n\nBitte teilen Sie uns diese mit, indem Sie auf diese E-Mail antworten.\n\nMit freundlichen Grüßen\nIhr Stadtwerke-Team',
    defaultUnrecognizableReplyTemplate: "Leider nciht kategorisierbar"
  });
  
  // Protokoll für gesendete automatische Antworten
  const [sentReplies, setSentReplies] = useState<{[emailId: string]: boolean}>({});
  
  // Detailansicht
  const [selectedEmail, setSelectedEmail] = useState<DisplayEmail | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  
  // E-Mail-Editor
  const [emailEditorOpen, setEmailEditorOpen] = useState(false);
  const [emailToEdit, setEmailToEdit] = useState<DisplayEmail | null>(null);

  const [openDropdownEmailId, setOpenDropdownEmailId] = useState<string | null>(null);

  const [openNumberEditorEmailId, setOpenNumberEditorEmailId] = useState<string | null>(null);
  const [newCustomerNumber, setNewCustomerNumber] = useState('');

  const forwardSuggestions = ['test@abc.de', 'test@def.de'];


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".dropdown-wrapper")) {
        setOpenDropdownEmailId(null);
      }
      if (!(event.target as HTMLElement).closest(".manual-forward-wrapper")) {
        setOpenManualForwardEmailId(null);
        setManualForwardRecipient('');
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleCategorySelect = async(email: DisplayEmail, category: string) => {
    console.log(`Selected category "${category}" for email: ${email.id}`);
    setOpenDropdownEmailId(null);

    handleAddCategory(email, category);
  };

  const handleAddCategory = async (email: DisplayEmail, cat: string) => {
    try {
      const current = Array.isArray(email.all_categories) ? [...email.all_categories] : [];
      let nextCats: string[];

      if (current.length === 1 && current[0] === "Sonstiges") {
        nextCats = [cat];
      } else if (!current.includes(cat)) {
        nextCats = [...current, cat];
      } else {
        nextCats = current;
      }

      await updateEmailCategories(email.id, {
        all_categories: nextCats,
        category: cat,
      });

      if (email.status === EMAIL_STATUS.UNKATEGORISIERT) {
        await handleStatusUpdate(email.id, EMAIL_STATUS.KATEGORISIERT);
      }

      setEmails(prev =>
        prev.map(e =>
          e.id === email.id ? { ...e, all_categories: nextCats, category: cat } : e
        )
      );

      setOpenDropdownEmailId(null);
    } catch (err) {
      console.error("Fehler beim Hinzufügen der Kategorie:", err);
    }
  };

  const handleRemove = async (email: DisplayEmail, index: number) => {
    try {
      const current = Array.isArray(email.all_categories) ? [...email.all_categories] : [];
      const removed = current[index];
      const next = current.filter((_, i) => i !== index);

      let nextMain: string | null;

      if (next.length === 0) {
        nextMain = "Sonstiges";
      } else if (email.category === removed) {
        nextMain = next[0];
      } else {
        nextMain = email.category || next[0];
      }

      const nextCats = next.length === 0 ? ["Sonstiges"] : next;

      await updateEmailCategories(email.id, {
        all_categories: nextCats,
        category: nextMain,
      });

      setEmails(prev =>
        prev.map(e =>
          e.id === email.id ? { ...e, all_categories: nextCats, category: nextMain } : e
        )
      );

    } catch (err) {
      console.error("Fehler beim Entfernen der Kategorie:", err);
    }
  };

  const handleAddCustomerNumber = async (email: DisplayEmail, raw: string) => {
    const num = (raw || '').trim();
    if (!num) return;

    const current = Array.isArray(email.all_customer_numbers) ? [...email.all_customer_numbers] : [];
    if (current.includes(num)) {
      setOpenNumberEditorEmailId(null);
      setNewCustomerNumber('');
      return;
    }

    const wasEmpty = current.length === 0;
    current.push(num);

    await updateEmailCustomerNumbers(email.id, {
      all_customer_numbers: current,
      customer_number: current[0] ?? null,
    });

    if (wasEmpty && email.status === EMAIL_STATUS.FEHLENDE_KUNDENNUMMER) {
      await handleStatusUpdate(
        email.id,
        email.category ? EMAIL_STATUS.KATEGORISIERT : EMAIL_STATUS.UNKATEGORISIERT
      );
    }

    setEmails(prev =>
      prev.map(e =>
        e.id === email.id
          ? { ...e, all_customer_numbers: current, customer_number: current[0] ?? null }
          : e
      )
    );

    setOpenNumberEditorEmailId(null);
    setNewCustomerNumber('');
  };

  const handleRemoveCustomerNumber = async (email: DisplayEmail, index: number) => {
    const current = Array.isArray(email.all_customer_numbers) ? [...email.all_customer_numbers] : [];
    current.splice(index, 1);

    await updateEmailCustomerNumbers(email.id, {
      all_customer_numbers: current,
      customer_number: current[0] ?? null,
    });

    if (current.length === 0 && email.status !== EMAIL_STATUS.FEHLENDE_KUNDENNUMMER) {
      await handleStatusUpdate(email.id, EMAIL_STATUS.FEHLENDE_KUNDENNUMMER);
    }

    setEmails(prev =>
      prev.map(e =>
        e.id === email.id
          ? { ...e, all_customer_numbers: current, customer_number: current[0] ?? null }
          : e
      )
    );
  };


  const handleForwardClick = async (emailId: string) => {
    await forwardEmails(emailId);
  };
  
  // Einstellungen laden
  useEffect(() => {
    const loadSettings = () => {
      const savedSettings = localStorage.getItem('emailSettings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    };
    loadSettings();
  }, []);

  // Auth prüfen + E-Mails laden
  useEffect(() => {
    const checkAuthAndLoadEmails = async () => {
      try {
        await MsalService.handleRedirectResponse();
        const isLoggedIn = MsalService.isLoggedIn();
        setOutlookConnected(isLoggedIn);
        
        if (isLoggedIn) {
          try {
            const userInfo = await GraphService.getUserInfo();
            setLoggedInUser({
              displayName: userInfo.displayName || '',
              email: userInfo.mail || userInfo.userPrincipalName || '@bsmarthh.onmicrosoft.com'
            });
            await loadEmails();
          } catch (error) {
            console.error('Fehler beim Abrufen der Benutzerinformationen:', error);
            if (error instanceof Error && 
                (error.message.includes('Authentifizierung') || 
                 error.message.includes('keine Authentifizierung möglich'))) {
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

  // Regelmäßige Aktualisierung
  useEffect(() => {
    if (!outlookConnected) return;

    const interval = setInterval(async () => {
      try {
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
          category: email.category ?? null,
          all_customer_numbers: Array.isArray(email.all_customer_numbers) ? email.all_customer_numbers : [],
          all_categories: Array.isArray(email.all_categories) ? email.all_categories : [],
        }));

        displayEmails.sort((a, b) => 
          new Date(b.received_date).getTime() - new Date(a.received_date).getTime()
        );

        setEmails(displayEmails);
        setLoading(false);
      } catch (error) {
        console.error('Fehler beim Aktualisieren der E-Mail-Liste:', error);
      }}, 5000);
      
      return () => clearInterval(interval);
  }, [outlookConnected]);
  
  const handleEmailClick = async(emailId: string, messageId: string, to_recipients: string) => {
    console.log("CLICKLCICKLCKICK")
    try {
      await GraphService.getEmailContent(messageId, to_recipients);
      setSelectedEmail(emails.find(e => e.id === emailId) || null);
      setSelectedMessageId(messageId);
    } catch (error) {
      if ((error as any).message === "Request failed with status code 404") {
        alert("Email nicht abrufbar");
        await deleteRequestStatus(emailId)
        await deleteForwardingStatus(emailId)
        await deleteEmail(emailId)
        setEmails(prevEmails =>
          prevEmails.filter(em =>
            em.id !== emailId
          )
        );
      }
    }
  };

  const handleCloseEmailDetail = async() => {
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

  const handleForwardingStatusUpdate = async (emailId: string, newStatus: EmailStatus) => {
    try {
      setEmails(prevEmails =>
        prevEmails.map(email =>
          email.id === emailId ? { ...email, status: newStatus } : email
        )
      );
      await updateForwardingStatus(emailId, newStatus);
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

  const processOutlookEmail = async (outlookEmail: any, existingEmail: IncomingEmail | null): Promise<DisplayEmail> => {
    try {
      if (existingEmail) {
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

      const toRecipientsArr = outlookEmail.toRecipients ?? [];
      const primaryTo = getPrimaryInboxRecipient(toRecipientsArr);

      const processedEmail: DisplayEmail = {
        id: uuidv4(),
        message_id: outlookEmail.id,
        sender_email: outlookEmail.from?.emailAddress?.address || '',
        sender_name: outlookEmail.from?.emailAddress?.name || null,
        subject: outlookEmail.subject || '',
        content: outlookEmail.bodyPreview || '',
        received_date: new Date(outlookEmail.receivedDateTime),
        customer_number: null,
        category: null,
        status: EMAIL_STATUS.FEHLENDE_KUNDENNUMMER,
        created_at: new Date(),
        updated_at: new Date(),
        hasAttachments: outlookEmail.hasAttachments || false,
        attachments: outlookEmail.attachments || [],
        forwarded: false,
        analysis_completed: false,
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
        forwarding_completed: false,
        to_recipients: primaryTo
      };

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
        image_analysis_result: processedEmail.image_analysis_result,
        to_recipients: processedEmail.to_recipients ?? "",
      });

      if (!savedEmail) {
        throw new Error('Fehler beim Speichern der E-Mail in der Datenbank');
      }

      // analysisService.startBackgroundAnalysis(savedEmail.id, savedEmail.message_id, settings.forwardingEmail)
      //   .catch(error => {
      //     console.error('Fehler bei Hintergrund-Analyse:', error);
      //   });


      if (!savedEmail.analysis_completed) {
        analysisService.startBackgroundAnalysis(savedEmail.id, savedEmail.message_id, primaryTo, settings.forwardingEmail)
          .catch(err => console.error('Fehler bei Hintergrund-Analyse:', err));
      }

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
        category: savedEmail.category ?? null,
        to_recipients: savedEmail.to_recipients ?? "",
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
      
      const existingEmails = await getEmailsWithStatus();
      console.log(existingEmails)
      const existingEmailsMap = new Map(
        existingEmails.map(email => [email.message_id, email])
      );
      
      const outlookEmails = await GraphService.getInboxMails(300);
      console.log("outlookEmails")
      console.log(outlookEmails)
      for (const asd of outlookEmails) {
        console.log(getPrimaryInboxRecipient(asd.toRecipients ?? []));
      }

      const snapshotIds = new Set(outlookEmails.map((m: any) => m.id));
      
      const toDeleteLocals = existingEmails.filter(
        (e) => !snapshotIds.has(e.message_id)
      );

      for (const local of toDeleteLocals) {
        try {
          await deleteRequestStatus(local.id);
          await deleteForwardingStatus(local.id);
          await deleteEmail(local.id);
        } catch (e) {
          console.error('Fehler beim Löschen lokaler E-Mail (Diff):', e);
        }
      }

      // const deletedEmailIds= outlookEmails.filter(
      //   (em: object) => em.hasOwnProperty('@removed')
      // ).map((elem: any) => elem.id)

      // console.log("deletedEmailIds")
      // console.log(deletedEmailIds)


      const newEmails = outlookEmails;
      // const newEmails = outlookEmails.filter(
      //   (em: object) => !em.hasOwnProperty('@removed')
      // )

      console.log("newEmails")
      console.log(newEmails)

      // for (const delId of deletedEmailIds){
      //   const email = await getEmailByMessageId(delId)
      //   await deleteRequestStatus(email.id)
      //   await deleteForwardingStatus(email.id)
      //   await deleteEmail(email.id)
      // }
      
      const processedEmails: DisplayEmail[] = [];
      
      for (const outlookEmail of newEmails) {
        try {
          const existingEmail = existingEmailsMap.get(outlookEmail.id);
          
          if (existingEmail) {
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

          let fullEmail = outlookEmail;
          // if (outlookEmail.hasAttachments) {
          //   fullEmail = await GraphService.getEmailContent(outlookEmail.id);
            
          //   if (fullEmail.attachments && Array.isArray(fullEmail.attachments)) {
          //     for (let i = 0; i < fullEmail.attachments.length; i++) {
          //       const att = fullEmail.attachments[i] as any;
          //       if (att.contentType && att.contentType.startsWith('image/') && att.id) {
          //         try {
          //           const buffer = await GraphService.getAttachmentContent(fullEmail.id, att.id);
          //           const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
          //           att.contentBytes = base64;
          //         } catch (error) {
          //           console.error(`Fehler beim Laden von base64 für Attachment ${att.name}:`, error);
          //           att.contentBytes = null;
          //         }
          //       } else if (att.contentType && att.contentType.startsWith('image/')) {
          //         att.contentBytes = null;
          //       }
          //     }
          //   }
          // }
          
          const processedEmail = await processOutlookEmail(fullEmail, null);
          
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

      processedEmails.sort((a, b) => 
        new Date(b.received_date).getTime() - new Date(a.received_date).getTime()
      );

      setEmails(processedEmails);
      
    } catch (error) {
      console.error('Fehler beim Laden der E-Mails:', error);
      setError('Fehler beim Laden der E-Mails aus Outlook');
    } finally {
      console.log("DONEODNEDONE");
      setLoading(false); // tiny QoL
    }
  };
  

  const filteredEmails = emails.filter((email) => {
  const matchesSearch =
    email.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    email.sender?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    email.customer_number?.toLowerCase().includes(searchTerm.toLowerCase());

  const matchesCategory =
    filterCategory === 'alle' ||
    (filterCategory === 'unkategorisiert' && !email.category) ||
    (filterCategory === 'ohne-kundennummer' && !email.customer_number) ||
    email.category === filterCategory ||
    (email.all_categories && email.all_categories.includes(filterCategory));
  
  // NEW: To-recipient filter (case-insensitive match against the tag)
  const matchesToRecipient =
    filterToRecipient === 'alle' ||
    (email.to_recipients || '').trim().toLowerCase() === filterToRecipient.trim().toLowerCase();

  const isAusgeblendet = email.status === EMAIL_STATUS.AUSGEBLENDET;

  let matchesStatus;
  switch (filterStatus) {
    case 'Unbearbeitet':
      // everything except Weitergeleitet, kundennummer-angefragt, and Ausgeblendet
      matchesStatus =
        !isAusgeblendet &&
        email.status !== 'Weitergeleitet' &&
        email.status !== 'kundennummer-angefragt';
      break;

    case 'alle':
      // all statuses except Ausgeblendet
      matchesStatus = !isAusgeblendet;
      break;

    case EMAIL_STATUS.AUSGEBLENDET:
      // only Ausgeblendet
      matchesStatus = isAusgeblendet;
      break;

    default:
      // exact match, but exclude Ausgeblendet unless explicitly selected above
      matchesStatus = email.status === filterStatus && !isAusgeblendet;
  }

  return matchesSearch && matchesCategory && matchesToRecipient && matchesStatus;
});


  // Status-Icon
  const getStatusIcon = (status: string, category?: string) => {
    switch(status) {
      case EMAIL_STATUS.KATEGORISIERT:
        return <CheckCircleIcon className="w-5 h-5 text-yellow-500" />;
      case EMAIL_STATUS.UNKATEGORISIERT:
        return <ExclamationCircleIcon className="w-5 h-5 text-orange-500" />;
      case EMAIL_STATUS.FEHLENDE_KUNDENNUMMER:
        return <ExclamationCircleIcon className="w-5 h-5 text-red-500" />;
      case EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT:
        return <EnvelopeIcon className="w-5 h-5 text-yellow-500" />;
      case EMAIL_STATUS.WEITERGELEITET:
        return <EnvelopeIcon className="w-5 h-5 text-green-500" />;
      case EMAIL_STATUS.AUSGEBLENDET:
        return <EyeSlashIcon className="w-5 h-5 text-gray-400" />;
      default:
        return <EnvelopeIcon className="w-5 h-5 text-gray-500" />;
    }
  };

  // Editor öffnen
  const manualSendReply = async (emailId: string) => {
    try {
      const email = emails.find(e => e.id === emailId);
      if (!email) return;
      setEmailToEdit(email);
      setEmailEditorOpen(true);
    } catch (error) {
      console.error('Fehler beim Öffnen des E-Mail-Editors:', error);
      alert('Fehler beim Öffnen des E-Mail-Editors: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // Standard-Weiterleitung (bestehend)
  const forwardEmails = async (emailId: string) => {
    try {
      const email = emails.find(e => e.id === emailId);
      if (!email) return;

      await analysisService.startForwarding(email.id, email.message_id, settings.forwardingEmail)
        .catch(err => console.error('Fehler bei Hintergrund-Analyse:', err));

      const mailbox = email.to_recipients || '';

      if (mailbox) {
        // 1) Mark as read
        try { await GraphService.markMessageRead(email.message_id, mailbox); } catch (e) { console.warn('Mark read failed:', e); }

        // 2) Ensure folder + move
        try {
          const destId = await GraphService.ensureFolder(mailbox, PROCESSED_FOLDER_NAME);
          await GraphService.moveMessage(email.message_id, mailbox, destId);
        } catch (e) {
          console.warn('Move failed:', e);
        }
      }

      await handleForwardingStatusUpdate(email.id, EMAIL_STATUS.WEITERGELEITET);
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, status: EMAIL_STATUS.WEITERGELEITET } : e));
      return { success: true };
    } catch (error) {
      console.error('Fehler beim Weiterleiten', error);
      alert('Fehler beim Weiterleiten ' + (error instanceof Error ? error.message : String(error)));
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  };


  // NEW: Manuelle Weiterleitung (Empfänger frei wählen)
  const manualForwardEmails = async (emailId: string, recipientEmail: string) => {
    try {
      const email = emails.find(e => e.id === emailId);
      if (!email) return;

      const to = (recipientEmail || '').trim();
      if (!to || !to.includes('@')) {
        alert('Bitte eine gültige Empfänger-E-Mail eingeben.');
        return;
      }

      const mailbox = email.to_recipients || '';

      await analysisService.startManualForwarding(email.id, email.message_id, mailbox, to)
        .catch(err => console.error('Fehler bei Hintergrund-Analyse (manuelle Weiterleitung):', err));

      if (mailbox) {
        // 1) Mark as read
        try { await GraphService.markMessageRead(email.message_id, mailbox); } catch (e) { console.warn('Mark read failed:', e); }

        // 2) Ensure folder + move
        try {
          const destId = await GraphService.ensureFolder(mailbox, PROCESSED_FOLDER_NAME);
          await GraphService.moveMessage(email.message_id, mailbox, destId);
        } catch (e) {
          console.warn('Move failed:', e);
        }
      }

      await handleForwardingStatusUpdate(email.id, EMAIL_STATUS.WEITERGELEITET);
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, status: EMAIL_STATUS.WEITERGELEITET } : e));

      setOpenManualForwardEmailId(null);
      setManualForwardRecipient('');

      return { success: true };
    } catch (error) {
      console.error('Fehler bei manueller Weiterleitung', error);
      alert('Fehler bei manueller Weiterleitung ' + (error instanceof Error ? error.message : String(error)));
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  };



  // Callback nach Senden im Editor
  const handleEmailSent = async () => {
    if (!emailToEdit) return;

    try {
      await handleStatusUpdate(emailToEdit.id, EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT);
      
      setEmails(prevEmails =>
        prevEmails.map(e =>
          e.id === emailToEdit.id
            ? { ...e, status: EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT }
            : e
        )
      );
      
      setSentReplies(prev => ({...prev, [emailToEdit.id]: true}));
      alert('E-Mail wurde erfolgreich gesendet.');
    } catch (error) {
      console.error('Fehler beim Aktualisieren des E-Mail-Status:', error);
      alert('E-Mail wurde gesendet, aber Status konnte nicht aktualisiert werden.');
    }
  };

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
            category: email.category ?? null,
            all_customer_numbers: Array.isArray(email.all_customer_numbers) ? email.all_customer_numbers : [],
            all_categories: Array.isArray(email.all_categories) ? email.all_categories : [],
          }));

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
          const autoReplySettings = storedData.settings.find((s: any) => s.setting_key === 'autoReply');
          const replyTemplateSettings = storedData.settings.find((s: any) => s.setting_key === 'defaultReplyTemplate');
          const unrecognizableReplySettings = storedData.settings.find((s: any) => s.setting_key === 'defaultUnrecognizableReplyTemplate');
          const forwardingEmail = storedData.settings.find((s: any) => s.setting_key === 'emailForward');
          setSettings(prev => ({
            ...prev,
            autoReply: autoReplySettings?.setting_value === 'true',
            defaultReplyTemplate: replyTemplateSettings?.setting_value || prev.defaultReplyTemplate,
            defaultUnrecognizableReplyTemplate: unrecognizableReplySettings?.setting_value || prev.defaultReplyTemplate,
            forwardingEmail: forwardingEmail?.setting_value
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
      await updateRequestStatus(emailId, 'kundennummer-angefragt');
      setEmails(prevEmails =>
        prevEmails.map(email =>
          email.id === emailId ? { ...email, status: 'kundennummer-angefragt' } : email
        )
      );
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Anfrage-Status:', error);
    }
  };

  const handleAnalysisComplete = async (result: { customerNumber?: string | undefined; category?: string | undefined }) => {
    if (!selectedEmail) return;

    try {
      await updateEmailAnalysis(selectedEmail.message_id, {
        customerNumber: result.customerNumber,
        category: result.category
      });

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

      setSelectedEmail(prevEmail => 
        prevEmail
          ? {
              ...prevEmail,
              customer_number: result.customerNumber ?? null,
              category: result.category ?? null
            }
          : null
      );

    } catch (error) {
      console.error('Fehler beim Aktualisieren der E-Mail:', error);
    }
  };

  return (
    <div className="container max-w-none mx-auto px-4 py-8">
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
          <div className="bg-white w-full rounded-lg shadow p-6 mb-8">
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
              <div className="relative mb-4 md:mb-0 md:w-4/5">
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
                <button
                  className="p-2 rounded-md text-gray-600 hover:bg-gray-100 transition-colors duration-200"
                  onClick={loadEmails}
                  disabled={loading}
                  title="E-Mails aktualisieren"
                >
                  <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
                <div className="flex items-center">
                  <label htmlFor="to-filter" className="mr-2 text-gray-600">Empfänger:</label>
                  <select
                    id="to-filter"
                    className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    value={filterToRecipient}
                    onChange={(e) => setFilterToRecipient(e.target.value)}
                  >
                    {inboxFilterOptions.map(opt => (
                      <option key={opt} value={opt}>
                        {opt === 'alle' ? 'Alle Postfächer' : opt}
                      </option>
                    ))}
                  </select>
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
                {(
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <div className="flex flex-col">
                              <label htmlFor="status-filter" className="mr-2 text-gray-600">Status:</label>
                              <select
                                id="status-filter"
                                className="w-16 truncate border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                              >
                                {statusOptions.map((status) => (
                                  <option key={status.value} value={status.value}>
                                    {status.label}
                                  </option>
                                ))}
                              </select>
                            </div>
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
                          <div className="flex flex-col">
                            <label htmlFor="category-filter" className="mr-2 text-gray-600">Kategorie:</label>
                            <select
                              id="category-filter"
                              className="w-40 truncate border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                              value={filterCategory}
                              onChange={(e) => setFilterCategory(e.target.value)}
                            >
                              {
                                categories.map((cat) => (
                                  <option value={cat}>{cat}</option>
                                ))
                              }
                              <option value="alle">Alle E-Mails</option>
                            </select>
                          </div>
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Aktionen
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredEmails.length > 0 ? filteredEmails.map((email) => (
                        <tr 
                          key={email.id}
                          className="hover:bg-gray-50 cursor-pointer"
                        >
                          <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center">
                              {getStatusIcon(email.status, email.category === null ? undefined : email.category)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap w-60 max-w-60">
                            <div className="text-sm font-medium text-gray-900 whitespace-normal break-words"  onClick={() => handleEmailClick(email.id, email.message_id, email.to_recipients)}>{email.subject}</div>
                            {email.to_recipients && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                  <span
                                    key={`${email.id}-rcp`}
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800"
                                    title={email.to_recipients}
                                  >
                                    {email.to_recipients}
                                  </span>
                                
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{email.sender}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{email.date}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {email.all_customer_numbers && email.all_customer_numbers.length > 0 ? (
                              <div className="space-y-1">
                                <div className="flex flex-wrap">
                                  {email.all_customer_numbers.map((num, index) => (
                                    <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-1 mb-1">
                                      {num}
                                      <button
                                        onClick={() => {
                                          handleRemoveCustomerNumber(email, index);
                                        }}
                                        className="ml-1 text-blue-700 hover:text-red-600"
                                      >
                                        <XMarkIcon className="h-3 w-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>

                                <div className="relative inline-block">
                                  {openNumberEditorEmailId === email.id ? (
                                    <div className="absolute z-50 bottom-full mb-2 left-0 bg-white border border-gray-200 rounded shadow-md p-2 w-48">
                                      <input
                                        autoFocus
                                        type="text"
                                        placeholder="Neue Kundennummer"
                                        value={newCustomerNumber}
                                        onChange={(e) => setNewCustomerNumber(e.target.value)}
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleAddCustomerNumber(email, newCustomerNumber);
                                          if (e.key === 'Escape') { setOpenNumberEditorEmailId(null); setNewCustomerNumber(''); }
                                        }}
                                      />
                                      <div className="flex justify-end space-x-2">
                                        <button className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                                          onClick={() => { setOpenNumberEditorEmailId(null); setNewCustomerNumber(''); }}>
                                          Abbrechen
                                        </button>
                                        <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                                          onClick={() => handleAddCustomerNumber(email, newCustomerNumber)}>
                                          Speichern
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setOpenNumberEditorEmailId(email.id); setNewCustomerNumber(''); }}
                                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                      title="Kundennummer hinzufügen"
                                    >
                                      <PlusIcon className="mr-1 h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2 relative">
                                {email.status === EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT ? (
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

                                {openNumberEditorEmailId === email.id ? (
                                  <div className="absolute z-50 bottom-full mb-2 left-0 bg-white border border-gray-200 rounded shadow-md p-2 w-48">
                                    <input
                                      autoFocus
                                      type="text"
                                      placeholder="Neue Kundennummer"
                                      value={newCustomerNumber}
                                      onChange={(e) => setNewCustomerNumber(e.target.value)}
                                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleAddCustomerNumber(email, newCustomerNumber);
                                        if (e.key === 'Escape') { setOpenNumberEditorEmailId(null); setNewCustomerNumber(''); }
                                      }}
                                    />
                                    <div className="flex justify-end space-x-2">
                                      <button className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                                        onClick={() => { setOpenNumberEditorEmailId(null); setNewCustomerNumber(''); }}>
                                        Abbrechen
                                      </button>
                                      <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                                        onClick={() => handleAddCustomerNumber(email, newCustomerNumber)}>
                                        Speichern
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setOpenNumberEditorEmailId(email.id); setNewCustomerNumber(''); }}
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                    title="Kundennummer hinzufügen"
                                  >
                                    <PlusIcon className="mr-1 h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {email.category ? (
                              <div className="space-y-1">
                                {email.all_categories && email.all_categories.length > 0 ? (
                                  <div className="flex flex-wrap">
                                    {email.all_categories.map((category, index) => (
                                      <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-1 mb-1">
                                        <TagIcon className="mr-1 h-3 w-3" />
                                        {category}
                                        <button
                                          onClick={() => {
                                            handleRemove(email,index);
                                          }}
                                          className="ml-1 text-green-700 hover:text-red-600"
                                        >
                                          <XMarkIcon className="h-3 w-3" />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    <TagIcon className="mr-1 h-3 w-3" />
                                    {email.category}
                                  </span>
                                )}
                                <div className="relative inline-block dropdown-wrapper">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdownEmailId(prev => prev === email.id ? null : email.id);
                                    }}
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                                  >
                                    <PlusIcon className="mr-1 h-3 w-3" />
                                  </button>
                                    {openDropdownEmailId === email.id && (
                                      <div className="absolute z-50 bottom-full mb-2 left-0 bg-white border border-gray-200 rounded shadow-md max-h-60 overflow-y-auto w-auto min-w-[10rem] max-w-sm">
                                        {categories.filter((item) => !email.all_categories?.includes(item)).map((cat) => (
                                          <div
                                            key={cat}
                                            onClick={() => handleCategorySelect(email, cat)}
                                            className="cursor-pointer px-3 py-2 text-sm hover:bg-green-100 break-words"
                                          >
                                            {cat}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                </div>
                                {email.all_customer_numbers && email.all_customer_numbers.length > 0 && 
                                 email.all_categories && email.all_categories.length > 0 && ((email.all_categories.length == 1 && email.all_categories[0] == "Sonstiges")? false: true)&&(
                                  <div className="text-xs text-blue-600 mt-1">
                                    {email.all_customer_numbers.length} Weiterleitungen
                                  </div>
                                )}
                              </div>
                            ) : email.analysis_completed === false ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                Wird analysiert...
                              </span>
                            ) : (
                              <div>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                  Nicht kategorisiert
                                </span>
                                <div className="relative inline-block dropdown-wrapper">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenDropdownEmailId(prev => prev === email.id ? null : email.id);
                                      }}
                                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                                    >
                                      <PlusIcon className="mr-1 h-3 w-3" />
                                    </button>
                                      {openDropdownEmailId === email.id && (
                                        <div className="absolute z-50 bottom-full mb-2 left-0 bg-white border border-gray-200 rounded shadow-md max-h-60 overflow-y-auto w-auto min-w-[10rem] max-w-sm">
                                          {categories.filter((item) => !email.all_categories?.includes(item)).map((cat) => (
                                            <div
                                              key={cat}
                                              onClick={() => handleCategorySelect(email, cat)}
                                              className="cursor-pointer px-3 py-2 text-sm hover:bg-green-100 break-words"
                                            >
                                              {cat}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                  </div>
                              </div>
                            )}
                          </td>

                          {/* Aktionen */}
                          <td className="px-6 py-4 whitespace-nowrap relative" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-col items-center space-y-2">
                              {(email.customer_number && email.category != "Sonstiges" && email.category) && !(email.status === EMAIL_STATUS.WEITERGELEITET) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleForwardClick(email.id);
                                  }}
                                  className="inline-flex items-center px-3 py-1 mr-2 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                  Weiterleitung auslösen
                                </button>
                              )}

                              {email.status === EMAIL_STATUS.WEITERGELEITET && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                                  Weiterleitung gesendet
                                </span>
                              )}
                              
                              {(!email.customer_number || email.category == "Sonstiges") && !sentReplies[email.id] && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    manualSendReply(email.id);
                                  }}
                                  className="inline-flex items-center px-3 py-1 mr-2 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                  Anfrage senden
                                </button>
                              )}
                              {email.status === EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                                  Kundennummer angefragt
                                </span>
                              )}
                              {sentReplies[email.id] && email.status !== EMAIL_STATUS.KUNDENNUMMER_ANGEFRAGT && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-2">
                                  Antwort gesendet
                                </span>
                              )}

                              {/* Hide / Unhide toggle */}
                              {email.status === EMAIL_STATUS.AUSGEBLENDET ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const nextStatus = !email.customer_number
                                      ? EMAIL_STATUS.FEHLENDE_KUNDENNUMMER
                                      : (email.category ? EMAIL_STATUS.KATEGORISIERT : EMAIL_STATUS.UNKATEGORISIERT);

                                    handleStatusUpdate(email.id, nextStatus);
                                  }}
                                  className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded-md shadow-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 text-gray-700"
                                  title="E-Mail einblenden"
                                >
                                  Einblenden
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusUpdate(email.id, EMAIL_STATUS.AUSGEBLENDET);
                                  }}
                                  className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded-md shadow-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 text-gray-700"
                                  title="E-Mail ausblenden"
                                >
                                  Ausblenden
                                </button>
                              )}

                              {/* NEW: Manuelle Weiterleitung */}
                              <div className="relative inline-block manual-forward-wrapper">
                                
                                {openManualForwardEmailId === email.id ? (
                                  <div className="absolute z-50 bottom-full mb-2 right-0 bg-white border border-gray-200 rounded shadow-md p-3 w-64">
                                    <label className="block text-xs text-gray-600 mb-1">Empfänger</label>

                                    {/* Input + natives Dropdown per datalist */}
                                    <input
                                      autoFocus
                                      type="email"
                                      placeholder="name@example.com"
                                      value={manualForwardRecipient}
                                      onChange={(e) => setManualForwardRecipient(e.target.value)}
                                      list={`forward-suggestions-${email.id}`}
                                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary"
                                      onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                          await manualForwardEmails(email.id, manualForwardRecipient);
                                        }
                                        if (e.key === 'Escape') {
                                          setOpenManualForwardEmailId(null);
                                          setManualForwardRecipient('');
                                        }
                                      }}
                                    />

                                    <datalist id={`forward-suggestions-${email.id}`}> 
                                      {forwardSuggestions.map((s) => (
                                        <option key={s} value={s} />
                                      ))}
                                    </datalist>

                                    <div className="flex justify-end space-x-2">
                                      <button
                                        className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                                        onClick={() => { setOpenManualForwardEmailId(null); setManualForwardRecipient(''); }}
                                      >
                                        Abbrechen
                                      </button>
                                      <button
                                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                                        onClick={async () => {
                                          await manualForwardEmails(email.id, manualForwardRecipient);
                                        }}
                                      >
                                        Senden
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  /* Button bleibt wie bei dir */
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenManualForwardEmailId(email.id);
                                      setManualForwardRecipient('');
                                    }}
                                    className="inline-flex items-center px-3 py-1 mr-2 border border-gray-300 text-xs font-medium rounded-md shadow-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 text-gray-700"
                                    title="Manuelle Weiterleitung"
                                  >
                                    Manuelle Weiterleitung
                                  </button>
                                )}

                              </div>
                            </div>
                          </td>
                        </tr>
                      ))
                      : (
                        <div className="text-center py-10">
                          <p className="text-gray-500">Keine E-Mails gefunden</p>
                        </div>
                      )}
                    </tbody>
                  </table>
                ) }
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
          to_recipient={(selectedEmail.to_recipients)? selectedEmail.to_recipients: ""}
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
          defaultTemplate={emailToEdit.customer_number? settings.defaultUnrecognizableReplyTemplate : settings.defaultReplyTemplate }
          from_email = {(emailToEdit && emailToEdit.to_recipients) ? emailToEdit.to_recipients : ""}
        />
      )}
    </div>
  );
};

export default Emails;
