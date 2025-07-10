import React, { useState , useEffect} from 'react';
import { 
  PlusIcon, 
  TrashIcon, 
  PencilIcon,
  CheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { saveMultipleSettings, getSettings, deleteCategories, getCategories, saveCategories } from '../services/SupabaseService';


interface Category {
  name: string;
  description: string;
}

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');  
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<Category>({
    name: '',
    description: '',
  });
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  

  // Load categories from Supabase when component mounts
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setLoading(true);
        setError('');
        console.log('Loading categories from Supabase...');
        
        const data = await getCategories();
        console.log('Categories loaded:', data.length);
        console.log('Categories:', data);

        setCategories(data.map(
          cat => ({
            name: cat.category_name,
            description: cat.category_description
          })
        ));
      } catch (err) {
        console.error('Error loading categories:', err);
        setError('Fehler beim Laden der Kategorien');
      } finally {
        setLoading(false);
      }
    };

    loadCategories();
  }, []);

  
  const handleSaveCategory = () => {
    if (isAddingNew) {
      saveCategories(newCategory.name, newCategory.description)
      setCategories([...categories, { ...newCategory }]);
      setNewCategory({
        name: '',
        description: '',
      });
      setIsAddingNew(false);
    } else if (editingCategory) {
      saveCategories(newCategory.name, newCategory.description)
      setEditingCategory(null);
    }
  };
  
  const handleDeleteCategory = (name: string, description: string) => {
    deleteCategories(name, description)
    setCategories(categories.filter(cat => (cat.name !== name && cat.description != description)));
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
          cat.name === editingCategory 
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
          <div key={category.name} className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">
                {editingCategory === category.name ? (
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
                {editingCategory === category.name ? (
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
                      setEditingCategory(category.name);
                      setIsAddingNew(false);
                    }}
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                )}
                <button
                  className="text-red-600 hover:text-red-800"
                  
                  onClick={() => {
                    if (window.confirm(`Sind Sie sicher, dass Sie die Kategorie "${category.name}" löschen möchten?`)) {
                      handleDeleteCategory(category.name, category.description)
                    }
                  }}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-500 mb-1">Beschreibung</h3>
              {editingCategory === category.name ? (
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  value={category.description}
                  onChange={(e) => handleChange(e, 'description')}
                />
              ) : (
                <p className="text-gray-700">{category.description}</p>
              )}
            </div>
            
          </div>
        ))}
      </div>
    </div>
  );
};

export default Categories; 