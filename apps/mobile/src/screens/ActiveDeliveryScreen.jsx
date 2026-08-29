import React, { useState, useEffect, useRef } from 'react';
import CameraProofModal from '../components/CameraProofModal';
import QRScannerModal from '../components/QRScannerModal';
import { confirmPickup, verifyAndCompleteDelivery } from '../services/api';

export default function ActiveDeliveryScreen({
  delivery,
  riderId,
  socket,
  onBack,
  onDeliveryCompleted,
  isOnline,
}) {
  const [status, setStatus] = useState(delivery.status);
  const [isPhotoModalOpen, setPhotoModalOpen] = useState(false);
  const [isQRModalOpen, setQRModalOpen] = useState(false);
  const [podPhoto, setPodPhoto] = useState(null);
  const [verifiedCode, setVerifiedCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentCoords, setCurrentCoords] = useState(null);

  const wakeLockRef = useRef(null);
  const watchIdRef = useRef(null);

  // 1. Screen WakeLock during Transit
  useEffect(() => {
    const acquireWakeLock = async () => {
      if ('wakeLock' in navigator && status === 'PICKED_UP') {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch {
          // Wake lock might fail on low battery
        }
      }
    };
    acquireWakeLock();

    return () => {
      if (wakeLockRef.current) {
        try {
          wakeLockRef.current.release();
        } catch {}
        wakeLockRef.current = null;
      }
    };
  }, [status]);

  // 2. Geolocation Watcher during Transit
  useEffect(() => {
    if (status === 'PICKED_UP' && 'geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
          setCurrentCoords(coords);

          const payload = {
            deliveryId: delivery.id,
            riderId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            timestamp: new Date().toISOString(),
          };

          if (socket && socket.connected) {
            socket.emit('rider:location_update', payload);
          }
        },
        (err) => console.warn('GPS Watcher warning:', err.message),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [status, delivery.id, riderId, socket]);

  // Handle Pickup Confirmation
  const handlePickup = async () => {
    setIsSubmitting(true);
    try {
      await confirmPickup(delivery.id, riderId);
      setStatus('PICKED_UP');
      if ('vibrate' in navigator) navigator.vibrate(100);
    } catch (err) {
      console.warn('Pickup fallback:', err.message);
      setStatus('PICKED_UP');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Final Completion
  const handleFinalCompletion = async () => {
    if (!verifiedCode || !podPhoto) {
      alert('Please complete both Dropoff Photo and PIN/QR Verification.');
      return;
    }

    setIsSubmitting(true);
    try {
      await verifyAndCompleteDelivery(
        delivery.id,
        verifiedCode,
        podPhoto.dataUrl,
        riderId
      );

      // Hardware Teardown
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }

      setStatus('DELIVERED');
      onDeliveryCompleted({
        ...delivery,
        status: 'DELIVERED',
        deliveredAt: new Date().toISOString(),
      });
    } catch (err) {
      alert(err.message || 'Verification failed. Please check the code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isReadyToComplete = status === 'PICKED_UP' && podPhoto && verifiedCode;

  const navUrl = delivery.dropoffLat && delivery.dropoffLng
    ? `https://www.google.com/maps/dir/?api=1&destination=${delivery.dropoffLat},${delivery.dropoffLng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.dropoffAddress || '')}`;

  return (
    <div style={styles.screen}>
      {/* Top Navbar */}
      <nav style={styles.navBar}>
        <button onClick={onBack} style={styles.backBtn}>
          ← Back
        </button>
        <span style={styles.navTitle}>Delivery #{delivery.id ? delivery.id.slice(0, 8) : 'DEL-001'}</span>
        <span
          style={{
            ...styles.badge,
            backgroundColor: status === 'PICKED_UP' ? '#0284c7' : '#f59e0b',
          }}
        >
          {status}
        </span>
      </nav>

      {/* Main Container */}
      <div style={styles.content}>
        {/* Destination & Navigation Card */}
        <div style={styles.routeCard}>
          <div style={styles.routeNode}>
            <span style={styles.dotPickup}>●</span>
            <div>
              <span style={styles.nodeLabel}>PICKUP LOCATION</span>
              <p style={styles.nodeText}>{delivery.pickupAddress || 'Merchant Warehouse'}</p>
            </div>
          </div>

          <div style={styles.routeDivider} />

          <div style={styles.routeNode}>
            <span style={styles.dotDropoff}>●</span>
            <div>
              <span style={styles.nodeLabel}>DROPOFF DESTINATION</span>
              <p style={styles.nodeText}>{delivery.dropoffAddress || 'Customer Address'}</p>
            </div>
          </div>

          {/* Deep link into Google Maps */}
          <a
            href={navUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.navLinkBtn}
          >
            🗺️ Start Google Maps Navigation
          </a>
        </div>

        {/* Customer Information */}
        {delivery.customerName && (
          <div style={styles.customerCard}>
            <div style={styles.customerLeft}>
              <span style={styles.customerName}>👤 {delivery.customerName}</span>
              <span style={styles.customerNote}>Customer Phone</span>
            </div>
            {delivery.customerPhone && (
              <a href={`tel:${delivery.customerPhone}`} style={styles.phoneCallBtn}>
                📞 Call
              </a>
            )}
          </div>
        )}

        {/* In-Transit Dropoff Validation Gates (PICKED_UP Mode) */}
        {status === 'PICKED_UP' && (
          <div style={styles.verificationCard}>
            <h3 style={styles.cardHeading}>Dropoff Verification Checklist</h3>
            <p style={styles.cardSubheading}>
              Both steps below are required to complete the delivery.
            </p>

            <div style={styles.gateGrid}>
              {/* Gate 1: Photo */}
              <button
                onClick={() => setPhotoModalOpen(true)}
                style={{
                  ...styles.gateTile,
                  borderColor: podPhoto ? '#16a34a' : '#475569',
                  backgroundColor: podPhoto ? 'rgba(22, 163, 74, 0.1)' : '#0f172a',
                }}
              >
                <span style={styles.gateIcon}>{podPhoto ? '✓' : '📷'}</span>
                <span style={styles.gateLabel}>
                  {podPhoto ? 'Photo Captured' : 'Take Proof Photo'}
                </span>
                {podPhoto && <span style={styles.gateSub}>({podPhoto.sizeKb} KB)</span>}
              </button>

              {/* Gate 2: PIN / QR */}
              <button
                onClick={() => setQRModalOpen(true)}
                style={{
                  ...styles.gateTile,
                  borderColor: verifiedCode ? '#16a34a' : '#475569',
                  backgroundColor: verifiedCode ? 'rgba(22, 163, 74, 0.1)' : '#0f172a',
                }}
              >
                <span style={styles.gateIcon}>{verifiedCode ? '✓' : '🔢'}</span>
                <span style={styles.gateLabel}>
                  {verifiedCode ? `Code: ${verifiedCode}` : 'Verify PIN / QR'}
                </span>
                {verifiedCode && <span style={styles.gateSub}>Verified</span>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fixed Ergonomic Bottom Action Anchor (56px) */}
      <div style={styles.bottomBar}>
        {status === 'ASSIGNED' && (
          <button
            onClick={handlePickup}
            disabled={isSubmitting}
            style={styles.primaryActionBtn}
          >
            {isSubmitting ? 'Confirming...' : 'CONFIRM PACKAGE PICKUP'}
          </button>
        )}

        {status === 'PICKED_UP' && (
          <button
            onClick={handleFinalCompletion}
            disabled={isSubmitting || !isReadyToComplete}
            style={{
              ...styles.primaryActionBtn,
              backgroundColor: isReadyToComplete ? '#16a34a' : '#334155',
              cursor: isReadyToComplete ? 'pointer' : 'not-allowed',
            }}
          >
            {isSubmitting
              ? 'Verifying & Finalizing...'
              : isReadyToComplete
              ? 'COMPLETE DELIVERY'
              : 'Complete Delivery (Complete Steps Above)'}
          </button>
        )}
      </div>

      {/* Verification Modals */}
      <CameraProofModal
        isOpen={isPhotoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        onPhotoAccepted={(photo) => setPodPhoto(photo)}
        locationMetadata={currentCoords}
      />

      <QRScannerModal
        isOpen={isQRModalOpen}
        onClose={() => setQRModalOpen(false)}
        onCodeVerified={(code) => setVerifiedCode(code)}
        expectedCode={delivery.verificationCode || '123456'}
      />
    </div>
  );
}

const styles = {
  screen: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    boxSizing: 'border-box',
    paddingBottom: '100px',
  },
  navBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#38bdf8',
    fontSize: '15px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  navTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
  },
  badge: {
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#fff',
    textTransform: 'uppercase',
  },
  content: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  routeCard: {
    backgroundColor: '#1e293b',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  routeNode: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  dotPickup: {
    color: '#38bdf8',
    fontSize: '18px',
  },
  dotDropoff: {
    color: '#4ade80',
    fontSize: '18px',
  },
  nodeLabel: {
    fontSize: '10px',
    color: '#94a3b8',
    fontWeight: 'bold',
    letterSpacing: '0.5px',
  },
  nodeText: {
    margin: '2px 0 0 0',
    fontSize: '15px',
    color: '#f8fafc',
  },
  routeDivider: {
    height: '1px',
    backgroundColor: '#334155',
    margin: '4px 0',
  },
  navLinkBtn: {
    marginTop: '6px',
    display: 'block',
    textAlign: 'center',
    backgroundColor: '#334155',
    color: '#38bdf8',
    textDecoration: 'none',
    padding: '12px',
    borderRadius: '10px',
    fontWeight: 'bold',
    fontSize: '14px',
  },
  customerCard: {
    backgroundColor: '#1e293b',
    borderRadius: '14px',
    padding: '14px 18px',
    border: '1px solid #334155',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerLeft: {
    display: 'flex',
    flexDirection: 'column',
  },
  customerName: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  customerNote: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  phoneCallBtn: {
    backgroundColor: '#16a34a',
    color: '#fff',
    textDecoration: 'none',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 'bold',
  },
  verificationCard: {
    backgroundColor: '#1e293b',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid #334155',
  },
  cardHeading: {
    margin: '0 0 4px 0',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  cardSubheading: {
    margin: '0 0 16px 0',
    fontSize: '12px',
    color: '#94a3b8',
  },
  gateGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  gateTile: {
    border: '2px dashed #475569',
    borderRadius: '14px',
    padding: '18px 10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    cursor: 'pointer',
    color: '#f8fafc',
  },
  gateIcon: {
    fontSize: '24px',
  },
  gateLabel: {
    fontSize: '13px',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  gateSub: {
    fontSize: '11px',
    color: '#4ade80',
    fontWeight: 'bold',
  },
  bottomBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0f172a',
    borderTop: '1px solid #1e293b',
    padding: '16px',
    boxSizing: 'border-box',
    zIndex: 100,
  },
  primaryActionBtn: {
    width: '100%',
    height: '56px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '14px',
    fontSize: '16px',
    fontWeight: 'bold',
    letterSpacing: '0.5px',
  },
};