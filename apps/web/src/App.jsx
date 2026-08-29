import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css'; // Optional: keeping this if you want to add external styles later

const SOCKET_URL = 'http://localhost:4000'; // The backend URL

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [deliveries, setDeliveries] = useState([]);
  const socketRef = useRef(null);

  // Form state for dispatching new orders
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    // 1. Connect to the backend
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on('connect', () => setIsConnected(true));
    socketRef.current.on('disconnect', () => setIsConnected(false));
    
    // 2. Listen for real-time status updates from the riders
    socketRef.current.on('delivery_updated', (updatedDelivery) => {
      setDeliveries((prev) =>
        prev.map((item) => (item.id === updatedDelivery.id ? updatedDelivery : item))
      );
    });

    return () => socketRef.current.disconnect();
  }, []);

  // 3. Handle creating a new delivery
  const handleDispatch = (e) => {
    e.preventDefault();
    if (!customerName || !address) return;

    const newDelivery = {
      id: `DEL-${Math.floor(Math.random() * 10000)}`,
      customerName,
      address,
      status: 'ASSIGNED',
      timestamp: new Date().toISOString()
    };

    // Send the new order to the backend so it routes to a rider
    socketRef.current.emit('new_delivery', newDelivery);
    
    // Add to local dispatcher view immediately
    setDeliveries((prev) => [newDelivery, ...prev]);
    
    // Reset form for the next order
    setCustomerName('');
    setAddress('');
  };

  return (
    <div style={styles.container}>
      {/* Sidebar / Dispatch Form Area */}
      <div style={styles.sidebar}>
        <h1 style={styles.title}>REFLEX Dispatch</h1>
        <div style={styles.statusBadge}>
          <div style={{ ...styles.indicator, backgroundColor: isConnected ? '#4CAF50' : '#F44336' }} />
          <span>{isConnected ? 'System Online' : 'System Offline'}</span>
        </div>

        <div style={styles.formCard}>
          <h2 style={styles.subhead}>New Delivery Request</h2>
          <form onSubmit={handleDispatch}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Customer Name</label>
              <input 
                style={styles.input}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Amina Wanjiru"
              />
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Delivery Address</label>
              <input 
                style={styles.input}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Westlands, Ring Rd"
              />
            </div>
            <button type="submit" style={styles.dispatchButton}>Assign to Rider</button>
          </form>
        </div>
      </div>

      {/* Main Monitoring Dashboard */}
      <div style={styles.dashboard}>
        <h2 style={styles.dashboardTitle}>Live Delivery Tracker</h2>
        <div style={styles.grid}>
          {deliveries.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyText}>No active deliveries in the system.</p>
              <p style={styles.emptySubtext}>Use the panel on the left to dispatch a new order.</p>
            </div>
          ) : (
            deliveries.map((item) => (
              <div key={item.id} style={styles.deliveryCard}>
                <div style={styles.cardHeader}>
                  <h3 style={styles.orderId}>{item.id}</h3>
                  <span style={{ ...styles.statusTag, ...styles[`tag_${item.status}`] }}>
                    {item.status.replace('_', ' ')}
                  </span>
                </div>
                <p style={styles.detailText}><strong>Customer:</strong> {item.customerName}</p>
                <p style={styles.detailText}><strong>Address:</strong> {item.address}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Inline styles to ensure it looks great out-of-the-box without needing complex CSS files
const styles = {
  container: { display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#f8fafc', color: '#0f172a', margin: 0 },
  sidebar: { width: '380px', backgroundColor: '#ffffff', padding: '32px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', boxShadow: '2px 0 5px rgba(0,0,0,0.02)' },
  title: { margin: '0 0 8px 0', fontSize: '28px', color: '#0f172a', fontWeight: '800', letterSpacing: '-0.5px' },
  subhead: { margin: '0 0 20px 0', fontSize: '18px', color: '#334155' },
  statusBadge: { display: 'flex', alignItems: 'center', fontSize: '14px', color: '#64748b', marginBottom: '40px', fontWeight: '500' },
  indicator: { width: '10px', height: '10px', borderRadius: '50%', marginRight: '8px', boxShadow: '0 0 0 2px #fff' },
  formCard: { backgroundColor: '#f1f5f9', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' },
  inputGroup: { marginBottom: '20px' },
  label: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#475569' },
  input: { width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '15px', transition: 'border-color 0.2s', outline: 'none' },
  dispatchButton: { width: '100%', backgroundColor: '#0284c7', color: 'white', padding: '14px', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginTop: '8px', transition: 'background-color 0.2s', boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.2)' },
  dashboard: { flex: 1, padding: '40px', overflowY: 'auto' },
  dashboardTitle: { margin: '0 0 24px 0', fontSize: '24px', color: '#1e293b' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' },
  deliveryCard: { backgroundColor: '#ffffff', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0', transition: 'transform 0.2s' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  orderId: { margin: 0, fontSize: '18px', color: '#0f172a' },
  statusTag: { padding: '6px 12px', borderRadius: '24px', fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px' },
  tag_ASSIGNED: { backgroundColor: '#fef08a', color: '#854d0e' },
  tag_PICKED_UP: { backgroundColor: '#bae6fd', color: '#0369a1' },
  tag_DELIVERED: { backgroundColor: '#bbf7d0', color: '#166534' },
  detailText: { margin: '8px 0', color: '#475569', fontSize: '15px' },
  emptyState: { gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px dashed #cbd5e1' },
  emptyText: { margin: '0 0 8px 0', fontSize: '18px', color: '#475569', fontWeight: '600' },
  emptySubtext: { margin: 0, color: '#94a3b8' }
};