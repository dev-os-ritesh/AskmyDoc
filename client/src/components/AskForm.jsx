import { useState } from 'react';

/**
 * AskForm — question input with submit and "upload new document" controls.
 */
export default function AskForm({ documentName, loading, onAsk, onReset }) {
  const [question, setQuestion] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    onAsk(q);
  }

  return (
    <div className="card" style={{ animationDelay: '0s' }}>
      {/* Header row */}
      <div className="ask-header">
        <div className="card-label" style={{ margin: 0 }}>Step 2 — Ask a question</div>
        <div className="doc-pill" title={documentName}>
          <span>📄</span>
          <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {documentName}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="textarea-wrap">
          <textarea
            id="question-input"
            placeholder="e.g. What is the refund policy? Who founded the company?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            disabled={loading}
            onKeyDown={(e) => {
              // Ctrl/Cmd + Enter submits
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit(e);
            }}
          />
        </div>

        <div className="ask-actions">
          <button
            type="button"
            id="new-doc-btn"
            className="btn btn-ghost"
            onClick={onReset}
            disabled={loading}
          >
            ↩ New document
          </button>
          <button
            type="submit"
            id="ask-btn"
            className="btn btn-primary"
            disabled={!question.trim() || loading}
          >
            {loading ? (
              <><div className="spinner" /> Searching…</>
            ) : (
              '🔍 Ask'
            )}
          </button>
        </div>
      </form>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
        Tip: press Ctrl + Enter to submit
      </p>
    </div>
  );
}
