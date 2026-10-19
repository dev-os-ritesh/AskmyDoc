import { useState, useRef, useCallback } from 'react';
import { API_BASE } from '../config.js';

/**
 * UploadBox — drag-and-drop or click to select a .txt or .pdf file, then upload.
 * Calls onSuccess({ documentId, filename }) on success.
 */
export default function UploadBox({ onSuccess }) {
  const [file,      setFile]      = useState(null);
  const [dragging,  setDragging]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState(null);
  const inputRef = useRef(null);

  // Validate file type before accepting
  function acceptFile(f) {
    if (!f) return;
    const name = f.name.toLowerCase();
    if (!name.endsWith('.txt') && !name.endsWith('.pdf')) {
      setError('Please upload a .txt or .pdf file.');
      return;
    }
    setError(null);
    setFile(f);
  }

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files[0]);
  }, []);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);

    const form = new FormData();
    form.append('file', file);

    try {
      const res  = await fetch(`${API_BASE}/api/documents`, { method: 'POST', body: form });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Upload failed. Please try again.');
        return;
      }
      onSuccess({ documentId: data.documentId, filename: file.name });
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setUploading(false);
    }
  }

  // Pick icon based on file type
  const fileIcon = file?.name?.endsWith('.pdf') ? '📕' : '📄';

  return (
    <div className="card" style={{ animationDelay: '0.1s' }}>
      <div className="card-label">Step 1 — Upload document</div>

      {/* Drop zone */}
      <div
        id="upload-dropzone"
        className={`upload-zone ${dragging ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !file && inputRef.current?.click()}
        role="button"
        aria-label="Upload text or PDF file"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          id="file-input"
          accept=".txt,.pdf,text/plain,application/pdf"
          onChange={(e) => acceptFile(e.target.files[0])}
          style={{ display: 'none' }}
        />

        <span className="upload-icon">{file ? '✅' : '📂'}</span>

        {file ? (
          <>
            <h3>File ready to upload</h3>
            <div className="file-info">
              <span>{fileIcon}</span>
              <span>{file.name}</span>
              <span style={{ color: 'var(--text-muted)' }}>
                ({(file.size / 1024).toFixed(1)} KB)
              </span>
            </div>
          </>
        ) : (
          <>
            <h3>Drop your file here</h3>
            <p>Supports <strong>.txt</strong> and <strong>.pdf</strong> — click to browse</p>
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
          ⚠ {error}
        </p>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
        {file && (
          <button
            className="btn btn-ghost"
            id="clear-file-btn"
            onClick={() => { setFile(null); setError(null); }}
            disabled={uploading}
          >
            Clear
          </button>
        )}
        <button
          className="btn btn-primary btn-full"
          id="upload-btn"
          onClick={handleUpload}
          disabled={!file || uploading}
        >
          {uploading ? (
            <><div className="spinner" /> Uploading…</>
          ) : (
            '⬆ Upload & Analyse'
          )}
        </button>
      </div>
    </div>
  );
}
