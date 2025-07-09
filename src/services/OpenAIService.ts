import OpenAI from 'openai';
import { getCategories } from './SupabaseService';

class OpenAIService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true
    });
  }

  async analyzeEmailText(subject: string, body: string): Promise<{
    customerNumber: string | null;
    category: string | null;
    allCustomerNumbers: string[];
    allCategories: string[];
  }> {
    try {
      console.log("CAT CHECK")
      let cats = `KATEGORIEN:
      `;
      const loadedData = await getCategories();

      const data = loadedData.map(
          cat => ({
            name: cat.category_name,
            description: cat.category_description
          })
        )

      for(const d of data){
        cats += (' - '+ d.name + ': ' + d.description +  `
      `) 
      }

      console.log(cats)
      let prompt = `Analysiere den folgenden E-Mail-Text sehr sorgfältig und extrahiere ALLE Kundennummern (falls vorhanden) und ordne die E-Mail ALLEN zutreffenden Kategorien zu:

      `
      prompt += cats;
      
      prompt += `
      `
      
// KATEGORIEN:
// - Zählerstandsmeldungen: E-Mails mit Zählerständen, Ablesung, Zählernummern
// - Abschlagsänderung: Änderung von Abschlagszahlungen, monatlichen Beträgen
// - Bankverbindungen zur Abbuchung/SEPA/Einzugsermächtigung: SEPA-Mandate, Lastschriftverfahren, Kontodaten für Abbuchungen
// - Bankverbindung für Guthaben: Kontodaten für Rückerstattungen, Guthaben-Auszahlungen
// - Adressänderung: Änderung der Rechnungsadresse, Postadresse (NICHT Umzug)
// - Umzug: Mieterwechsel, neue Verbrauchsstelle, Zählerummeldung bei Wohnungswechsel
// - Ratenzahlung: Anfragen für Ratenzahlung, Teilzahlungen, Zahlungsaufschub
// - Mahnung: Mahnungen, Sperrandrohungen, offene Rechnungen, Zahlungserinnerungen
// - Abwendungsvereinbarung: Abwendungsvereinbarungen zur Vermeidung von Sperrungen
// - Stammdatenänderung: Änderung von Kundendaten, Kontaktdaten, Vertragsinhaber
// - Zahlwegänderung: Änderung der Bankverbindung, Kontowechsel, neue Zahlungsmethode
// - Rechnungsstellung: Fragen zu Rechnungen, Abrechnungen, Rechnungsprüfung
// - Kundenservice: Allgemeine Anfragen, Beschwerden
// - Sonstiges: Wenn keine andere Kategorie passt

// WICHTIGE ERKENNUNGSMERKMALE:
// - Adressänderung: "Adressänderung", "Rechnungsadresse ändern", "neue Anschrift", "Verwalterwechsel", "Postadresse"
// - Umzug: "Umzug", "Mieterwechsel", "neue Verbrauchsstelle", "Zählerummeldung", "neues Mietverhältnis", "Einzug", "Auszug"
// - Ratenzahlung: "Ratenzahlung", "Raten", "monatlich zahlen", "Teilzahlung", "nicht in einer Summe", "Rate", "Ratenzahlung vereinbaren"
// - Mahnung: "Mahnung", "Sperrung", "Sperrandrohung", "offene Rechnung", "Zahlungserinnerung", "Mahngebühr", "Inkasso"
// - Abwendungsvereinbarung: "Abwendungsvereinbarung", "Sperrung vermeiden", "Vereinbarung treffen", "Abwendung", "Sperrung abwenden"
// - Stammdatenänderung: "Stammdaten", "Vertragsinhaber", "verstorben", "Kundendaten ändern", "Namensänderung", "Kontaktdaten"
// - Zahlwegänderung: "Bankverbindung", "Kontowechsel", "neue Bank", "Kontowechselservice", "IBAN", "Lastschrift ändern"
// - Zählerstandsmeldungen: "Zählerstand", "Ablesung", "Zählernummer", "kWh", "Verbrauch", "Zähler"
// - Abschlagsänderung: "Abschlag", "monatlicher Betrag", "Vorauszahlung", "Abschlagszahlung"
// - Rechnungsstellung: "Rechnung", "Abrechnung", "Jahresabrechnung", "Guthaben", "Nachzahlung"


  prompt += `ANALYSE-ANWEISUNGEN:
1. Lies den GESAMTEN Text sorgfältig durch
2. Suche nach ALLEN Kundennummern (meist 6-12 stellige Zahlen)
3. Prüfe JEDEN Satz auf mögliche Kategorien
4. Eine E-Mail kann MEHRERE Kategorien gleichzeitig betreffen
5. Vergiss nicht, auch Nebensätze und Anhänge-Erwähnungen zu prüfen
6. Wenn mehrere Themen in einer E-Mail behandelt werden, erkenne ALLE

Betreff: ${subject}
Inhalt: ${body}

Antworte ausschließlich im folgenden JSON-Format:
{
  "customerNumber": "erste gefundene Kundennummer oder null",
  "category": "hauptsächliche Kategorie",
  "allCustomerNumbers": ["array aller gefundenen Kundennummern"],
  "allCategories": ["array aller zutreffenden Kategorien - auch wenn mehrere!"]
}`;

console.log(prompt)
      const response = await this.analyzeText(prompt);
      
      try {
        const result = JSON.parse(response);
        console.log('ChatGPT Multi-Analyse Ergebnis:', result);
        
        // Validiere die Kategorien
        const validCategories = data.map(
          d => (d.name)
        );
        
        // Validiere alle Kategorien und filtere ungültige heraus
        if (Array.isArray(result.allCategories)) {
          result.allCategories = result.allCategories.filter((cat: string) => 
            validCategories.includes(cat)
          );
          // Wenn keine gültigen Kategorien gefunden wurden, verwende die Hauptkategorie
          if (result.allCategories.length === 0 ) {
            result.allCategories = [result.category || 'Sonstiges'];
          }
        } else {
          result.allCategories = [result.category || 'Sonstiges'];
        }
        
        // Validiere Hauptkategorie
        if (!validCategories.includes(result.category)) {
          result.category = result.allCategories.length > 0 ? result.allCategories[0] : 'Sonstiges';
        }
        
        // Bereinige Kundennummern (entferne Duplikate und leere Werte)
        if (Array.isArray(result.allCustomerNumbers)) {
          result.allCustomerNumbers = [...new Set(
            result.allCustomerNumbers
              .filter((num: any) => num && num.toString().trim())
              .map((num: any) => num.toString().trim())
          )];
        } else {
          result.allCustomerNumbers = result.customerNumber ? [result.customerNumber] : [];
        }
        
        // Stelle sicher, dass customerNumber gesetzt ist, wenn Kundennummern vorhanden sind
        if (!result.customerNumber && result.allCustomerNumbers.length > 0) {
          result.customerNumber = result.allCustomerNumbers[0];
        }
        
        console.log('Bereinigte Analyse-Ergebnisse:', {
          customerNumber: result.customerNumber,
          category: result.category,
          allCustomerNumbers: result.allCustomerNumbers,
          allCategories: result.allCategories
        });
        
        return {
          customerNumber: result.customerNumber,
          category: result.category,
          allCustomerNumbers: result.allCustomerNumbers,
          allCategories: result.allCategories
        };
      } catch (error) {
        console.error('Fehler beim Parsen der ChatGPT-Antwort:', error);
        return { 
          customerNumber: null, 
          category: 'Sonstiges',
          allCustomerNumbers: [],
          allCategories: ['Sonstiges']
        };
      }
    } catch (error) {
      console.error('Fehler bei der ChatGPT-Analyse:', error);
      return { 
        customerNumber: null, 
        category: 'Sonstiges',
        allCustomerNumbers: [],
        allCategories: ['Sonstiges']
      };
    }
  }

  async analyzeAttachment(base64Content: string, contentType: string): Promise<{
    customerNumber?: string;
    category?: string;
    allCustomerNumbers?: string[];
    allCategories?: string[];
  }> {
    if (contentType.startsWith('image/')) {
      console.log('Analysiere Bild-Anhang...');
      const result = await this.analyzeImage(base64Content);
      console.log('Bildanalyse-Ergebnis:', result);
      return result;
    }
    console.log('Nicht unterstützter Anhang-Typ:', contentType);
    return {
      customerNumber: undefined,
      category: "Sonstiges",
      allCustomerNumbers: [],
      allCategories: ["Sonstiges"]
    };
  }

  async analyzeImage(base64Image: string): Promise<{
    customerNumber?: string;
    category?: string;
    allCustomerNumbers?: string[];
    allCategories?: string[];
  }> {
    try {
      console.log('Starte Bildanalyse mit GPT-4o...');
      console.log("CAT CHECK")
      let cats = `KATEGORIEN:
      `;
      const loadedData = await getCategories();

      const data = loadedData.map(
          cat => ({
            name: cat.category_name,
            description: cat.category_description
          })
        )

      for(const d of data){
        cats += (' - '+ d.name + ': ' + d.description +  `
      `) 
      }

      console.log(cats)
      let prompt = `Analysiere dieses Bild sehr sorgfältig. Extrahiere ALLE Kundennummern (falls vorhanden) und ordne das Bild ALLEN zutreffenden Kategorien zu:

      `
      prompt += cats;
      
      prompt += `
      
      WICHTIG: 
      // - Finde ALLE Kundennummern im Bild (meist 6-12 stellige Zahlen)
      // - Das Bild kann mehrere Kategorien gleichzeitig betreffen
      // - Prüfe alle Texte und Zahlen im Bild sorgfältig

      // Antworte NUR im Format: {"customerNumber": "erste gefundene Nummer oder null", "category": "hauptsächliche Kategorie", "allCustomerNumbers": ["array aller Kundennummern"], "allCategories": ["array aller Kategorien"]}
      `



//       prompt = `Analysiere dieses Bild sehr sorgfältig. Extrahiere ALLE Kundennummern (falls vorhanden) und ordne das Bild ALLEN zutreffenden Kategorien zu:

// KATEGORIEN:
// - Zählerstandsmeldungen: Zählerbilder, Ablesung, Zählernummern
// - Abschlagsänderung: Änderung von Abschlagszahlungen, monatlichen Beträgen
// - Bankverbindungen zur Abbuchung/SEPA/Einzugsermächtigung: SEPA-Mandate, Lastschriftverfahren, Kontodaten für Abbuchungen
// - Bankverbindung für Guthaben: Kontodaten für Rückerstattungen, Guthaben-Auszahlungen
// - Adressänderung: Änderung der Rechnungsadresse, Postadresse
// - Umzug: Mieterwechsel, neue Verbrauchsstelle, Zählerummeldung bei Wohnungswechsel
// - Ratenzahlung: Anfragen für Ratenzahlung, Teilzahlungen, Zahlungsaufschub
// - Mahnung: Mahnungen, Sperrandrohungen, offene Rechnungen, Zahlungserinnerungen
// - Abwendungsvereinbarung: Abwendungsvereinbarungen zur Vermeidung von Sperrungen
// - Stammdatenänderung: Änderung von Kundendaten, Kontaktdaten, Vertragsinhaber
// - Zahlwegänderung: Änderung der Bankverbindung, Kontowechsel, neue Zahlungsmethode
// - Rechnungsstellung: Rechnungen, Abrechnungen, Rechnungsprüfung
// - Kundenservice: Allgemeine Anfragen, Beschwerden
// - Sonstiges: Wenn keine andere Kategorie passt

// WICHTIG: 
// - Finde ALLE Kundennummern im Bild (meist 6-12 stellige Zahlen)
// - Das Bild kann mehrere Kategorien gleichzeitig betreffen
// - Prüfe alle Texte und Zahlen im Bild sorgfältig

// Antworte NUR im Format: {"customerNumber": "erste gefundene Nummer oder null", "category": "hauptsächliche Kategorie", "allCustomerNumbers": ["array aller Kundennummern"], "allCategories": ["array aller Kategorien"]}`

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ]
      });

      try {
        const content = response.choices[0]?.message?.content;
        console.log('OpenAI Vision Antwort:', content);
        if (content) {
          // Versuche zuerst, direkt zu parsen
          try {
            const result = JSON.parse(content);
            console.log('Erfolgreich geparste JSON-Antwort:', result);
            
            // Für Rückwärtskompatibilität: Falls neue Felder nicht vorhanden sind, verwende die alten
            return {
              customerNumber: result.customerNumber,
              category: result.category,
              allCustomerNumbers: result.allCustomerNumbers || (result.customerNumber ? [result.customerNumber] : []),
              allCategories: result.allCategories || (result.category ? [result.category] : [])
            };
          } catch (e) {
            console.log('Direktes Parsen fehlgeschlagen, versuche JSON-Extraktion');
            // Wenn das fehlschlägt, versuche den JSON-Teil zu extrahieren
            const jsonMatch = content.match(/\{.*\}/s);
            if (jsonMatch) {
              const result = JSON.parse(jsonMatch[0]);
              console.log('Erfolgreich extrahierte JSON-Antwort:', result);
              return {
                customerNumber: result.customerNumber,
                category: result.category,
                allCustomerNumbers: result.allCustomerNumbers || (result.customerNumber ? [result.customerNumber] : []),
                allCategories: result.allCategories || (result.category ? [result.category] : [])
              };
            }
          }
        }
      } catch (error) {
        console.error('Fehler beim Parsen der OpenAI-Antwort:', error);
        console.log('Erhaltene Antwort:', response.choices[0]?.message?.content);
      }

      // Standardwerte zurückgeben, wenn keine gültige Antwort
      return {
        customerNumber: undefined,
        category: "Sonstiges"
      };
    } catch (error) {
      console.error('Fehler bei der OpenAI-Bildanalyse:', error);
      return {
        customerNumber: undefined,
        category: "Sonstiges"
      };
    }
  }

  async analyzePdf(base64Pdf: string): Promise<{
    customerNumber?: string;
    category?: string;
    allCustomerNumbers?: string[];
    allCategories?: string[];
  }> {
    try {
      console.log('Starte PDF-analyse mit GPT-4o...');

      console.log("CAT CHECK")
      let cats = `KATEGORIEN:
      `;
      const loadedData = await getCategories();

      const data = loadedData.map(
          cat => ({
            name: cat.category_name,
            description: cat.category_description
          })
        )

      for(const d of data){
        cats += (' - '+ d.name + ': ' + d.description +  `
      `) 
      }

      console.log(cats)
      let prompt = `Analysiere dieses Bild sehr sorgfältig. Extrahiere ALLE Kundennummern (falls vorhanden) und ordne das Bild ALLEN zutreffenden Kategorien zu:

      `
      prompt += cats;
      
      prompt += `
      
      WICHTIG: 
      // - Finde ALLE Kundennummern im Bild (meist 6-12 stellige Zahlen)
      // - Das Bild kann mehrere Kategorien gleichzeitig betreffen
      // - Prüfe alle Texte und Zahlen im Bild sorgfältig

      // Antworte NUR im Format: {"customerNumber": "erste gefundene Nummer oder null", "category": "hauptsächliche Kategorie", "allCustomerNumbers": ["array aller Kundennummern"], "allCategories": ["array aller Kategorien"]}
      `
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              {
                type: "file",
                file: {
                  file_data: `data:application/pdf;base64,${base64Pdf}`,
                  filename: 'name'
                }
              }
            ]
          }
        ]
      });

      try {
        const content = response.choices[0]?.message?.content;
        console.log('OpenAI Vision Antwort:', content);
        if (content) {
          // Versuche zuerst, direkt zu parsen
          try {
            const result = JSON.parse(content);
            console.log('Erfolgreich geparste JSON-Antwort:', result);
            
            // Für Rückwärtskompatibilität: Falls neue Felder nicht vorhanden sind, verwende die alten
            return {
              customerNumber: result.customerNumber,
              category: result.category,
              allCustomerNumbers: result.allCustomerNumbers || (result.customerNumber ? [result.customerNumber] : []),
              allCategories: result.allCategories || (result.category ? [result.category] : [])
            };
          } catch (e) {
            console.log('Direktes Parsen fehlgeschlagen, versuche JSON-Extraktion');
            // Wenn das fehlschlägt, versuche den JSON-Teil zu extrahieren
            const jsonMatch = content.match(/\{.*\}/s);
            if (jsonMatch) {
              const result = JSON.parse(jsonMatch[0]);
              console.log('Erfolgreich extrahierte JSON-Antwort:', result);
              return {
                customerNumber: result.customerNumber,
                category: result.category,
                allCustomerNumbers: result.allCustomerNumbers || (result.customerNumber ? [result.customerNumber] : []),
                allCategories: result.allCategories || (result.category ? [result.category] : [])
              };
            }
          }
        }
      } catch (error) {
        console.error('Fehler beim Parsen der OpenAI-Antwort:', error);
        console.log('Erhaltene Antwort:', response.choices[0]?.message?.content);
      }

      // Standardwerte zurückgeben, wenn keine gültige Antwort
      return {
        customerNumber: undefined,
        category: "Sonstiges"
      };
    } catch (error) {
      console.error('Fehler bei der OpenAI-Bildanalyse:', error);
      return {
        customerNumber: undefined,
        category: "Sonstiges"
      };
    }
  }

  async analyzeText(prompt: string): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "Du bist ein Assistent, der E-Mails analysiert und Kundennummern sowie Kategorien extrahiert. Antworte ausschließlich im vorgegebenen JSON-Format."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        model: "gpt-4",
      });

      return completion.choices[0]?.message?.content || '{"customerNumber": null, "category": "Sonstiges"}';
    } catch (error) {
      console.error('Fehler bei der OpenAI API:', error);
      return '{"customerNumber": null, "category": "Sonstiges"}';
    }
  }

  /**
   * Analysiert Mailtext und ggf. Bildanhang und kombiniert die Ergebnisse mit einem weiteren Prompt.
   */
  async analyzeEmailWithAttachments(
    subject: string,
    body: string,
    attachments: Array<{ contentType?: string; contentBytes?: string; name?: string }>
  ): Promise<{ customerNumber: string | null; category: string | null }> {
    try {
      console.log('Starte kombinierte Analyse von E-Mail-Text und Anhängen...');
      
      // Schritt 1: Analysiere den E-Mail-Text
      console.log('Schritt 1: Analysiere E-Mail-Text...');
      const textResult = await this.analyzeEmailText(subject, body);
      console.log('Text-Analyse Ergebnis:', textResult);
      
      // Schritt 2: Analysiere alle Bildanhänge
      const imageResults: Array<{ customerNumber?: string; category?: string }> = [];
      
      if (attachments && attachments.length > 0) {
        console.log(`Schritt 2: Analysiere ${attachments.length} Anhänge...`);
        
        for (let i = 0; i < attachments.length; i++) {
          const attachment = attachments[i];
          
          if (attachment.contentType?.startsWith('image/') && attachment.contentBytes) {
            console.log(`Analysiere Bild ${i + 1}: ${attachment.name}`);
            try {
              const imageResult = await this.analyzeImage(attachment.contentBytes);
              console.log(`Bild ${i + 1} Analyse Ergebnis:`, imageResult);
              imageResults.push(imageResult);
            } catch (error) {
              console.error(`Fehler bei Analyse von Bild ${i + 1} (${attachment.name}):`, error);
              imageResults.push({ customerNumber: undefined, category: undefined });
            }
          } else if (attachment.contentType?.startsWith('image/')) {
            console.warn(`Bild ${i + 1} (${attachment.name}) hat keine base64-Daten - überspringe`);
          }
        }
      }
      
      // Schritt 3: Kombiniere die Ergebnisse - priorisiere die beste gefundene Information
      console.log('Schritt 3: Kombiniere Ergebnisse...');
      
      // Sammle alle gefundenen Kundennummern und Kategorien
      const allCustomerNumbers = [textResult.customerNumber, ...imageResults.map(r => r.customerNumber)]
        .filter(num => num !== null && num !== undefined && num.trim() !== '');
      
      const allCategories = [textResult.category, ...imageResults.map(r => r.category)]
        .filter(cat => cat !== null && cat !== undefined && cat.trim() !== '');
      
      // Wähle die beste Kundennummer (erste gefundene, priorisiere Text)
      const finalCustomerNumber = allCustomerNumbers.length > 0 ? allCustomerNumbers[0] : null;
      
      // Wähle die beste Kategorie (erste gefundene, priorisiere Text)
      const finalCategory = allCategories.length > 0 ? allCategories[0] : null;
      
      const finalResult = {
        customerNumber: finalCustomerNumber,
        category: finalCategory
      };
      
      console.log('Finale kombinierte Analyse:', {
        textResult,
        imageResults,
        allCustomerNumbers,
        allCategories,
        finalResult
      });
      
      return {
        customerNumber: finalResult.customerNumber || null,
        category: finalResult.category || null
      };
      
    } catch (error) {
      console.error('Fehler bei der kombinierten Analyse:', error);
      return { customerNumber: null, category: null };
    }
  }
}

export const openAIService = new OpenAIService();
export default OpenAIService; 