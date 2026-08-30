import React, { useState, useEffect, useCallback } from 'react';
import RiderHomeScreen from './screens/RiderHomeScreen';
import ActiveDeliveryScreen from './screens/ActiveDeliveryScreen';
import OfflineBanner from './components/OfflineBanner';
import DeliverySummaryModal from './components/DeliverySummaryModal';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useRiderSocket } from './hooks/useRiderSocket';
import { getAssignedDeliveries, confirmPickup } from './services/api';

export default function App() {
  const [riderId, setRiderId] = useState('4'); // Brian Mutua
  const [deliveries, setDeliveries] = useState([]);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [summaryDelivery, setSummaryDelivery] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const { isOnline, pendingCount, isSyncing, triggerSync } = useNetworkStatus();

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

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
    loadDeliveries();
  }, [loadDeliveries]);

  // Real-time socket callbacks
  const handleAssignmentReceived = useCallback((newDelivery) => {
    setDeliveries((prev) => {
      const exists = prev.some((d) => String(d.id) === String(newDelivery.id));
      if (exists) return prev.map((d) => (String(d.id) === String(newDelivery.id) ? newDelivery : d));
      return [newDelivery, ...prev];
    });
    showToast(`🔔 New Order Assigned: ${newDelivery.reference || '#' + newDelivery.id}`);
  }, []);

  const handleOrderCancelled = useCallback((payload) => {
    const cancelledId = String(payload.deliveryId || payload.id);
    setDeliveries((prev) => prev.filter((d) => String(d.id) !== cancelledId));
    if (selectedDelivery && String(selectedDelivery.id) === cancelledId) {
      setSelectedDelivery(null);
    }
    showToast(`⚠️ Order #${cancelledId} was cancelled or reassigned.`);
  }, [selectedDelivery]);

  const handleStatusChanged = useCallback((payload) => {
    setDeliveries((prev) =>
      prev.map((d) => (String(d.id) === String(payload.deliveryId) ? { ...d, status: payload.status } : d))
    );
  }, []);

  const { socket, isConnected } = useRiderSocket({
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

  return (
    <div style={styles.appRoot}>
      {/* Toast Banner */}
      {toastMessage && (
        <div style={styles.toast}>
          {toastMessage}
        </div>
      )}

      {/* Network and Offline Outbox Banner */}
      <OfflineBanner
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
    </div>
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
};