import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function QRScannerModal({ isOpen, onClose, onCodeVerified, expectedCode, deliveryId }) {
  const [scannerState, setScannerState] = useState('ready'); // 'ready', 'scanning', 'verified', 'mismatch', 'error'
  const [scannedCode, setScannedCode] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const qrReaderRef = useRef(null);
  const html5QrcodeRef = useRef(null);
  const cameraPermissionRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !qrReaderRef.current) return;

    let scanner;
    const initScanner = async () => {
      try {
        scanner = new Html5Qrcode('qr-reader', {
          formatsToSupport: [Html5Qrcode.SCAN_TYPE_CAMERA],
          disableFlip: false,
          videoConstraints: {
            facingMode: { ideal: 'environment' },
          },
        });

        html5QrcodeRef.current = scanner;
        setScannerState('scanning');

        const cameraId = (await Html5Qrcode.getCameras())[0]?.id;

        if (cameraId) {
          await scanner.start(
            cameraId,
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
              // QR code scanned
              setScannedCode(decodedText);

              // Check if it matches expected code
              if (
                decodedText === expectedCode ||
                decodedText.includes(expectedCode) ||
                decodedText.toUpperCase().includes(expectedCode?.toUpperCase?.())
              ) {
                setScannerState('verified');
                if ('vibrate' in navigator) {
                  navigator.vibrate([100, 50, 100]);
                }
                // Auto-verify after 1.5 seconds
                setTimeout(() => {
                  onCodeVerified(decodedText);
                  onClose();
                }, 1500);
              } else {
                setScannerState('mismatch');
                setErrorMsg(`Scanned: ${decodedText}\nExpected: ${expectedCode}`);
                // Reset after 3 seconds
                setTimeout(() => {
                  setScannerState('scanning');
                  setScannedCode(null);
                }, 3000);
              }
            },
            (error) => {
              // Ignore scanning errors (constant scanning)
            }
          );
        } else {
          throw new Error('No camera found on this device');
        }
      } catch (error) {
        setScannerState('error');
        setErrorMsg(error.message || 'Failed to initialize camera');
        console.error('QR Scanner init error:', error);
      }
    };

    initScanner();

    return () => {
      if (html5QrcodeRef.current) {
        html5QrcodeRef.current
          .stop()
          .then(() => {
            html5QrcodeRef.current = null;
          })
          .catch(() => {
            html5QrcodeRef.current = null;
          });
      }
    };
  }, [isOpen, expectedCode, onCodeVerified, onClose]);

  const handleManualVerify = () => {
    if (scannedCode) {
      onCodeVerified(scannedCode);
      onClose();
    }
  };

  const handleRetry = () => {
    setScannerState('scanning');
    setScannedCode(null);
    setErrorMsg('');
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.dragBar} />

        <div style={styles.header}>
          <div>
            <span style={styles.subtag}>QR CODE VERIFICATION</span>
            <h3 style={styles.title}>📱 Scan Delivery QR Code</h3>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.scannerSection}>
          {scannerState === 'error' ? (
            <div style={styles.errorBox}>
              <span style={styles.errorIcon}>⚠️</span>
              <p style={styles.errorText}>{errorMsg}</p>
              <button onClick={handleRetry} style={styles.retryBtn}>
                🔄 Retry Camera
              </button>
              <p style={styles.fallbackHint}>Or manually enter the verification code:</p>
              <input
                type="text"
                placeholder={expectedCode}
                disabled
                style={styles.codeDisplay}
              />
              <button onClick={() => onCodeVerified(expectedCode)} style={styles.confirmBtn}>
                ✓ Use Manual Code
              </button>
            </div>
          ) : scannerState === 'verified' ? (
            <div style={styles.successBox}>
              <span style={styles.successIcon}>✅</span>
              <p style={styles.successText}>QR Code Verified!</p>
              <p style={styles.scannedCodeText}>{scannedCode}</p>
            </div>
          ) : scannerState === 'mismatch' ? (
            <div style={styles.mismatchBox}>
              <span style={styles.mismatchIcon}>❌</span>
              <p style={styles.mismatchText}>Invalid QR Code</p>
              <p style={styles.mismatchDetail}>{errorMsg}</p>
              <button onClick={handleRetry} style={styles.retryBtn}>
                🔄 Try Again
              </button>
            </div>
          ) : (
            <div id="qr-reader" ref={qrReaderRef} style={styles.qrScannerBox} />
          )}
        </div>

        {scannerState === 'scanning' && (
          <div style={styles.instructions}>
            <p>📍 Point camera at QR code on delivery waybill</p>
            <p style={styles.smallText}>Make sure QR code is well-lit and centered</p>
          </div>
        )}

        {scannerState === 'verified' && (
          <div style={styles.verifiedFooter}>
            <p>Delivery verified and locked for completion</p>
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
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(8px)',
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
    boxShadow: '0 -10px 40px rgba(0,0,0,0.8)',
  },
  dragBar: {
    width: '44px',
    height: '5px',
    backgroundColor: '#475569',
    borderRadius: '10px',
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
  scannerSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '6px 0', minHeight: '240px' },
  qrScannerBox: { width: '100%', height: '240px', borderRadius: '12px', overflow: 'hidden', border: '2px solid #0284c7' },
  errorBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '16px', backgroundColor: '#7f1d1d', borderRadius: '12px', width: '100%' },
  errorIcon: { fontSize: '40px' },
  errorText: { margin: 0, fontSize: '14px', textAlign: 'center', color: '#fecaca' },
  successBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px', backgroundColor: '#166534', borderRadius: '12px', width: '100%' },
  successIcon: { fontSize: '48px' },
  successText: { margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#bbf7d0' },
  scannedCodeText: { margin: '4px 0 0 0', fontSize: '12px', color: '#a7f3d0', fontFamily: 'monospace' },
  mismatchBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px', backgroundColor: '#92400e', borderRadius: '12px', width: '100%' },
  mismatchIcon: { fontSize: '40px' },
  mismatchText: { margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#fed7aa' },
  mismatchDetail: { margin: '4px 0 0 0', fontSize: '11px', color: '#f5dab1', fontFamily: 'monospace' },
  instructions: { textAlign: 'center', fontSize: '12px', color: '#cbd5e1' },
  smallText: { margin: '4px 0 0 0', fontSize: '11px', color: '#94a3b8' },
  verifiedFooter: { textAlign: 'center', padding: '12px', backgroundColor: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px', borderTop: '1px solid #22c55e' },
  retryBtn: { backgroundColor: '#0284c7', color: '#ffffff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', width: '100%' },
  fallbackHint: { margin: '8px 0 4px 0', fontSize: '12px', color: '#cbd5e1' },
  codeDisplay: { width: '100%', padding: '8px', fontSize: '13px', fontFamily: 'monospace', backgroundColor: '#0f172a', color: '#38bdf8', border: '1px solid #0284c7', borderRadius: '6px', boxSizing: 'border-box' },
  confirmBtn: { width: '100%', backgroundColor: '#16a34a', color: '#ffffff', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' },
};