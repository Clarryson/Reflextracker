import React from 'react';

export default function NewAssignmentModal({ delivery, onAccept, onDismiss }) {
  if (!delivery) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modalCard}>
        {/* Animated KASI Pulse Header */}
        <div style={styles.pulseHeader}>
          <span style={styles.bellIcon}>⚡</span>
          <div>
            <h2 style={styles.alertTitle}>REFLEX DISPATCH ASSIGNMENT!</h2>
            <span style={styles.alertSub}>New delivery task dispatched to your queue</span>
          </div>
        </div>

        {/* Order Details Card */}
        <div style={styles.detailsCard}>
          <div style={styles.orderRow}>
            <span style={styles.orderLabel}>WAYBILL REFERENCE</span>
            <span style={styles.orderId}>{delivery.reference || '#' + (delivery.id ? String(delivery.id).slice(0, 8) : 'NEW')}</span>
          </div>

          {delivery.customerName && (
            <div style={styles.customerRow}>
              <span style={styles.customerName}>👤 {delivery.customerName}</span>
              {delivery.customerPhone && (
                <span style={styles.customerPhone}>📞 {delivery.customerPhone}</span>
              )}
            </div>
          )}

          <div style={styles.routeSection}>
            <div style={styles.routeItem}>
              <span style={styles.dotPickup}>●</span>
              <div>
                <span style={styles.routeLabel}>PICKUP FROM</span>
                <p style={styles.routeText}>{delivery.pickupAddress || 'Merchant Warehouse'}</p>
              </div>
            </div>

            <div style={styles.routeDivider} />

            <div style={styles.routeItem}>
              <span style={styles.dotDropoff}>●</span>
              <div>
                <span style={styles.routeLabel}>DROPOFF TO</span>
                <p style={styles.routeText}>{delivery.dropoffAddress || 'Customer Address'}</p>
              </div>
            </div>
          </div>

          {delivery.packageDetails && (
            <div style={styles.packageBadge}>
              📦 {delivery.packageDetails}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={styles.btnRow}>
          <button onClick={onDismiss} style={styles.dismissBtn}>
            Dismiss
          </button>
          <button onClick={() => onAccept(delivery)} style={styles.acceptBtn}>
            ⚡ Accept & Start Pickup →
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(9, 13, 22, 0.92)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 100000,
    backdropFilter: 'blur(8px)',
    animation: 'fadeIn 0.25s ease-out',
  },
  modalCard: {
    backgroundColor: '#131c2e',
    width: '100%',
    maxWidth: '480px',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    padding: '24px 20px 32px 20px',
    boxSizing: 'border-box',
    color: '#f8fafc',
    borderTop: '2.5px solid #38bdf8',
    boxShadow: '0 -10px 30px rgba(2, 132, 199, 0.35)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  pulseHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    border: '1px solid #38bdf8',
    padding: '12px 16px',
    borderRadius: '14px',
  },
  bellIcon: {
    fontSize: '26px',
    animation: 'spin 4s linear infinite',
  },
  alertTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '900',
    color: '#38bdf8',
    letterSpacing: '0.3px',
  },
  alertSub: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  detailsCard: {
    backgroundColor: '#090d16',
    borderRadius: '16px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    border: '1px solid #1e293b',
  },
  orderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderLabel: {
    fontSize: '10px',
    color: '#94a3b8',
    fontWeight: '800',
    letterSpacing: '0.5px',
  },
  orderId: {
    fontSize: '15px',
    fontWeight: '800',
    color: '#f8fafc',
  },
  customerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    backgroundColor: '#131c2e',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '13px',
  },
  customerName: {
    fontWeight: '700',
    color: '#f1f5f9',
  },
  customerPhone: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  routeSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  routeItem: {
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
  },
  dotPickup: {
    color: '#38bdf8',
    fontSize: '16px',
    lineHeight: '18px',
  },
  dotDropoff: {
    color: '#4ade80',
    fontSize: '16px',
    lineHeight: '18px',
  },
  routeLabel: {
    fontSize: '9.5px',
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: '0.5px',
    display: 'block',
  },
  routeText: {
    margin: '2px 0 0 0',
    fontSize: '13px',
    color: '#f8fafc',
    lineHeight: '1.3',
    fontWeight: '500',
  },
  routeDivider: {
    height: '1px',
    backgroundColor: '#1e293b',
    margin: '4px 0',
  },
  packageBadge: {
    backgroundColor: '#1e293b',
    color: '#e2e8f0',
    padding: '6px 10px',
    borderRadius: '8px',
    fontSize: '12px',
    textAlign: 'center',
    fontWeight: '600',
  },
  btnRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '4px',
  },
  dismissBtn: {
    flex: 1,
    height: '48px',
    backgroundColor: '#1e293b',
    color: '#94a3b8',
    border: 'none',
    borderRadius: '12px',
    fontSize: '13.5px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  acceptBtn: {
    flex: 2,
    height: '48px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
  },
};