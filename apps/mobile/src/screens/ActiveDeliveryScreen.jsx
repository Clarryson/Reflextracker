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
          // Wake lock fallback
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
        podPhoto.blob || podPhoto.dataUrl,
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
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.dropoffAddress || delivery.deliveryAddress || '')}`;

  return (
    <div style={styles.screen}>
      {/* Top Navbar */}
      <nav style={styles.navBar}>
        <button onClick={onBack} style={styles.backBtn}>
          ← Back
        </button>
        <div style={styles.navTitleBlock}>
          <span style={styles.navWaybillTag}>IN PROGRESS</span>
          <span style={styles.navTitle}>{delivery.reference || `#${delivery.id}`}</span>
        </div>
        <span
          style={{
            ...styles.badge,
            backgroundColor: status === 'PICKED_UP' ? '#38bdf822' : '#fde04722',
            color: status === 'PICKED_UP' ? '#38bdf8' : '#fde047',
            borderColor: status === 'PICKED_UP' ? '#38bdf844' : '#fde04744',
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
              <span style={styles.nodeLabel}>PICKUP DEPOT</span>
              <p style={styles.nodeText}>{delivery.pickupAddress || (delivery.retailerName ? `${delivery.retailerName} Depot` : 'Merchant Warehouse')}</p>
            </div>
          </div>

          <div style={styles.routeDivider} />

          <div style={styles.routeNode}>
            <span style={styles.dotDropoff}>●</span>
            <div>
              <span style={styles.nodeLabel}>DROPOFF DESTINATION</span>
              <p style={styles.nodeText}>{delivery.dropoffAddress || delivery.deliveryAddress || 'Customer Destination'}</p>
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

        {/* Customer Information Card */}
        <div style={styles.customerCard}>
          <div style={styles.customerLeft}>
            <span style={styles.customerName}>👤 {delivery.customerName || 'Customer Recipient'}</span>
            <span style={styles.customerNote}>{delivery.packageDetails || delivery.itemDescription || 'Delivery Package'}</span>
          </div>
          {delivery.customerPhone && (
            <a href={`tel:${delivery.customerPhone}`} style={styles.phoneCallBtn}>
              📞 Call Recipient
            </a>
          )}
        </div>

        {/* In-Transit Dropoff Validation Checklist (PICKED_UP Mode) */}
        {status === 'PICKED_UP' && (
          <div style={styles.verificationCard}>
            <div style={styles.gateHeader}>
              <h3 style={styles.cardHeading}>Dropoff Verification Gates</h3>
              <span style={styles.gateSubheading}>
                Both gates required for handoff confirmation
              </span>
            </div>

            <div style={styles.gateGrid}>
              {/* Gate 1: Photo */}
              <button
                onClick={() => setPhotoModalOpen(true)}
                style={{
                  ...styles.gateTile,
                  borderColor: podPhoto ? '#22c55e' : '#334155',
                  backgroundColor: podPhoto ? 'rgba(34, 197, 94, 0.12)' : '#0f172a',
                }}
              >
                <div style={{ ...styles.gateIconBadge, backgroundColor: podPhoto ? '#16a34a' : '#334155' }}>
                  {podPhoto ? '✓' : '📷'}
                </div>
                <span style={styles.gateLabel}>
                  {podPhoto ? 'Photo Uploaded' : 'Capture Proof Photo'}
                </span>
                {podPhoto && <span style={styles.gateStatusBadge}>✓ {podPhoto.sizeKb} KB</span>}
              </button>

              {/* Gate 2: PIN / QR */}
              <button
                onClick={() => setQRModalOpen(true)}
                style={{
                  ...styles.gateTile,
                  borderColor: verifiedCode ? '#22c55e' : '#334155',
                  backgroundColor: verifiedCode ? 'rgba(34, 197, 94, 0.12)' : '#0f172a',
                }}
              >
                <div style={{ ...styles.gateIconBadge, backgroundColor: verifiedCode ? '#16a34a' : '#334155' }}>
                  {verifiedCode ? '✓' : '🔢'}
                </div>
                <span style={styles.gateLabel}>
                  {verifiedCode ? 'Code Verified' : 'Verify PIN / QR'}
                </span>
                {verifiedCode && <span style={styles.gateStatusBadge}>✓ Verified</span>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fixed Ergonomic Bottom Action Bar */}
      <div style={styles.bottomBar}>
        {status !== 'PICKED_UP' ? (
          <button
            onClick={handlePickup}
            disabled={isSubmitting}
            style={styles.primaryActionBtn}
          >
            {isSubmitting ? 'Confirming Pickup...' : '✓ CONFIRM PACKAGE PICKUP'}
          </button>
        ) : (
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
              ? '✓ COMPLETE DELIVERY'
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
        expectedCode={delivery.qrToken || delivery.verificationCode || '123456'}
      />
    </div>
  );
}

const styles = {
  screen: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#090d16',
    color: '#f8fafc',
    boxSizing: 'border-box',
    paddingBottom: '80px',
  },
  navBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    backgroundColor: '#0f172a',
    borderBottom: '1px solid #1e293b',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#38bdf8',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  navTitleBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  navWaybillTag: {
    fontSize: '9.5px',
    color: '#94a3b8',
    fontWeight: '700',
    letterSpacing: '0.6px',
  },
  navTitle: {
    fontSize: '15px',
    fontWeight: '800',
    color: '#ffffff',
  },
  badge: {
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '10.5px',
    fontWeight: '800',
    border: '1px solid',
    textTransform: 'uppercase',
  },
  content: {
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  routeCard: {
    backgroundColor: '#0f172a',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid #1e293b',
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
    fontSize: '16px',
  },
  dotDropoff: {
    color: '#4ade80',
    fontSize: '16px',
  },
  nodeLabel: {
    fontSize: '10px',
    color: '#94a3b8',
    fontWeight: '700',
    letterSpacing: '0.5px',
    display: 'block',
  },
  nodeText: {
    margin: '2px 0 0 0',
    fontSize: '13.5px',
    color: '#f8fafc',
    fontWeight: '600',
  },
  routeDivider: {
    height: '1px',
    backgroundColor: '#1e293b',
    margin: '2px 0',
  },
  navLinkBtn: {
    marginTop: '6px',
    display: 'block',
    textAlign: 'center',
    backgroundColor: '#1e293b',
    color: '#38bdf8',
    textDecoration: 'none',
    padding: '11px',
    borderRadius: '10px',
    fontWeight: '700',
    fontSize: '12.5px',
    border: '1px solid #334155',
  },
  customerCard: {
    backgroundColor: '#0f172a',
    borderRadius: '16px',
    padding: '14px 16px',
    border: '1px solid #1e293b',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  customerName: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#f8fafc',
  },
  customerNote: {
    fontSize: '11.5px',
    color: '#94a3b8',
  },
  phoneCallBtn: {
    backgroundColor: '#16a34a',
    color: '#fff',
    textDecoration: 'none',
    padding: '8px 14px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: 'bold',
    boxShadow: '0 2px 8px rgba(22, 163, 74, 0.3)',
  },
  verificationCard: {
    backgroundColor: '#0f172a',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid #1e293b',
  },
  gateHeader: {
    marginBottom: '12px',
  },
  cardHeading: {
    margin: '0 0 2px 0',
    fontSize: '15px',
    fontWeight: '800',
    color: '#f8fafc',
  },
  gateSubheading: {
    fontSize: '11.5px',
    color: '#94a3b8',
  },
  gateGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  gateTile: {
    borderRadius: '14px',
    padding: '14px 10px',
    border: '1.5px solid',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    cursor: 'pointer',
    color: '#f8fafc',
  },
  gateIconBadge: {
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    color: '#ffffff',
  },
  gateLabel: {
    fontSize: '12px',
    fontWeight: '700',
    textAlign: 'center',
  },
  gateStatusBadge: {
    fontSize: '10px',
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
    padding: '14px 16px',
    boxSizing: 'border-box',
    zIndex: 100,
  },
  primaryActionBtn: {
    width: '100%',
    height: '48px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '800',
    letterSpacing: '0.5px',
    boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
  },
};