import React, { useState, useEffect } from 'react';
import { Upload, Download, Trash2, File, FolderOpen, RefreshCw, CheckSquare, Square, Filter, X } from 'lucide-react';

const API_URL = 'http://192.168.0.103:6061/api';

export default function LocalFTP() {
  const [files, setFiles] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [timeFilter, setTimeFilter] = useState('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  useEffect(() => {
    fetchFiles();
  }, []);

  useEffect(() => {
    applyTimeFilter();
  }, [files, timeFilter]);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/files`);
      const data = await response.json();
      if (data.success) {
        setFiles(data.data || []);
      }
    } catch (error) {
      showMessage('Failed to fetch files', 'error');
    } finally {
      setLoading(false);
    }
  };

  const applyTimeFilter = () => {
    if (timeFilter === 'all') {
      setFilteredFiles(files);
      return;
    }

    const now = new Date();
    const filtered = files.filter(file => {
      const fileDate = new Date(file.modifiedTime);
      const diffHours = (now - fileDate) / (1000 * 60 * 60);
      const diffDays = diffHours / 24;

      switch (timeFilter) {
        case '1h': return diffHours <= 1;
        case '24h': return diffHours <= 24;
        case '7d': return diffDays <= 7;
        case '30d': return diffDays <= 30;
        default: return true;
      }
    });

    setFilteredFiles(filtered);
  };

  const handleMultipleUpload = async (e) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;

    // If more than 500 files, auto-compress to zip
    if (fileList.length > 500) {
      showMessage('More than 500 files detected. Creating zip archive...', 'info');
      await handleZipUpload(fileList);
      e.target.value = '';
      return;
    }

    // Initialize progress for each file
    const initialProgress = fileList.map((file, idx) => ({
      id: idx,
      name: file.name,
      progress: 0,
      status: 'pending'
    }));
    setUploadProgress(initialProgress);

    // Upload files concurrently with limit
    const concurrentLimit = 3;
    for (let i = 0; i < fileList.length; i += concurrentLimit) {
      const batch = fileList.slice(i, i + concurrentLimit);
      await Promise.all(
        batch.map((file, batchIdx) => uploadSingleFile(file, i + batchIdx))
      );
    }

    showMessage(`Successfully uploaded ${fileList.length} file(s)`, 'success');
    setTimeout(() => setUploadProgress([]), 2000);
    fetchFiles();
    e.target.value = '';
  };

  const uploadSingleFile = async (file, index) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadProgress(prev => prev.map((p, i) => 
        i === index ? { ...p, status: 'uploading', progress: 0 } : p
      ));

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(prev => prev.map((p, i) => 
            i === index ? { ...p, progress } : p
          ));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          setUploadProgress(prev => prev.map((p, i) => 
            i === index ? { ...p, status: 'completed', progress: 100 } : p
          ));
        } else {
          setUploadProgress(prev => prev.map((p, i) => 
            i === index ? { ...p, status: 'error' } : p
          ));
        }
      });

      xhr.addEventListener('error', () => {
        setUploadProgress(prev => prev.map((p, i) => 
          i === index ? { ...p, status: 'error' } : p
        ));
      });

      xhr.open('POST', `${API_URL}/upload`);
      xhr.send(formData);

      await new Promise((resolve) => {
        xhr.addEventListener('loadend', resolve);
      });
    } catch (error) {
      setUploadProgress(prev => prev.map((p, i) => 
        i === index ? { ...p, status: 'error' } : p
      ));
    }
  };

  const handleZipUpload = async (fileList) => {
    try {
      const response = await fetch(`${API_URL}/upload-zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileCount: fileList.length,
          message: 'Auto-compressed due to file count > 500'
        })
      });

      const data = await response.json();
      if (data.success) {
        showMessage('Files compressed and uploaded as ZIP', 'success');
        fetchFiles();
      }
    } catch (error) {
      showMessage('Failed to create zip archive', 'error');
    }
  };

  const handleDownloadSelected = async () => {
    if (selectedFiles.size === 0) return;

    const filesToDownload = Array.from(selectedFiles);
    
    for (const filename of filesToDownload) {
      await handleDownload(filename);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    showMessage(`Downloaded ${filesToDownload.length} file(s)`, 'success');
  };

  const handleDownload = async (filename) => {
    try {
      const response = await fetch(`${API_URL}/download/${filename}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      showMessage('Failed to download file', 'error');
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedFiles.size === 0) return;
    if (!window.confirm(`Delete ${selectedFiles.size} selected file(s)?`)) return;

    const filesToDelete = Array.from(selectedFiles);
    let successCount = 0;

    for (const filename of filesToDelete) {
      try {
        const response = await fetch(`${API_URL}/delete/${filename}`, {
          method: 'DELETE',
        });
        const data = await response.json();
        if (data.success) successCount++;
      } catch (error) {
        console.error('Delete error:', error);
      }
    }

    showMessage(`Deleted ${successCount} file(s)`, 'success');
    setSelectedFiles(new Set());
    fetchFiles();
  };

  const toggleFileSelection = (filename) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(filename)) {
        newSet.delete(filename);
      } else {
        newSet.add(filename);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedFiles.size === filteredFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredFiles.map(f => f.name)));
    }
  };

  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  const getFilterLabel = () => {
    const labels = {
      'all': 'All Time',
      '1h': 'Last Hour',
      '24h': 'Last 24 Hours',
      '7d': 'Last 7 Days',
      '30d': 'Last 30 Days'
    };
    return labels[timeFilter] || 'All Time';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
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

        {/* Upload Progress */}
        {uploadProgress.length > 0 && (
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
        )}

        {/* Message */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-100 text-green-800' :
            message.type === 'info' ? 'bg-blue-100 text-blue-800' :
            'bg-red-100 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {/* Actions Bar */}
        {selectedFiles.size > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6 flex items-center justify-between">
            <span className="text-indigo-900 font-medium">
              {selectedFiles.size} file(s) selected
            </span>
            <div className="flex gap-3">
              <button
                onClick={handleDownloadSelected}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Selected
              </button>
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected
              </button>
            </div>
          </div>
        )}

        {/* Files List */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-6 border-b flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-800">
              Files ({filteredFiles.length})
            </h2>
            <div className="relative">
              <button
                onClick={() => setShowFilterMenu(!showFilterMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                <Filter className="w-4 h-4" />
                {getFilterLabel()}
              </button>
              {showFilterMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-10">
                  {['all', '1h', '24h', '7d', '30d'].map(filter => (
                    <button
                      key={filter}
                      onClick={() => {
                        setTimeFilter(filter);
                        setShowFilterMenu(false);
                      }}
                      className={`w-full text-left px-4 py-2 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                        timeFilter === filter ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'
                      }`}
                    >
                      {getFilterLabel.call({ timeFilter: filter })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
              Loading files...
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <File className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No files found</p>
              <p className="text-sm mt-1">
                {timeFilter !== 'all' ? 'Try changing the time filter' : 'Upload a file to get started'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={toggleSelectAll}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        {selectedFiles.size === filteredFiles.length ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Modified
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredFiles.map((file) => (
                    <tr key={file.name} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleFileSelection(file.name)}
                          className="text-gray-500 hover:text-indigo-600"
                        >
                          {selectedFiles.has(file.name) ? (
                            <CheckSquare className="w-5 h-5 text-indigo-600" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <File className="w-5 h-5 text-gray-400 mr-3" />
                          <span className="text-sm font-medium text-gray-900">
                            {file.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatSize(file.size)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(file.modifiedTime)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDownload(file.name)}
                          className="text-indigo-600 hover:text-indigo-900 mr-4 inline-flex items-center gap-1"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-gray-600 text-sm">
          <p>Share this URL with users on your network: <strong>http://YOUR_LOCAL_IP:6061</strong></p>
        </div>
      </div>
    </div>
  );
}