import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:4000';

export default function App() {
  const [activeTab, setActiveTab] = useState('dispatcher');
  const [isConnected, setIsConnected] = useState(false);
  const [deliveries, setDeliveries] = useState([]);
  const socketRef = useRef(null);

  // Expanded Form state
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
    
    // Reset form fields
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

  return (
    <div style={styles.shell}>
      {/* Professional Top Navigation Bar */}
      <header style={styles.navbar}>
        <div style={styles.navBrand}>
          <div style={styles.brandLogo}>D</div>
          <div>
            <h1 style={styles.brandTitle}>Droplink</h1>
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

      {/* Main View Area */}
      <main style={styles.mainContent}>
        {activeTab === 'dispatcher' ? (
          <div style={styles.gridDashboard}>
            {/* Left Form Card */}
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

            {/* Right Live Feed */}
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
                        <p style={styles.detailRow}><strong>Recipient:</strong> {item.customerName} ({item.phone})</p>
                        <p style={styles.detailRow}><strong>Item:</strong> {item.itemDescription}</p>
                        <p style={styles.detailRow}><strong>Location:</strong> {item.address}</p>
                        <p style={styles.timestamp}>Dispatched at {item.timestamp}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Retailer Portal View */
          <div style={styles.retailerContainer}>
            <div style={styles.retailerTopBar}>
              <div>
                <h2 style={styles.panelTitle}>Retailer Delivery Ledger</h2>
                <p style={styles.panelDesc}>Audit trail and status tracking for enterprise retail partners.</p>
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
                        <td style={styles.td}><code>{item.id}</code></td>
                        <td style={styles.td}><strong>{item.customerName}</strong></td>
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
  shell: { minHeight: '100vh', backgroundColor: '#090d16', color: '#f1f5f9', fontFamily: '"Inter", system-ui, -apple-system, sans-serif' },
  navbar: { height: '70px', borderBottom: '1px solid #1e293b', backgroundColor: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 32px' },
  navBrand: { display: 'flex', alignItems: 'center', gap: '14px' },
  brandLogo: { width: '36px', height: '36px', backgroundColor: '#38bdf8', color: '#0f172a', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', fontSize: '18px' },
  brandTitle: { margin: 0, fontSize: '16px', fontWeight: '800', letterSpacing: '0.5px', color: '#ffffff' },
  brandSubtitle: { fontSize: '11px', color: '#64748b', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' },
  navCenter: { display: 'flex', justifyContent: 'center' },
  segmentedControl: { display: 'flex', backgroundColor: '#1e293b', padding: '4px', borderRadius: '10px', border: '1px solid #334155' },
  segmentButton: { padding: '8px 20px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s ease' },
  segmentActive: { backgroundColor: '#38bdf8', color: '#0f172a', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
  navRight: { display: 'flex', alignItems: 'center' },
  statusPill: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1e293b', padding: '6px 14px', borderRadius: '20px', border: '1px solid #334155' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%' },
  statusText: { fontSize: '12px', fontWeight: '600', color: '#cbd5e1' },
  mainContent: { padding: '40px 32px', maxWidth: '1400px', margin: '0 auto' },
  gridDashboard: { display: 'grid', gridTemplateColumns: '400px 1fr', gap: '32px' },
  panel: { backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '28px', height: 'fit-content' },
  panelHeader: { marginBottom: '24px' },
  panelTitle: { margin: '0 0 6px 0', fontSize: '18px', fontWeight: '700', color: '#ffffff' },
  panelDesc: { margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.4' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '14px', outline: 'none', transition: 'border-color 0.2s' },
  submitBtn: { backgroundColor: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '8px', padding: '12px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', transition: 'filter 0.2s', marginTop: '4px' },
  feedList: { display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '550px', overflowY: 'auto' },
  emptyState: { textAlign: 'center', padding: '48px 20px', border: '1px dashed #334155', borderRadius: '12px' },
  emptyTitle: { margin: '0 0 4px 0', fontSize: '14px', fontWeight: '600', color: '#94a3b8' },
  emptySubtitle: { margin: 0, fontSize: '12px', color: '#64748b' },
  dispatchCard: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '18px' },
  cardTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  cardId: { fontFamily: 'monospace', fontWeight: '700', fontSize: '14px', color: '#38bdf8' },
  badge: { padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase' },
  badge_ASSIGNED: { backgroundColor: '#fef08a22', color: '#fde047', border: '1px solid #fef08a44' },
  badge_PICKED_UP: { backgroundColor: '#38bdf822', color: '#38bdf8', border: '1px solid #38bdf844' },
  badge_DELIVERED: { backgroundColor: '#10b98122', color: '#34d399', border: '1px solid #10b98144' },
  cardDetails: { display: 'flex', flexDirection: 'column', gap: '4px' },
  detailRow: { margin: 0, fontSize: '13px', color: '#cbd5e1' },
  timestamp: { margin: '4px 0 0 0', fontSize: '11px', color: '#64748b' },
  retailerContainer: { display: 'flex', flexDirection: 'column', gap: '24px' },
  retailerTopBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
  searchBox: { backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '10px 16px', color: '#ffffff', fontSize: '14px', width: '320px', outline: 'none' },
  tableWrapper: { backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  trHead: { borderBottom: '1px solid #1e293b', backgroundColor: '#0f172a' },
  th: { padding: '16px 24px', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  trBody: { borderBottom: '1px solid #1e293b', transition: 'background-color 0.2s' },
  td: { padding: '16px 24px', fontSize: '14px', color: '#cbd5e1' },
  emptyTd: { padding: '60px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }
};