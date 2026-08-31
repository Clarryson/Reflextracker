import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:4000';

export default function App() {
  const [activeTab, setActiveTab] = useState('dispatcher');
  const [isConnected, setIsConnected] = useState(false);
  const [deliveries, setDeliveries] = useState([]);
  const socketRef = useRef(null);

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [address, setAddress] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on('connect', () => setIsConnected(true));
    socketRef.current.on('disconnect', () => setIsConnected(false));
    
    socketRef.current.on('delivery_updated', (updatedDelivery) => {
      setDeliveries((prev) =>
        prev.map((item) => (item.id === updatedDelivery.id ? updatedDelivery : item))
      );
    });

    return () => socketRef.current.disconnect();
  }, []);

  const handleDispatch = (e) => {
    e.preventDefault();
    if (!customerName || !address || !phone || !itemDescription) return;

    const newDelivery = {
      id: `DEL-${Math.floor(1000 + Math.random() * 9000)}`,
      customerName,
      phone,
      itemDescription,
      address,
      status: 'ASSIGNED',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    socketRef.current.emit('new_delivery', newDelivery);
    setDeliveries((prev) => [newDelivery, ...prev]);
    
    setCustomerName('');
    setPhone('');
    setItemDescription('');
    setAddress('');
  };

  const filteredDeliveries = deliveries.filter(item => 
    item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.itemDescription.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCount = deliveries.filter(d => d.status !== 'DELIVERED').length;
  const deliveredCount = deliveries.filter(d => d.status === 'DELIVERED').length;

  return (
    <div style={styles.shell}>
      <header style={styles.navbar}>
        <div style={styles.navBrand}>
          <div style={styles.brandLogo}>R</div>
          <div>
            <h1 style={styles.brandTitle}>Reflex</h1>
            <span style={styles.brandSubtitle}>Logistics Control Plane</span>
          </div>
        </div>

        <div style={styles.navCenter}>
          <div style={styles.segmentedControl}>
            <button 
              style={{ ...styles.segmentButton, ...(activeTab === 'dispatcher' ? styles.segmentActive : {}) }}
              onClick={() => setActiveTab('dispatcher')}
            >
              Dispatcher View
            </button>
            <button 
              style={{ ...styles.segmentButton, ...(activeTab === 'retailer' ? styles.segmentActive : {}) }}
              onClick={() => setActiveTab('retailer')}
            >
              Retailer Portal
            </button>
          </div>
        </div>

        <div style={styles.navRight}>
          <div style={styles.statusPill}>
            <span style={{ ...styles.statusDot, backgroundColor: isConnected ? '#10b981' : '#f43f5e' }} />
            <span style={styles.statusText}>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </header>

      <main style={styles.mainContent}>
        {activeTab === 'dispatcher' ? (
          <>
            <div style={styles.pageHeader}>
              <div>
                <h2 style={styles.pageTitle}>Dispatch Operations</h2>
                <p style={styles.pageSubtitle}>Monitor and route deliveries across your rider network in real time.</p>
              </div>
              <div style={styles.statsRow}>
                <div style={styles.statCard}>
                  <span style={styles.statValue}>{deliveries.length}</span>
                  <span style={styles.statLabel}>Total Orders</span>
                </div>
                <div style={styles.statCard}>
                  <span style={styles.statValue}>{activeCount}</span>
                  <span style={styles.statLabel}>In Transit</span>
                </div>
                <div style={styles.statCard}>
                  <span style={styles.statValue}>{deliveredCount}</span>
                  <span style={styles.statLabel}>Delivered</span>
                </div>
              </div>
            </div>

            <div style={styles.gridDashboard}>
              <div style={styles.panel}>
                <div style={styles.panelHeader}>
                  <h2 style={styles.panelTitle}>New Dispatch Order</h2>
                  <p style={styles.panelDesc}>Route a package directly to the nearest active rider node.</p>
                </div>

                <form onSubmit={handleDispatch} style={styles.form}>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Recipient Name</label>
                    <input 
                      style={styles.input}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Amina Wanjiru"
                    />
                  </div>

                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Phone Number</label>
                    <input 
                      style={styles.input}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +251 91 123 4567"
                    />
                  </div>

                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Package / Item Details</label>
                    <input 
                      style={styles.input}
                      value={itemDescription}
                      onChange={(e) => setItemDescription(e.target.value)}
                      placeholder="e.g. Fragrance Gift Set (50ml)"
                    />
                  </div>

                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Destination Address</label>
                    <input 
                      style={styles.input}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. Bole Atlas, Addis Ababa"
                    />
                  </div>

                  <button type="submit" style={styles.submitBtn}>
                    Dispatch Assignment →
                  </button>
                </form>
              </div>

              <div style={styles.panel}>
                <div style={styles.panelHeader}>
                  <h2 style={styles.panelTitle}>Active Dispatches</h2>
                  <p style={styles.panelDesc}>Real-time telemetry and status synchronization.</p>
                </div>

                <div style={styles.feedList}>
                  {deliveries.length === 0 ? (
                    <div style={styles.emptyState}>
                      <p style={styles.emptyTitle}>No active dispatches</p>
                      <p style={styles.emptySubtitle}>Dispatched items will stream here instantly.</p>
                    </div>
                  ) : (
                    deliveries.map((item) => (
                      <div key={item.id} style={styles.dispatchCard}>
                        <div style={styles.cardTopRow}>
                          <span style={styles.cardId}>{item.id}</span>
                          <span style={{ ...styles.badge, ...styles[`badge_${item.status}`] }}>
                            {item.status}
                          </span>
                        </div>
                        <div style={styles.cardDetails}>
                          <p style={styles.detailRow}><strong style={styles.detailKey}>Recipient:</strong> {item.customerName} ({item.phone})</p>
                          <p style={styles.detailRow}><strong style={styles.detailKey}>Item:</strong> {item.itemDescription}</p>
                          <p style={styles.detailRow}><strong style={styles.detailKey}>Location:</strong> {item.address}</p>
                          <p style={styles.timestamp}>Dispatched at {item.timestamp}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={styles.retailerContainer}>
            <div style={styles.retailerTopBar}>
              <div>
                <h2 style={styles.pageTitle}>Retailer Delivery Ledger</h2>
                <p style={styles.pageSubtitle}>Audit trail and status tracking for enterprise retail partners.</p>
              </div>
              <input 
                style={styles.searchBox}
                placeholder="Filter by Order ID, Customer, or Item..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.trHead}>
                    <th style={styles.th}>Order Identifier</th>
                    <th style={styles.th}>Customer</th>
                    <th style={styles.th}>Phone</th>
                    <th style={styles.th}>Package Details</th>
                    <th style={styles.th}>Destination Node</th>
                    <th style={styles.th}>Timestamp</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeliveries.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={styles.emptyTd}>No records found matching criteria.</td>
                    </tr>
                  ) : (
                    filteredDeliveries.map((item) => (
                      <tr key={item.id} style={styles.trBody}>
                        <td style={styles.td}><code style={styles.codeCell}>{item.id}</code></td>
                        <td style={styles.td}><strong style={styles.strongCell}>{item.customerName}</strong></td>
                        <td style={styles.td}>{item.phone}</td>
                        <td style={styles.td}>{item.itemDescription}</td>
                        <td style={styles.td}>{item.address}</td>
                        <td style={styles.td}>{item.timestamp}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.badge, ...styles[`badge_${item.status}`] }}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  shell: { minHeight: '100vh', width: '100%', backgroundColor: '#090d16', color: '#f1f5f9', fontFamily: '"Inter", system-ui, -apple-system, sans-serif' },
  navbar: { height: '72px', borderBottom: '1px solid #1e293b', backgroundColor: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 40px', position: 'sticky', top: 0, zIndex: 50 },
  navBrand: { display: 'flex', alignItems: 'center', gap: '14px' },
  brandLogo: { width: '40px', height: '40px', backgroundColor: '#38bdf8', color: '#0f172a', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', fontSize: '20px' },
  brandTitle: { margin: 0, fontSize: '19px', fontWeight: '800', letterSpacing: '-0.02em', color: '#ffffff', lineHeight: 1.2 },
  brandSubtitle: { fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em' },
  navCenter: { display: 'flex', justifyContent: 'center' },
  segmentedControl: { display: 'flex', backgroundColor: '#1e293b', padding: '4px', borderRadius: '12px', border: '1px solid #334155' },
  segmentButton: { padding: '9px 22px', borderRadius: '9px', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '14px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease', fontFamily: 'inherit' },
  segmentActive: { backgroundColor: '#38bdf8', color: '#0f172a', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', fontWeight: '600' },
  navRight: { display: 'flex', alignItems: 'center' },
  statusPill: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1e293b', padding: '7px 15px', borderRadius: '20px', border: '1px solid #334155' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%' },
  statusText: { fontSize: '14px', fontWeight: '500', color: '#cbd5e1' },
  mainContent: { padding: '40px', maxWidth: '1600px', margin: '0 auto', width: '100%' },

  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '24px', marginBottom: '32px' },
  pageTitle: { margin: '0 0 6px 0', fontSize: '28px', fontWeight: '800', letterSpacing: '-0.03em', color: '#ffffff' },
  pageSubtitle: { margin: 0, fontSize: '14px', fontWeight: '400', color: '#94a3b8', lineHeight: 1.5 },
  statsRow: { display: 'flex', gap: '16px' },
  statCard: { display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 24px', minWidth: '120px' },
  statValue: { fontSize: '28px', fontWeight: '800', color: '#38bdf8', letterSpacing: '-0.03em', lineHeight: 1 },
  statLabel: { fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' },

  gridDashboard: { display: 'grid', gridTemplateColumns: 'minmax(360px, 440px) 1fr', gap: '28px', alignItems: 'start' },
  panel: { backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '32px' },
  panelHeader: { marginBottom: '26px' },
  panelTitle: { margin: '0 0 6px 0', fontSize: '20px', fontWeight: '700', letterSpacing: '-0.02em', color: '#ffffff' },
  panelDesc: { margin: 0, fontSize: '14px', fontWeight: '400', color: '#64748b', lineHeight: '1.5' },
  form: { display: 'flex', flexDirection: 'column', gap: '18px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '7px' },
  label: { fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '12px 15px', color: '#ffffff', fontSize: '14px', fontWeight: '400', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s', fontFamily: 'inherit' },
  submitBtn: { backgroundColor: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '10px', padding: '13px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', transition: 'filter 0.2s', marginTop: '6px', fontFamily: 'inherit', letterSpacing: '-0.01em' },
  feedList: { display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '620px', overflowY: 'auto' },
  emptyState: { textAlign: 'center', padding: '56px 20px', border: '1px dashed #334155', borderRadius: '14px' },
  emptyTitle: { margin: '0 0 4px 0', fontSize: '14px', fontWeight: '500', color: '#94a3b8' },
  emptySubtitle: { margin: 0, fontSize: '14px', fontWeight: '400', color: '#64748b' },
  dispatchCard: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '20px' },
  cardTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  cardId: { fontFamily: '"JetBrains Mono", monospace', fontWeight: '700', fontSize: '14px', color: '#38bdf8', letterSpacing: '-0.01em' },
  badge: { padding: '5px 11px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase' },
  badge_ASSIGNED: { backgroundColor: '#fef08a22', color: '#fde047', border: '1px solid #fef08a44' },
  badge_PICKED_UP: { backgroundColor: '#38bdf822', color: '#38bdf8', border: '1px solid #38bdf844' },
  badge_DELIVERED: { backgroundColor: '#10b98122', color: '#34d399', border: '1px solid #10b98144' },
  cardDetails: { display: 'flex', flexDirection: 'column', gap: '5px' },
  detailRow: { margin: 0, fontSize: '14px', fontWeight: '400', color: '#cbd5e1', lineHeight: 1.5 },
  detailKey: { color: '#94a3b8', fontWeight: '500' },
  timestamp: { margin: '6px 0 0 0', fontSize: '12px', fontWeight: '400', color: '#64748b' },
  retailerContainer: { display: 'flex', flexDirection: 'column', gap: '28px' },
  retailerTopBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '20px' },
  searchBox: { backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '12px 16px', color: '#ffffff', fontSize: '14px', fontWeight: '400', width: '340px', outline: 'none', fontFamily: 'inherit' },
  tableWrapper: { backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  trHead: { borderBottom: '1px solid #1e293b', backgroundColor: '#131c31' },
  th: { padding: '16px 24px', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' },
  trBody: { borderBottom: '1px solid #1e293b', transition: 'background-color 0.2s' },
  td: { padding: '16px 24px', fontSize: '14px', fontWeight: '400', color: '#cbd5e1' },
  codeCell: { fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', color: '#38bdf8' },
  strongCell: { color: '#ffffff', fontWeight: '500' },
  emptyTd: { padding: '60px', textAlign: 'center', fontSize: '14px', fontWeight: '400', color: '#64748b', fontStyle: 'italic' }
};