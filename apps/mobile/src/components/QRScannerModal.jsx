import React, { useState } from 'react';

export default function QRScannerModal({ isOpen, onClose, onCodeVerified, expectedCode }) {
  const [manualCode, setManualCode] = useState('');
  const [activeTab, setActiveTab] = useState('pin'); // 'qr' or 'pin'
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const cleanCode = manualCode.trim();
    if (!cleanCode) {
      setErrorMsg('Please enter the 6-digit PIN code');
      return;
    }

    if (expectedCode && cleanCode !== expectedCode) {
      setErrorMsg(`Code mismatch. Please check the customer's PIN.`);
      if ('vibrate' in navigator) navigator.vibrate(200);
      return;
    }

    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
    onCodeVerified(cleanCode);
    onClose();
  };

  const handleKeypadPress = (digit) => {
    if (manualCode.length < 8) {
      const nextCode = manualCode + digit;
      setManualCode(nextCode);
      setErrorMsg('');
    }
  };

  const handleBackspace = () => {
    setManualCode((prev) => prev.slice(0, -1));
    setErrorMsg('');
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalCard}>
        <div style={styles.headerRow}>
          <h3 style={styles.title}>🔐 Delivery Verification</h3>
          <button onClick={onClose} style={styles.closeIconBtn}>✕</button>
        </div>

        {/* Tab switch */}
        <div style={styles.tabBar}>
          <button
            onClick={() => setActiveTab('pin')}
            style={{
              ...styles.tabBtn,
              backgroundColor: activeTab === 'pin' ? '#0284c7' : 'transparent',
              color: activeTab === 'pin' ? '#fff' : '#94a3b8',
            }}
          >
            🔢 Manual PIN
          </button>
          <button
            onClick={() => setActiveTab('qr')}
            style={{
              ...styles.tabBtn,
              backgroundColor: activeTab === 'qr' ? '#0284c7' : 'transparent',
              color: activeTab === 'qr' ? '#fff' : '#94a3b8',
            }}
          >
            📷 QR Scanner
          </button>
        </div>

        {activeTab === 'pin' ? (
          <div style={styles.pinSection}>
            <p style={styles.hint}>
              Ask the customer for the 6-digit confirmation PIN.
            </p>

            <div style={styles.pinDisplay}>
              <input
                type="text"
                value={manualCode}
                readOnly
                placeholder="------"
                style={styles.pinInput}
              />
            </div>

            {errorMsg && <div style={styles.errorBanner}>{errorMsg}</div>}

            {/* Custom On-Screen NumPad for one-handed operation */}
            <div style={styles.keypadGrid}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeypadPress(num)}
                  style={styles.keyBtn}
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleBackspace}
                style={{ ...styles.keyBtn, backgroundColor: '#334155' }}
              >
                ⌫
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress('0')}
                style={styles.keyBtn}
              >
                0
              </button>
              <button
                type="button"
                onClick={handleManualSubmit}
                disabled={manualCode.length === 0}
                style={{
                  ...styles.keyBtn,
                  backgroundColor: manualCode.length > 0 ? '#16a34a' : '#334155',
                  color: '#fff',
                  fontWeight: 'bold',
                }}
              >
                ✓
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.qrSection}>
            <div style={styles.qrFrame}>
              <div style={styles.qrLaser} />
              <p style={styles.qrText}>Point camera at customer's QR code</p>
            </div>
            <p style={styles.hint}>
              If the QR code is damaged or unreadable, switch to <b>Manual PIN</b>.
            </p>
            {expectedCode && (
              <button
                onClick={() => {
                  onCodeVerified(expectedCode);
                  onClose();
                }}
                style={styles.simulateScanBtn}
              >
                Simulate QR Code Match ({expectedCode})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(4px)',
  },
  modalCard: {
    backgroundColor: '#1e293b',
    width: '100%',
    maxWidth: '480px',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    padding: '24px 20px',
    boxSizing: 'border-box',
    color: '#f8fafc',
    borderTop: '1px solid #334155',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { margin: 0, fontSize: '18px', fontWeight: 'bold' },
  closeIconBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: '20px',
    cursor: 'pointer',
  },
  tabBar: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    backgroundColor: '#0f172a',
    borderRadius: '12px',
    padding: '4px',
    margin: '16px 0',
  },
  tabBtn: {
    border: 'none',
    padding: '10px',
    borderRadius: '8px',
    fontWeight: 'bold',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  hint: {
    margin: '0 0 12px 0',
    fontSize: '13px',
    color: '#94a3b8',
    textAlign: 'center',
  },
  pinSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  pinDisplay: {
    display: 'flex',
    justifyContent: 'center',
  },
  pinInput: {
    width: '100%',
    padding: '16px',
    backgroundColor: '#0f172a',
    border: '2px solid #0284c7',
    borderRadius: '12px',
    color: '#f8fafc',
    fontSize: '24px',
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: '8px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    color: '#fca5a5',
    border: '1px solid #ef4444',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    textAlign: 'center',
  },
  keypadGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    marginTop: '6px',
  },
  keyBtn: {
    height: '54px',
    backgroundColor: '#334155',
    color: '#f8fafc',
    border: 'none',
    borderRadius: '12px',
    fontSize: '20px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
  },
  qrSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 0',
  },
  qrFrame: {
    width: '220px',
    height: '220px',
    border: '3px dashed #38bdf8',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
  },
  qrLaser: {
    position: 'absolute',
    top: '50%',
    left: '10%',
    right: '10%',
    height: '2px',
    backgroundColor: '#ef4444',
    boxShadow: '0 0 8px #ef4444',
  },
  qrText: {
    fontSize: '12px',
    color: '#64748b',
    textAlign: 'center',
    padding: '0 16px',
  },
  simulateScanBtn: {
    backgroundColor: '#0284c7',
    color: '#fff',
    border: 'none',
    padding: '12px 18px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
};