import React from 'react';

export default function DeliveryCard({ delivery, onSelect, onPickupClick }) {
  const isAssigned = delivery.status === 'ASSIGNED' || delivery.status === 'OPEN';
  const isPickedUp = delivery.status === 'PICKED_UP';
  const isDelivered = delivery.status === 'DELIVERED';

  const getStatusBadge = () => {
    if (isDelivered) return { label: 'Delivered', bg: '#10b98122', text: '#34d399', border: '#10b98144' };
    if (isPickedUp) return { label: 'In Transit', bg: '#38bdf822', text: '#38bdf8', border: '#38bdf844' };
    return { label: 'Assigned', bg: '#818cf822', text: '#a5b4fc', border: '#818cf844' };
  };

  const badge = getStatusBadge();

  return (
    <div style={styles.card} onClick={() => onSelect && onSelect(delivery)}>
      {/* Top Waybill Bar */}
      <div style={styles.header}>
        <div style={styles.refBlock}>
          <span style={styles.tag}>WAYBILL</span>
          <h4 style={styles.refText}>{delivery.reference || `#${delivery.id}`}</h4>
        </div>
        <span
          style={{
            ...styles.badge,
            backgroundColor: badge.bg,
            color: badge.text,
            borderColor: badge.border,
          }}
        >
          {badge.label}
        </span>
      </div>

      {/* Package & Customer Info */}
      <div style={styles.contentBlock}>
        <p style={styles.itemTitle}>📦 {delivery.packageDetails || delivery.itemDescription || 'Delivery Package'}</p>
        <div style={styles.customerRow}>
          <span style={styles.customerName}>👤 {delivery.customerName || 'Customer Recipient'}</span>
          {delivery.customerPhone && (
            <a
              href={`tel:${delivery.customerPhone}`}
              style={styles.callPill}
              onClick={(e) => e.stopPropagation()}
            >
              📞 {delivery.customerPhone}
            </a>
          )}
        </div>
      </div>

      {/* Destination Preview */}
      <div style={styles.routePreview}>
        <div style={styles.dot}>●</div>
        <span style={styles.addressText}>
          {delivery.dropoffAddress || delivery.deliveryAddress || 'Nairobi Destination'}
        </span>
      </div>

      {/* Card Action Row */}
      <div style={styles.actionRow}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(delivery);
          }}
          style={styles.detailBtn}
        >
          Inspect Details
        </button>

        {isAssigned && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onPickupClick) onPickupClick(delivery);
              else onSelect(delivery);
            }}
            style={styles.actionBtn}
          >
            Confirm Pickup →
          </button>
        )}

        {isPickedUp && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(delivery);
            }}
            style={{ ...styles.actionBtn, backgroundColor: '#0284c7' }}
          >
            Dropoff Task →
          </button>
        )}

        {isDelivered && (
          <span style={styles.completedTag}>✓ Completed</span>
        )}
      </div>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: '#1e293b',
    borderRadius: '18px',
    padding: '18px',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, border-color 0.2s ease',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  refBlock: {
    display: 'flex',
    flexDirection: 'column',
  },
  tag: {
    fontSize: '10px',
    color: '#94a3b8',
    fontWeight: 'bold',
    letterSpacing: '0.8px',
  },
  refText: {
    margin: '2px 0 0 0',
    fontSize: '16px',
    fontWeight: '800',
    color: '#38bdf8',
  },
  badge: {
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 'bold',
    border: '1px solid',
    textTransform: 'uppercase',
  },
  contentBlock: {
    backgroundColor: '#0f172a',
    borderRadius: '12px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    border: '1px solid #1e293b',
  },
  itemTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: '700',
    color: '#f8fafc',
  },
  customerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '12px',
  },
  customerName: {
    color: '#cbd5e1',
    fontWeight: '500',
  },
  callPill: {
    color: '#38bdf8',
    textDecoration: 'none',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    padding: '2px 8px',
    borderRadius: '6px',
    fontWeight: 'bold',
  },
  routePreview: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#94a3b8',
  },
  dot: {
    color: '#4ade80',
    fontSize: '14px',
  },
  addressText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  actionRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '4px',
    alignItems: 'center',
  },
  detailBtn: {
    flex: 1,
    height: '42px',
    backgroundColor: '#0f172a',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  actionBtn: {
    flex: 2,
    height: '42px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
  },
  completedTag: {
    flex: 2,
    textAlign: 'center',
    color: '#34d399',
    fontSize: '12px',
    fontWeight: 'bold',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: '10px',
    borderRadius: '10px',
    border: '1px solid rgba(16, 185, 129, 0.2)',
  },
};