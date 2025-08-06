import OpenAI from 'openai';
import { 
  getCategories,
  getFlows,
  deleteFlows,
  saveFlows,
  getExistingFlowCategories
} from './SupabaseService';

class OpenAIService {
  private openai: OpenAI;

  constructor() {
    // this.openai = new OpenAI({
    //   apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    //   dangerouslyAllowBrowser: true
    // });
    this.openai = new OpenAI({
      apiKey: import.meta.env.VITE_AZURE_OPENAI_API_KEY,
      baseURL: `${import.meta.env.VITE_AZURE_OPENAI_ENDPOINT}/openai/deployments/${import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT_NAME}`,
      defaultQuery: { "api-version": "2024-02-15-preview" },
      defaultHeaders: {
        "api-key": import.meta.env.VITE_AZURE_OPENAI_API_KEY
      },
      dangerouslyAllowBrowser: true 
    });
  }

  async analyzeEmailText(subject: string, body: string): Promise<{
    customerNumber: string | null;
    category: string | null;
    allCustomerNumbers: string[];
    allCategories: string[];
    extractedInformation: object[]
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

      const loadedFlowData = await getFlows();

      const flowData = loadedFlowData.map(
          flow => ({
            category: flow.category_name,
            columns: flow.extraction_columns
          })
        )
      
      let flow_prompt = `Zusätzlich gibt es einige Kategorien, für die du einen Weiteren Schritt durchführen sollst. Falls du eine Email in eine dieser Kategorien klassifizierst, dann extrahiere bitte aus der Email die auch die Informationen die ich dir gleich spezifiziere. Durchsuche dafür den Email Inhalt Betreff, usw.
      
      Hier die Liste von Kategorien mit den dazugehörigen informationen die extrahiert werden sollen, wobei ich dir zuerst den Kategorienamen gebe, und dann nach einem doppelpunkt ein Array aus zuextrahierenden Informationen. Zuextrahierende Informationen in dem Array sind durch Kommas getrennt (z.B. KATEGORIENAME: [INFO1, INFO2, INFO3]).

      FLOW KATEGORIEN MIT DEN ZUGEHÖRIGEN ZU EXTRAHIERENDEN INFORMATIONEN:
      
      `

      for(const f of flowData){
        flow_prompt += (' - '+ f.category + ': [' + f.columns +  `]
      `) 
      }

      console.log(cats)
      console.log(flow_prompt)

      let prompt = `Analysiere den folgenden E-Mail-Text sehr sorgfältig und extrahiere ALLE Kundennummern (falls vorhanden) und ordne die E-Mail ALLEN zutreffenden Kategorien zu:

      `
      prompt += cats;
      prompt += flow_prompt;
      
      prompt += `
      `
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
          "extractedInformation": [
              {
                "name : ""Name der Kategorie, falls sie in der Liste der Kateogiren mit extraktionsaufforderung war",
                "data": {
                    "Name der extrahieren Information": "Wert der Extrahierten Information"
                }
              }
          ]
        }`;

      console.log(prompt)
      const response = await this.analyzeText(prompt);
      
      try {
        // Validiere die Kategorien
        const validCategories = data.map(
          d => (d.name)
        );

        return checkLlmResponse(response,validCategories,flowData)
      } catch (error) {
        console.error('Fehler beim Parsen der ChatGPT-Antwort:', error);
        return { 
          customerNumber: null, 
          category: 'Sonstiges',
          allCustomerNumbers: [],
          allCategories: ['Sonstiges'],
          extractedInformation: []
        };
      }
    } catch (error) {
      console.error('Fehler bei der ChatGPT-Analyse:', error);
      return { 
        customerNumber: null, 
        category: 'Sonstiges',
        allCustomerNumbers: [],
        allCategories: ['Sonstiges'],
        extractedInformation: []
      };
    }
  }

  async analyzeAttachment(base64Content: string, contentType: string): Promise<{
    customerNumber: string | null;
    category: string | null;
    allCustomerNumbers: string[];
    allCategories: string[];
    extractedInformation: object[]
  }> {
    if (contentType.startsWith('image/')) {
      console.log('Analysiere Bild-Anhang...');
      const result = await this.analyzeImage(base64Content);
      console.log('Bildanalyse-Ergebnis:', result);
      return result;
    }
    console.log('Nicht unterstützter Anhang-Typ:', contentType);
    return {
      customerNumber: null,
      category: "Sonstiges",
      allCustomerNumbers: [],
      allCategories: ["Sonstiges"],
      extractedInformation: [] 
    };
  }

  async analyzeImage(base64Image: string): Promise<{
    customerNumber: string | null;
    category: string | null;
    allCustomerNumbers: string[];
    allCategories: string[];
    extractedInformation: object[]
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

      const loadedFlowData = await getFlows();

      const flowData = loadedFlowData.map(
          flow => ({
            category: flow.category_name,
            columns: flow.extraction_columns
          })
        )
      
      let flow_prompt = `Zusätzlich gibt es einige Kategorien, für die du einen Weiteren Schritt durchführen sollst. Falls du eine Email in eine dieser Kategorien klassifizierst, dann extrahiere bitte aus der Email die auch die Informationen die ich dir gleich spezifiziere. Durchsuche dafür den Email Inhalt Betreff, usw.
      
      Hier die Liste von Kategorien mit den dazugehörigen informationen die extrahiert werden sollen, wobei ich dir zuerst den Kategorienamen gebe, und dann nach einem doppelpunkt ein Array aus zuextrahierenden Informationen. Zuextrahierende Informationen in dem Array sind durch Kommas getrennt (z.B. KATEGORIENAME: [INFO1, INFO2, INFO3]).

      FLOW KATEGORIEN MIT DEN ZUGEHÖRIGEN ZU EXTRAHIERENDEN INFORMATIONEN:
      
      `

      for(const f of flowData){
        flow_prompt += (' - '+ f.category + ': [' + f.columns +  `]
      `) 
      }

      console.log(cats)
      console.log(flow_prompt)


      let prompt = `Analysiere dieses Bild sehr sorgfältig. Extrahiere ALLE Kundennummern (falls vorhanden) und ordne das Bild ALLEN zutreffenden Kategorien zu:

      `
      prompt += cats;
      prompt += flow_prompt;
      prompt += `
      
      WICHTIG: 
      - Finde ALLE Kundennummern im Bild (meist 6-12 stellige Zahlen)
      - Das Bild kann mehrere Kategorien gleichzeitig betreffen
      - Prüfe alle Texte und Zahlen im Bild sorgfältig

      Antworte NUR im Format: 
      {
        "customerNumber": "erste gefundene Nummer oder null",
        "category": "hauptsächliche Kategorie",
        "allCustomerNumbers": ["array aller Kundennummern"],
        "allCategories": ["array aller Kategorien"]},
        "extractedInformation": [
            {
              "name : ""Name der Kategorie, falls sie in der Liste der Kateogiren mit extraktionsaufforderung war",
              "data": {
                  "Name der extrahieren Information": "Wert der Extrahierten Information"
              }
            }
        ]
      }
      `
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
      const content = response.choices[0]?.message?.content?.replace(/```json\n?|```/g, '') || '{"customerNumber": null, "category": "Sonstiges", "allCustomerNumbers": [], "allCategories": [], "extractedInformation": []}';
      try {
        console.log('OpenAI Vision Antwort:', content);
        // const response = JSON.parse(content);
        // console.log('Erfolgreich geparste JSON-Antwort:', response);
        
        // Validiere die Kategorien
        const validCategories = data.map(
          d => (d.name)
        );
        return checkLlmResponse(content,validCategories,flowData)
      } catch (error) {
        console.error('Fehler beim Parsen der ChatGPT-Antwort:', error);
        return { 
          customerNumber: null, 
          category: 'Sonstiges',
          allCustomerNumbers: [],
          allCategories: ['Sonstiges'],
          extractedInformation: []
        };
      }
    } catch (error) {
      console.error('Fehler bei der OpenAI-Bildanalyse:', error);
      return { 
        customerNumber: null, 
        category: 'Sonstiges',
        allCustomerNumbers: [],
        allCategories: ['Sonstiges'],
        extractedInformation: []
      };
    }
  }

  async analyzePdf(base64Pdf: string): Promise<{
    customerNumber: string | null;
    category: string | null;
    allCustomerNumbers: string[];
    allCategories: string[];
    extractedInformation: object[]
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

      const loadedFlowData = await getFlows();

      const flowData = loadedFlowData.map(
          flow => ({
            category: flow.category_name,
            columns: flow.extraction_columns
          })
        )
      
      let flow_prompt = `Zusätzlich gibt es einige Kategorien, für die du einen Weiteren Schritt durchführen sollst. Falls du eine Email in eine dieser Kategorien klassifizierst, dann extrahiere bitte aus der Email die auch die Informationen die ich dir gleich spezifiziere. Durchsuche dafür den Email Inhalt Betreff, usw.
      
      Hier die Liste von Kategorien mit den dazugehörigen informationen die extrahiert werden sollen, wobei ich dir zuerst den Kategorienamen gebe, und dann nach einem doppelpunkt ein Array aus zuextrahierenden Informationen. Zuextrahierende Informationen in dem Array sind durch Kommas getrennt (z.B. KATEGORIENAME: [INFO1, INFO2, INFO3]).

      FLOW KATEGORIEN MIT DEN ZUGEHÖRIGEN ZU EXTRAHIERENDEN INFORMATIONEN:
      
      `

      for(const f of flowData){
        flow_prompt += (' - '+ f.category + ': [' + f.columns +  `]
      `) 
      }

      console.log(cats)
      console.log(flow_prompt)

      let prompt = `Analysiere dieses Bild sehr sorgfältig. Extrahiere ALLE Kundennummern (falls vorhanden) und ordne das Bild ALLEN zutreffenden Kategorien zu:

      `
      prompt += cats;
      prompt += flow_prompt;
      prompt += `
      
      WICHTIG: 
      - Finde ALLE Kundennummern im Bild (meist 6-12 stellige Zahlen)
      - Das Bild kann mehrere Kategorien gleichzeitig betreffen
      - Prüfe alle Texte und Zahlen im Bild sorgfältig

      Antworte NUR im Format: 
      {
        "customerNumber": "erste gefundene Nummer oder null",
        "category": "hauptsächliche Kategorie",
        "allCustomerNumbers": ["array aller Kundennummern"],
        "allCategories": ["array aller Kategorien"]},
        "extractedInformation": [
            {
              "name : ""Name der Kategorie, falls sie in der Liste der Kateogiren mit extraktionsaufforderung war",
              "data": {
                  "Name der extrahieren Information": "Wert der Extrahierten Information"
              }
            }
        ]
      }
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
      const content = response.choices[0]?.message?.content?.replace(/```json\n?|```/g, '') || '{"customerNumber": null, "category": "Sonstiges", "allCustomerNumbers": [], "allCategories": [], "extractedInformation": []}';
      try {
        console.log('OpenAI Vision Antwort for PDF:', content);
        // const response = JSON.parse(content);
        // console.log('Erfolgreich geparste JSON-Antwort:', response);
        
        // Validiere die Kategorien
        const validCategories = data.map(
          d => (d.name)
        );
        return checkLlmResponse(content,validCategories,flowData)
    } catch (error) {
      console.error('Fehler bei der OpenAI-Bildanalyse:', error);
      return { 
        customerNumber: null, 
        category: 'Sonstiges',
        allCustomerNumbers: [],
        allCategories: ['Sonstiges'],
        extractedInformation: []
      };
    }
  } catch (error) {
      console.error('Fehler bei der OpenAI-Bildanalyse:', error);
      return { 
        customerNumber: null, 
        category: 'Sonstiges',
        allCustomerNumbers: [],
        allCategories: ['Sonstiges'],
        extractedInformation: []
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

      return completion.choices[0]?.message?.content || '{"customerNumber": null, "category": "Sonstiges", "allCustomerNumbers": [], "allCategories": [], "extractedInformation": []}';
    } catch (error) {
      console.error('Fehler bei der OpenAI API:', error);
      return '{"customerNumber": null, "category": "Sonstiges", "allCustomerNumbers": [], "allCategories": [], "extractedInformation": []}';
    }
  }

  
}

  function checkLlmResponse(
    response: string, 
    validCategories: string[],
    flowData: {category: string, columns: string[]}[]
  ):{ 
    customerNumber: string | null,
    category: string,
    allCustomerNumbers: string[],
    allCategories: string[],
    extractedInformation: object[]
  }{
    try {
      console.log('adgsvhjvkdf:', response);
      const result = JSON.parse(cleanJsonString(response));
      console.log('cleaned:', result);
      console.log('ChatGPT Multi-Analyse Ergebnis:', result);

      // Validiere die flows
      const validFlows = flowData.map(
        d => (d.category)
      );

      if (
        !(
          Object.keys(result).includes("customerNumber") &&
          Object.keys(result).includes("category") &&
          Object.keys(result).includes("allCustomerNumbers") &&
          Object.keys(result).includes("allCategories") &&
          Object.keys(result).includes("extractedInformation")
        )
      ) {
        console.log("response form LLM is missing attributes")
      }

      // Validiere Hauptkategorie
      if (!validCategories.includes(result.category)) {
        // wenn kategorie nicht valide ist, checke ob allcategories Array validen wert hat
        console.log("validCategories:")
        console.log(validCategories)
        console.log("result.category:")
        console.log(result.category)
        console.log("category not valid, searching in allCategories array for valid one")
        if (result.allCategories.length > 0) {
          const found = result.allCategories.find(
            (elem: string) => validCategories.includes(elem)
          )
          if (found) {
            console.log("found category: " + found + ", setting as main category.")
            result.category = found
          } else {
            console.log("nothing found, setting as main category to Sonstige.")
            result.category = 'Sonstiges';
          } 
        }
        console.log("allCategories is empty, setting as main category to Sonstige.")
        result.category = 'Sonstiges';
      }

      // Validiere alle Kategorien
      if (Array.isArray(result.allCategories)) {
        result.allCategories = result.allCategories.filter((cat: string) => validCategories.includes(cat));

        // Wenn keine gültigen Kategorien gefunden wurden, verwende die Hauptkategorie
        if (result.allCategories.length === 0 ) {
          console.log("allCategories contains no valid categories, trying to set to Main Category.")
          result.allCategories = [result.category || 'Sonstiges'];
        }
      } else {
        console.log("allCategories is not an Array, trying to set to Main Category.")
        result.allCategories = [result.category || 'Sonstiges'];
      }
        
      // Bereinige Kundennummern (entferne Duplikate und leere Werte)

      if (result.customerNumber) {
        result.customerNumber = result.customerNumber.toString().trim()
      }
      if (result.customerNumber === "null") {
        result.customerNumber = null
      }
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

      // Validiere flows
      if (Array.isArray(result.extractedInformation) && result.extractedInformation.length >= 0) {
        console.log("here is the extracted infor:")
        console.log(result.extractedInformation)
        console.log(validFlows)
        result.extractedInformation = result.extractedInformation.filter((elem: {name: string, data: object}) => 
          validFlows.includes(elem.name)
        );
        console.log("here is the extracted infor after filter:")
        console.log(result.extractedInformation)
        for (const fl of result.extractedInformation) {
          const foundFlow = flowData.find((elem) => { elem.category === fl.name })
          if(foundFlow){
            const llmExtractedInformationLength = Object.keys(fl.data).length
            const definedExtractedInformationLength = fl.foundFlow.columns.length
            if (
              (llmExtractedInformationLength === definedExtractedInformationLength) ||
              (llmExtractedInformationLength <= definedExtractedInformationLength)
            ) {
              for (const flowdatakey of foundFlow.columns) {
                if (Object.keys(fl.data).includes(flowdatakey)) {
                  continue
                } else {
                  console.log("LLM information extraction is missing an attribute. setting it to empty String")
                  fl.data[flowdatakey] = ""
                }
              }
            } else{
              for (const extractedflowdatakey of Object.keys(fl.data) ) {
                if (foundFlow.columns.includes(extractedflowdatakey)) {
                  continue
                } else {
                  console.log("LLM information extraction has extra attributes, removing them")
                  delete fl.data[extractedflowdatakey]
                }
              }
            }
          }
        }
      } else {
        result.extractedInformation = [];
      }
        
      console.log('Bereinigte Analyse-Ergebnisse:', {
        customerNumber: result.customerNumber,
        category: result.category,
        allCustomerNumbers: result.allCustomerNumbers,
        allCategories: result.allCategories,
        extractedInformation: result.extractedInformation
      });
        
      return {
        customerNumber: result.customerNumber,
        category: result.category,
        allCustomerNumbers: result.allCustomerNumbers,
        allCategories: result.allCategories,
        extractedInformation: result.extractedInformation
      };
    } catch (error) {
      console.error('Fehler beim Parsen der ChatGPT-Antwort:', error);
      return { 
        customerNumber: null, 
        category: 'Sonstiges',
        allCustomerNumbers: [],
        allCategories: ['Sonstiges'],
        extractedInformation: []
      };
    }
  }

function cleanJsonString(jsonString: string) {
  const pattern = /^```json\s*([\s\S]*?)\s*```$/;
  const match = jsonString.match(pattern);
  return match ? match[1].trim() : jsonString.trim();
}

export const openAIService = new OpenAIService();
export default OpenAIService; 