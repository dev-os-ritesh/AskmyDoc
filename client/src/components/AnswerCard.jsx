/**
 * AnswerCard — displays the answer, a "not found" message, or an error.
 * Props (one of):
 *   found=true,  answer="..."  → show the answer
 *   found=false               → show "document doesn't contain this"
 *   error="..."               → show error message
 */
export default function AnswerCard({ found, answer, error }) {
  if (error) {
    return (
      <div className="card answer-card error-state" style={{ animationDelay: '0.05s' }}>
        <div className="status-badge error">⚠ Error</div>
        <p className="error-text">{error}</p>
      </div>
    );
  }

  if (found === false) {
    return (
      <div className="card answer-card not-found" style={{ animationDelay: '0.05s' }}>
        <div className="status-badge not-found">🔎 Not found</div>
        <p className="not-found-text">
          The document does not contain enough information to answer this question.
          Try rephrasing, or ask something else about the document.
        </p>
      </div>
    );
  }

  if (found === true && answer) {
    return (
      <div className="card answer-card found" style={{ animationDelay: '0.05s' }}>
        <div className="status-badge found">✓ Answer found</div>
        <p className="answer-text" id="answer-text">{answer}</p>
      </div>
    );
  }

  return null;
}
