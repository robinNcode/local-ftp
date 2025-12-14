import React from 'react';
import { Upload, FolderOpen, RefreshCw } from 'lucide-react';

export default function Header({ loading, fetchFiles, handleMultipleUpload }) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <FolderOpen className="text-indigo-600" />
            Local FTP Server
          </h1>
          <p className="text-gray-600 mt-2">Share files on your local network</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchFiles}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <label className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-colors">
            <Upload className="w-5 h-5" />
            Upload Files
            <input
              type="file"
              multiple
              onChange={handleMultipleUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
}