import React from 'react';

export default function UploadProgress({ uploadProgress }) {
  if (uploadProgress.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h3 className="text-lg font-semibold mb-4">Upload Progress</h3>
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {uploadProgress.map((item) => (
          <div key={item.id} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-700 truncate flex-1">{item.name}</span>
              <span className={`ml-2 ${
                item.status === 'completed' ? 'text-green-600' :
                item.status === 'error' ? 'text-red-600' :
                'text-blue-600'
              }`}>
                {item.status === 'completed' ? '✓ Done' :
                 item.status === 'error' ? '✗ Failed' :
                 `${item.progress}%`}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  item.status === 'completed' ? 'bg-green-500' :
                  item.status === 'error' ? 'bg-red-500' :
                  'bg-blue-500'
                }`}
                style={{ width: `${item.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}