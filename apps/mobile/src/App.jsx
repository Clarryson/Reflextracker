import React, { useState, useEffect, useCallback } from 'react';
import RiderHomeScreen from './screens/RiderHomeScreen';
import ActiveDeliveryScreen from './screens/ActiveDeliveryScreen';
import OfflineBanner from './components/OfflineBanner';
import DeliverySummaryModal from './components/DeliverySummaryModal';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useRiderSocket } from './hooks/useRiderSocket';
import { getAssignedDeliveries } from './services/api';
import { cacheDeliveries } from './services/outboxStore';

const INITIAL_SAMPLE_DELIVERY = {
  id: 'del-nbi-' + Math.floor(1000 + Math.random() * 9000),
  status: 'ASSIGNED',
  pickupAddress: 'Depot Warehouse, Industrial Area, Road A, Nairobi',
  dropoffAddress: 'Delta Corner Towers, Westlands, Ring Rd, Nairobi',
  dropoffLat: -1.2644,
  dropoffLng: 36.8041,
  customerName: 'Amina Wanjiru',
  customerPhone: '+254712345678',
  verificationCode: '748291',
  packageDetails: 'Electronics & Accessories (Express)',
  createdAt: new Date().toISOString(),
};

export default function App() {
  const [riderId, setRiderId] = useState('rider-nairobi-01');
  const [deliveries, setDeliveries] = useState([INITIAL_SAMPLE_DELIVERY]);
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
      if (data && data.length > 0) {
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
      const exists = prev.some((d) => d.id === newDelivery.id);
      if (exists) return prev.map((d) => (d.id === newDelivery.id ? newDelivery : d));
      return [newDelivery, ...prev];
    });
    showToast(`🔔 New Order Assigned: #${newDelivery.id ? newDelivery.id.slice(0, 8) : ''}`);
  }, []);

  const handleOrderCancelled = useCallback((payload) => {
    const cancelledId = payload.deliveryId || payload.id;
    setDeliveries((prev) => prev.filter((d) => d.id !== cancelledId));
    if (selectedDelivery && selectedDelivery.id === cancelledId) {
      setSelectedDelivery(null);
    }
    showToast(`⚠️ Order #${cancelledId ? cancelledId.slice(0, 8) : ''} was cancelled or reassigned.`);
  }, [selectedDelivery]);

  const handleStatusChanged = useCallback((payload) => {
    setDeliveries((prev) =>
      prev.map((d) => (d.id === payload.deliveryId ? { ...d, status: payload.status } : d))
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
      prev.map((d) => (d.id === completedRecord.id ? completedRecord : d))
    );
    setSelectedDelivery(null);
    setSummaryDelivery(completedRecord);
  };

  const handleAddSample = async () => {
    const newSample = {
      id: 'del-nbi-' + Math.floor(1000 + Math.random() * 9000),
      status: 'ASSIGNED',
      pickupAddress: 'Depot Warehouse, Industrial Area, Road A, Nairobi',
      dropoffAddress: 'The Hub Karen, Dagoretti Rd, Nairobi',
      dropoffLat: -1.3204,
      dropoffLng: 36.7062,
      customerName: 'David Ochieng',
      customerPhone: '+254798765432',
      verificationCode: '492810',
      packageDetails: 'Parcel & Documents',
      createdAt: new Date().toISOString(),
    };
    const updated = [newSample, ...deliveries];
    setDeliveries(updated);
    await cacheDeliveries(updated);
    showToast('Sample delivery added to your tasks!');
  };

  return (
    <div style={styles.appRoot}>
      {/* Non-intrusive Toast */}
      {toastMessage && (
        <div style={styles.toast}>
          {toastMessage}
        </div>
      )}

      {/* Network and Offline Mutation Bar */}
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
          onAddSampleDelivery={handleAddSample}
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

      {/* Post-Completion Summary Modal */}
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
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    backgroundColor: '#0f172a',
    minHeight: '100vh',
    color: '#f8fafc',
    position: 'relative',
  },
  toast: {
    position: 'fixed',
    top: '16px',
    left: '16px',
    right: '16px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    padding: '12px 16px',
    borderRadius: '12px',
    fontWeight: 'bold',
    fontSize: '13px',
    zIndex: 99999,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    textAlign: 'center',
    animation: 'fadeIn 0.3s ease',
  },
};