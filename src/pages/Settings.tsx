import React, { useState, useEffect } from 'react';
import { Cog6ToothIcon, EnvelopeIcon, InformationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import MsalService from '../services/MsalService';
import GraphService from '../services/GraphService';
import { saveMultipleSettings, getSettings } from '../services/SupabaseService';

const Settings: React.FC = () => {
  const [settings, setSettings] = useState({
    email: 'stadtwerke@example.com',
    emailForward: 'test@test.de',
    refreshInterval: '5',
    customerNumberRequired: true,
    defaultCategory: 'unkategorisiert',
    autoReply: true,
    defaultReplyTemplate: 'Sehr geehrte(r) Frau/Herr,\n\nVielen Dank für Ihre Nachricht. Für eine schnellere Bearbeitung Ihres Anliegens benötigen wir Ihre Kundennummer.\n\nBitte teilen Sie uns diese mit, indem Sie auf diese E-Mail antworten.\n\nMit freundlichen Grüßen\nIhr Stadtwerke-Team',
    defaultUnrecognizableReplyTemplate: "Leider konnte das anliegen nciht automatisch zugeordnet werden."
  });

  const [outlookStatus, setOutlookStatus] = useState({
    connected: false,
    userName: '',
    userEmail: '',
    loading: false,
    error: ''
  });

  const [formChanged, setFormChanged] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Einstellungen beim Laden der Komponente abrufen
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedSettings = await getSettings();
        const settingsObject: { [key: string]: any } = {};
        
        storedSettings.forEach(setting => {
          if (setting.setting_key === 'customerNumberRequired') {
            settingsObject[setting.setting_key] = setting.setting_value === 'true';
          } else {
            settingsObject[setting.setting_key] = setting.setting_value;
          }
        });

        setSettings(prev => ({
          ...prev,
          ...settingsObject
        }));
      } catch (error) {
        console.error('Fehler beim Laden der Einstellungen:', error);
      }
    };

    loadSettings();
  }, []);

  const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
    setFormChanged(true);
    setSaveSuccess(false);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Konvertiere die Einstellungen in das richtige Format
      const settingsToSave: { [key: string]: string } = {
        email: settings.email,
        emailForward: settings.emailForward,
        refreshInterval: settings.refreshInterval.toString(),
        customerNumberRequired: settings.customerNumberRequired.toString(),
        defaultCategory: settings.defaultCategory,
        autoReply: settings.autoReply.toString(),
        defaultReplyTemplate: settings.defaultReplyTemplate,
        defaultUnrecognizableReplyTemplate: settings.defaultUnrecognizableReplyTemplate
      };

      await saveMultipleSettings(settingsToSave);
      setFormChanged(false);
      setSaveSuccess(true);

      // Zeige die Erfolgsmeldung für 3 Sekunden an
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Fehler beim Speichern der Einstellungen:', error);
      let errorMessage = 'Ein unbekannter Fehler ist aufgetreten.';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        // Supabase-spezifische Fehlermeldungen
        const supabaseError = error as { message?: string, details?: string };
        errorMessage = supabaseError.message || supabaseError.details || 'Datenbankfehler';
      }
      
      alert('Fehler beim Speichern der Einstellungen: ' + errorMessage);
    }
  };

  // Beim Laden der Komponente prüfen, ob ein Benutzer bereits angemeldet ist
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        // MSAL-Redirect-Antwort verarbeiten, falls vorhanden
        await MsalService.handleRedirectResponse();
        
        // Prüfen, ob ein Benutzer angemeldet ist
        if (MsalService.isLoggedIn()) {
          setOutlookStatus(prev => ({
            ...prev,
            connected: true,
            loading: true
          }));
          
          // Benutzerinformationen abrufen
          const userInfo = await GraphService.getUserInfo();
          
          setOutlookStatus(prev => ({
            ...prev,
            userName: userInfo.displayName || '',
            userEmail: userInfo.mail || userInfo.userPrincipalName || '',
            loading: false
          }));
        }
      } catch (error) {
        console.error('Fehler beim Prüfen des Authentifizierungsstatus:', error);
        setOutlookStatus(prev => ({
          ...prev,
          error: 'Fehler bei der Authentifizierung',
          loading: false
        }));
      }
    };
    
    checkAuthStatus();
  }, []);

  const connectOutlook = async () => {
    try {
      setOutlookStatus(prev => ({ ...prev, loading: true, error: '' }));
      
      // MSAL-Status zurücksetzen, falls es Probleme gab
      await MsalService.resetMsalState();
      
      // Microsoft-Anmeldung mit Popup starten
      await MsalService.loginPopup();
      
      // Prüfen, ob Anmeldung erfolgreich war
      if (MsalService.isLoggedIn()) {
        // Benutzerinformationen abrufen
        const userInfo = await GraphService.getUserInfo();
        
        setOutlookStatus({
          connected: true,
          userName: userInfo.displayName || '',
          userEmail: userInfo.mail || userInfo.userPrincipalName || '',
          loading: false,
          error: ''
        });
      } else {
        setOutlookStatus(prev => ({
          ...prev,
          loading: false,
          error: 'Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.'
        }));
      }
    } catch (error) {
      console.error('Fehler bei der Outlook-Verbindung:', error);
      
      // Angepasste Fehlermeldung basierend auf dem Fehlertyp
      let errorMessage = 'Fehler bei der Verbindung mit Outlook.';
      
      if (error instanceof Error) {
        if (error.message.includes('nicht konfiguriert')) {
          errorMessage = 'Microsoft-Anmeldung ist nicht konfiguriert. Bitte überprüfen Sie die .env.local-Datei.';
        } else if (error.message.includes('Authentication')) {
          errorMessage = 'Authentifizierungsfehler. Bitte versuchen Sie es erneut.';
        } else if (error.message.includes('interaction_in_progress')) {
          errorMessage = 'Es läuft bereits ein Anmeldeversuch. Bitte schließen Sie alle Popup-Fenster und versuchen Sie es erneut.';
        }
      }
      
      setOutlookStatus(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
    }
  };
  
  const disconnectOutlook = async () => {
    try {
      await MsalService.logout();
      setOutlookStatus({
        connected: false,
        userName: '',
        userEmail: '',
        loading: false,
        error: ''
      });
    } catch (error) {
      console.error('Fehler bei der Abmeldung:', error);
      setOutlookStatus(prev => ({
        ...prev,
        error: 'Fehler bei der Abmeldung'
      }));
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Einstellungen</h1>
      
      <form onSubmit={handleSaveSettings}>
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center mb-6">
            <Cog6ToothIcon className="w-6 h-6 text-primary mr-2" />
            <h2 className="text-xl font-semibold">Allgemeine Einstellungen</h2>
          </div>
          
          <div className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                E-Mail Adresse für Antworten
              </label>
              <input
                type="email"
                id="email"
                name="email"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={settings.email}
                onChange={handleSettingsChange}
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                E-Mail Adresse zur Weiterleitung
              </label>
              <input
                type="email"
                id="emailForward"
                name="emailForward"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={settings.emailForward}
                onChange={handleSettingsChange}
              />
            </div>
            
            <div>
              <label htmlFor="refreshInterval" className="block text-sm font-medium text-gray-700 mb-2">
                Aktualisierungsintervall (Minuten)
              </label>
              <input
                type="number"
                id="refreshInterval"
                name="refreshInterval"
                min="1"
                max="60"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={settings.refreshInterval}
                onChange={handleSettingsChange}
              />
            </div>
            
            <div>
              <label htmlFor="defaultCategory" className="block text-sm font-medium text-gray-700 mb-2">
                Standard-Kategorie für nicht kategorisierbare E-Mails
              </label>
              <select
                id="defaultCategory"
                name="defaultCategory"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={settings.defaultCategory}
                onChange={handleSettingsChange}
              >
                <option value="unkategorisiert">Unkategorisiert</option>
                <option value="Sonstiges">Sonstiges</option>
                <option value="Zu prüfen">Zu prüfen</option>
              </select>
            </div>
            
            <div className="flex items-center h-full">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="customerNumberRequired"
                  name="customerNumberRequired"
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                  checked={settings.customerNumberRequired}
                  onChange={handleSettingsChange}
                />
                <label htmlFor="customerNumberRequired" className="ml-2 block text-sm text-gray-700">
                  Kundennummer zwingend erforderlich
                </label>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center mb-6">
            <EnvelopeIcon className="w-6 h-6 text-primary mr-2" />
            <h2 className="text-xl font-semibold">Outlook-Verbindung</h2>
          </div>
          
          {outlookStatus.error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <InformationCircleIcon className="h-5 w-5 text-red-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Fehler</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{outlookStatus.error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {outlookStatus.connected ? (
            <div className="mb-6">
              <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6">
                <div className="flex items-center">
                  <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-green-700 font-medium">Verbunden mit Outlook</span>
                </div>
                <div className="mt-2 ml-7">
                  <p className="text-sm text-green-700">
                    Angemeldet als: <span className="font-medium">{outlookStatus.userName}</span>
                  </p>
                  <p className="text-sm text-green-700">
                    E-Mail: <span className="font-medium">{outlookStatus.userEmail}</span>
                  </p>
                </div>
              </div>
              
              <button
                type="button"
                className="px-4 py-2 border border-red-300 text-red-600 rounded-md hover:bg-red-50"
                onClick={disconnectOutlook}
                disabled={outlookStatus.loading}
              >
                Verbindung trennen
              </button>
            </div>
          ) : (
            <div className="flex items-center mb-6">
              <button
                type="button"
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-blue-600"
                onClick={connectOutlook}
                disabled={outlookStatus.loading}
              >
                {outlookStatus.loading ? 'Verbinde...' : 'Mit Outlook verbinden'}
              </button>
              <span className="ml-3 text-sm text-gray-500">
                Klicken Sie hier, um sich bei Ihrem Microsoft-Konto anzumelden
              </span>
            </div>
          )}
          
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <InformationCircleIcon className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Information</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>
                    Um die Integration mit Microsoft Outlook zu nutzen, wird eine Microsoft 365-Anmeldung benötigt.
                    Bei der Anmeldung werden Sie aufgefordert, die erforderlichen Berechtigungen zu erteilen.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center mb-6">
            <EnvelopeIcon className="w-6 h-6 text-primary mr-2" />
            <h2 className="text-xl font-semibold">Automatische Antworten</h2>
          </div>
          
          <div className="mb-6">
            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="autoReply"
                name="autoReply"
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                checked={settings.autoReply}
                onChange={handleSettingsChange}
              />
              <label htmlFor="autoReply" className="ml-2 block text-sm text-gray-700">
                Anfrage-Funktion bei fehlender Kundennummer aktivieren
              </label>
            </div>
            
            <label htmlFor="defaultReplyTemplate" className="block text-sm font-medium text-gray-700 mb-2">
              Standardvorlage für Kundennummer-Anfragen
            </label>
            <textarea
              id="defaultReplyTemplate"
              name="defaultReplyTemplate"
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              value={settings.defaultReplyTemplate}
              onChange={handleSettingsChange}
              disabled={!settings.autoReply}
            />

            <label htmlFor="defaultUnrecognizableReplyTemplate" className="block text-sm font-medium text-gray-700 mb-2">
              Standardvorlage für nicht kategorisierbare Emails
            </label>
            <textarea
              id="defaultUnrecognizableReplyTemplate"
              name="defaultUnrecognizableReplyTemplate"
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              value={settings.defaultUnrecognizableReplyTemplate}
              onChange={handleSettingsChange}
              disabled={!settings.autoReply}
            />
          </div>
        </div>
        
        <div className="flex justify-end items-center space-x-4">
          {saveSuccess && (
            <div className="flex items-center text-green-600">
              <CheckCircleIcon className="w-5 h-5 mr-2" />
              <span>Einstellungen erfolgreich gespeichert</span>
            </div>
          )}
          <button
            type="submit"
            className="px-6 py-3 bg-primary text-white rounded-md hover:bg-blue-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!formChanged}
          >
            Einstellungen speichern
          </button>
        </div>
      </form>
    </div>
  );
};

export default Settings; 