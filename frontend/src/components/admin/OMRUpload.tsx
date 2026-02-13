import React, { useState, useCallback } from 'react';
import { Upload, FileText, CheckCircle, XCircle, AlertCircle, Loader } from 'lucide-react';
import axios from 'axios';

interface OMRJob {
  id: string;
  examId: number;
  imagePath: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  studentNumber?: string;
  confidence?: number;
  rawData?: any;
  errorMessage?: string;
}

interface OMRUploadProps {
  examId: number;
  onComplete?: (results: any[]) => void;
}

const OMRUpload: React.FC<OMRUploadProps> = ({ examId, onComplete }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [jobs, setJobs] = useState<{ jobId: string; filename: string; status?: OMRJob }[]>([]);
  const [formType, setFormType] = useState('YKS_STANDARD');
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(file =>
      file.type.startsWith('image/')
    );
    setFiles(prev => [...prev, ...droppedFiles]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...selectedFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    
    files.forEach(file => {
      formData.append('files', file);
    });
    formData.append('examId', examId.toString());
    formData.append('formType', formType);

    try {
      const response = await axios.post('/api/admin/omr/process-batch', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const uploadedJobs = response.data.jobs;
      setJobs(uploadedJobs);
      setFiles([]);

      // Poll for status updates
      pollJobStatuses(uploadedJobs.map((j: any) => j.jobId));
    } catch (error: any) {
      console.error('Upload error:', error);
      alert('Form yükleme hatası: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploading(false);
    }
  };

  const pollJobStatuses = async (jobIds: string[]) => {
    const pollInterval = setInterval(async () => {
      try {
        const statusPromises = jobIds.map(jobId =>
          axios.get(`/api/admin/omr/status/${jobId}`)
        );

        const responses = await Promise.all(statusPromises);
        const statuses = responses.map(r => r.data);

        setJobs(prev =>
          prev.map(job => {
            const status = statuses.find(s => s.id === job.jobId);
            return status ? { ...job, status } : job;
          })
        );

        // Stop polling if all jobs are completed or failed
        const allDone = statuses.every(s =>
          s.status === 'COMPLETED' || s.status === 'FAILED'
        );

        if (allDone) {
          clearInterval(pollInterval);
          if (onComplete) {
            const completedResults = statuses.filter(s => s.status === 'COMPLETED');
            onComplete(completedResults);
          }
        }
      } catch (error) {
        console.error('Status polling error:', error);
      }
    }, 2000); // Poll every 2 seconds

    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(pollInterval), 300000);
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="text-green-500" size={20} />;
      case 'FAILED':
        return <XCircle className="text-red-500" size={20} />;
      case 'PROCESSING':
        return <Loader className="text-blue-500 animate-spin" size={20} />;
      default:
        return <AlertCircle className="text-gray-400" size={20} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Form Type Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Form Tipi
        </label>
        <select
          value={formType}
          onChange={(e) => setFormType(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="YKS_STANDARD">YKS Standart Form</option>
          <option value="LGS_STANDARD">LGS Standart Form</option>
        </select>
      </div>

      {/* Drag and Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Upload className="mx-auto mb-4 text-gray-400" size={48} />
        <p className="text-lg font-medium text-gray-700 mb-2">
          Optik formları buraya sürükleyin
        </p>
        <p className="text-sm text-gray-500 mb-4">
          veya dosya seçmek için tıklayın
        </p>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors"
        >
          Dosya Seç
        </label>
        <p className="text-xs text-gray-400 mt-2">
          JPG, PNG, TIFF formatları desteklenir (Maks. 10MB)
        </p>
      </div>

      {/* Selected Files */}
      {files.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700">Seçilen Dosyalar ({files.length})</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <FileText className="text-gray-400" size={20} />
                  <span className="text-sm text-gray-700">{file.name}</span>
                  <span className="text-xs text-gray-500">
                    ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  <XCircle size={20} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={uploadFiles}
            disabled={uploading}
            className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {uploading ? 'Yükleniyor...' : `${files.length} Formu Yükle ve İşle`}
          </button>
        </div>
      )}

      {/* Processing Jobs */}
      {jobs.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700">İşleme Durumu</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {jobs.map((job, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg"
              >
                <div className="flex items-center space-x-3 flex-1">
                  {getStatusIcon(job.status?.status)}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">{job.filename}</p>
                    {job.status?.studentNumber && (
                      <p className="text-xs text-gray-500">
                        Öğrenci No: {job.status.studentNumber} (Güven: {(job.status.confidence! * 100).toFixed(1)}%)
                      </p>
                    )}
                    {job.status?.errorMessage && (
                      <p className="text-xs text-red-500">{job.status.errorMessage}</p>
                    )}
                  </div>
                </div>
                <span className="text-xs font-medium text-gray-500 uppercase">
                  {job.status?.status || 'PENDING'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OMRUpload;
