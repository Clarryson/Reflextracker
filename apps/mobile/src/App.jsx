import React, { useState, useEffect, useCallback } from 'react';
import RiderHomeScreen from './screens/RiderHomeScreen';
import ActiveDeliveryScreen from './screens/ActiveDeliveryScreen';
import OfflineBanner from './components/OfflineBanner';
import DeliverySummaryModal from './components/DeliverySummaryModal';

import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useRiderSocket } from './hooks/useRiderSocket';
import { getAssignedDeliveries, confirmPickup, validateOnboardingToken } from './services/api';

export default function App() {
  // ─── 0. Check URL for Onboarding Link (/join/:token or ?join=token) ───
  const urlParams = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split('/');
  const isJoinPath = pathParts[1] === 'join' && pathParts[2];
  const joinTokenParam = isJoinPath ? pathParts[2] : (urlParams.get('join') || urlParams.get('token') || urlParams.get('onboarding'));

  // Saved rider profile from previous onboarding session
  const [savedRider, setSavedRider] = useState(() => {
    try {
      const saved = localStorage.getItem('reflex_mobile_rider');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [isOnboardingMode, setIsOnboardingMode] = useState(Boolean(joinTokenParam));
  const [onboardingToken, setOnboardingToken] = useState(joinTokenParam || '');
  const [onboardingStatus, setOnboardingStatus] = useState('loading'); // 'loading', 'valid', 'invalid'
  const [onboardingRider, setOnboardingRider] = useState(null);
  const [onboardingErrorMsg, setOnboardingErrorMsg] = useState('');

  const [riderId, setRiderId] = useState(() => {
    try {
      const saved = localStorage.getItem('reflex_mobile_rider_id');
      return saved || '4'; // Default to Brian Mutua (ID: 4)
    } catch (e) {
      return '4';
    }
  });

  const [deliveries, setDeliveries] = useState([]);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [summaryDelivery, setSummaryDelivery] = useState(null);
  const [incomingAssignmentModal, setIncomingAssignmentModal] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const { isOnline, pendingCount, isSyncing, triggerSync } = useNetworkStatus();

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Onboarding validation effect
  useEffect(() => {
    if (!isOnboardingMode || !onboardingToken) return;

    let isMounted = true;
    (async () => {
      setOnboardingStatus('loading');
      const result = await validateOnboardingToken(onboardingToken);
      if (isMounted) {
        if (result.success && result.rider) {
          setOnboardingRider(result.rider);
          setOnboardingStatus('valid');
        } else {
          setOnboardingStatus('invalid');
          setOnboardingErrorMsg(result.message || 'Invalid or expired rider invitation token.');
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOnboardingMode, onboardingToken]);

  // Load deliveries for the active rider
  const loadDeliveries = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getAssignedDeliveries(riderId);
      if (data) {
        setDeliveries(data);
      }
    } catch (err) {
      console.warn('Could not load deliveries:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, [riderId]);

  useEffect(() => {
    if (!isOnboardingMode) {
      loadDeliveries();
    }
  }, [loadDeliveries, isOnboardingMode]);

  // Real-time socket callbacks
  const handleAssignmentReceived = useCallback((newDelivery) => {
    setDeliveries((prev) => {
      const exists = prev.some((d) => String(d.id) === String(newDelivery.id));
      if (exists) return prev.map((d) => (String(d.id) === String(newDelivery.id) ? newDelivery : d));
      return [newDelivery, ...prev];
    });
    setIncomingAssignmentModal(newDelivery);
    showToast(`⚡ KASI Alert: New Order ${newDelivery.reference || '#' + newDelivery.id}`);
  }, []);

  const handleOrderCancelled = useCallback((payload) => {
    const cancelledId = String(payload.deliveryId || payload.id);
    setDeliveries((prev) => prev.filter((d) => String(d.id) !== cancelledId));
    if (selectedDelivery && String(selectedDelivery.id) === cancelledId) {
      setSelectedDelivery(null);
    }
    if (incomingAssignmentModal && String(incomingAssignmentModal.id) === cancelledId) {
      setIncomingAssignmentModal(null);
    }
    showToast(`⚠️ Order #${cancelledId} was cancelled or reassigned.`);
  }, [selectedDelivery, incomingAssignmentModal]);

  const handleStatusChanged = useCallback((payload) => {
    // Handle catch-up events after reconnection
    if (payload.type === 'catch_up' && Array.isArray(payload.deliveries)) {
      setDeliveries(payload.deliveries);
      return;
    }
    
    // Handle regular status change events
    setDeliveries((prev) =>
      prev.map((d) => (String(d.id) === String(payload.deliveryId) ? { ...d, status: payload.status } : d))
    );
  }, []);

  const {
    socket,
    isConnected,
    notificationPermission,
    requestNotificationPermission,
    triggerNotificationAlert,
  } = useRiderSocket({
    riderId,
    onAssignmentReceived: handleAssignmentReceived,
    onOrderCancelled: handleOrderCancelled,
    onStatusChanged: handleStatusChanged,
  });

  const handleDeliveryCompleted = (completedRecord) => {
    setDeliveries((prev) =>
      prev.map((d) => (String(d.id) === String(completedRecord.id) ? completedRecord : d))
    );
    setSelectedDelivery(null);
    setSummaryDelivery(completedRecord);
  };

  const handleConfirmPickup = async (deliveryId) => {
    await confirmPickup(deliveryId, riderId);
    setDeliveries((prev) =>
      prev.map((d) => (String(d.id) === String(deliveryId) ? { ...d, status: 'PICKED_UP' } : d))
    );
    showToast('✓ Package picked up! Transit started.');
  };

  // Simulate full incoming assignment with sound, vibration, push notification, and popup
  const handleSimulateIncomingNotification = async () => {
    const simDelivery = {
      id: 'del-ksi-' + Math.floor(1000 + Math.random() * 9000),
      reference: 'KSI-' + Math.floor(100000 + Math.random() * 900000),
      status: 'ASSIGNED',
      pickupAddress: 'KASI Hub Westlands, Sarit Centre, Nairobi',
      dropoffAddress: 'Village Market, Limuru Rd, Gigiri, Nairobi',
      dropoffLat: -1.2297,
      dropoffLng: 36.8045,
      customerName: 'Ken Mwangi',
      customerPhone: '+254701234567',
      verificationCode: '839201',
      packageDetails: 'Express Medical & Supplies',
      createdAt: new Date().toISOString(),
    };

    triggerNotificationAlert(simDelivery);
    const updated = [simDelivery, ...deliveries];
    setDeliveries(updated);
    setIncomingAssignmentModal(simDelivery);
    showToast(`🔔 KASI Assignment Alert: ${simDelivery.reference}`);
  };

  // ─── 1. ONBOARDING WELCOME / INVALID SCREEN ───
  if (isOnboardingMode) {
    return (
      <div style={styles.appRoot}>
        <div style={styles.onboardingCard}>
          <div style={styles.onboardingHeaderGroup}>
            <div style={styles.onboardingLogoBadge}>⚡</div>
            <h1 style={styles.onboardingBrandTitle}>KASI Rider PWA</h1>
            <span style={styles.onboardingSubTag}>COURIER ONBOARDING</span>
          </div>

          {onboardingStatus === 'loading' && (
            <div style={styles.onboardingLoadingBox}>
              <div style={styles.loadingSpinner} />
              <p style={{ margin: 0, fontSize: '13.5px', color: '#cbd5e1', fontWeight: '600' }}>
                Validating invitation token...
              </p>
            </div>
          )}

          {onboardingStatus === 'valid' && onboardingRider && (
            <div style={styles.onboardingContent}>
              <div style={styles.welcomeHeroBox}>
                <div style={{ fontSize: '32px', marginBottom: '6px' }}>👋</div>
                <h2 style={{ margin: '0 0 4px 0', fontSize: '19px', fontWeight: '800', color: '#ffffff' }}>
                  Welcome to KASI!
                </h2>
                <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>
                  Hi <strong>{onboardingRider.name}</strong>, you have been registered as an authorized KASI delivery courier.
                </p>
              </div>

              {/* Rider Identity Card */}
              <div style={styles.onboardingRiderCard}>
                <div style={styles.onboardingAvatar}>
                  {(onboardingRider.name || 'R').slice(0, 1)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <code style={styles.onboardingCodeTag}>{onboardingRider.code || `#${onboardingRider.id}`}</code>
                    <span style={styles.pwaActiveBadge}>✓ KASI ACTIVE</span>
                  </div>
                  <strong style={styles.onboardingNameText}>{onboardingRider.name}</strong>
                  <span style={styles.onboardingMetaText}>📞 {onboardingRider.phone} • 📍 {onboardingRider.hub || 'Nairobi Central'}</span>
                </div>
              </div>

              {/* Home Screen PWA Tip */}
              <div style={styles.homeScreenPromptCard}>
                <span style={{ fontSize: '20px' }}>📲</span>
                <div>
                  <strong style={{ fontSize: '13px', color: '#ffffff', display: 'block' }}>
                    Add KASI to Home Screen
                  </strong>
                  <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                    Add KASI to your phone Home Screen for instant 1-tap dispatch access.
                  </span>
                </div>
              </div>

              {/* Continue Action */}
              <button
                style={styles.onboardingContinueBtn}
                onClick={() => {
                  const targetId = String(onboardingRider.id);
                  setRiderId(targetId);
                  setSavedRider(onboardingRider);
                  setIsOnboardingMode(false);
                  try {
                    localStorage.setItem('reflex_mobile_rider', JSON.stringify(onboardingRider));
                    localStorage.setItem('reflex_mobile_rider_id', targetId);
                  } catch (e) {}
                  showToast(`👋 Welcome ${onboardingRider.name}! Ready to receive deliveries.`);
                }}
              >
                🚀 Launch KASI Rider Workbench →
              </button>
            </div>
          )}

          {onboardingStatus === 'invalid' && (
            <div style={styles.onboardingInvalidBox}>
              <div style={styles.invalidIconCircle}>❌</div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: '800', color: '#ffffff' }}>
                Invalid Invitation
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>
                {onboardingErrorMsg || 'This rider invitation is invalid or has expired. Please contact your dispatcher.'}
              </p>
              <button
                style={styles.onboardingReturnBtn}
                onClick={() => {
                  setIsOnboardingMode(false);
                  window.location.href = window.location.origin;
                }}
              >
                ← Return to Home
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── 2. NORMAL PWA RIDER WORKBENCH ───
  return (

          isOnline={isOnline}
          pendingCount={pendingCount}
          isSyncing={isSyncing}
          onSyncClick={triggerSync}
        />

        {/* Screen Routing */}
        {!selectedDelivery ? (
          <RiderHomeScreen
            riderId={riderId}
            onRiderIdChange={setRiderId}
            deliveries={deliveries}
            onSelectDelivery={(delivery) => setSelectedDelivery(delivery)}
            isConnected={isConnected}
            onRefresh={loadDeliveries}
            isLoading={isLoading}
            onConfirmPickup={handleConfirmPickup}
          />
        ) : (
          <ActiveDeliveryScreen
            delivery={selectedDelivery}
            riderId={riderId}
            socket={socket}
            isOnline={isOnline}
            onBack={() => setSelectedDelivery(null)}
            onDeliveryCompleted={handleDeliveryCompleted}
          />
        )}

        {/* Post-Completion Summary Celebration Modal */}
        <DeliverySummaryModal
          isOpen={Boolean(summaryDelivery)}
          delivery={summaryDelivery}
          onClose={() => setSummaryDelivery(null)}
        />

  );
}

const styles = {
  appRoot: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: '#090d16',
    minHeight: '100vh',
    color: '#f8fafc',
    position: 'relative',
    maxWidth: '540px',
    margin: '0 auto',
    boxShadow: '0 0 40px rgba(0,0,0,0.8)',
    display: 'flex',
    flexDirection: 'column',
  },
  toast: {
    position: 'fixed',
    top: '16px',
    left: '16px',
    right: '16px',
    maxWidth: '480px',
    margin: '0 auto',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    padding: '12px 16px',
    borderRadius: '12px',
    fontWeight: 'bold',
    fontSize: '13px',
    zIndex: 99999,
    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
    textAlign: 'center',
    border: '1px solid #38bdf8',
  },
  onboardingCard: {
    margin: '20px',
    backgroundColor: '#131c2e',
    borderRadius: '24px',
    padding: '30px 20px',
    border: '1.5px solid #1e293b',
    boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '18px',
    boxSizing: 'border-box'
  },
  onboardingHeaderGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px'
  },
  onboardingLogoBadge: {
    width: '46px',
    height: '46px',
    backgroundColor: '#0284c7',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '22px',
    boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
  },
  onboardingBrandTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: '-0.02em',
  },
  onboardingSubTag: {
    fontSize: '10.5px',
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: '0.8px'
  },
  onboardingLoadingBox: {
    padding: '30px 10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px'
  },
  loadingSpinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #1e293b',
    borderTopColor: '#38bdf8',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  onboardingContent: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    textAlign: 'left'
  },
  welcomeHeroBox: {
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    border: '1px solid rgba(56, 189, 248, 0.3)',
    borderRadius: '16px',
    padding: '16px',
    textAlign: 'center'
  },
  onboardingRiderCard: {
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '16px',
    padding: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  onboardingAvatar: {
    width: '42px',
    height: '42px',
    borderRadius: '12px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontSize: '17px',
    fontWeight: '900',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  onboardingCodeTag: {
    fontFamily: 'monospace',
    fontSize: '11px',
    fontWeight: 'bold',
    backgroundColor: '#1e293b',
    color: '#38bdf8',
    padding: '2px 6px',
    borderRadius: '6px'
  },
  pwaActiveBadge: {
    fontSize: '10px',
    fontWeight: '800',
    color: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    padding: '2px 6px',
    borderRadius: '6px',
    border: '1px solid #22c55e'
  },
  onboardingNameText: {
    fontSize: '15px',
    color: '#ffffff',
    display: 'block',
    marginTop: '3px'
  },
  onboardingMetaText: {
    fontSize: '11.5px',
    color: '#94a3b8',
    display: 'block',
    marginTop: '2px'
  },
  homeScreenPromptCard: {
    backgroundColor: '#1e293b',
    border: '1px dashed #38bdf8',
    borderRadius: '12px',
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  onboardingContinueBtn: {
    width: '100%',
    height: '46px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
  },
  onboardingInvalidBox: {
    padding: '20px 10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    textAlign: 'center'
  },
  invalidIconCircle: {
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1.5px solid #ef4444',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '22px'
  },
  onboardingReturnBtn: {
    marginTop: '6px',
    backgroundColor: '#1e293b',
    color: '#38bdf8',
    border: '1px solid #334155',
    padding: '8px 18px',
    borderRadius: '10px',
    fontSize: '12.5px',
    fontWeight: '700',
    cursor: 'pointer'
  }
};