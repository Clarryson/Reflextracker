import React, { useState } from 'react';

export default function PickupConfirmModal({ isOpen, delivery, onClose, onConfirm }) {
  const [checkedBox, setCheckedBox] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !delivery) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(delivery);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.dragBar} />

        <div style={styles.header}>
          <div style={styles.iconBadge}>📦</div>
          <div>
            <h3 style={styles.title}>Confirm Package Pickup</h3>
            <span style={styles.subTitle}>Waybill #{delivery.reference || delivery.id}</span>
          </div>
        </div>

        <div style={styles.body}>
          {/* Depot Summary */}
          <div style={styles.depotCard}>
            <span style={styles.depotLabel}>MERCHANT DISPATCH DEPOT</span>
            <p style={styles.depotName}>{delivery.pickupAddress || (delivery.retailerName ? `${delivery.retailerName} Depot` : 'Merchant Hub')}</p>
            <p style={styles.itemDesc}><strong>Item:</strong> {delivery.packageDetails || delivery.itemDescription || 'Standard Parcel'}</p>
          </div>

          {/* Verification Checklist */}
          <div style={styles.checklist}>
            <label style={styles.checkRow}>
              <input
                type="checkbox"
                checked={checkedBox}
                onChange={(e) => setCheckedBox(e.target.checked)}
                style={styles.checkbox}
              />
              <span style={styles.checkText}>
                I have inspected the package condition and verified the recipient waybill tag.
              </span>
            </label>
          </div>

          <div style={styles.noticeBox}>
            <span style={styles.noticeIcon}>⚡</span>
            <p style={styles.noticeText}>
              Confirming pickup will start live GPS beacon tracking and notify the retailer.
            </p>
          </div>
        </div>

        <div style={styles.footer}>
          <button
            onClick={handleConfirm}
            disabled={!checkedBox || isSubmitting}
            style={{
              ...styles.confirmBtn,
              backgroundColor: checkedBox && !isSubmitting ? '#0284c7' : '#334155',
              cursor: checkedBox && !isSubmitting ? 'pointer' : 'not-allowed',
            }}
          >
            {isSubmitting ? 'Confirming Pickup...' : '✓ Confirm Pickup & Start Transit'}
          </button>
          <button onClick={onClose} style={styles.cancelBtn} disabled={isSubmitting}>
            Cancel
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
    alignItems: 'center',
    gap: '14px',
    marginBottom: '18px',
  },
  iconBadge: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    backgroundColor: '#0284c7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '22px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '800',
    color: '#f8fafc',
  },
  subTitle: {
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: '600',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  depotCard: {
    backgroundColor: '#0f172a',
    borderRadius: '14px',
    padding: '14px',
    border: '1px solid #334155',
  },
  depotLabel: {
    fontSize: '10px',
    color: '#94a3b8',
    fontWeight: 'bold',
    letterSpacing: '0.5px',
    display: 'block',
  },
  depotName: {
    margin: '4px 0 6px 0',
    fontSize: '15px',
    color: '#f8fafc',
    fontWeight: '700',
  },
  itemDesc: {
    margin: 0,
    fontSize: '13px',
    color: '#cbd5e1',
  },
  checklist: {
    backgroundColor: '#0f172a',
    borderRadius: '14px',
    padding: '14px',
    border: '1px solid #334155',
  },
  checkRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
    cursor: 'pointer',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    marginTop: '2px',
    accentColor: '#0284c7',
    cursor: 'pointer',
  },
  checkText: {
    fontSize: '13px',
    color: '#f1f5f9',
    lineHeight: '1.4',
    userSelect: 'none',
  },
  noticeBox: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: '10px',
    padding: '10px 14px',
    border: '1px solid rgba(56, 189, 248, 0.2)',
  },
  noticeIcon: {
    fontSize: '16px',
  },
  noticeText: {
    margin: 0,
    fontSize: '12px',
    color: '#38bdf8',
    lineHeight: '1.3',
  },
  footer: {
    marginTop: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  confirmBtn: {
    width: '100%',
    height: '52px',
    color: '#ffffff',
    border: 'none',
    borderRadius: '14px',
    fontSize: '15px',
    fontWeight: 'bold',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  cancelBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    padding: '10px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};
