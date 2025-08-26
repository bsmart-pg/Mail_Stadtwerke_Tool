import { updateEmailAnalysisResults, getEmailById } from './SupabaseService';
import GraphService from './GraphService';
import { EMAIL_STATUS } from '../types/supabase';


const baseURL = import.meta.env.VITE_API_BASE;

if (!baseURL) {
  throw new Error('backend URL müssen in den Umgebungsvariablen definiert sein.');
}


interface ImageAnalysisResult {
  customerNumber?: string | null;
  category?: string | null;
  extractedInformation?: object | [];
  imageCount: number;
  timestamp: string;
}

class AnalysisService {
  private analysisQueue: Set<string> = new Set();

  /**
   * Startet die Hintergrund-Analyse für eine E-Mail
   */
  async startBackgroundAnalysis(emailId: string, messageId: string, forwardingEmail: string): Promise<void> {
    try {
      console.log(`Starte Hintergrund-Analyse für E-Mail ${emailId}`);

      // Hole die vollständige E-Mail von Microsoft Graph mit allen Anhängen
      const fullEmail = await GraphService.getEmailContent(messageId);
      
      // Lade alle Bild-Anhänge vollständig (base64)
      if (fullEmail.hasAttachments && fullEmail.attachments && Array.isArray(fullEmail.attachments)) {
        console.log(`E-Mail hat ${fullEmail.attachments.length} Anhänge - lade Bilder vollständig...`);
        
        for (let i = 0; i < fullEmail.attachments.length; i++) {
          const attachment = fullEmail.attachments[i] as any;
          
          // Nur Bilder verarbeiten
          if (attachment.contentType && attachment.contentType.startsWith('image/') && attachment.id) {
            try {
              console.log(`Lade base64 für Bild-Attachment: ${attachment.name}`);
              const buffer = await GraphService.getAttachmentContent(fullEmail.id, attachment.id);
              const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
              attachment.contentBytes = base64;
              console.log(`Base64 erfolgreich geladen für ${attachment.name}, Größe: ${base64.length} Zeichen`);
            } catch (error) {
              console.error(`Fehler beim Laden von base64 für Attachment ${attachment.name}:`, error);
              attachment.contentBytes = null;
            }
          }
        }
        
        // Zähle erfolgreich geladene Bilder
        const loadedImages = fullEmail.attachments.filter((att: any) => 
          att.contentType?.startsWith('image/') && att.contentBytes
        ).length;
        const totalImages = fullEmail.attachments.filter((att: any) => 
          att.contentType?.startsWith('image/')
        ).length;
        
        console.log(`Bildanhänge für Hintergrund-Analyse geladen: ${loadedImages}/${totalImages}`);
      }
      
      // Starte Text- und Bildanalyse parallel mit der vollständig geladenen E-Mail
      const [textResult, imageResult] = await Promise.all([
        this.analyzeEmailText(fullEmail),
        this.analyzeEmailImages(fullEmail)
      ]);

      console.log('Text-Analyse Ergebnis:', textResult);
      console.log('Bild-Analyse Ergebnis:', imageResult);

      // Kombiniere die Ergebnisse
      const combinedResult = this.combineAnalysisResults(textResult, imageResult);
      console.log('Kombiniertes Ergebnis:', combinedResult);

      // Aktualisiere die E-Mail in der Datenbank mit allen Ergebnissen
      await updateEmailAnalysisResults(messageId, {
        customer_number: combinedResult.customerNumber,
        category: combinedResult.category,
        all_customer_numbers: combinedResult.allCustomerNumbers,
        all_categories: combinedResult.allCategories,
        text_analysis_result: JSON.stringify({
          ...textResult,
          allCustomerNumbers: combinedResult.allCustomerNumbers,
          allCategories: combinedResult.allCategories
        }),
        image_analysis_result: JSON.stringify(imageResult),
        analysis_completed: true,
        // Aktualisiere auch den Status basierend auf den Ergebnissen
        status: this.determineEmailStatus(combinedResult.customerNumber, combinedResult.category),
        extracted_information: combinedResult.allExtractedInformation
      });

      console.log(`Hintergrund-Analyse für E-Mail ${emailId} abgeschlossen`);

    } catch (error) {
      console.error(`Fehler bei Hintergrund-Analyse für E-Mail ${emailId}:`, error);
      
      // Markiere als abgeschlossen, auch wenn Fehler aufgetreten sind
      try {
        await updateEmailAnalysisResults(messageId, {
          analysis_completed: true,
          text_analysis_result: `Fehler: ${error instanceof Error ? error.message : String(error)}`,
          image_analysis_result: null
        });
      } catch (updateError) {
        console.error('Fehler beim Aktualisieren des Fehlerstatus:', updateError);
      }
    }
  }

  async startForwarding(emailId: string, messageId: string, forwardingEmail: string): Promise<void> {
    try {

      console.log(`Start Weiterleitung für E-Mail ${emailId}`);

      const email = await getEmailById(emailId);

      const combinedResult = {
        customerNumber: email?.customer_number,
        category: email?.category,
        allCustomerNumbers: email?.all_customer_numbers,
        allCategories: email?.all_categories,
      }

      // Starte Weiterleitungsprozess nur wenn sowohl Kundennummer als auch Kategorie gefunden wurden
      if (combinedResult.customerNumber && combinedResult.category && 
          combinedResult.allCustomerNumbers.length > 0 && combinedResult.allCategories.length > 0) {
        console.log(`Starte Weiterleitungsprozess - Kundennummer und Kategorie gefunden`);
        await this.processForwarding(emailId, messageId, combinedResult, forwardingEmail);
      } else {
        console.log(`Keine Weiterleitung - unvollständige Analyse:`, {
          customerNumber: combinedResult.customerNumber,
          category: combinedResult.category,
          allCustomerNumbers: combinedResult.allCustomerNumbers.length,
          allCategories: combinedResult.allCategories.length
        });
        
        // Markiere als nicht weitergeleitet
        await updateEmailAnalysisResults(messageId, {
          forwarded: false,
          forwarding_completed: true
        });
      }

    } catch (error) {
      console.error(`Fehler bei Weiterleitung für E-Mail ${emailId}:`, error);
    }
  }

  async startManualForwarding(emailId: string, messageId: string, forwardingEmail: string): Promise<void> {
    try {

      console.log(`Start Weiterleitung für E-Mail ${emailId}`);

      const email = await GraphService.getEmailContent(messageId);
     
      console.log(`Starte Manuellen Weiterleitungsprozess`);
      await this.forwardManualEmailWithTags(email, 1,1 , forwardingEmail);

    } catch (error) {
      console.error(`Fehler bei Weiterleitung für E-Mail ${emailId}:`, error);
    }
  }

  /**
   * Schritt 1: Analysiert den E-Mail-Text
   */
  private async analyzeEmailText(email: any): Promise<{
    customerNumber: string | null;
    category: string | null;
    allCustomerNumbers: string[];
    allCategories: string[];
    extractedInformation: object[];
    timestamp: string;
  }> {
    try {
      console.log(`Schritt 1: Text-Analyse für E-Mail ${email.id}`);
      
      // // Analysiere den Text
      // const textResult = await openAIService.analyzeEmailText(
      //   email.subject || '',
      //   email.body?.content || ''
      // );

      const email_subject = email.subject || ''
      const email_body = email.body?.content || ''
      const response = await fetch(baseURL +'/api/analyze-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_subject,
          email_body
        })
      });

      const textResult = await response.json();


      return {
        ...textResult,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Fehler bei Text-Analyse für E-Mail ${email.id}:`, error);
      return {
        customerNumber: null,
        category: null,
        allCustomerNumbers: [],
        allCategories: [],
        extractedInformation: [],
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Schritt 2: Analysiert die Bild-Anhänge
   */
  private async analyzeEmailImages(email: any): Promise<{
    customerNumber: string | null;
    category: string | null;
    allCustomerNumbers?: string[];
    allCategories?: string[];
    extractedInformation?: object[];
    timestamp: string;
    imageCount: number,
  }> {
    try {
      console.log(`Schritt 2: Bild-Analyse für E-Mail ${email.id}`);
      
      if (!email.hasAttachments || !email.attachments) {
        console.log(`E-Mail ${email.id} hat keine Anhänge - überspringe Bild-Analyse`);
        return {
          customerNumber: null,
          category: null,
          imageCount: 0,
          timestamp: new Date().toISOString()
        };
      }

      const imageResults: Array<{
        customerNumber: string | null;
        category: string | null;
        allCustomerNumbers: string[];
        allCategories: string[];
        extractedInformation: object[];
      }> = [];
      let imageCount = 0;

      // Analysiere alle Bild-Anhänge
      for (const attachment of email.attachments) {
        if (attachment.contentType?.startsWith('image/')) {
          imageCount++;
          try {
            console.log(`Analysiere Bild ${imageCount}: ${attachment.name}`);
            
            let base64: string;
            
            // Verwende bereits geladene base64-Daten oder lade sie neu
            if (attachment.contentBytes) {
              base64 = attachment.contentBytes;
              console.log(`Verwende bereits geladene base64-Daten für ${attachment.name}`);
            } else if (attachment.id) {
              console.log(`Lade base64-Inhalt für ${attachment.name}`);
              const buffer = await GraphService.getAttachmentContent(email.id, attachment.id);
              base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            } else {
              console.warn(`Bild-Attachment ${attachment.name} hat keine ID und keine base64-Daten - überspringe`);
              continue;
            }
            
            // Analysiere das Bild
            // const imageResult = await openAIService.analyzeImage(base64);
            const response = await fetch(baseURL +'/api/analyze-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                base64Image: base64,
              })
            });

            const imageResult = await response.json();


            imageResults.push(imageResult);
            
            console.log(`Bild ${imageCount} analysiert:`, imageResult);
          } catch (error) {
            console.error(`Fehler bei Analyse von Bild ${imageCount}:`, error);
            imageResults.push({ 
              customerNumber: null, 
              category: 'Sonstiges',
              allCustomerNumbers: [],
              allCategories: ['Sonstiges'],
              extractedInformation: []
            });
          }
        }
        else if (attachment.contentType?.startsWith('application/pdf')) {
          imageCount++;
          try {
            console.log(`Analysiere PDF ${imageCount}: ${attachment.name}`);
            
            let base64: string;
            
            // Verwende bereits geladene base64-Daten oder lade sie neu
            if (attachment.contentBytes) {
              base64 = attachment.contentBytes;
              console.log(`Verwende bereits geladene base64-Daten für ${attachment.name}`);
            } else if (attachment.id) {
              console.log(`Lade base64-Inhalt für ${attachment.name}`);
              const buffer = await GraphService.getAttachmentContent(email.id, attachment.id);
              base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            } else {
              console.warn(`PDF-Attachment ${attachment.name} hat keine ID und keine base64-Daten - überspringe`);
              continue;
            }
            
            // Analysiere das PDF
            // const imageResult = await openAIService.analyzePdf(base64);
            const response = await fetch(baseURL +'/api/analyze-pdf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                base64Pdf: base64
              })
            });

            const imageResult = await response.json();

            imageResults.push(imageResult);
            
            console.log(`PDF ${imageCount} analysiert:`, imageResult);
          } catch (error) {
            console.error(`Fehler bei Analyse von PDF ${imageCount}:`, error);
            imageResults.push(
              { 
                customerNumber: null, 
                category: 'Sonstiges',
                allCustomerNumbers: [],
                allCategories: ['Sonstiges'],
                extractedInformation: []
              }
            );
          }
        }
      }

      if (imageCount > 0) {
        // Kombiniere die Bild-Ergebnisse (erste gefundene Kundennummer/Kategorie)
        let combinedAllCustomerNumbers = []
        let combinedAllCategories = []
        let combinedExtractedInformation = []
        for (let i = 0; i < imageCount; i++) {
          if(imageResults[0].allCustomerNumbers && imageResults[0].allCustomerNumbers.length > 0){
            combinedAllCustomerNumbers.push(...imageResults[i].allCustomerNumbers)
          }
          if(imageResults[0].allCategories && imageResults[0].allCategories.length > 0){
            combinedAllCategories.push(...imageResults[i].allCategories)
          }
          if(imageResults[0].extractedInformation && imageResults[0].extractedInformation.length > 0){
            combinedExtractedInformation.push(...imageResults[i].extractedInformation)
          }
          
        }
        const combinedResult = {
          customerNumber: imageResults.find(r => r.customerNumber)?.customerNumber || null,
          category: imageResults.find(r => r.category)?.category || null,
          allCustomerNumbers: combinedAllCustomerNumbers,
          allCategories: combinedAllCategories,
          extractedInformation: combinedExtractedInformation
        };

        return {
          customerNumber: combinedResult.customerNumber,
          category: combinedResult.category,
          imageCount: imageCount,
          timestamp: new Date().toISOString(),
          allCustomerNumbers: combinedResult.allCustomerNumbers,
          allCategories: combinedResult.allCategories,
          extractedInformation: combinedResult.extractedInformation
        };
      } else {
        console.log(`E-Mail ${email.id} hat keine analysierbaren Bilder`);
        return {
          customerNumber: null,
          category: null,
          imageCount: 0,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error(`Fehler bei Bild-Analyse für E-Mail ${email.id}:`, error);
      return {
        customerNumber: null,
        category: null,
        imageCount: 0,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Kombiniert Text- und Bild-Analyse zu einem finalen Ergebnis
   */
  private combineAnalysisResults(textResult: {
    customerNumber: string | null;
    category: string | null;
    allCustomerNumbers: string[];
    allCategories: string[];
    extractedInformation: {
      name: string,
      data: object[]
    }[];
    timestamp: string;
  }, imageResult: {
    customerNumber?: string | null;
    category?: string | null;
    allCustomerNumbers?: string[];
    allCategories?: string[];
    extractedInformation?: {
      name: string,
      data: object[]
    }[];
    imageCount: number;
    timestamp: string;
  }): {
    customerNumber: string | null;
    category: string | null;
    allCustomerNumbers: string[];
    allCategories: string[];
    allExtractedInformation: {
      name: string,
      data: object[]
    }[]
  } {
    let customerNumber: string | null = null;
    let category: string | null = null;
    let allCustomerNumbers: string[] = [];
    let allCategories: string[] = [];
    let allExtractedInformation: {
      name: string,
      data: object[]
    }[] = [];

    // // Verwende die Arrays aus der Text-Analyse (diese sind vollständig)
    // allCustomerNumbers = textResult.allCustomerNumbers || [];
    // allCategories = textResult.allCategories || [];


    // Kundennummer: Text hat Vorrang
    if (textResult.customerNumber && textResult.customerNumber != null) {
      customerNumber = textResult.customerNumber;
      allCustomerNumbers.push(customerNumber);
      allCustomerNumbers.push(...textResult.allCustomerNumbers);
    }
    if (imageResult.customerNumber && imageResult.customerNumber != null) {
      if (customerNumber == null){
        customerNumber = imageResult.customerNumber;
      }  
      // Füge Bild-Kundennummer hinzu, falls nicht bereits vorhanden
      allCustomerNumbers.push(imageResult.customerNumber);
      if (imageResult.allCustomerNumbers){
        allCustomerNumbers.push(...imageResult.allCustomerNumbers);
      }
    }

    // Kategorie: Text hat Vorrang
    if (textResult.category && textResult.category != "Sonstiges") {
      category = textResult.category;
      allCategories.push(...textResult.allCategories.filter(item => item !== "Sonstiges"));
    }
    if (imageResult.category && imageResult.category != "Sonstiges") {
      if (textResult.category == null || textResult.category == "Sonstiges"){
        category = imageResult.category;
        allCategories.push(imageResult.category); 
      }
      if (imageResult.allCategories){
        allCategories.push(...imageResult.allCategories.filter(item => item !== "Sonstiges"));
      }
    }
    allCategories = [...new Set(allCategories)];
    allCustomerNumbers = [...new Set(allCustomerNumbers)];


    let textExtractedInformationFlows = []
    if (textResult.extractedInformation && textResult.extractedInformation.length > 0 ) {
      allExtractedInformation.push(...textResult.extractedInformation);
      textExtractedInformationFlows = textResult.extractedInformation.map( (n) => {n.name} )
    }
    if (imageResult.extractedInformation && imageResult.extractedInformation.length > 0 ) {
      for(const elem of imageResult.extractedInformation){
        if (textExtractedInformationFlows.includes(elem.name)) {

          const found = allExtractedInformation.find((m) => {m.name === elem.name})
          if(found) {
            found["data"].push(elem["data"]);
          } else {
            allExtractedInformation.push(...imageResult.extractedInformation);
          }
        }
        else {
            allExtractedInformation.push(...imageResult.extractedInformation);
        }
      }
    }

    console.log("allCategories")
    console.log(allCategories)
    console.log("allCustomerNumbers")
    console.log(allCustomerNumbers)
    console.log(textResult.extractedInformation)
    console.log(imageResult.extractedInformation)
    console.log(allExtractedInformation)

    if(allCategories.length == 0) {
      console.log("else")
      category = "Sonstiges"
      allCategories = ["Sonstiges"]
    }

    allCategories = allCategories.filter(a => a !== null)
    allCustomerNumbers = allCustomerNumbers.filter(a => a !== null)

    // ⬇️ add this block here
    const norm = (s: any) => String(s ?? '').normalize('NFKC').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const isAlnum10 = (s: string) => /^[A-Z0-9]{10}$/.test(s);
    allCustomerNumbers = (allCustomerNumbers || []).map(norm).filter(isAlnum10);
    const cnNorm = norm(customerNumber);
    customerNumber = isAlnum10(cnNorm) ? cnNorm : (allCustomerNumbers[0] ?? null);

    // and then the return
    return {
      customerNumber,
      category,
      allCustomerNumbers,
      allCategories, 
      allExtractedInformation
    };

  }

  private async processForwarding(
    emailId: string, 
    messageId: string, 
    analysisResult: {
      customerNumber: string | null;
      category: string | null;
      allCustomerNumbers: string[];
      allCategories: string[];
    },
    forwardingEmail: string,
  ): Promise<void> {
    try {
      console.log(`Starte Weiterleitungsprozess für E-Mail ${emailId}`);

      // Erstelle alle Kombinationen von Kundennummern und Kategorien
      const combinations = this.createForwardingCombinations(analysisResult);
      
      console.log(`Erstelle ${combinations.length} Weiterleitungen:`, combinations);

      // Hole die vollständige E-Mail für die Weiterleitung
      const fullEmail = await GraphService.getEmailContent(messageId);

      // Sende für jede Kombination eine separate Weiterleitung
      for (let i = 0; i < combinations.length; i++) {
        const combination = combinations[i];
        
        try {
          await this.forwardEmailWithTags(fullEmail, combination, i + 1, combinations.length, forwardingEmail);
          console.log(`Weiterleitung ${i + 1}/${combinations.length} erfolgreich gesendet`);
        } catch (error) {
          console.error(`Fehler bei Weiterleitung ${i + 1}/${combinations.length}:`, error);
        }
      }

      // Markiere Weiterleitung als abgeschlossen
      await updateEmailAnalysisResults(messageId, {
        forwarded: true,
        forwarding_completed: true
      });

      console.log(`Weiterleitungsprozess für E-Mail ${emailId} abgeschlossen`);

    } catch (error) {
      console.error(`Fehler beim Weiterleitungsprozess für E-Mail ${emailId}:`, error);
    }
  }

  private createForwardingCombinations(analysisResult: {
    allCustomerNumbers: string[];
    allCategories: string[];
  }): Array<{ customerNumber: string | null; category: Array<string> }> {
    const combinations: Array<{ customerNumber: string | null; category: Array<string> }> = [];
    console.log(analysisResult)
    // Nur weiterleiten wenn sowohl Kundennummern als auch Kategorien vorhanden sind
    if (analysisResult.allCustomerNumbers.length > 0 && analysisResult.allCategories.length > 0 && analysisResult.allCategories[0] != "Sonstiges") {
      analysisResult.allCustomerNumbers.forEach(customerNumber => {
          const category = analysisResult.allCategories
          combinations.push({ customerNumber, category });
      });
    } else {
      console.log('Keine Weiterleitungskombinationen erstellt - unvollständige Daten:', {
        customerNumbers: analysisResult.allCustomerNumbers.length,
        categories: analysisResult.allCategories.length
      });
    }

    return combinations;
  }

  private async forwardEmailWithTags(
    email: any, 
    combination: { customerNumber: string | null; category: Array<string> }, 
    index: number, 
    total: number,
    forwardingEmail: string
  ): Promise<void> {
    console.log("following combo")
    console.log(combination)
    try {
      // Erstelle den Weiterleitungsbetreff mit Tags
      let forwardSubject = ``
      if (combination.customerNumber) {
        forwardSubject += `${combination.customerNumber}_`;
      }
      forwardSubject += combination.category.join("+");
      if (total > 1) {
        forwardSubject += ` [${index}/${total}]`;
      }
      forwardSubject += ` FWD: ${email.subject || 'Kein Betreff'}`;

      // Erstelle den Weiterleitungsinhalt
      let forwardBody = `<div style="font-family: Arial, sans-serif; line-height: 1.6;">`;
      forwardBody += `<h3 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">AUTOMATISCHE WEITERLEITUNG</h3>`;
      forwardBody += `<div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">`;
      forwardBody += `<p><strong>Kategorie:</strong> ${JSON.stringify(combination.category)}</p>`;
      forwardBody += `<p><strong>Kundennummer:</strong> ${combination.customerNumber || 'Nicht gefunden'}</p>`;
      if (total > 1) {
        forwardBody += `<p><strong>Weiterleitung:</strong> ${index} von ${total}</p>`;
      }
      forwardBody += `<p><strong>Ursprünglicher Absender:</strong> ${email.from?.emailAddress?.address}</p>`;
      forwardBody += `<p><strong>Empfangen am:</strong> ${new Date(email.receivedDateTime).toLocaleString('de-DE')}</p>`;
      forwardBody += `</div>`;
      forwardBody += `<h4 style="color: #374151; margin-top: 25px;">URSPRÜNGLICHE NACHRICHT</h4>`;
      forwardBody += `<div style="border-left: 4px solid #d1d5db; padding-left: 15px; margin-left: 10px;">`;
      
      // Füge den ursprünglichen Inhalt hinzu
      if (email.body?.contentType === 'html') {
        forwardBody += email.body.content;
      } else {
        // Konvertiere Text zu HTML
        const textContent = email.body?.content || '';
        forwardBody += `<pre style="white-space: pre-wrap; font-family: Arial, sans-serif;">${textContent}</pre>`;
      }
      
      forwardBody += `</div></div>`;

      // Konfigurierbare Ziel-E-Mail-Adressen (später aus Einstellungen laden)
      const targetRecipients = [
        forwardingEmail // Ziel-E-Mail-Adresse für Weiterleitungen
      ];
      
      // Sende die tatsächliche Weiterleitung
      console.log('Sende Weiterleitung:', {
        subject: forwardSubject,
        customerNumber: combination.customerNumber,
        category: JSON.stringify(combination.category),
        index: index,
        total: total,
        recipients: targetRecipients
      });
      
      if (email.hasAttachments && email.attachments && Array.isArray(email.attachments)) {
        console.log(`E-Mail hat ${email.attachments.length} Anhänge zur Weiterleitung...`);
        await GraphService.sendEmail(forwardSubject, forwardBody, targetRecipients, email.attachments);
      }
      else{
        await GraphService.sendEmail(forwardSubject, forwardBody, targetRecipients);
      }
      
      
      console.log(`✅ Weiterleitung ${index}/${total} erfolgreich an ${targetRecipients.join(', ')} gesendet`);

    } catch (error) {
      console.error('Fehler beim Erstellen der Weiterleitung:', error);
      throw error;
    }
  }

  private async forwardManualEmailWithTags(
    email: any, 
    index: number, 
    total: number,
    forwardingEmail: string
  ): Promise<void> {
    console.log("following combo")
    try {
      // Erstelle den Weiterleitungsbetreff mit Tags
      let forwardSubject = ` FWD: ${email.subject || 'Kein Betreff'}`;

      // Erstelle den Weiterleitungsinhalt
      let forwardBody = `<p><strong>Ursprünglicher Absender:</strong> ${email.from?.emailAddress?.address}</p>`;
      forwardBody += `<p><strong>Empfangen am:</strong> ${new Date(email.receivedDateTime).toLocaleString('de-DE')}</p>`;
      forwardBody += `</div>`;
      forwardBody += `<h4 style="color: #374151; margin-top: 25px;">URSPRÜNGLICHE NACHRICHT</h4>`;
      forwardBody += `<div style="border-left: 4px solid #d1d5db; padding-left: 15px; margin-left: 10px;">`;
      
      // Füge den ursprünglichen Inhalt hinzu
      if (email.body?.contentType === 'html') {
        forwardBody += email.body.content;
      } else {
        // Konvertiere Text zu HTML
        const textContent = email.body?.content || '';
        forwardBody += `<pre style="white-space: pre-wrap; font-family: Arial, sans-serif;">${textContent}</pre>`;
      }
      
      forwardBody += `</div></div>`;

      // Konfigurierbare Ziel-E-Mail-Adressen (später aus Einstellungen laden)
      const targetRecipients = [
        forwardingEmail // Ziel-E-Mail-Adresse für Weiterleitungen
      ];
      
      // Sende die tatsächliche Weiterleitung
      console.log('Sende Weiterleitung:', {
        subject: forwardSubject,
        index: index,
        total: total,
        recipients: targetRecipients
      });
      
      if (email.hasAttachments && email.attachments && Array.isArray(email.attachments)) {
        console.log(`E-Mail hat ${email.attachments.length} Anhänge zur Weiterleitung...`);
        await GraphService.sendEmail(forwardSubject, forwardBody, targetRecipients, email.attachments);
      }
      else{
        await GraphService.sendEmail(forwardSubject, forwardBody, targetRecipients);
      }
      
      
      console.log(`✅ Weiterleitung ${index}/${total} erfolgreich an ${targetRecipients.join(', ')} gesendet`);

    } catch (error) {
      console.error('Fehler beim Erstellen der Weiterleitung:', error);
      throw error;
    }
  }

  /**
   * Prüft den Analyse-Status einer E-Mail
   */
  async getAnalysisStatus(emailId: string): Promise<{
    textCompleted: boolean;
    imageCompleted: boolean;
    finalCompleted: boolean;
    inProgress: boolean;
  }> {
    const email = await getEmailById(emailId);
    const inProgress = this.analysisQueue.has(emailId);
    
    return {
      textCompleted: !!email?.text_analysis_result,
      imageCompleted: !!email?.image_analysis_result,
      finalCompleted: !!email?.analysis_completed,
      inProgress
    };
  }

  private determineEmailStatus(customerNumber: string | null, category: string | null): string {
    if (customerNumber && category) {
      return EMAIL_STATUS.KATEGORISIERT;
    } else if (!customerNumber && category) {
      return EMAIL_STATUS.FEHLENDE_KUNDENNUMMER;
    } else if (customerNumber && !category) {
      return EMAIL_STATUS.UNKATEGORISIERT;
    } else {
      return EMAIL_STATUS.FEHLENDE_KUNDENNUMMER;
    }
  }
}

export const analysisService = new AnalysisService();
export default AnalysisService; 