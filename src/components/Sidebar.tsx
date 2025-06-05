import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  HomeIcon, 
  EnvelopeIcon,
  TagIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';

// Benutzerdefiniertes Event für die Seitenleistenumschaltung
const sidebarToggleEvent = new Event('sidebarToggle');

const Sidebar = () => {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Initialzustand aus localStorage lesen
    const savedState = localStorage.getItem('sidebarCollapsed');
    return savedState === 'true';
  });

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: HomeIcon },
    { name: 'E-Mails', path: '/emails', icon: EnvelopeIcon },
    { name: 'Kategorien', path: '/categories', icon: TagIcon },
    { name: 'Statistiken', path: '/statistics', icon: ChartBarIcon },
    { name: 'Einstellungen', path: '/settings', icon: Cog6ToothIcon },
  ];
  
  // Aktualisiere localStorage, wenn sich isCollapsed ändert
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', isCollapsed.toString());
    window.dispatchEvent(sidebarToggleEvent);
  }, [isCollapsed]);

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className={`bg-dark text-white fixed h-screen transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'} overflow-y-auto z-50`}>
      <div className="flex items-center justify-center py-4 border-b border-gray-700 sticky top-0 bg-dark">
        {!isCollapsed ? (
          <div className="flex items-center">
            <img src="/logo.png" alt="Logo" className="h-8" />
          </div>
        ) : (
          <img src="/logo.png" alt="Logo" className="h-8" />
        )}
      </div>
      
      <nav className="mt-6">
        <ul>
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.name} className="mb-2">
                <Link
                  to={item.path}
                  className={`flex items-center px-4 py-3 ${
                    location.pathname === item.path
                      ? 'bg-primary text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  } rounded-md transition-all duration-200 mx-2`}
                >
                  <Icon className="w-6 h-6" />
                  {!isCollapsed && (
                    <span className="ml-3">{item.name}</span>
                  )}
                </Link>
              </li>
            );
          })}
          
          {/* Einklapp-Button in der Navigationsliste */}
          <li className="mb-2">
            <button
              onClick={toggleSidebar}
              className="flex items-center px-4 py-3 text-gray-300 hover:bg-gray-700 rounded-md transition-all duration-200 mx-2 w-full"
            >
              {isCollapsed ? (
                <ChevronRightIcon className="w-6 h-6" />
              ) : (
                <>
                  <ChevronLeftIcon className="w-6 h-6" />
                  <span className="ml-3">Einklappen</span>
                </>
              )}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar; 