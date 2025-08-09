import { createClient } from '@supabase/supabase-js';
import { IncomingEmail, AutoReply, Setting, RequestStatus, Category, Flow} from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL und Anon Key müssen in den Umgebungsvariablen definiert sein.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  },
  global: {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`
    }
  }
});

console.log(supabase)

// Prüfen, ob eine E-Mail bereits existiert
export const checkExistingEmail = async (messageId: string): Promise<IncomingEmail | null> => {
  try {
    console.log('Suche nach E-Mail mit Message-ID:', messageId);
    
    // Entferne mögliche URL-Kodierung und kodiere neu
    const decodedMessageId = decodeURIComponent(messageId);
    const encodedMessageId = encodeURIComponent(decodedMessageId);
    
    const { data, error } = await supabase
      .from('incoming_emails')
      .select()
      .eq('message_id', encodedMessageId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // PGRST116 ist der "not found" Fehler
        console.log('Keine existierende E-Mail gefunden');
        return null;
      }
      console.error('Supabase Fehler:', error);
      throw error;
    }

    console.log('Existierende E-Mail gefunden:', data);
    return data;
  } catch (error) {
    console.error('Fehler beim Prüfen auf existierende E-Mail:', error);
    throw error;
  }
};

// E-Mail speichern oder aktualisieren
export const saveEmailData = async (email: Partial<IncomingEmail>): Promise<IncomingEmail | null> => {
  try {
    // Prüfe, ob die E-Mail bereits existiert
    const existingEmail = await getEmailByMessageId(email.message_id || '');
    
    // Erstelle ein bereinigtes E-Mail-Objekt ohne die problematischen Felder
    const cleanedEmail = {
      id: email.id,
      message_id: email.message_id,
      sender_email: email.sender_email,
      sender_name: email.sender_name,
      subject: email.subject,
      content: email.content,
      received_date: email.received_date,
      customer_number: email.customer_number,
      category: email.category,
      status: email.status,
      created_at: email.created_at,
      updated_at: email.updated_at,
      forwarded: email.forwarded
    };
    
    if (existingEmail) {
      // Aktualisiere die existierende E-Mail
      const { data, error } = await supabase
        .from('incoming_emails')
        .update(cleanedEmail)
        .eq('id', existingEmail.id)
        .select()
        .single();

      if (error) {
        console.error('Fehler beim Aktualisieren der E-Mail:', error);
        return null;
      }

      return data;
    } else {
      // Erstelle eine neue E-Mail
      const { data, error } = await supabase
        .from('incoming_emails')
        .insert([{
          ...cleanedEmail,
          created_at: new Date(),
          updated_at: new Date(),
          forwarded: false // Setze den Standardwert für neue E-Mails
        }])
        .select()
        .single();

      if (error) {
        console.error('Fehler beim Speichern der E-Mail:', error);
        return null;
      }

      return data;
    }
  } catch (error) {
    console.error('Fehler beim Speichern/Aktualisieren der E-Mail:', error);
    return null;
  }
};

export const updateEmailStatus = async (emailId: string, status: IncomingEmail['status']): Promise<void> => {
  const { error } = await supabase
    .from('incoming_emails')
    .update({ status, updated_at: new Date() })
    .eq('id', emailId);

  if (error) throw error;
};

// Einstellungen-Funktionen
export const saveSettings = async (key: string, value: string): Promise<Setting | null> => {
  const { data, error } = await supabase
    .from('settings')
    .upsert([{ setting_key: key, setting_value: value }])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const saveCategories = async (name: string, description: string): Promise<Category | null> => {
  const { data, error } = await supabase
    .from('categories')
    .upsert([{ category_name: name, category_description: description}])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteCategories = async (name: string, description: string): Promise<Category | null> => {
  const id = await supabase
    .from('categories')
    .select("id")
    .eq("category_name", name)
    .eq("category_description", description)

  const { data, error } = await supabase
    .from('categories').
    delete().eq("id", id.data?.pop()?.id)

  if (error) throw error;
  return data;
};

export const getCategories = async (): Promise<Category[]> => {
  const { data, error } = await supabase
    .from('categories')
    .select('*');

  if (error) throw error;
  return data || [];
};


export const saveFlows = async (name: string, description: string[]): Promise<Flow | null> => {
  const { data, error } = await supabase
    .from('flows')
    .upsert([{ category_name: name, extraction_columns: description}])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteFlows = async (name: string, description: string[]): Promise<Flow | null> => {
  console.log(description)
  const id = await supabase
    .from('flows')
    .select("id")
    .eq("category_name", name)
    .contains('extraction_columns', description)

  const { data, error } = await supabase
    .from('flows').
    delete().eq("id", id.data?.pop()?.id)

  if (error) throw error;
  return data;
};

export const getFlows = async (): Promise<Flow[]> => {
  const { data, error } = await supabase
    .from('flows')
    .select('*');

  if (error) throw error;
  return data || [];
};

export const getExistingFlowCategories = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('flows')
    .select('*');

  if (error) throw error;
  return data.map((elem) => {return elem.category_name}) || [];
};

export const getSettings = async (): Promise<Setting[]> => {
  const { data, error } = await supabase
    .from('settings')
    .select('*');

  if (error) throw error;
  return data || [];
};


// Mehrere Einstellungen auf einmal speichern
export const saveMultipleCategories = async (categories: { [key: string]: string }): Promise<void> => {
  try {
    // Hole zuerst die existierenden Einstellungen
    const { data: existingCategories, error: fetchError } = await supabase
      .from('categories')
      .select('*');

    if (fetchError) throw fetchError;

    // Erstelle ein Map der existierenden Einstellungen
    const existingCategoriesMap = new Map(
      existingCategories?.map(category => [category.category_name, category]) || []
    );

    // Bereite die Einstellungen für das Upsert vor
    const categoriesArray = Object.entries(categories).map(([name, value]) => {
      const existingCategory = existingCategoriesMap.get(name);
      return {
        id: existingCategory?.id || undefined, // Verwende die existierende ID wenn vorhanden
        category_name: name,
        category_description: value,
        updated_at: new Date().toISOString()
      };
    });

    const { error } = await supabase
      .from('categories')
      .upsert(categoriesArray, {
        onConflict: 'category_name'
      });

    if (error) throw error;
  } catch (error) {
    console.error('Fehler beim Speichern der Einstellungen:', error);
    throw error;
  }
};

// Mehrere Einstellungen auf einmal speichern
export const saveMultipleSettings = async (settings: { [key: string]: string }): Promise<void> => {
  try {
    // Hole zuerst die existierenden Einstellungen
    const { data: existingSettings, error: fetchError } = await supabase
      .from('settings')
      .select('*');

    if (fetchError) throw fetchError;

    // Erstelle ein Map der existierenden Einstellungen
    const existingSettingsMap = new Map(
      existingSettings?.map(setting => [setting.setting_key, setting]) || []
    );

    // Bereite die Einstellungen für das Upsert vor
    const settingsArray = Object.entries(settings).map(([key, value]) => {
      const existingSetting = existingSettingsMap.get(key);
      return {
        id: existingSetting?.id || undefined, // Verwende die existierende ID wenn vorhanden
        setting_key: key,
        setting_value: value,
        updated_at: new Date().toISOString()
      };
    });

    const { error } = await supabase
      .from('settings')
      .upsert(settingsArray, {
        onConflict: 'setting_key'
      });

    if (error) throw error;
  } catch (error) {
    console.error('Fehler beim Speichern der Einstellungen:', error);
    throw error;
  }
};

// Anfragen-Status aktualisieren
export const updateForwardingStatus = async (emailId: string, status: string): Promise<RequestStatus | null> => {
  try {
    // Aktualisiere zuerst den Status in der incoming_emails Tabelle
    const { error: emailUpdateError } = await supabase
      .from('incoming_emails')
      .update({ status: status, updated_at: new Date() })
      .eq('id', emailId);

    if (emailUpdateError) throw emailUpdateError;

    // Prüfe dann, ob bereits ein Status existiert
    const { data: existingStatus, error: checkError } = await supabase
      .from('forwarding_status')
      .select()
      .eq('email_id', emailId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') throw checkError;

    if (existingStatus) {
      // Aktualisiere den bestehenden Status
      const { data, error } = await supabase
        .from('forwarding_status')
        .update({
          status: status,
          updated_at: new Date()
        })
        .eq('email_id', emailId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Erstelle einen neuen Status-Eintrag
      const { data, error } = await supabase
        .from('forwarding_status')
        .insert([{
          email_id: emailId,
          status: status,
          requested_at: new Date(),
          updated_at: new Date()
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Weiterleitungs-Status:', error);
    throw error;
  }
};


// Anfragen-Status aktualisieren
export const updateRequestStatus = async (emailId: string, status: string): Promise<RequestStatus | null> => {
  try {
    // Aktualisiere zuerst den Status in der incoming_emails Tabelle
    const { error: emailUpdateError } = await supabase
      .from('incoming_emails')
      .update({ status: status, updated_at: new Date() })
      .eq('id', emailId);

    if (emailUpdateError) throw emailUpdateError;

    // Prüfe dann, ob bereits ein Status existiert
    const { data: existingStatus, error: checkError } = await supabase
      .from('request_status')
      .select()
      .eq('email_id', emailId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') throw checkError;

    if (existingStatus) {
      // Aktualisiere den bestehenden Status
      const { data, error } = await supabase
        .from('request_status')
        .update({
          status: status,
          updated_at: new Date()
        })
        .eq('email_id', emailId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Erstelle einen neuen Status-Eintrag
      const { data, error } = await supabase
        .from('request_status')
        .insert([{
          email_id: emailId,
          status: status,
          requested_at: new Date(),
          updated_at: new Date()
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Anfrage-Status:', error);
    throw error;
  }
};


// Anfragen-Status aktualisieren
export const deleteRequestStatus = async (emailId: string) => {
  try {
    // Aktualisiere zuerst den Status in der incoming_emails Tabelle
    const response = await supabase
      .from('request_status')
      .delete()
      .eq('email_id', emailId);

  } catch (error) {
    console.error('Fehler beim Löschen des Anfrage-Status von Mail ' + emailId + ":", error);
    throw error;
  }
};


// Anfragen-Status aktualisieren
export const deleteForwardingStatus = async (emailId: string) => {
  try {
    // Aktualisiere zuerst den Status in der incoming_emails Tabelle
    const response = await supabase
      .from('forwarding_status')
      .delete()
      .eq('email_id', emailId);

  } catch (error) {
    console.error('Fehler beim Löschen des Weiterleitungs-Status von Mail ' + emailId + ":", error);
    throw error;
  }
};


// Anfragen-Status aktualisieren
export const deleteEmail = async (emailId: string) => {
  try {
    // Aktualisiere zuerst den Status in der incoming_emails Tabelle
    const response = await supabase
      .from('incoming_emails')
      .delete()
      .eq('id', emailId);

  } catch (error) {
    console.error('Fehler beim Löschen von Mail ' + emailId + ":", error);
    throw error;
  }
};

// Auto-Reply-Funktionen
export const saveAutoReply = async (autoReplyData: Partial<AutoReply>): Promise<AutoReply | null> => {
  const { data, error } = await supabase
    .from('auto_replies')
    .upsert([autoReplyData])
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Daten laden
export const getStoredData = async () => {
  const { data: emails, error: emailsError } = await supabase
    .from('incoming_emails')
    .select('*')
    .order('received_date', { ascending: false });

  const { data: settings, error: settingsError } = await supabase
    .from('settings')
    .select('*');

  const { data: requestStatus, error: statusError } = await supabase
    .from('request_status')
    .select('*');

  if (emailsError) throw emailsError;
  if (settingsError) throw settingsError;
  if (statusError) throw statusError;

  return {
    emails,
    settings,
    requestStatus
  };
};


// Daten laden
export const getEmailsByCategory = async (category: string, from_date: string, to_date: string) => {
  try {
    const startTimestamp = new Date(Date.parse(from_date)).toISOString()
    const endTimestamp = new Date(Date.parse(to_date)).toISOString()

    console.log("startTimestamp")
    console.log(startTimestamp)
    console.log("endTimestamp")
    console.log(endTimestamp)
    const { data, error } = await supabase
      .from('incoming_emails')
      .select('*')
      .eq('category', category)
      .lte("received_date", to_date)
      .gte("received_date", from_date)

    if (error) {
      console.error('Supabase Fehler:', error);
      throw error;
    }

    console.log('Geladene E-Mails:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('Fehler beim Abrufen der E-Mails mit Status:', error);
    return [];
  }
};

// Lade E-Mails mit Status
export const getEmailsWithStatus = async () => {
  try {
    const { data, error } = await supabase
      .from('incoming_emails')
      .select('*')
      .returns<IncomingEmail[]>();

    if (error) {
      console.error('Supabase Fehler:', error);
      throw error;
    }

    console.log('Geladene E-Mails:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('Fehler beim Abrufen der E-Mails mit Status:', error);
    return [];
  }
};

export const getEmailByMessageId = async (messageId: string): Promise<IncomingEmail | null> => {
  try {
    console.log('Suche nach E-Mail mit Message-ID:', messageId);
    
    // Entferne mögliche URL-Kodierung aus der message_id
    const decodedMessageId = decodeURIComponent(messageId);
    
    const { data, error } = await supabase
      .from('incoming_emails')
      .select('*')
      .eq('message_id', decodedMessageId)
      .single();

    if (error) {
      console.error('Fehler beim Suchen der E-Mail:', error);
      return null;
    }

    if (!data) {
      console.log('Keine existierende E-Mail gefunden');
      return null;
    }

    return data;
  } catch (error) {
    console.error('Fehler beim Suchen der E-Mail:', error);
    return null;
  }
};

export const updateEmailAnalysis = async (messageId: string, analysis: { customerNumber?: string | undefined; category?: string | undefined }) => {
  try {
    console.log('Aktualisiere E-Mail-Analyse:', { messageId, analysis });
    
    const { data, error } = await supabase
      .from('incoming_emails')
      .update({
        customer_number: analysis.customerNumber ?? null,
        category: analysis.category ?? null,
        updated_at: new Date().toISOString()
      })
      .eq('message_id', messageId);

    if (error) {
      console.error('Supabase Update Fehler:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Analyse:', error);
    throw error;
  }
};

export const getEmailById = async (emailId: string): Promise<IncomingEmail | null> => {
  try {
    const { data, error } = await supabase
      .from('incoming_emails')
      .select('*')
      .eq('id', emailId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Keine Zeile gefunden
        return null;
      }
      console.error('Supabase Fehler beim Abrufen der E-Mail:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Fehler beim Abrufen der E-Mail:', error);
    return null;
  }
};

export const updateEmailAnalysisResults = async (messageId: string, updates: {
  text_analysis_result?: string | null;
  image_analysis_result?: string | null;
  customer_number?: string | null;
  category?: string | null;
  all_customer_numbers?: string[] | null;
  all_categories?: string[] | null;
  status?: string;
  analysis_completed?: boolean;
  forwarded?: boolean;
  forwarding_completed?: boolean;
  extracted_information?: object
}) => {
  try {
    console.log('Aktualisiere E-Mail-Analyse-Ergebnisse:', { messageId, updates });
    
    const { data, error } = await supabase
      .from('incoming_emails')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('message_id', messageId);

    if (error) {
      console.error('Supabase Update Fehler:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Analyse-Ergebnisse:', error);
    throw error;
  }
};


export const updateEmailCategories = async (id: string, updates: {
  category?: string | null;
  all_categories?: string[] | null;
}) => {
  try {
    console.log('Aktualisiere E-Mail-Categorie:', { id, updates });
    
    const { data, error } = await supabase
      .from('incoming_emails')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('Supabase Update Fehler:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Analyse-Ergebnisse:', error);
    throw error;
  }
};

export default {
  getEmailByMessageId,
  updateEmailAnalysis,
  getEmailById,
  updateEmailAnalysisResults
}; 