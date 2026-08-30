import React, { useState } from 'react';
import DeliveryCard from '../components/DeliveryCard';
import DeliveryDetailModal from '../components/DeliveryDetailModal';
import PickupConfirmModal from '../components/PickupConfirmModal';
import RiderSwitcherModal from '../components/RiderSwitcherModal';

export default function RiderHomeScreen({
  riderId,
  onRiderIdChange,
  deliveries,
  onSelectDelivery,
  isConnected,
  onRefresh,
  isLoading,
  onConfirmPickup,
}) {
  const [filterTab, setFilterTab] = useState('active'); // 'active', 'transit', 'completed', 'all'
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals state
  const [selectedDetailDelivery, setSelectedDetailDelivery] = useState(null);
  const [pickupConfirmDelivery, setPickupConfirmDelivery] = useState(null);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  const pendingPickup = deliveries.filter((d) => d.status === 'ASSIGNED' || d.status === 'OPEN');
  const inTransit = deliveries.filter((d) => d.status === 'PICKED_UP');
  const completed = deliveries.filter((d) => d.status === 'DELIVERED');

  const filteredDeliveries = deliveries.filter((d) => {
    // Tab filter
    if (filterTab === 'active' && d.status !== 'ASSIGNED' && d.status !== 'OPEN' && d.status !== 'PICKED_UP') return false;
    if (filterTab === 'transit' && d.status !== 'PICKED_UP') return false;
    if (filterTab === 'completed' && d.status !== 'DELIVERED') return false;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        (d.reference || '').toLowerCase().includes(q) ||
        String(d.id).toLowerCase().includes(q) ||
        (d.customerName || '').toLowerCase().includes(q) ||
        (d.dropoffAddress || '').toLowerCase().includes(q) ||
        (d.packageDetails || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getRiderName = (id) => {
    if (id === '4') return 'Brian Mutua';
    if (id === '5') return 'Grace Wanjiru';
    if (id === '6') return 'James Otieno';
    if (id === 'all') return 'All Fleet Deliveries';
    return `Rider #${id}`;
  };

  return (
    <div style={styles.container}>
      {/* Top Professional Header */}
      <header style={styles.header}>
        <div style={styles.topRow}>
          <div style={styles.brandGroup}>
            <div style={styles.logoBadge}>⚡</div>
            <div>
              <h1 style={styles.appTitle}>REFLEX Rider</h1>
              <span style={styles.regionTag}>Railway Production Network</span>
            </div>
          </div>

          <div style={styles.headerRight}>
            <div style={styles.livePill}>
              <span
                style={{
                  ...styles.socketDot,
                  backgroundColor: isConnected ? '#22c55e' : '#f59e0b',
                }}
              />
              <span style={styles.socketText}>{isConnected ? 'Live' : 'Syncing'}</span>
            </div>
            <button onClick={onRefresh} style={styles.refreshIconBtn} disabled={isLoading}>
              {isLoading ? '⏳' : '🔄'}
            </button>
          </div>
        </div>

        {/* Rider Profile Card Button (Opens Switcher Modal) */}
        <div style={styles.riderBar} onClick={() => setIsSwitcherOpen(true)}>
          <div style={styles.riderAvatar}>
            {getRiderName(riderId).slice(0, 1)}
          </div>
          <div style={styles.riderInfo}>
            <span style={styles.riderRole}>Active Rider Account</span>
            <strong style={styles.riderNameText}>{getRiderName(riderId)}</strong>
          </div>
          <button style={styles.switchPillBtn}>
            Switch Profile ▾
          </button>
        </div>

        {/* Shift Metrics Bar */}
        <div style={styles.kpiRow}>
          <div style={styles.kpiCard} onClick={() => setFilterTab('active')}>
            <span style={styles.kpiValue}>{pendingPickup.length}</span>
            <span style={styles.kpiLabel}>To Pickup</span>
          </div>
          <div style={styles.kpiCard} onClick={() => setFilterTab('transit')}>
            <span style={{ ...styles.kpiValue, color: '#38bdf8' }}>{inTransit.length}</span>
            <span style={styles.kpiLabel}>In Transit</span>
          </div>
          <div style={styles.kpiCard} onClick={() => setFilterTab('completed')}>
            <span style={{ ...styles.kpiValue, color: '#34d399' }}>{completed.length}</span>
            <span style={styles.kpiLabel}>Delivered</span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main style={styles.main}>
        {/* In-Transit Ongoing Alert Banner */}
        {inTransit.length > 0 && (
          <div style={styles.inTransitBanner}>
            <div style={styles.bannerLeft}>
              <span style={styles.inTransitLabel}>🚴 ACTIVE IN-TRANSIT DROPOFF</span>
              <p style={styles.inTransitText}>
                {inTransit[0].reference || `#${inTransit[0].id}`}: {inTransit[0].dropoffAddress || 'Customer Destination'}
              </p>
            </div>
            <button
              onClick={() => onSelectDelivery(inTransit[0])}
              style={styles.resumeBtn}
            >
              Resume →
            </button>
          </div>
        )}

        {/* Search & Segmented Filter Controls */}
        <div style={styles.controlsSection}>
          <input
            type="text"
            placeholder="Search waybill, customer, or destination..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchBar}
          />

          <div style={styles.segmentedTabBar}>
            <button
              onClick={() => setFilterTab('active')}
              style={{
                ...styles.tabBtn,
                backgroundColor: filterTab === 'active' ? '#0284c7' : 'transparent',
                color: filterTab === 'active' ? '#ffffff' : '#94a3b8',
              }}
            >
              Active ({pendingPickup.length + inTransit.length})
            </button>
            <button
              onClick={() => setFilterTab('transit')}
              style={{
                ...styles.tabBtn,
                backgroundColor: filterTab === 'transit' ? '#0284c7' : 'transparent',
                color: filterTab === 'transit' ? '#ffffff' : '#94a3b8',
              }}
            >
              In Transit ({inTransit.length})
            </button>
            <button
              onClick={() => setFilterTab('completed')}
              style={{
                ...styles.tabBtn,
                backgroundColor: filterTab === 'completed' ? '#0284c7' : 'transparent',
                color: filterTab === 'completed' ? '#ffffff' : '#94a3b8',
              }}
            >
              Done ({completed.length})
            </button>
            <button
              onClick={() => setFilterTab('all')}
              style={{
                ...styles.tabBtn,
                backgroundColor: filterTab === 'all' ? '#0284c7' : 'transparent',
                color: filterTab === 'all' ? '#ffffff' : '#94a3b8',
              }}
            >
              All ({deliveries.length})
            </button>
          </div>
        </div>

        {/* Deliveries List */}
        {filteredDeliveries.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📦</div>
            <h3 style={styles.emptyTitle}>No deliveries in this section</h3>
            <p style={styles.emptyText}>
              Deliveries assigned by Dispatch on Railway will appear here in real-time.
            </p>
            <button onClick={onRefresh} style={styles.emptyRefreshBtn}>
              🔄 Refresh List
            </button>
          </div>
        ) : (
          <div style={styles.deliveriesList}>
            {filteredDeliveries.map((delivery) => (
              <DeliveryCard
                key={delivery.id}
                delivery={delivery}
                onSelect={(d) => {
                  if (d.status === 'PICKED_UP') {
                    onSelectDelivery(d);
                  } else {
                    setSelectedDetailDelivery(d);
                  }
                }}
                onPickupClick={(d) => setPickupConfirmDelivery(d)}
              />
            ))}
          </div>
        )}
      </main>

      {/* ─── Modals ─── */}
      {/* 1. Delivery Details Modal */}
      <DeliveryDetailModal
        isOpen={Boolean(selectedDetailDelivery)}
        delivery={selectedDetailDelivery}
        onClose={() => setSelectedDetailDelivery(null)}
        onStartPickup={(d) => {
          setSelectedDetailDelivery(null);
          setPickupConfirmDelivery(d);
        }}
        onContinueDropoff={(d) => {
          setSelectedDetailDelivery(null);
          onSelectDelivery(d);
        }}
      />

      {/* 2. Pickup Confirmation Modal */}
      <PickupConfirmModal
        isOpen={Boolean(pickupConfirmDelivery)}
        delivery={pickupConfirmDelivery}
        onClose={() => setPickupConfirmDelivery(null)}
        onConfirm={async (d) => {
          await onConfirmPickup(d.id, riderId);
          onSelectDelivery({ ...d, status: 'PICKED_UP' });
        }}
      />

      {/* 3. Rider Switcher Modal */}
      <RiderSwitcherModal
        isOpen={isSwitcherOpen}
        currentRiderId={riderId}
        onClose={() => setIsSwitcherOpen(false)}
        onSelectRider={(newId) => onRiderIdChange(newId)}
      />
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#090d16',
    color: '#f8fafc',
    boxSizing: 'border-box',
    paddingBottom: '70px',
  },
  header: {
    backgroundColor: '#0f172a',
    padding: '14px 16px',
    borderBottom: '1px solid #1e293b',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoBadge: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: '#0284c7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)',
  },
  appTitle: {
    margin: 0,
    fontSize: '17px',
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: '-0.01em',
  },
  regionTag: {
    fontSize: '11px',
    color: '#38bdf8',
    fontWeight: '700',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  livePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#1e293b',
    padding: '5px 10px',
    borderRadius: '16px',
    border: '1px solid #334155',
  },
  socketDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
  },
  socketText: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#cbd5e1',
  },
  refreshIconBtn: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    color: '#38bdf8',
    borderRadius: '8px',
    padding: '6px 10px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  riderBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: '#1e293b',
    padding: '10px 14px',
    borderRadius: '14px',
    border: '1px solid #334155',
    cursor: 'pointer',
  },
  riderAvatar: {
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    backgroundColor: '#0284c7',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '800',
    fontSize: '15px',
  },
  riderInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  riderRole: {
    fontSize: '10px',
    color: '#94a3b8',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  riderNameText: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#f8fafc',
  },
  switchPillBtn: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    color: '#38bdf8',
    fontSize: '11px',
    fontWeight: '700',
    padding: '6px 10px',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
  },
  kpiCard: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    padding: '10px',
    textAlign: 'center',
    border: '1px solid #334155',
    cursor: 'pointer',
  },
  kpiValue: {
    fontSize: '18px',
    fontWeight: '900',
    color: '#fde047',
    display: 'block',
  },
  kpiLabel: {
    fontSize: '10px',
    color: '#94a3b8',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: '2px',
    display: 'block',
  },
  main: {
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  inTransitBanner: {
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    border: '1.5px solid #0284c7',
    borderRadius: '14px',
    padding: '12px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    boxShadow: '0 4px 14px rgba(2, 132, 199, 0.2)',
  },
  bannerLeft: {
    flex: 1,
  },
  inTransitLabel: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: '0.5px',
    display: 'block',
  },
  inTransitText: {
    margin: '2px 0 0 0',
    fontSize: '13px',
    fontWeight: '600',
    color: '#f8fafc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  resumeBtn: {
    backgroundColor: '#0284c7',
    color: '#fff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    flexShrink: 0,
  },
  controlsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  searchBar: {
    width: '100%',
    padding: '11px 14px',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '12px',
    color: '#ffffff',
    fontSize: '13px',
    outline: 'none',
  },
  segmentedTabBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    backgroundColor: '#0f172a',
    borderRadius: '10px',
    padding: '4px',
    border: '1px solid #1e293b',
    gap: '3px',
  },
  tabBtn: {
    border: 'none',
    padding: '8px 4px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  deliveriesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  emptyState: {
    backgroundColor: '#0f172a',
    borderRadius: '16px',
    padding: '36px 18px',
    textAlign: 'center',
    border: '1.5px dashed #334155',
    marginTop: '8px',
  },
  emptyIcon: {
    fontSize: '36px',
    marginBottom: '8px',
  },
  emptyTitle: {
    margin: '0 0 4px 0',
    fontSize: '15px',
    fontWeight: '700',
  },
  emptyText: {
    margin: '0 0 16px 0',
    fontSize: '12px',
    color: '#94a3b8',
    lineHeight: '1.45',
  },
  emptyRefreshBtn: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    color: '#38bdf8',
    padding: '10px 18px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
};