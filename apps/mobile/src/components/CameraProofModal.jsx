import React, { useState, useRef } from 'react';
import { compressImage } from '../services/imageCompressor';

export default function CameraProofModal({ isOpen, onClose, onPhotoAccepted, locationMetadata }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [compressedBlob, setCompressedBlob] = useState(null);
  const [fileSizeKb, setFileSizeKb] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const result = await compressImage(file, 1280, 0.75, locationMetadata);
      setCompressedBlob(result.blob);
      setPreviewUrl(result.dataUrl);
      setFileSizeKb(Math.round(result.sizeBytes / 1024));
    } catch (err) {
      console.error('Image compression error:', err);
      alert('Failed to process image: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetake = () => {
    setPreviewUrl(null);
    setCompressedBlob(null);
    setFileSizeKb(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirm = () => {
    if (compressedBlob && previewUrl) {
      onPhotoAccepted({
        blob: compressedBlob,
        dataUrl: previewUrl,
        sizeKb: fileSizeKb,
      });
      onClose();
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalCard}>
        <div style={styles.headerRow}>
          <h3 style={styles.title}>📷 Proof of Delivery Photo</h3>
          <button onClick={onClose} style={styles.closeIconBtn}>✕</button>
        </div>

        <p style={styles.subtitle}>
          Take a photo of the package at the customer's dropoff location.
        </p>

        {!previewUrl ? (
          <div style={styles.captureZone}>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="camera-proof-input"
            />
            <label htmlFor="camera-proof-input" style={styles.cameraBtn}>
              {isProcessing ? '⏳ Compressing Photo...' : '📸 Open Camera'}
            </label>
            <p style={styles.hint}>
              Photos are automatically optimized to &lt;400KB to save mobile data.
            </p>
          </div>
        ) : (
          <div style={styles.previewContainer}>
            <div style={styles.imageWrapper}>
              <img src={previewUrl} alt="Dropoff Proof" style={styles.previewImage} />
              {fileSizeKb && (
                <div style={styles.sizeBadge}>
                  ✓ Compressed ({fileSizeKb} KB)
                </div>
              )}
            </div>

            <div style={styles.btnRow}>
              <button onClick={handleRetake} style={styles.retakeBtn}>
                🔄 Retake
              </button>
              <button onClick={handleConfirm} style={styles.acceptBtn}>
                ✓ Use Photo
              </button>
            </div>
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
  subtitle: {
    margin: '8px 0 20px 0',
    fontSize: '13px',
    color: '#94a3b8',
  },
  captureZone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    margin: '20px 0',
  },
  cameraBtn: {
    backgroundColor: '#0284c7',
    color: '#fff',
    padding: '16px 24px',
    borderRadius: '14px',
    fontSize: '17px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textAlign: 'center',
    width: '100%',
    boxSizing: 'border-box',
    display: 'block',
    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
  },
  hint: {
    margin: 0,
    fontSize: '12px',
    color: '#64748b',
    textAlign: 'center',
  },
  previewContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  imageWrapper: {
    position: 'relative',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid #334155',
  },
  previewImage: {
    width: '100%',
    maxHeight: '280px',
    objectFit: 'cover',
    display: 'block',
  },
  sizeBadge: {
    position: 'absolute',
    bottom: '8px',
    right: '8px',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    color: '#4ade80',
    fontSize: '11px',
    fontWeight: 'bold',
    padding: '4px 8px',
    borderRadius: '6px',
  },
  btnRow: {
    display: 'flex',
    gap: '12px',
  },
  retakeBtn: {
    flex: 1,
    padding: '14px',
    backgroundColor: '#334155',
    color: '#f1f5f9',
    border: 'none',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  acceptBtn: {
    flex: 1,
    padding: '14px',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
};