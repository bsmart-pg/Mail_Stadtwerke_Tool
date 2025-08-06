import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Emails from './pages/Emails';
import Categories from './pages/Categories';
import Settings from './pages/Settings';
import Flows from './pages/Flows';
import Statistics from './pages/Statistics';
import PasswordProtection from './components/PasswordProtection';
import './App.css';

function App() {
  return (
    <PasswordProtection>
      <Router>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="emails" element={<Emails />} />
            <Route path="categories" element={<Categories />} />
            <Route path="statistics" element={<Statistics />} />
            <Route path="flows" element={<Flows />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </Router>
    </PasswordProtection>
  );
}

export default App; 