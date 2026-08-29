import React, { useEffect, useState } from 'react';

export default function DeliverySummaryModal({ isOpen, delivery, onClose }) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!isOpen) return;

    setCountdown(5);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, onClose]);

  if (!isOpen || !delivery) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.iconCircle}>
          <span style={styles.checkIcon}>✓</span>
        </div>

        <h2 style={styles.title}>Delivery Completed!</h2>
        <p style={styles.orderSubtitle}>
          Order #{delivery.id ? delivery.id.slice(0, 8) : 'DEL-001'} is safely delivered.
        </p>

        <div style={styles.statsBlock}>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Dropoff Location:</span>
            <span style={styles.statValue}>{delivery.dropoffAddress || 'Customer Address'}</span>
          </div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Completed At:</span>
            <span style={styles.statValue}>
              {delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleTimeString() : new Date().toLocaleTimeString()}
            </span>
          </div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Proof Verification:</span>
            <span style={{ ...styles.statValue, color: '#4ade80', fontWeight: 'bold' }}>✓ Verified</span>
          </div>
        </div>

        <button onClick={onClose} style={styles.actionBtn}>
          Ready for Next Order ({countdown}s)
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px',
    boxSizing: 'border-box',
    backdropFilter: 'blur(6px)',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: '24px',
    padding: '32px 24px',
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center',
    border: '1px solid #334155',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  iconCircle: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    border: '3px solid #22c55e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  checkIcon: {
    fontSize: '36px',
    color: '#22c55e',
    fontWeight: 'bold',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '22px',
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  orderSubtitle: {
    margin: '0 0 20px 0',
    fontSize: '14px',
    color: '#94a3b8',
  },
  statsBlock: {
    backgroundColor: '#0f172a',
    borderRadius: '14px',
    padding: '16px',
    width: '100%',
    boxSizing: 'border-box',
    marginBottom: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    textAlign: 'left',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    gap: '8px',
  },
  statLabel: {
    color: '#94a3b8',
  },
  statValue: {
    color: '#f1f5f9',
    textAlign: 'right',
  },
  actionBtn: {
    width: '100%',
    height: '52px',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '14px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
};