import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { useState, useEffect } from 'react';

const MainLayout = () => {
  const [marginLeft, setMarginLeft] = useState<string>('ml-64');
  
  // Überwache Änderungen am Speicher für die Sidebar-Ausklappung
  useEffect(() => {
    const handleStorageChange = () => {
      const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
      setMarginLeft(isCollapsed ? 'ml-20' : 'ml-64');
    };
    
    // Initial setzen
    handleStorageChange();
    
    // Event-Listener für Speicher-Änderungen
    window.addEventListener('storage', handleStorageChange);
    
    // Spezielles Event für Sidebar-Änderungen innerhalb derselben Seite
    window.addEventListener('sidebarToggle', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sidebarToggle', handleStorageChange);
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />
      <main className={`flex-1 ${marginLeft} transition-all duration-300`}>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default MainLayout; 