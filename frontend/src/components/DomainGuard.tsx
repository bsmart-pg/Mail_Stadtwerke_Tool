import React, { useEffect, useState } from 'react';
import { isValidDomain, enforceHTTPS } from '../config/domain';

interface DomainGuardProps {
  children: React.ReactNode;
}

const DomainGuard: React.FC<DomainGuardProps> = ({ children }) => {
  const [isValidAccess, setIsValidAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Enforce HTTPS
    enforceHTTPS();
    
    // Check domain validity
    const valid = isValidDomain();
    setIsValidAccess(valid);
    setIsLoading(false);
    
    if (!valid) {
      console.warn('Access from unauthorized domain detected');
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying secure connection...</p>
        </div>
      </div>
    );
  }

  if (!isValidAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg border border-gray-200 p-6 text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            This application can only be accessed from authorized domains.
          </p>
          <p className="text-sm text-gray-500">
            Please contact the administrator if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default DomainGuard;