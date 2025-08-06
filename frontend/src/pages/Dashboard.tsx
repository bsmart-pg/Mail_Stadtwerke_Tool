import React from 'react';
import { 
  EnvelopeIcon, 
  TagIcon, 
  ExclamationCircleIcon, 
  CheckCircleIcon
} from '@heroicons/react/24/outline';

const Dashboard: React.FC = () => {
  // Mock-Daten - würden in einer realen Anwendung von der API kommen
  const stats = [
    {
      id: 1,
      name: 'Neue E-Mails',
      value: '23',
      icon: EnvelopeIcon,
      color: 'bg-blue-100 text-blue-600',
    },
    {
      id: 2,
      name: 'Kategorisiert',
      value: '186',
      icon: TagIcon,
      color: 'bg-green-100 text-green-600',
    },
    {
      id: 3,
      name: 'Nicht kategorisierbar',
      value: '12',
      icon: ExclamationCircleIcon,
      color: 'bg-red-100 text-red-600',
    },
    {
      id: 4,
      name: 'Kundennummer fehlend',
      value: '5',
      icon: ExclamationCircleIcon,
      color: 'bg-orange-100 text-orange-600',
    },
  ];

  const categories = [
    { name: 'Zählerstandmeldungen', count: 76 },
    { name: 'Abschlagsänderung', count: 42 },
    { name: 'Bankverbindung zur Abbuchung', count: 34 },
    { name: 'Bankverbindung für Guthaben', count: 28 },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className={`rounded-full p-3 mr-4 ${stat.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-gray-500 text-sm">{stat.name}</p>
                  <h2 className="text-2xl font-bold">{stat.value}</h2>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Verteilung nach Kategorien</h2>
        <div className="space-y-4">
          {categories.map((category, index) => (
            <div key={index} className="flex items-center">
              <span className="text-gray-700 w-64">{category.name}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-4">
                <div 
                  className="bg-primary rounded-full h-4" 
                  style={{ width: `${(category.count / 180) * 100}%` }} 
                />
              </div>
              <span className="ml-4 text-gray-700">{category.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Letzte Aktivitäten</h2>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="flex items-center border-b border-gray-100 pb-3">
                <CheckCircleIcon className="w-5 h-5 text-green-500 mr-3" />
                <div>
                  <p className="text-sm font-medium">E-Mail kategorisiert als Zählerstandmeldung</p>
                  <p className="text-xs text-gray-500">Vor {item * 5} Minuten</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Hinweise</h2>
          <ul className="space-y-2">
            <li className="flex items-start">
              <ExclamationCircleIcon className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-sm">5 E-Mails ohne Kundennummer benötigen Ihre Aufmerksamkeit</p>
            </li>
            <li className="flex items-start">
              <ExclamationCircleIcon className="w-5 h-5 text-orange-500 mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-sm">12 E-Mails konnten nicht automatisch kategorisiert werden</p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 