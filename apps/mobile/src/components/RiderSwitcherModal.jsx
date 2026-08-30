import React, { useState } from 'react';

const RIDERS = [
  { id: '4', name: 'Brian Mutua', phone: '0745678901', email: 'brian@rider.co.ke', hub: 'Nairobi CBD' },
  { id: '5', name: 'Grace Wanjiru', phone: '0756789012', email: 'grace@rider.co.ke', hub: 'Westlands' },
  { id: '6', name: 'James Otieno', phone: '0767890123', email: 'james@rider.co.ke', hub: 'Industrial Area' },
  { id: 'all', name: 'All Assigned Tasks', phone: 'Dispatcher Feed', email: 'fleet@reflex.co.ke', hub: 'All Regions' },
];

export default function RiderSwitcherModal({ isOpen, currentRiderId, onClose, onSelectRider }) {
  const [customInput, setCustomInput] = useState('');

  if (!isOpen) return null;

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    if (customInput.trim()) {
      onSelectRider(customInput.trim());
      onClose();
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.dragBar} />

        <div style={styles.header}>
          <div>
            <h3 style={styles.title}>Switch Active Rider</h3>
            <p style={styles.subtitle}>Select an authenticated Railway rider profile or enter ID.</p>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.body}>
          <div style={styles.ridersGrid}>
            {RIDERS.map((r) => {
              const isSelected = String(currentRiderId) === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => {
                    onSelectRider(r.id);
                    onClose();
                  }}
                  style={{
                    ...styles.riderCard,
                    borderColor: isSelected ? '#38bdf8' : '#334155',
                    backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : '#0f172a',
                  }}
                >
                  <div style={styles.avatar}>
                    {r.name.slice(0, 1)}
                  </div>
                  <div style={styles.riderMeta}>
                    <div style={styles.nameRow}>
                      <strong style={styles.riderName}>{r.name}</strong>
                      {isSelected && <span style={styles.activeTag}>ACTIVE</span>}
                    </div>
                    <span style={styles.riderPhone}>{r.phone} • {r.hub}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Custom ID Form */}
          <form onSubmit={handleCustomSubmit} style={styles.customForm}>
            <input
              type="text"
              placeholder="Or enter custom Rider ID..."
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              style={styles.customInput}
            />
            <button type="submit" style={styles.customSubmitBtn}>
              Switch
            </button>
          </form>
        </div>
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
    backdropFilter: 'blur(6px)',
  },
  sheet: {
    backgroundColor: '#1e293b',
    width: '100%',
    maxWidth: '500px',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    padding: '16px 20px 28px 20px',
    borderTop: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 -10px 30px rgba(0,0,0,0.5)',
  },
  dragBar: {
    width: '44px',
    height: '5px',
    backgroundColor: '#475569',
    borderRadius: '10px',
    alignSelf: 'center',
    marginBottom: '16px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: '18px',
    fontWeight: '800',
    color: '#f8fafc',
  },
  subtitle: {
    margin: 0,
    fontSize: '12px',
    color: '#94a3b8',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: '20px',
    cursor: 'pointer',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  ridersGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  riderCard: {
    borderRadius: '14px',
    padding: '12px 14px',
    border: '1.5px solid',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontWeight: '900',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '17px',
  },
  riderMeta: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  nameRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  riderName: {
    fontSize: '14px',
    color: '#f8fafc',
  },
  activeTag: {
    fontSize: '10px',
    fontWeight: '900',
    color: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    padding: '2px 8px',
    borderRadius: '12px',
    letterSpacing: '0.5px',
  },
  riderPhone: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  customForm: {
    display: 'flex',
    gap: '8px',
    marginTop: '6px',
  },
  customInput: {
    flex: 1,
    padding: '12px 14px',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '10px',
    color: '#ffffff',
    fontSize: '13px',
    outline: 'none',
  },
  customSubmitBtn: {
    backgroundColor: '#334155',
    color: '#38bdf8',
    border: 'none',
    borderRadius: '10px',
    padding: '0 18px',
    fontWeight: 'bold',
    fontSize: '13px',
    cursor: 'pointer',
  },
};
