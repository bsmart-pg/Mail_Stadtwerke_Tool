import React, { useState, useEffect } from 'react';
import { XMarkIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import GraphService from '../services/GraphService';

interface EmailEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: () => void;
  recipientEmail: string;
  recipientName?: string;
  originalSubject: string;
  originalContent: string;
  originalDate: string;
  originalSender: string;
  defaultTemplate: string;
}

const EmailEditor: React.FC<EmailEditorProps> = ({
  isOpen,
  onClose,
  onSend,
  recipientEmail,
  recipientName,
  originalSubject,
  originalContent,
  originalDate,
  originalSender,
  defaultTemplate
}) => {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Initialisiere die Felder beim Öffnen
  useEffect(() => {
    if (isOpen) {
      setTo(recipientEmail);
      setSubject(`RE: ${originalSubject}`);
      
      // Erstelle die vollständige E-Mail mit Template und Original-Verlauf
      let fullMessage = defaultTemplate;
      fullMessage += '\n\n';
      fullMessage += '------- Ursprüngliche Nachricht -------\n';
      fullMessage += `Von: ${recipientName || originalSender} <${recipientEmail}>\n`;
      fullMessage += `Gesendet: ${originalDate}\n`;
      fullMessage += `Betreff: ${originalSubject}\n\n`;
      fullMessage += originalContent;
      
      setMessage(fullMessage);
      setError('');
    }
  }, [isOpen, recipientEmail, recipientName, originalSubject, originalContent, originalDate, originalSender, defaultTemplate]);

  const handleSend = async () => {
    if (!to.trim() || !subject.trim() || !message.trim()) {
      setError('Bitte füllen Sie alle Felder aus.');
      return;
    }

    try {
      setSending(true);
      setError('');

      await GraphService.sendEmail(subject, message, [to]);
      
      onSend();
      onClose();
    } catch (error) {
      console.error('Fehler beim Senden der E-Mail:', error);
      setError('Fehler beim Senden der E-Mail: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">E-Mail bearbeiten und senden</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            {/* Empfänger */}
            <div>
              <label htmlFor="to" className="block text-sm font-medium text-gray-700 mb-1">
                An:
              </label>
              <input
                type="email"
                id="to"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="empfaenger@example.com"
              />
            </div>

            {/* Betreff */}
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                Betreff:
              </label>
              <input
                type="text"
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="E-Mail Betreff"
              />
            </div>

            {/* Nachricht */}
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                Nachricht:
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={20}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                placeholder="Ihre Nachricht..."
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            disabled={sending}
          >
            Abbrechen
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Wird gesendet...
              </>
            ) : (
              <>
                <PaperAirplaneIcon className="w-4 h-4 mr-2" />
                E-Mail senden
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailEditor; 