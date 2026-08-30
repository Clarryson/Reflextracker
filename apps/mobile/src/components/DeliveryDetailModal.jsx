import React from 'react';

export default function DeliveryDetailModal({ isOpen, delivery, onClose, onStartPickup, onContinueDropoff }) {
  if (!isOpen || !delivery) return null;

  const isAssigned = delivery.status === 'ASSIGNED' || delivery.status === 'OPEN';
  const isPickedUp = delivery.status === 'PICKED_UP';
  const isDelivered = delivery.status === 'DELIVERED';

  const navUrl = delivery.dropoffLat && delivery.dropoffLng
    ? `https://www.google.com/maps/dir/?api=1&destination=${delivery.dropoffLat},${delivery.dropoffLng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.dropoffAddress || delivery.deliveryAddress || '')}`;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        {/* Drag handle */}
        <div style={styles.dragBar} />

        {/* Modal Header */}
        <div style={styles.header}>
          <div>
            <span style={styles.refTag}>WAYBILL ORDER</span>
            <h3 style={styles.title}>{delivery.reference || `#${delivery.id}`}</h3>
          </div>
          <span style={{ ...styles.badge, ...styles[`badge_${delivery.status}`] }}>
            {delivery.status}
          </span>
        </div>

        {/* Scrollable Content */}
        <div style={styles.body}>
          {/* Package Info Card */}
          <div style={styles.infoCard}>
            <div style={styles.infoRow}>
              <span style={styles.icon}>📦</span>
              <div>
                <span style={styles.label}>Package / Item Description</span>
                <p style={styles.val}>{delivery.packageDetails || delivery.itemDescription || 'Standard Parcel'}</p>
              </div>
            </div>
          </div>

          {/* Customer & Call Action */}
          <div style={styles.customerCard}>
            <div style={styles.customerInfo}>
              <span style={styles.icon}>👤</span>
              <div>
                <span style={styles.label}>Customer Recipient</span>
                <p style={styles.val}>{delivery.customerName || 'Customer'}</p>
                <span style={styles.subVal}>{delivery.customerPhone || 'No phone provided'}</span>
              </div>
            </div>
            {delivery.customerPhone && (
              <a href={`tel:${delivery.customerPhone}`} style={styles.callButton}>
                📞 Call
              </a>
            )}
          </div>

          {/* Route Milestones */}
          <div style={styles.routeContainer}>
            <div style={styles.nodeItem}>
              <span style={styles.dotPickup}>●</span>
              <div style={styles.nodeText}>
                <span style={styles.label}>PICKUP FROM</span>
                <p style={styles.val}>{delivery.pickupAddress || (delivery.retailerName ? `${delivery.retailerName} Depot` : 'Merchant Depot')}</p>
              </div>
            </div>

            <div style={styles.nodeDivider} />

            <div style={styles.nodeItem}>
              <span style={styles.dotDropoff}>●</span>
              <div style={styles.nodeText}>
                <span style={styles.label}>DROPOFF TO</span>
                <p style={styles.val}>{delivery.dropoffAddress || delivery.deliveryAddress || 'Customer Destination'}</p>
              </div>
            </div>
          </div>

          {/* External Map Trigger */}
          <a href={navUrl} target="_blank" rel="noopener noreferrer" style={styles.mapLinkBtn}>
            🗺️ Open in Google Maps
          </a>

          {/* QR Token Preview */}
          {delivery.qrToken && (
            <div style={styles.qrInfoCard}>
              <span style={styles.label}>Security Verification Token</span>
              <code style={styles.tokenCode}>{delivery.qrToken}</code>
            </div>
          )}
        </div>

        {/* Bottom Modal Actions */}
        <div style={styles.footer}>
          {isAssigned && (
            <button
              onClick={() => {
                onClose();
                onStartPickup(delivery);
              }}
              style={styles.primaryBtn}
            >
              Confirm Package Pickup →
            </button>
          )}

          {isPickedUp && (
            <button
              onClick={() => {
                onClose();
                onContinueDropoff(delivery);
              }}
              style={{ ...styles.primaryBtn, backgroundColor: '#0284c7' }}
            >
              Continue In-Transit Dropoff →
            </button>
          )}

          {isDelivered && (
            <button onClick={onClose} style={styles.secondaryBtn}>
              Close Waybill Details
            </button>
          )}
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
    animation: 'fadeIn 0.2s ease',
  },
  sheet: {
    backgroundColor: '#1e293b',
    width: '100%',
    maxWidth: '520px',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    padding: '16px 20px 24px 20px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    borderTop: '1px solid #334155',
    boxShadow: '0 -10px 30px rgba(0,0,0,0.5)',
  },
  dragBar: {
    width: '44px',
    height: '5px',
    backgroundColor: '#475569',
    borderRadius: '10px',
    alignSelf: 'center',
    marginBottom: '14px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #334155',
  },
  refTag: {
    fontSize: '10px',
    color: '#94a3b8',
    fontWeight: 'bold',
    letterSpacing: '1px',
  },
  title: {
    margin: '2px 0 0 0',
    fontSize: '18px',
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: '0.5px',
  },
  badge: {
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  badge_OPEN: { backgroundColor: '#fef08a22', color: '#fde047', border: '1px solid #fef08a44' },
  badge_ASSIGNED: { backgroundColor: '#818cf822', color: '#a5b4fc', border: '1px solid #818cf844' },
  badge_PICKED_UP: { backgroundColor: '#38bdf822', color: '#38bdf8', border: '1px solid #38bdf844' },
  badge_DELIVERED: { backgroundColor: '#10b98122', color: '#34d399', border: '1px solid #10b98144' },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    overflowY: 'auto',
    paddingBottom: '16px',
  },
  infoCard: {
    backgroundColor: '#0f172a',
    borderRadius: '14px',
    padding: '14px',
    border: '1px solid #334155',
  },
  infoRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  icon: {
    fontSize: '20px',
  },
  label: {
    fontSize: '11px',
    color: '#94a3b8',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'block',
    marginBottom: '2px',
  },
  val: {
    margin: 0,
    fontSize: '14px',
    color: '#f8fafc',
    fontWeight: '600',
  },
  subVal: {
    fontSize: '12px',
    color: '#38bdf8',
    fontWeight: '500',
  },
  customerCard: {
    backgroundColor: '#0f172a',
    borderRadius: '14px',
    padding: '14px',
    border: '1px solid #334155',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerInfo: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  callButton: {
    backgroundColor: '#16a34a',
    color: '#ffffff',
    textDecoration: 'none',
    padding: '8px 16px',
    borderRadius: '10px',
    fontWeight: 'bold',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    boxShadow: '0 2px 8px rgba(22, 163, 74, 0.3)',
  },
  routeContainer: {
    backgroundColor: '#0f172a',
    borderRadius: '14px',
    padding: '16px',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  nodeItem: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  nodeDivider: {
    width: '2px',
    height: '16px',
    backgroundColor: '#334155',
    marginLeft: '6px',
  },
  dotPickup: {
    color: '#38bdf8',
    fontSize: '16px',
  },
  dotDropoff: {
    color: '#4ade80',
    fontSize: '16px',
  },
  nodeText: {
    flex: 1,
  },
  mapLinkBtn: {
    display: 'block',
    textAlign: 'center',
    backgroundColor: '#334155',
    color: '#38bdf8',
    padding: '12px',
    borderRadius: '12px',
    fontWeight: 'bold',
    fontSize: '13px',
    textDecoration: 'none',
  },
  qrInfoCard: {
    backgroundColor: '#0f172a',
    borderRadius: '12px',
    padding: '12px',
    border: '1px solid #334155',
  },
  tokenCode: {
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#fde047',
    wordBreak: 'break-all',
    marginTop: '4px',
    display: 'block',
  },
  footer: {
    marginTop: '10px',
  },
  primaryBtn: {
    width: '100%',
    height: '52px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '14px',
    fontSize: '15px',
    fontWeight: 'bold',
    cursor: 'pointer',
    letterSpacing: '0.5px',
    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
  },
  secondaryBtn: {
    width: '100%',
    height: '46px',
    backgroundColor: '#334155',
    color: '#cbd5e1',
    border: 'none',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
};
