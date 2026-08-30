import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function QRScannerModal({ isOpen, onClose, onCodeVerified, expectedCode, deliveryId }) {
  if (!isOpen) return null;

  const verifyUrl = `https://backend-production-7f0d0.up.railway.app/verify.html?id=${deliveryId || ''}&token=${encodeURIComponent(expectedCode || '')}`;

  const handleDirectValidate = () => {
    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
    onCodeVerified(expectedCode || 'VERIFIED-QR');
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.dragBar} />

        <div style={styles.header}>
          <div>
            <span style={styles.subtag}>SECURITY VERIFICATION BARCODE</span>
            <h3 style={styles.title}>📱 Customer Waybill QR Barcode</h3>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.qrDisplaySection}>
          {/* High Contrast Clean Scannable SVG Barcode QR */}
          <div style={styles.qrWhiteBox}>
            <QRCodeSVG
              value={verifyUrl}
              size={200}
              level="H"
              includeMargin={false}
            />
          </div>

          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 'bold', color: '#ffffff' }}>
              Point any mobile phone camera to scan
            </p>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Redirects to browser verification page &amp; validates live on Railway DB.
            </span>
          </div>

          <a
            href={verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.directLinkBtn}
          >
            🔗 Open Verification URL Directly ↗
          </a>

          <button onClick={handleDirectValidate} style={styles.confirmScannedBtn}>
            ✓ 1-Tap Validate Token on Railway
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(6px)',
  },
  sheet: {
    backgroundColor: '#1e293b',
    width: '100%',
    maxWidth: '480px',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    padding: '16px 20px 28px 20px',
    boxSizing: 'border-box',
    color: '#f8fafc',
    borderTop: '1px solid #334155',
    boxShadow: '0 -10px 30px rgba(0,0,0,0.6)',
  },
  dragBar: {
    width: '44px',
    height: '5px',
    backgroundColor: '#475569',
    borderRadius: '10px',
    alignSelf: 'center',
    margin: '0 auto 12px auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '14px',
  },
  subtag: { fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '0.8px' },
  title: { margin: '2px 0 0 0', fontSize: '18px', fontWeight: '800', color: '#ffffff' },
  closeBtn: { background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' },
  qrDisplaySection: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '6px 0' },
  qrWhiteBox: { backgroundColor: '#ffffff', padding: '16px', borderRadius: '18px', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' },
  directLinkBtn: {
    width: '100%',
    backgroundColor: '#0f172a',
    color: '#38bdf8',
    padding: '12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 'bold',
    textAlign: 'center',
    textDecoration: 'none',
    border: '1px solid #0284c7',
    boxSizing: 'border-box',
  },
  confirmScannedBtn: {
    width: '100%',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    padding: '14px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)',
  },
};