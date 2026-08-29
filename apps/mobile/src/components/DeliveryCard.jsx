import React from 'react';

export default function DeliveryCard({ delivery, onSelect }) {
  const isPickedUp = delivery.status === 'PICKED_UP';
  const isAssigned = delivery.status === 'ASSIGNED';
  const isDelivered = delivery.status === 'DELIVERED';

  const getStatusColor = () => {
    if (isDelivered) return '#16a34a';
    if (isPickedUp) return '#0284c7';
    return '#f59e0b';
  };

  const navUrl = delivery.dropoffLat && delivery.dropoffLng
    ? `https://www.google.com/maps/dir/?api=1&destination=${delivery.dropoffLat},${delivery.dropoffLng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.dropoffAddress || '')}`;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div>
          <span style={styles.orderLabel}>ORDER</span>
          <h4 style={styles.orderId}>#{delivery.id ? delivery.id.slice(0, 8) : 'DEL-001'}</h4>
        </div>
        <span style={{ ...styles.badge, backgroundColor: getStatusColor() }}>
          {delivery.status}
        </span>
      </div>

      {delivery.customerName && (
        <div style={styles.customerRow}>
          <span style={styles.customerName}>👤 {delivery.customerName}</span>
          {delivery.customerPhone && (
            <a href={`tel:${delivery.customerPhone}`} style={styles.callBtn}>
              📞 Call Customer
            </a>
          )}
        </div>
      )}

      <div style={styles.timeline}>
        <div style={styles.timelineItem}>
          <div style={styles.dotPickup}>●</div>
          <div style={styles.timelineContent}>
            <span style={styles.stopLabel}>PICKUP FROM</span>
            <p style={styles.addressText}>{delivery.pickupAddress || 'Retail Merchant Depot'}</p>
          </div>
        </div>

        <div style={styles.timelineLine} />

        <div style={styles.timelineItem}>
          <div style={styles.dotDropoff}>●</div>
          <div style={styles.timelineContent}>
            <span style={styles.stopLabel}>DROPOFF TO</span>
            <p style={styles.addressText}>{delivery.dropoffAddress || 'Customer Address'}</p>
          </div>
        </div>
      </div>

      <div style={styles.actionRow}>
        <a
          href={navUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.mapBtn}
          onClick={(e) => e.stopPropagation()}
        >
          🗺️ Open Map
        </a>

        <button
          onClick={() => onSelect && onSelect(delivery)}
          style={styles.openBtn}
        >
          {isAssigned ? 'Start Pickup →' : isPickedUp ? 'Continue Dropoff →' : 'View Details'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: '#1e293b',
    borderRadius: '16px',
    padding: '18px',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderLabel: {
    fontSize: '10px',
    color: '#94a3b8',
    fontWeight: 'bold',
    letterSpacing: '1px',
  },
  orderId: {
    margin: '2px 0 0 0',
    fontSize: '17px',
    color: '#f8fafc',
    fontWeight: 'bold',
  },
  badge: {
    padding: '4px 10px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#ffffff',
    textTransform: 'uppercase',
  },
  customerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: '8px 12px',
    borderRadius: '10px',
  },
  customerName: {
    fontSize: '13px',
    color: '#f1f5f9',
    fontWeight: '500',
  },
  callBtn: {
    fontSize: '12px',
    color: '#38bdf8',
    textDecoration: 'none',
    fontWeight: 'bold',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    padding: '4px 8px',
    borderRadius: '6px',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    position: 'relative',
    paddingLeft: '4px',
  },
  timelineItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  timelineLine: {
    width: '2px',
    height: '14px',
    backgroundColor: '#475569',
    marginLeft: '6px',
  },
  timelineContent: {
    flex: 1,
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
  stopLabel: {
    fontSize: '10px',
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: '0.5px',
    display: 'block',
  },
  addressText: {
    margin: '2px 0 0 0',
    fontSize: '14px',
    color: '#f8fafc',
    lineHeight: '1.3',
  },
  actionRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '4px',
  },
  mapBtn: {
    flex: 1,
    textAlign: 'center',
    backgroundColor: '#334155',
    color: '#38bdf8',
    textDecoration: 'none',
    padding: '12px 8px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 'bold',
    boxSizing: 'border-box',
  },
  openBtn: {
    flex: 2,
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    padding: '12px 8px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
};