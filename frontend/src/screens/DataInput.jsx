import React, { useState, useRef } from 'react';

const SAMPLE_CSV = `product,category,revenue,units_sold,region
Widget A,Electronics,12500,250,North
Widget B,Electronics,8300,166,South
Gadget X,Accessories,4200,84,East
Widget A,Electronics,12500,250,North
Gadget Y,Accessories,6100,122,West
Service Pro,Services,22000,44,North
Widget B,Electronics,8300,166,South
Service Lite,Services,9500,190,East
Gadget X,Accessories,,84,East
Gadget Z,Accessories,3800,76,West`;

export default function DataInput({ token, onCleanSuccess }) {
  const [activeTab, setActiveTab] = useState('upload');
  const [file, setFile] = useState(null);
  const [rawData, setRawData] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.csv')) { setFile(f); setError(''); }
    else setError('Please drop a .csv file');
  }

  function handleFileChange(e) {
    const f = e.target.files[0];
    if (f) { setFile(f); setError(''); }
  }

  async function handleClean() {
    setError('');
    setLoading(true);

    try {
      let body, headers;
      if (activeTab === 'upload') {
        if (!file) { setError('Please select a CSV file first.'); setLoading(false); return; }
        body = new FormData();
        body.append('file', file);
        headers = { Authorization: `Bearer ${token}` };
      } else {
        if (!rawData.trim()) { setError('Please paste some CSV data.'); setLoading(false); return; }
        body = JSON.stringify({ rawData });
        headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      }

      const res = await fetch('/api/data/clean', { method: 'POST', headers, body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cleaning failed');
      onCleanSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function loadSample() {
    setActiveTab('paste');
    setRawData(SAMPLE_CSV);
    setError('');
  }

  return (
    <div className="page">
      <div className="content">
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Import your data</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Upload a CSV file or paste raw data. We'll clean it and surface insights.</p>
        </div>

        <div className="card">
          <div className="tabs">
            <button className={`tab ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
              Upload CSV
            </button>
            <button className={`tab ${activeTab === 'paste' ? 'active' : ''}`} onClick={() => setActiveTab('paste')}>
              Paste data
            </button>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

          {activeTab === 'upload' && (
            <>
              <div
                className={`upload-zone ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
                onClick={() => fileRef.current.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <div className="upload-icon">{file ? '✓' : '↑'}</div>
                <div className="upload-text">
                  {file ? file.name : 'Drop CSV here or click to browse'}
                </div>
                <div className="upload-hint">
                  {file ? `${(file.size / 1024).toFixed(1)} KB` : 'CSV files only · max 5 MB'}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              </div>

              {file && (
                <button
                  className="btn btn-ghost"
                  style={{ marginTop: 10, fontSize: 13 }}
                  onClick={() => { setFile(null); fileRef.current.value = ''; }}
                >
                  Remove file
                </button>
              )}
            </>
          )}

          {activeTab === 'paste' && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="rawData">CSV data (first row = headers)</label>
              <textarea
                id="rawData"
                placeholder={"name,revenue,region\nAcme Corp,42000,North\nBeta Inc,18500,South"}
                value={rawData}
                onChange={e => setRawData(e.target.value)}
                style={{ minHeight: 180, fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>
          )}

          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={handleClean}
              disabled={loading || (activeTab === 'upload' ? !file : !rawData.trim())}
            >
              {loading ? <><span className="spinner" /> Cleaning…</> : 'Clean & Analyze →'}
            </button>
            <button className="btn btn-ghost" onClick={loadSample}>
              Load sample data
            </button>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title" style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)', marginBottom: 10 }}>
            What we do to your data
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {[
              ['Remove empty rows', 'Rows with no data are dropped'],
              ['Deduplicate', 'Exact duplicate rows removed'],
              ['Detect missing values', 'Flagged per column'],
              ['Trim whitespace', 'Clean leading/trailing spaces'],
              ['Infer types', 'Numeric vs. text columns'],
              ['Compute statistics', 'Min, max, mean, top values']
            ].map(([title, desc]) => (
              <div key={title} style={{ padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
