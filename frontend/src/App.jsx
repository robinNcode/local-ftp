import React, { useState, useEffect } from 'react';
import { Upload, Download, Trash2, File, FolderOpen, RefreshCw, CheckSquare, Square, Filter } from 'lucide-react';

const API_URL = 'http://192.168.0.102:6061/api';

export default function LocalFTP() {
  const [files, setFiles] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [timeFilter, setTimeFilter] = useState('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Detect if device is iOS
  const isIOS = () => {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) || 
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };

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

  // ✨ FIXED FOR iOS - This is the main upload handler
  const handleMultipleUpload = async (e) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;

    // 🔥 CRITICAL: Close file picker immediately on iOS
    e.target.blur();
    
    // Show loading state immediately
    showMessage(`Processing ${fileList.length} file(s)...`, 'info');

    // Small delay to let UI update on iOS
    await new Promise(resolve => setTimeout(resolve, 100));

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

    // 🔥 iOS uploads one file at a time, others can do 3 concurrent
    const concurrentLimit = isIOS() ? 1 : 3;
    let successCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < fileList.length; i += concurrentLimit) {
      const batch = fileList.slice(i, i + concurrentLimit);
      
      // Use Promise.allSettled to handle individual failures
      const results = await Promise.allSettled(
        batch.map((file, batchIdx) => uploadSingleFile(file, i + batchIdx))
      );
      
      // Count successes and failures
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          successCount++;
        } else {
          failedCount++;
        }
      });
      
      // 🔥 Small delay between batches for iOS stability
      if (isIOS() && i + concurrentLimit < fileList.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Show final result
    const resultMessage = failedCount > 0 
      ? `Uploaded ${successCount}/${fileList.length} files (${failedCount} failed)`
      : `Successfully uploaded ${successCount} file(s)`;
    
    showMessage(resultMessage, failedCount > 0 ? 'error' : 'success');
    setTimeout(() => setUploadProgress([]), 2000);
    fetchFiles();
    e.target.value = '';
  };

  // ✨ FIXED FOR iOS - Using fetch instead of XMLHttpRequest
  const uploadSingleFile = async (file, index) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadProgress(prev => prev.map((p, i) => 
        i === index ? { ...p, status: 'uploading', progress: 50 } : p
      ));

      // 🔥 Use fetch with timeout for better iOS compatibility
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        setUploadProgress(prev => prev.map((p, i) => 
          i === index ? { ...p, status: 'completed', progress: 100 } : p
        ));
        return true;
      } else {
        throw new Error(`Upload failed with status ${response.status}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadProgress(prev => prev.map((p, i) => 
        i === index ? { ...p, status: 'error', progress: 0 } : p
      ));
      return false;
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

  const getFilterLabel = (filter) => {
    const labels = {
      'all': 'All Time',
      '1h': 'Last Hour',
      '24h': 'Last 24 Hours',
      '7d': 'Last 7 Days',
      '30d': 'Last 30 Days'
    };
    return labels[filter] || 'All Time';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 flex items-center gap-3">
                <FolderOpen className="text-indigo-600" />
                Local FTP Server
              </h1>
              <p className="text-gray-600 mt-2 text-sm sm:text-base">Share files on your local network</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={fetchFiles}
                disabled={loading}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <label className="flex items-center justify-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-colors">
                <Upload className="w-5 h-5" />
                Upload Files
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*,application/pdf,application/zip,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={handleMultipleUpload}
                  className="hidden"
                  capture={undefined}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Upload Progress */}
        {uploadProgress.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Upload Progress</h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {uploadProgress.map((item) => (
                <div key={item.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700 truncate flex-1 pr-2">{item.name}</span>
                    <span className={`flex-shrink-0 ${
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
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <span className="text-indigo-900 font-medium">
              {selectedFiles.size} file(s) selected
            </span>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleDownloadSelected}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Selected
              </button>
              <button
                onClick={handleDeleteSelected}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected
              </button>
            </div>
          </div>
        )}

        {/* Files List */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-4 sm:p-6 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-xl font-semibold text-gray-800">
              Files ({filteredFiles.length})
            </h2>
            <div className="relative">
              <button
                onClick={() => setShowFilterMenu(!showFilterMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors w-full sm:w-auto"
              >
                <Filter className="w-4 h-4" />
                {getFilterLabel(timeFilter)}
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
                      {getFilterLabel(filter)}
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
                    <th className="px-4 sm:px-6 py-3 text-left">
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
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                      Size
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                      Modified
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredFiles.map((file) => (
                    <tr key={file.name} className="hover:bg-gray-50">
                      <td className="px-4 sm:px-6 py-4">
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
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center">
                          <File className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {file.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden sm:table-cell">
                        {formatSize(file.size)}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell">
                        {formatDate(file.modifiedTime)}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDownload(file.name)}
                          className="text-indigo-600 hover:text-indigo-900 inline-flex items-center gap-1"
                        >
                          <Download className="w-4 h-4" />
                          <span className="hidden sm:inline">Download</span>
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
        <div className="mt-6 text-center text-gray-600 text-xs sm:text-sm">
          <p>Share this URL: <strong className="break-all">http://192.168.0.105:6061</strong></p>
        </div>
      </div>
    </div>
  );
}