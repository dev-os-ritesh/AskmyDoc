import { useState } from 'react';
import { API_BASE } from './config.js';
import UploadBox  from './components/UploadBox.jsx';
import AskForm    from './components/AskForm.jsx';
import AnswerCard from './components/AnswerCard.jsx';
import SourcePanel from './components/SourcePanel.jsx';

export default function App() {
  // ── State ───────────────────────────────────────────────────────────────
  const [documentId,   setDocumentId]   = useState(null);
  const [documentName, setDocumentName] = useState('');
  const [result,       setResult]       = useState(null);   // { found, answer, sources }
  const [asking,       setAsking]       = useState(false);
  const [askError,     setAskError]     = useState(null);

  // ── Handlers ────────────────────────────────────────────────────────────
  function handleUploadSuccess({ documentId, filename }) {
    setDocumentId(documentId);
    setDocumentName(filename);
    setResult(null);
    setAskError(null);
  }

  async function handleAsk(question) {
    setAsking(true);
    setResult(null);
    setAskError(null);

    try {
      const res  = await fetch(`${API_BASE}/api/ask`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId, question }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAskError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      setResult(data);
    } catch {
      setAskError('Network error. Is the server running?');
    } finally {
      setAsking(false);
    }
  }

  function handleReset() {
    setDocumentId(null);
    setDocumentName('');
    setResult(null);
    setAskError(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="logo-mark">📄</div>
        <span className="logo-text">AskMyDoc</span>
        <span className="logo-badge">Powered by Groq</span>
      </header>

      <main className="main-content">
        {!documentId ? (
          /* ── Upload view ── */
          <>
            <div className="hero">
              <h1>Ask questions from<br /><span>your document</span></h1>
              <p>
                Upload a .txt or .pdf file. Every answer is grounded
                strictly in that document — with the exact source passage shown.
              </p>
            </div>
            <UploadBox onSuccess={handleUploadSuccess} />
          </>
        ) : (
          /* ── Ask view ── */
          <>
            <AskForm
              documentName={documentName}
              loading={asking}
              onAsk={handleAsk}
              onReset={handleReset}
            />

            {/* Loading state */}
            {asking && (
              <div className="card">
                <div className="loading-block">
                  <div className="spinner" />
                  <span>Searching your document…</span>
                </div>
              </div>
            )}

            {/* Error state */}
            {!asking && askError && (
              <AnswerCard error={askError} />
            )}

            {/* Result */}
            {!asking && result && (
              <>
                <AnswerCard found={result.found} answer={result.answer} />
                {result.found && result.sources?.length > 0 && (
                  <SourcePanel sources={result.sources} />
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
