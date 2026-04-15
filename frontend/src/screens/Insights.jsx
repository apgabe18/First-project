import React, { useState, useEffect } from 'react';

export default function Insights({ token, cleanResult, onReset }) {
  const { headers, rows, issues, colTypes, stats, rowCount } = cleanResult;
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchInsights() {
      try {
        const res = await fetch('/api/insights/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ headers, stats, colTypes, rowCount, issues })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to generate insights');
        setInsights(data.insights);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchInsights();
  }, []);

  const numericCols = headers.filter(h => colTypes[h] === 'numeric');
  const textCols = headers.filter(h => colTypes[h] === 'text');
  const qualityGood = issues.length === 0;

  return (
    <div className="page">
      <div className="content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Results & Insights</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Your data has been cleaned. Here's what we found.</p>
          </div>
          <button className="btn btn-ghost" onClick={onReset} style={{ fontSize: 13 }}>
            ← New dataset
          </button>
        </div>

        {/* Summary bar */}
        <div className="summary-bar">
          <div className="summary-bar-item">
            <span className="summary-bar-label">Rows</span>
            <span className="summary-bar-value">{rowCount.toLocaleString()}</span>
          </div>
          <div className="summary-bar-item">
            <span className="summary-bar-label">Columns</span>
            <span className="summary-bar-value">{headers.length}</span>
          </div>
          <div className="summary-bar-item">
            <span className="summary-bar-label">Numeric</span>
            <span className="summary-bar-value">{numericCols.length}</span>
          </div>
          <div className="summary-bar-item">
            <span className="summary-bar-label">Categorical</span>
            <span className="summary-bar-value">{textCols.length}</span>
          </div>
          <div className="summary-bar-item">
            <span className="summary-bar-label">Issues fixed</span>
            <span className="summary-bar-value">{issues.length}</span>
          </div>
        </div>

        {/* Cleaning issues */}
        {issues.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Cleaning log</div>
            <div className="card-sub">The following issues were detected and corrected.</div>
            <div className="issues-list">
              {issues.map((issue, i) => (
                <div key={i} className="issue-item">
                  <span className="issue-icon">⚠</span>
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Column statistics */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Column statistics</div>
          <div className="card-sub">Key metrics extracted from your cleaned dataset.</div>
          <div className="stats-grid">
            {numericCols.map(h => {
              const s = stats[h];
              return (
                <div key={h} className="stat-card">
                  <div className="stat-label">{h}</div>
                  <div className="stat-value">{s.mean.toLocaleString()}</div>
                  <div className="stat-meta">mean · range {s.min.toLocaleString()}–{s.max.toLocaleString()}</div>
                </div>
              );
            })}
            {textCols.map(h => {
              const s = stats[h];
              return (
                <div key={h} className="stat-card">
                  <div className="stat-label">{h}</div>
                  <div className="stat-value">{s.uniqueCount}</div>
                  <div className="stat-meta">unique values</div>
                  {s.topValues?.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {s.topValues.slice(0, 3).map(([v, c]) => (
                        <span key={v} style={{
                          fontSize: 11,
                          padding: '2px 7px',
                          background: 'var(--accent-light)',
                          color: 'var(--accent)',
                          borderRadius: 100,
                          fontWeight: 500
                        }}>
                          {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Data preview */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Data preview</div>
          <div className="card-sub">First 10 rows of your cleaned dataset.</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    {headers.map(h => (
                      <td key={h} style={{ color: row[h] === '' ? 'var(--muted)' : undefined }}>
                        {row[h] === '' ? '—' : row[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 10 && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              Showing 10 of {rows.length} rows
            </div>
          )}
        </div>

        {/* AI Insights */}
        <div className="card">
          <div className="card-title">Business insights</div>
          <div className="card-sub">Analysis and recommended next steps based on your data.</div>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: 'var(--muted)', fontSize: 14 }}>
              <span className="spinner spinner-dark" />
              Analyzing your data…
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}

          {insights && (
            <>
              {/* Summary */}
              {insights.summary && (
                <div className="insight-section">
                  <div className="section-label">Overview</div>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>{insights.summary}</p>
                </div>
              )}

              {/* Data quality */}
              {insights.dataQuality && (
                <div className="insight-section">
                  <div className="section-label">Data quality</div>
                  <span className={`quality-badge ${qualityGood ? 'quality-good' : 'quality-warn'}`}>
                    {qualityGood ? '✓' : '⚠'} {insights.dataQuality}
                  </span>
                </div>
              )}

              {/* Key findings */}
              {insights.keyFindings?.length > 0 && (
                <div className="insight-section">
                  <div className="section-label">Key findings</div>
                  <div className="findings-list">
                    {insights.keyFindings.map((f, i) => (
                      <div key={i} className="finding-item">
                        <span className="finding-dot" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next steps */}
              {insights.nextSteps?.length > 0 && (
                <div className="insight-section">
                  <div className="section-label">Recommended next steps</div>
                  <div className="steps-list">
                    {insights.nextSteps.map((step, i) => (
                      <div key={i} className="step-item">
                        <div className="step-num">{i + 1}</div>
                        <div className="step-content">
                          <div className="step-action">{step.action}</div>
                          <div className="step-detail">{step.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw fallback */}
              {insights.raw && (
                <div className="insight-section">
                  <div className="section-label">Analysis</div>
                  <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{insights.raw}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
