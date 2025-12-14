import React from 'react';

export default function MessageDisplay({ message }) {
  if (!message.text) return null;

  return (
    <div className={`mb-6 p-4 rounded-lg ${
      message.type === 'success' ? 'bg-green-100 text-green-800' :
      message.type === 'info' ? 'bg-blue-100 text-blue-800' :
      'bg-red-100 text-red-800'
    }`}>
      {message.text}
    </div>
  );
}