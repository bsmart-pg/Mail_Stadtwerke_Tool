import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { ClientSecretCredential } from '@azure/identity';

// Umgebungsvariablen laden
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Microsoft Graph Client für Outlook-Integration
const setupGraphClient = () => {
  const credential = new ClientSecretCredential(
    process.env.TENANT_ID || '',
    process.env.CLIENT_ID || '',
    process.env.CLIENT_SECRET || ''
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default']
  });

  return Client.initWithMiddleware({
    authProvider,
  });
};

// API-Routen
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server läuft' });
});

// E-Mails abrufen (Mock-Implementierung)
app.get('/api/emails', (req, res) => {
  // In einer realen Anwendung würden hier E-Mails über die Microsoft Graph API abgerufen werden
  res.status(200).json({
    success: true,
    data: {
      emails: [
        {
          id: '1',
          subject: 'Zählerstand für Kundennummer 1234567890',
          sender: 'max.mustermann@example.com',
          date: '19.03.2024 09:32',
          customerNumber: '1234567890',
          category: 'Zählerstandmeldungen',
          status: 'categorized'
        },
        {
          id: '2',
          subject: 'Änderung meines Abschlags ab April',
          sender: 'maria.muster@example.com',
          date: '18.03.2024 14:15',
          customerNumber: '9876543210',
          category: 'Abschlagsänderung',
          status: 'categorized'
        },
        // weitere Mock-E-Mails...
      ]
    }
  });
});

// Kategorien abrufen
app.get('/api/categories', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      categories: [
        {
          id: '1',
          name: 'Zählerstandmeldungen',
          description: 'E-Mails mit Zählerstandsmeldungen von Kunden',
          keywords: ['zählerstand', 'ablesung', 'stromzähler', 'gaszähler', 'wasserzähler'],
          count: 76
        },
        {
          id: '2',
          name: 'Abschlagsänderung',
          description: 'Anfragen zur Änderung des monatlichen Abschlags',
          keywords: ['abschlag', 'änderung', 'monatlich', 'zahlung', 'anpassen'],
          count: 42
        },
        // weitere Kategorien...
      ]
    }
  });
});

// E-Mail kategorisieren
app.post('/api/emails/categorize', (req, res) => {
  const { emailId, category } = req.body;
  
  if (!emailId || !category) {
    return res.status(400).json({
      success: false,
      message: 'E-Mail-ID und Kategorie sind erforderlich'
    });
  }
  
  // Hier würde in einer realen Anwendung die E-Mail kategorisiert werden
  res.status(200).json({
    success: true,
    message: `E-Mail ${emailId} wurde der Kategorie ${category} zugeordnet`,
    data: { emailId, category }
  });
});

// E-Mail mit fehlender Kundennummer beantworten
app.post('/api/emails/reply', (req, res) => {
  const { emailId, template } = req.body;
  
  if (!emailId) {
    return res.status(400).json({
      success: false,
      message: 'E-Mail-ID ist erforderlich'
    });
  }
  
  // Hier würde in einer realen Anwendung die Antwort-E-Mail gesendet werden
  res.status(200).json({
    success: true,
    message: `Antwort auf E-Mail ${emailId} wurde gesendet`,
    data: { emailId }
  });
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
}); 