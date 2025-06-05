import React, { useState } from 'react';
import { 
  PlusIcon, 
  TrashIcon, 
  PencilIcon,
  CheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

interface Category {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  count: number;
}

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([
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
    {
      id: '3',
      name: 'Bankverbindungen zur Abbuchung',
      description: 'Mitteilungen zu Bankverbindungen für Lastschriftverfahren',
      keywords: ['sepa', 'lastschrift', 'bankverbindung', 'abbuchung', 'konto'],
      count: 34
    },
    {
      id: '4',
      name: 'Bankverbindung für Guthaben',
      description: 'Mitteilungen zu Bankverbindungen für Gutschriften',
      keywords: ['guthaben', 'rückzahlung', 'überweisung', 'bankverbindung', 'konto'],
      count: 28
    }
  ]);
  
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<Category>({
    id: '',
    name: '',
    description: '',
    keywords: [],
    count: 0
  });
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  
  const addKeyword = () => {
    if (keywordInput.trim() === '') return;
    
    if (isAddingNew) {
      setNewCategory({
        ...newCategory,
        keywords: [...newCategory.keywords, keywordInput.trim()]
      });
    } else if (editingCategory) {
      setCategories(cats => 
        cats.map(cat => 
          cat.id === editingCategory 
            ? { ...cat, keywords: [...cat.keywords, keywordInput.trim()] } 
            : cat
        )
      );
    }
    
    setKeywordInput('');
  };
  
  const removeKeyword = (keyword: string) => {
    if (isAddingNew) {
      setNewCategory({
        ...newCategory,
        keywords: newCategory.keywords.filter(k => k !== keyword)
      });
    } else if (editingCategory) {
      setCategories(cats => 
        cats.map(cat => 
          cat.id === editingCategory 
            ? { ...cat, keywords: cat.keywords.filter(k => k !== keyword) } 
            : cat
        )
      );
    }
  };
  
  const handleSaveCategory = () => {
    if (isAddingNew) {
      const id = `${categories.length + 1}`;
      setCategories([...categories, { ...newCategory, id }]);
      setNewCategory({
        id: '',
        name: '',
        description: '',
        keywords: [],
        count: 0
      });
      setIsAddingNew(false);
    } else if (editingCategory) {
      setEditingCategory(null);
    }
  };
  
  const handleDeleteCategory = (id: string) => {
    setCategories(categories.filter(cat => cat.id !== id));
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, field: keyof Category) => {
    if (isAddingNew) {
      setNewCategory({
        ...newCategory,
        [field]: e.target.value
      });
    } else if (editingCategory) {
      setCategories(cats => 
        cats.map(cat => 
          cat.id === editingCategory 
            ? { ...cat, [field]: e.target.value } 
            : cat
        )
      );
    }
  };
  
  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Kategorien</h1>
        <button
          className="bg-primary text-white px-4 py-2 rounded-md flex items-center"
          onClick={() => {
            setIsAddingNew(true);
            setEditingCategory(null);
          }}
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Neue Kategorie
        </button>
      </div>
      
      {isAddingNew && (
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Neue Kategorie erstellen</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={newCategory.name}
                onChange={(e) => handleChange(e, 'name')}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Beschreibung
              </label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={newCategory.description}
                onChange={(e) => handleChange(e, 'description')}
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Schlüsselwörter
              </label>
              <div className="flex mb-2">
                <input
                  type="text"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-primary"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                  placeholder="Neues Schlüsselwort hinzufügen..."
                />
                <button 
                  className="bg-primary text-white px-4 py-2 rounded-r-md"
                  onClick={addKeyword}
                >
                  Hinzufügen
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {newCategory.keywords.map((keyword, idx) => (
                  <div key={idx} className="flex items-center bg-gray-100 px-3 py-1 rounded-full">
                    <span className="text-sm mr-2">{keyword}</span>
                    <button
                      className="text-gray-500 hover:text-red-500"
                      onClick={() => removeKeyword(keyword)}
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex justify-end mt-6 space-x-3">
            <button
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              onClick={() => setIsAddingNew(false)}
            >
              Abbrechen
            </button>
            <button
              className="bg-primary text-white px-4 py-2 rounded-md"
              onClick={handleSaveCategory}
              disabled={!newCategory.name}
            >
              Kategorie speichern
            </button>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 gap-6">
        {categories.map((category) => (
          <div key={category.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">
                {editingCategory === category.id ? (
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    value={category.name}
                    onChange={(e) => handleChange(e, 'name')}
                  />
                ) : (
                  <span>{category.name}</span>
                )}
              </h2>
              <div className="flex space-x-2">
                {editingCategory === category.id ? (
                  <button
                    className="text-green-600 hover:text-green-800"
                    onClick={handleSaveCategory}
                  >
                    <CheckIcon className="h-5 w-5" />
                  </button>
                ) : (
                  <button
                    className="text-gray-600 hover:text-gray-800"
                    onClick={() => {
                      setEditingCategory(category.id);
                      setIsAddingNew(false);
                    }}
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                )}
                <button
                  className="text-red-600 hover:text-red-800"
                  onClick={() => handleDeleteCategory(category.id)}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-500 mb-1">Beschreibung</h3>
              {editingCategory === category.id ? (
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  value={category.description}
                  onChange={(e) => handleChange(e, 'description')}
                />
              ) : (
                <p className="text-gray-700">{category.description}</p>
              )}
            </div>
            
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-500 mb-1">Schlüsselwörter</h3>
              {editingCategory === category.id ? (
                <>
                  <div className="flex mb-2">
                    <input
                      type="text"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-primary"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                      placeholder="Neues Schlüsselwort hinzufügen..."
                    />
                    <button 
                      className="bg-primary text-white px-4 py-2 rounded-r-md"
                      onClick={addKeyword}
                    >
                      Hinzufügen
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {category.keywords.map((keyword, idx) => (
                      <div key={idx} className="flex items-center bg-gray-100 px-3 py-1 rounded-full">
                        <span className="text-sm mr-2">{keyword}</span>
                        <button
                          className="text-gray-500 hover:text-red-500"
                          onClick={() => removeKeyword(keyword)}
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {category.keywords.map((keyword, idx) => (
                    <span key={idx} className="bg-gray-100 px-3 py-1 rounded-full text-sm">
                      {keyword}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-gray-500">Zugeordnete E-Mails</h3>
              <span className="bg-primary bg-opacity-10 text-primary font-medium px-3 py-1 rounded-full">
                {category.count}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Categories; 