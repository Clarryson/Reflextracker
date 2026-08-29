import React, { useState } from 'react';
import DeliveryCard from '../components/DeliveryCard';

export default function RiderHomeScreen({
  riderId,
  onRiderIdChange,
  deliveries,
  onSelectDelivery,
  isConnected,
  onRefresh,
  isLoading,
  onAddSampleDelivery,
}) {
  const [customRiderInput, setCustomRiderInput] = useState('');
  const [showRiderPicker, setShowRiderPicker] = useState(false);

  const activeJobs = deliveries.filter((d) => d.status === 'ASSIGNED' || d.status === 'PICKED_UP');
  const completedJobs = deliveries.filter((d) => d.status === 'DELIVERED');

  const handleCustomRiderSubmit = (e) => {
    e.preventDefault();
    if (customRiderInput.trim()) {
      onRiderIdChange(customRiderInput.trim());
      setShowRiderPicker(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.brandingRow}>
          <div style={styles.brandGroup}>
            <div style={styles.logoBadge}>⚡</div>
            <div>
              <h1 style={styles.appTitle}>REFLEX Rider</h1>
              <span style={styles.regionTag}>🇰🇪 Nairobi Network</span>
            </div>
          </div>

          <div style={styles.statusGroup}>
            <span
              style={{
                ...styles.socketDot,
                backgroundColor: isConnected ? '#22c55e' : '#64748b',
              }}
            />
            <span style={styles.socketText}>{isConnected ? 'Live' : 'Standby'}</span>
          </div>
        </div>

        {/* Active Rider Bar */}
        <div style={styles.riderBar}>
          <div style={styles.riderInfo}>
            <span style={styles.riderRole}>Active Rider ID:</span>
            <span style={styles.riderBadge}>{riderId}</span>
          </div>
          <button
            onClick={() => setShowRiderPicker(!showRiderPicker)}
            style={styles.switchRiderBtn}
          >
            {showRiderPicker ? 'Done' : 'Switch ID'}
          </button>
        </div>

        {/* Rider Switcher Drawer */}
        {showRiderPicker && (
          <div style={styles.pickerDrawer}>
            <div style={styles.presetButtons}>
              {['rider-nairobi-01', 'rider-cbd-02', 'rider-westlands-03'].map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    onRiderIdChange(id);
                    setShowRiderPicker(false);
                  }}
                  style={{
                    ...styles.presetBtn,
                    backgroundColor: riderId === id ? '#0284c7' : '#334155',
                  }}
                >
                  {id}
                </button>
              ))}
            </div>
            <form onSubmit={handleCustomRiderSubmit} style={styles.customIdForm}>
              <input
                type="text"
                placeholder="Enter custom Rider UUID"
                value={customRiderInput}
                onChange={(e) => setCustomRiderInput(e.target.value)}
                style={styles.customIdInput}
              />
              <button type="submit" style={styles.customIdSubmit}>
                Set
              </button>
            </form>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main style={styles.main}>
        {/* Active In-Progress Highlight */}
        {activeJobs.some((d) => d.status === 'PICKED_UP') && (
          <div style={styles.inTransitBanner}>
            <div>
              <span style={styles.inTransitLabel}>🚴 IN TRANSIT</span>
              <p style={styles.inTransitText}>You have an ongoing dropoff task.</p>
            </div>
            <button
              onClick={() => {
                const ongoing = activeJobs.find((d) => d.status === 'PICKED_UP');
                if (ongoing) onSelectDelivery(ongoing);
              }}
              style={styles.resumeBtn}
            >
              Resume Dropoff →
            </button>
          </div>
        )}

        {/* Section Header */}
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>
            Assigned Deliveries ({activeJobs.length})
          </h2>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            style={styles.refreshBtn}
          >
            {isLoading ? '⏳' : '🔄 Refresh'}
          </button>
        </div>

        {/* Deliveries List */}
        {activeJobs.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📦</div>
            <h3 style={styles.emptyTitle}>No active delivery tasks</h3>
            <p style={styles.emptyText}>
              Stay online. Incoming orders assigned by Dispatch will appear here automatically with sound & vibration alerts.
            </p>

            <button
              onClick={onAddSampleDelivery}
              style={styles.sampleDeliveryBtn}
            >
              ➕ Load Sample Demo Delivery
            </button>
          </div>
        ) : (
          <div style={styles.deliveriesList}>
            {activeJobs.map((delivery) => (
              <DeliveryCard
                key={delivery.id}
                delivery={delivery}
                onSelect={onSelectDelivery}
              />
            ))}
          </div>
        )}

        {/* Completed deliveries history */}
        {completedJobs.length > 0 && (
          <div style={styles.historySection}>
            <h3 style={styles.historyTitle}>Completed Today ({completedJobs.length})</h3>
            <div style={styles.historyList}>
              {completedJobs.map((item) => (
                <div key={item.id} style={styles.historyItem}>
                  <div>
                    <span style={styles.historyOrderId}>#{item.id.slice(0, 8)}</span>
                    <p style={styles.historyDropoff}>{item.dropoffAddress}</p>
                  </div>
                  <span style={styles.historyBadge}>✓ DELIVERED</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    boxSizing: 'border-box',
    paddingBottom: '80px',
  },
  header: {
    backgroundColor: '#1e293b',
    padding: '16px',
    borderBottom: '1px solid #334155',
  },
  brandingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
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
    fontSize: '20px',
  },
  appTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  regionTag: {
    fontSize: '11px',
    color: '#38bdf8',
    fontWeight: '500',
  },
  statusGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#0f172a',
    padding: '4px 10px',
    borderRadius: '20px',
    border: '1px solid #334155',
  },
  socketDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  socketText: {
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#94a3b8',
  },
  riderBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: '8px 12px',
    borderRadius: '10px',
  },
  riderInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  riderRole: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  riderBadge: {
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  switchRiderBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  pickerDrawer: {
    marginTop: '12px',
    backgroundColor: '#0f172a',
    padding: '12px',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  presetButtons: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  presetBtn: {
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '11px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  customIdForm: {
    display: 'flex',
    gap: '6px',
  },
  customIdInput: {
    flex: 1,
    padding: '8px 10px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '12px',
  },
  customIdSubmit: {
    backgroundColor: '#0284c7',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  main: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inTransitBanner: {
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    border: '1px solid #0284c7',
    borderRadius: '14px',
    padding: '14px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inTransitLabel: {
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#38bdf8',
    letterSpacing: '0.5px',
  },
  inTransitText: {
    margin: '2px 0 0 0',
    fontSize: '13px',
    color: '#f8fafc',
  },
  resumeBtn: {
    backgroundColor: '#0284c7',
    color: '#fff',
    border: 'none',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  refreshBtn: {
    background: 'none',
    border: '1px solid #334155',
    color: '#94a3b8',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  deliveriesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  emptyState: {
    backgroundColor: '#1e293b',
    borderRadius: '16px',
    padding: '36px 20px',
    textAlign: 'center',
    border: '1px dashed #334155',
  },
  emptyIcon: {
    fontSize: '44px',
    marginBottom: '12px',
  },
  emptyTitle: {
    margin: '0 0 8px 0',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  emptyText: {
    margin: '0 0 20px 0',
    fontSize: '13px',
    color: '#94a3b8',
    lineHeight: '1.4',
  },
  sampleDeliveryBtn: {
    backgroundColor: '#0284c7',
    color: '#fff',
    border: 'none',
    padding: '12px 20px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  historySection: {
    marginTop: '12px',
  },
  historyTitle: {
    margin: '0 0 10px 0',
    fontSize: '14px',
    color: '#94a3b8',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  historyItem: {
    backgroundColor: '#1e293b',
    borderRadius: '10px',
    padding: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyOrderId: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  historyDropoff: {
    margin: '2px 0 0 0',
    fontSize: '12px',
    color: '#94a3b8',
  },
  historyBadge: {
    fontSize: '11px',
    color: '#4ade80',
    fontWeight: 'bold',
  },
};