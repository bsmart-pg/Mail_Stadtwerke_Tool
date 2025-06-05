import { PublicClientApplication, Configuration, AuthenticationResult, AccountInfo, InteractionType, PopupRequest, RedirectRequest } from '@azure/msal-browser';

// Client-ID aus Umgebungsvariablen auslesen oder Hinweis anzeigen
const clientId = import.meta.env.VITE_MSAL_CLIENT_ID || '';
const tenantId = import.meta.env.VITE_MSAL_TENANT_ID || 'common';

// Überprüfen, ob die Client-ID gesetzt ist
if (!clientId) {
  console.warn('MSAL_CLIENT_ID ist nicht konfiguriert. Bitte setzen Sie die Umgebungsvariable VITE_MSAL_CLIENT_ID in der .env.local-Datei.');
}

// MSAL-Konfiguration
const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage", // Cache-Speicherort für Token
    storeAuthStateInCookie: true, // Für bessere Browser-Kompatibilität
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return;
        }
        switch (level) {
          case 0: // Error
            console.error('MSAL: ' + message);
            break;
          case 1: // Warning
            console.warn('MSAL: ' + message);
            break;
          case 2: // Info
            console.info('MSAL: ' + message);
            break;
          default:
            console.debug('MSAL: ' + message);
            break;
        }
      },
      piiLoggingEnabled: false
    }
  }
};

// Scopes für die Berechtigungen, die wir benötigen
const scopes = {
  mail: [
    "Mail.Read",           // E-Mails lesen
    "Mail.ReadWrite",      // E-Mails lesen und schreiben
    "Mail.Send",           // E-Mails senden (für Weiterleitungen)
    "User.Read",           // Benutzerinformationen lesen
    "Files.Read.All",      // Dateien/Anhänge lesen (für Bildanalyse)
    "Mail.ReadBasic",      // Basis-E-Mail-Informationen
    "offline_access"       // Für Refresh-Token (längere Sitzungen)
  ],
};

// MSAL Client-Anwendung
const msalInstance = new PublicClientApplication(msalConfig);

// Cache initialisieren und mögliche bestehende Anmeldungen erkennen
const initializeMsal = async () => {
  try {
    await msalInstance.initialize();
    
    // Prüfen, ob ein Benutzer bereits angemeldet ist
    const accounts = msalInstance.getAllAccounts();
    
    if (accounts.length > 0) {
      msalInstance.setActiveAccount(accounts[0]);
      console.info('MSAL: Bestehender Account gefunden und aktiviert');
    } else {
      console.info('MSAL: Kein bestehender Account gefunden');
    }
    
    return true;
  } catch (error) {
    console.error('Fehler bei der Initialisierung von MSAL:', error);
    return false;
  }
};

// Sofort initialisieren
initializeMsal();

/**
 * Microsoft Graph API Authentifizierungs-Service
 */
export const MsalService = {
  /**
   * Anmeldung mit Popup-Fenster
   */
  loginPopup: async (): Promise<AuthenticationResult | null> => {
    // Überprüfen, ob die Client-ID konfiguriert ist
    if (!clientId) {
      console.error('MSAL Client-ID ist nicht konfiguriert. Anmeldung nicht möglich.');
      // Einen angepassten Fehler für die Benutzeroberfläche zurückgeben
      throw new Error('Microsoft-Anmeldung nicht konfiguriert. Bitte kontaktieren Sie den Administrator.');
    }
    
    try {
      // Cache leeren, um Authentifizierungsprobleme zu vermeiden
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        // Bestehende Accounts entfernen
        await msalInstance.logout();
        console.info('MSAL: Bestehende Accounts entfernt für Neuanmeldung');
      }
      
      // Erneut initialisieren
      await initializeMsal();
      
      const loginRequest: PopupRequest = {
        scopes: scopes.mail,
        prompt: "select_account"
      };
      
      console.info('MSAL: Starte Popup-Anmeldung');
      const response = await msalInstance.loginPopup(loginRequest);
      
      if (response?.account) {
        msalInstance.setActiveAccount(response.account);
        console.info('MSAL: Anmeldung erfolgreich, Account aktiviert');
      }
      
      return response;
    } catch (error) {
      console.error("Fehler bei der Anmeldung mit Popup:", error);
      throw error; // Fehler weitergeben, damit er in der UI behandelt werden kann
    }
  },

  /**
   * Anmeldung mit Redirect (Weiterleitung)
   */
  loginRedirect: async (): Promise<void> => {
    try {
      // Cache leeren, um Authentifizierungsprobleme zu vermeiden
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        // Bestehende Accounts entfernen
        await msalInstance.logout();
      }
      
      const loginRequest: RedirectRequest = {
        scopes: scopes.mail,
        prompt: "select_account"
      };
      await msalInstance.loginRedirect(loginRequest);
    } catch (error) {
      console.error("Fehler bei der Anmeldung mit Redirect:", error);
      throw error;
    }
  },

  /**
   * Abmeldung
   */
  logout: async (): Promise<void> => {
    try {
      await msalInstance.logout();
      console.info('MSAL: Abmeldung erfolgreich');
    } catch (error) {
      console.error("Fehler bei der Abmeldung:", error);
      throw error;
    }
  },

  /**
   * Abrufen eines Access Tokens für die Microsoft Graph API
   */
  getAccessToken: async (): Promise<string | null> => {
    try {
      const account = msalInstance.getActiveAccount();
      if (!account) {
        console.error("Kein aktiver Account vorhanden");
        
        // Versuchen, einen Account zu aktivieren, falls einer verfügbar ist
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
          msalInstance.setActiveAccount(accounts[0]);
          console.info('MSAL: Account aktiviert');
          
          // Erneut versuchen, ein Token zu erhalten
          return MsalService.getAccessToken();
        }
        
        return null;
      }

      const silentRequest = {
        scopes: scopes.mail,
        account: account,
        forceRefresh: false
      };

      try {
        const response = await msalInstance.acquireTokenSilent(silentRequest);
        return response.accessToken;
      } catch (silentError) {
        console.warn("Silent Token-Abruf fehlgeschlagen, versuche Popup:", silentError);
        
        // Bei Fehler versuchen, mit Popup einen neuen Token zu erhalten
        const response = await msalInstance.acquireTokenPopup({
          ...silentRequest
        });
        
        return response.accessToken;
      }
    } catch (error) {
      console.error("Fehler beim Abrufen des Access Tokens:", error);
      return null;
    }
  },

  /**
   * Prüft, ob ein Benutzer angemeldet ist
   */
  isLoggedIn: (): boolean => {
    try {
      const accounts = msalInstance.getAllAccounts();
      const isLoggedIn = accounts.length > 0;
      
      // Wenn angemeldet, stelle sicher, dass ein aktiver Account gesetzt ist
      if (isLoggedIn && !msalInstance.getActiveAccount() && accounts.length > 0) {
        msalInstance.setActiveAccount(accounts[0]);
      }
      
      return isLoggedIn;
    } catch (error) {
      console.error('Fehler beim Überprüfen des Anmeldestatus:', error);
      return false;
    }
  },

  /**
   * Gibt den aktiven Benutzer zurück
   */
  getActiveAccount: (): AccountInfo | null => {
    const account = msalInstance.getActiveAccount();
    
    // Wenn kein aktiver Account, aber Accounts vorhanden sind
    if (!account) {
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        msalInstance.setActiveAccount(accounts[0]);
        return accounts[0];
      }
    }
    
    return account;
  },

  /**
   * Verarbeitet die Antwort von der Redirect-Anmeldung
   */
  handleRedirectResponse: async (): Promise<AuthenticationResult | null> => {
    try {
      return await msalInstance.handleRedirectPromise();
    } catch (error) {
      console.error("Fehler bei der Verarbeitung der Redirect-Antwort:", error);
      return null;
    }
  },
  
  /**
   * Hilfsfunktion zum Zurücksetzen des MSAL-Status
   */
  resetMsalState: async (): Promise<void> => {
    try {
      // Cache leeren
      localStorage.removeItem(`msal.${clientId}.idtoken`);
      localStorage.removeItem(`msal.${clientId}.accesstoken`);
      localStorage.removeItem(`msal.${clientId}.refreshtoken`);
      localStorage.removeItem(`msal.${clientId}.token.keys`);
      
      // Erneut initialisieren
      await initializeMsal();
      
      console.info('MSAL: Status zurückgesetzt');
    } catch (error) {
      console.error('Fehler beim Zurücksetzen des MSAL-Status:', error);
    }
  }
};

export default MsalService; 