import React, { useState , useEffect} from 'react';
import { PlusIcon, XMarkIcon, PlayIcon, ChevronDownIcon, TrashIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { 
  getCategories,
  getFlows,
  deleteFlows,
  saveFlows,
  getExistingFlowCategories,
  getEmailsByCategory
} from '../services/SupabaseService';
import { v4 as uuidv4 } from 'uuid';
import { copyFileSync } from 'fs';

// Mock function to simulate loading flows
const loadFlows = async () => {
  // Simulate a fetch call
  const data = (await getFlows()).map(
    (elem) => {
      return {
        id: elem.id,
        name: elem.category_name,
        columns: elem.extraction_columns.map(
          (elem2) => {
            return {
              id: uuidv4().toString(),
              name: elem2
            }
          }
        )
      }
    }
  )
  return data;
};

const loadedData = await getCategories();
  
  const categoryOptions = loadedData.map(
      cat => (cat.category_name)
    )

interface FlowColumn {
  id: string;
  name: string;
}

interface Flow {
  id: string;
  name: string;
  columns: FlowColumn[];
}

const Flows: React.FC = () => {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [newFlow, setNewFlow] = useState({
    name: '',
    columns: [] as FlowColumn[]
  });
  const [executingFlow, setExecutingFlow] = useState<string | null>(null);
  const [executionDates, setExecutionDates] = useState<{
    startDate: string;
    endDate: string;
  }>({
    startDate: '',
    endDate: ''
  });

  const addColumn = () => {
    const newColumn: FlowColumn = {
      id: Date.now().toString(),
      name: ''
    };
    setNewFlow({
      ...newFlow,
      columns: [...newFlow.columns, newColumn]
    });
  };

  const removeColumn = (columnId: string) => {
    setNewFlow({
      ...newFlow,
      columns: newFlow.columns.filter(col => col.id !== columnId)
    });
  };

  const updateColumnName = (columnId: string, name: string) => {
    setNewFlow({
      ...newFlow,
      columns: newFlow.columns.map(col =>
        col.id === columnId ? { ...col, name } : col
      )
    });
  };

  const selectCategory = (category: string) => {
    setNewFlow({ ...newFlow, name: category });
    setIsDropdownOpen(false);
  };

  const createFlow = async() => {
    if (newFlow.name.trim() && newFlow.columns.length > 0) {
      const flow: Flow = {
        id: Date.now().toString(),
        name: newFlow.name,
        columns: newFlow.columns.filter(col => col.name.trim() !== '')
      };
      const existingFlowCats = await getExistingFlowCategories()
      if (existingFlowCats.includes(newFlow.name)){
        alert("Für diese Kategorie existiert bereits ein Flow.")
      }
      else{
        setFlows([...flows, flow]);
        await saveFlows(flow.name, flow.columns.map((elem) => {return elem.name}))
        
      }
      setNewFlow({ name: '', columns: [] });
      setIsAddingNew(false);
    }
  };

  const deleteFlow = async(flowId: string) => {
    if (window.confirm('Sind Sie sicher, dass Sie diesen Flow löschen möchten?')) {
      const flow = flows.filter(flow => flow.id === flowId)[0]
      console.log(flow)
      console.log(flow.name)
      console.log(flow.columns.map((elem) => {return elem.name}))
      await deleteFlows(flow.name, flow.columns.map((elem) => {return elem.name}));
      setFlows(flows.filter(flow => flow.id !== flowId));
    }
  };

  const executeFlow = async(flow: Flow) => {
    console.log('Executing flow:', {
      name: flow.name,
      columns: flow.columns
    });

    setExecutingFlow(flow.id);
    setExecutionDates({ startDate: '', endDate: '' });
  };

  const confirmExecution = async(flow: Flow) => {
    if (executionDates.startDate && executionDates.endDate) {
      console.log('Executing flow:', {
        name: flow.name,
        columns: flow.columns,
        startDate: executionDates.startDate,
        endDate: executionDates.endDate
      });

      const data = await getEmailsByCategory(flow.name, executionDates.startDate, executionDates.endDate)
      console.log(data)
      const init_map = new Map();
      for(let i = 0; i < flow.columns.length; i++){
          init_map.set(flow.columns[i].name, []);
      };
      console.log(init_map)
      const result = Object.fromEntries(init_map)
      console.log("result")
      console.log(result)
      for(const mail of data){
        const extracted_information = mail.extracted_information
        console.log(extracted_information)
        const relevant_information = extracted_information.find((elem) => elem.name === flow.name)
        console.log(relevant_information["data"])
        for (const datakey of Object.keys(relevant_information["data"])){
          console.log("datakey")
          console.log(datakey)
          result[datakey].push(relevant_information["data"][datakey])
        }
      } 
      console.log("result")
      console.log(result)
      const csvdata = csvmaker(result)
      download(csvdata, flow.name);
      setExecutingFlow(null);
      setExecutionDates({ startDate: '', endDate: '' });
    }
  };

  const cancelExecution = () => {
    setExecutingFlow(null);
    setExecutionDates({ startDate: '', endDate: '' });
  };

  const cancelAddFlow = () => {
    setNewFlow({ name: '', columns: [] });
    setIsAddingNew(false);
  };


  useEffect(() => {
    const fetchFlows = async () => {
      const data = await loadFlows();
      setFlows(data);
    };

    fetchFlows();
  }, []);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Flows</h1>
        <button
          onClick={() => setIsAddingNew(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Neuen Flow hinzufügen
        </button>
      </div>

      {isAddingNew && (
        <div className="bg-white p-6 rounded-lg shadow-md mb-6 border">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Neuen Flow erstellen</h2>
            <button
              onClick={() => {
                setIsAddingNew(false);
                setNewFlow({ name: '', columns: [] });
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Kategorie
            </label>
            <div className="relative">
              <button
                type="button"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white text-left flex items-center justify-between"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                <span className={newFlow.name ? 'text-gray-900' : 'text-gray-500'}>
                  {newFlow.name || 'Kategorie auswählen'}
                </span>
                <ChevronDownIcon className="h-5 w-5 text-gray-400" />
              </button>
              
              {isDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg">
                  {categoryOptions.map((category) => (
                    <button
                      key={category}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                      onClick={() => selectCategory(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Spalten
              </label>
              <button
                onClick={addColumn}
                className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-primary bg-blue-100 hover:bg-blue-200"
              >
                <PlusIcon className="h-3 w-3 mr-1" />
                Spalte hinzufügen
              </button>
            </div>
            
            <div className="space-y-2">
              {newFlow.columns.map((column) => (
                <div key={column.id} className="flex items-center space-x-2">
                  <input
                    type="text"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    value={column.name}
                    onChange={(e) => updateColumnName(column.id, e.target.value)}
                    placeholder="Spaltenname eingeben"
                  />
                  <button
                    onClick={() => removeColumn(column.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
              
              </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              onClick={() => {
                setIsAddingNew(false);
                setNewFlow({ name: '', columns: [] });
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Abbrechen
            </button>
            <button
              onClick={createFlow}
              disabled={!newFlow.name || newFlow.columns.length === 0}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Flow erstellen
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {flows.map((flow) => (
          <div key={flow.id} className="bg-white p-6 rounded-lg shadow-md border">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{flow.name}</h3>
              <button
                onClick={() => deleteFlow(flow.id)}
                className="text-red-500 hover:text-red-700"
                title="Flow löschen"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Spalten:</p>
              <div className="space-y-1">
                {flow.columns.map((column) => (
                  <span
                    key={column.id}
                    className="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded mr-2 mb-1"
                  >
                    {column.name}
                  </span>
                ))}
              </div>
            </div>
            
            {executingFlow === flow.id ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Startdatum
                    </label>
                    <input
                      type="date"
                      value={executionDates.startDate}
                      onChange={(e) => setExecutionDates({
                        ...executionDates,
                        startDate: e.target.value
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Enddatum
                    </label>
                    <input
                      type="date"
                      value={executionDates.endDate}
                      onChange={(e) => setExecutionDates({
                        ...executionDates,
                        endDate: e.target.value
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => confirmExecution(flow)}
                    disabled={!executionDates.startDate || !executionDates.endDate}
                    className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-secondary hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <PlayIcon className="h-4 w-4 mr-1" />
                    CSV herunterladen
                  </button>
                  <button
                    onClick={cancelExecution}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => executeFlow(flow)}
                className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-secondary hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary"
              >
                <PlayIcon className="h-4 w-4 mr-2" />
                CSV herunterladen
              </button>
            )}
          </div>
        ))}
      </div>

      {flows.length === 0 && !isAddingNew && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">Noch keine Flows erstellt</p>
          <p className="text-gray-400 text-sm mt-2">
            Klicken Sie auf "Neuen Flow hinzufügen", um zu beginnen
          </p>
        </div>
      )}
    </div>
  );
};


// Function to download the CSV file
const download = (data, flowname: string) => {
    // Create a Blob with the CSV data and type
    const blob = new Blob([data], { type: 'text/csv' });
    
    // Create a URL for the Blob
    const url = URL.createObjectURL(blob);
    
    // Create an anchor tag for downloading
    const a = document.createElement('a');
    
    // Set the URL and download attribute of the anchor tag
    a.href = url;
    a.download = flowname + "-" + Date.now() + '.csv';
    
    // Trigger the download by clicking the anchor tag
    a.click();
}


const csvmaker = (data) => {
  const keys = Object.keys(data); // z.B. ["Zählerstand", "Zählernummer"]
  
  // Anzahl der Zeilen anhand des längsten Arrays bestimmen
  const maxLength = Math.max(...keys.map(key => data[key].length));

  // Header (Spaltenüberschriften)
  const header = keys.join(",");

  // Rows (Datenzeilen)
  const rows = [];
  for (let i = 0; i < maxLength; i++) {
    const row = keys.map(key => data[key][i].replace(",", ".") || "").join(",");
    rows.push(row);
  }

  // CSV als String
  return [header, ...rows].join("\n");
}


export default Flows;