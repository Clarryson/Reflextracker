import React from 'react';

export default function OfflineBanner({ isOnline, pendingCount, isSyncing, onSyncClick }) {
  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div style={styles.banner}>
      <div style={styles.infoRow}>
        {!isOnline ? (
          <span style={styles.badgeOffline}>⚠️ Offline Mode</span>
        ) : (
          <span style={styles.badgeOnline}>🟢 Online</span>
        )}

        <span style={styles.text}>
          {!isOnline
            ? 'Actions saved locally to device.'
            : isSyncing
            ? 'Syncing local mutations...'
            : `${pendingCount} offline update${pendingCount === 1 ? '' : 's'} pending.`}
        </span>

        {isOnline && pendingCount > 0 && (
          <button
            onClick={onSyncClick}
            disabled={isSyncing}
            style={styles.syncBtn}
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  banner: {
    backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155',
    padding: '10px 16px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    flexWrap: 'wrap',
  },
  badgeOffline: {
    backgroundColor: '#b45309',
    color: '#fef3c7',
    padding: '3px 8px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  badgeOnline: {
    backgroundColor: '#166534',
    color: '#dcfce7',
    padding: '3px 8px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  text: {
    color: '#e2e8f0',
    fontSize: '12px',
    flex: 1,
  },
  syncBtn: {
    backgroundColor: '#0284c7',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
};