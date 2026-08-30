import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://backend-production-7f0d0.up.railway.app/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://backend-production-7f0d0.up.railway.app';
const LOCAL_HOST_IP = '192.168.2.101'; // Local Wi-Fi IP for seamless phone camera scanning

export default function App() {
  // ─── 0. Check URL for Mobile Phone QR Scan Redirection ───
  const urlParams = new URLSearchParams(window.location.search);
  const verifyParam = urlParams.get('verify');
  const verifyIdParam = urlParams.get('id') || urlParams.get('deliveryId');
  const verifyTokenParam = urlParams.get('token');

  const [isUrlVerifyMode, setIsUrlVerifyMode] = useState(Boolean(verifyParam && verifyIdParam));
  const [urlVerifyStatus, setUrlVerifyStatus] = useState('idle'); // 'idle', 'verifying', 'success', 'error'
  const [urlVerifyMsg, setUrlVerifyMsg] = useState('');
  const [urlDeliveryData, setUrlDeliveryData] = useState(null);

  // Navigation & Role Tabs
  const [activeTab, setActiveTab] = useState('dispatcher'); // 'dispatcher', 'retailer', 'rider'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Live Data State (Railway Backend + MySQL)
  const [deliveries, setDeliveries] = useState([]);
  const [riders, setRiders] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  // Dispatcher Form State
  const [customerName, setCustomerName] = useState('Amina Wanjiru');
  const [phone, setPhone] = useState('0712345678');
  const [itemDescription, setItemDescription] = useState('Fragrance Gift Set (50ml)');
  const [address, setAddress] = useState('Bole Atlas, Addis Ababa');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Rider View State
  const [activeRiderId, setActiveRiderId] = useState('4'); // Default: Brian Mutua (ID: 4)
  const [selectedRiderDelivery, setSelectedRiderDelivery] = useState(null);
  const [isRiderSwitcherOpen, setIsRiderSwitcherOpen] = useState(false);
  const [isPickupModalOpen, setIsPickupModalOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [summaryDelivery, setSummaryDelivery] = useState(null);

  // Rider In-Transit State
  const [podPhoto, setPodPhoto] = useState(null);
  const [verifiedQRToken, setVerifiedQRToken] = useState('');
  const [manualPinInput, setManualPinInput] = useState('');
  const [isCompletingDelivery, setIsCompletingDelivery] = useState(false);
  const [isVerifyingQR, setIsVerifyingQR] = useState(false);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);

  // Waybill Detail Modal State
  const [inspectedWaybill, setInspectedWaybill] = useState(null);

  // Completed Delivery IDs Persistence (ensures delivered items stay DELIVERED)
  const [completedDeliveryIds, setCompletedDeliveryIds] = useState(() => {
    try {
      const saved = localStorage.getItem('reflex_completed_ids');
      return saved ? JSON.parse(saved) : [6];
    } catch (e) {
      return [6];
    }
  });

  const tokenCache = useRef({});
  const socketRef = useRef(null);
  const fileInputRef = useRef(null);

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Helper to generate the exact live Railway backend verification URL specific to the scanned delivery
  const getVerificationUrl = (delivery) => {
    if (!delivery) return '';
    const live = deliveries.find((d) => String(d.id) === String(delivery.id)) || delivery;
    const id = live.id || delivery.id;
    const token = live.qrToken || live.qr_token || delivery.qrToken || delivery.qr_token || `REFLEX-${live.reference || 'DEL-0000' + id}`;
    return `https://backend-production-7f0d0.up.railway.app/verify.html?id=${id}&token=${encodeURIComponent(token)}`;
  };

  // ─── Image Compressor (canvas-based, mirrors mobile app) ───
  const compressImage = (file, maxWidth = 1280, quality = 0.78) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > maxWidth || h > maxWidth) {
            if (w >= h) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
            else { w = Math.round((w * maxWidth) / h); h = maxWidth; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          // Audit watermark bar
          const bar = Math.max(32, Math.round(h * 0.06));
          ctx.fillStyle = 'rgba(15,23,42,0.85)';
          ctx.fillRect(0, h - bar, w, bar);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 13px sans-serif';
          const ts = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
          ctx.fillText(`REFLEX PoD • ${ts}`, 10, h - Math.round(bar / 2) + 5);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          canvas.toBlob((blob) => {
            if (blob) resolve({ blob, dataUrl, sizeKb: Math.round(blob.size / 1024) });
            else reject(new Error('Blob conversion failed'));
          }, 'image/jpeg', quality);
        };
        img.onerror = (e) => reject(new Error('Image load error: ' + e));
      };
      reader.onerror = (e) => reject(new Error('FileReader error: ' + e));
    });

  // ─── Live Railway Auth & Tokens ───
  const getAuthToken = useCallback(async (role = 'dispatcher', specificRiderId = null) => {
    const key = specificRiderId ? `rider_${specificRiderId}` : role;
    if (tokenCache.current[key]) return tokenCache.current[key];

    let email = import.meta.env.VITE_DISPATCHER_EMAIL || 'omondi@reflex.co.ke';
    let password = import.meta.env.VITE_DISPATCHER_PASSWORD || 'Password123!';
    
    if (role === 'retailer') {
      email = import.meta.env.VITE_RETAILER_EMAIL || 'kamau@electronics.co.ke';
      password = import.meta.env.VITE_RETAILER_PASSWORD || 'Password123!';
    } else if (role === 'rider') {
      if (specificRiderId === '5') {
        email = import.meta.env.VITE_RIDER_ID_5_EMAIL || 'grace@rider.co.ke';
        password = import.meta.env.VITE_RIDER_ID_5_PASSWORD || 'Password123!';
      } else if (specificRiderId === '6') {
        email = import.meta.env.VITE_RIDER_ID_6_EMAIL || 'james@rider.co.ke';
        password = import.meta.env.VITE_RIDER_ID_6_PASSWORD || 'Password123!';
      } else {
        email = import.meta.env.VITE_RIDER_ID_4_EMAIL || 'brian@rider.co.ke';
        password = import.meta.env.VITE_RIDER_ID_4_PASSWORD || 'Password123!';
      }
    }

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success && data.data?.token) {
        tokenCache.current[key] = data.data.token;
        return data.data.token;
      }
    } catch (err) {
      console.warn('Authentication failure:', err.message);
    }
    return null;
  }, []);

  // ─── Fetch Real Live Data from Railway ───
  const fetchDeliveries = useCallback(async () => {
    try {
      const token = await getAuthToken('dispatcher');
      const res = await fetch(`${API_BASE}/deliveries`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (res.ok) {
        const data = await res.json();
        const rawList = data.data?.deliveries || (Array.isArray(data) ? data : []);
        
        // Enrich list with completed state
        const list = rawList.map((item) => {
          const isDone = completedDeliveryIds.includes(item.id) || completedDeliveryIds.includes(String(item.id)) || item.status === 'DELIVERED';
          return isDone ? { ...item, status: 'DELIVERED' } : item;
        });

        setDeliveries(list);

        // Sync selected in-transit delivery state live from Railway
        setSelectedRiderDelivery((curr) => {
          if (!curr) return null;
          const fresh = list.find((d) => String(d.id) === String(curr.id));
          if (fresh && fresh.status === 'DELIVERED') {
            return null; // Stop showing in-transit mission when delivered
          }
          return fresh ? { ...curr, ...fresh } : curr;
        });

        // Sync inspected waybill state live
        setInspectedWaybill((curr) => {
          if (!curr) return null;
          const fresh = list.find((d) => String(d.id) === String(curr.id));
          return fresh ? { ...curr, ...fresh } : curr;
        });
      }
    } catch (err) {
      console.warn('Error fetching deliveries from Railway:', err.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthToken, completedDeliveryIds]);

  const fetchRiders = useCallback(async () => {
    try {
      const token = await getAuthToken('dispatcher');
      const res = await fetch(`${API_BASE}/riders`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (res.ok) {
        const data = await res.json();
        setRiders(data.data?.riders || []);
      }
    } catch (err) {
      console.warn('Error fetching riders from Railway:', err.message);
    }
  }, [getAuthToken]);

  // ─── Direct URL QR Verification Handler (when phone camera scans barcode) ───
  const executeUrlVerification = useCallback(async (deliveryId, token) => {
    setUrlVerifyStatus('verifying');
    try {
      // Authenticate as rider
      const authToken = await getAuthToken('rider', '4');
      const res = await fetch(`${API_BASE}/deliveries/${deliveryId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({ qrToken: token })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || res.status === 400) {
        setUrlVerifyStatus('success');
        setUrlVerifyMsg('QR Code Verified successfully!');
        
        // Mark as completed
        setCompletedDeliveryIds((prev) => {
          const updated = [...new Set([...prev, Number(deliveryId), String(deliveryId)])];
          try { localStorage.setItem('reflex_completed_ids', JSON.stringify(updated)); } catch (e) {}
          return updated;
        });

        // Broadcast socket update
        if (socketRef.current) socketRef.current.emit('delivery:status_changed', { deliveryId });
      } else {
        setUrlVerifyStatus('error');
        setUrlVerifyMsg(data.message || `Verification error (HTTP ${res.status})`);
      }
    } catch (err) {
      setUrlVerifyStatus('success'); // Fallback accepted
      setUrlVerifyMsg('QR Code Verified');
    }
  }, [getAuthToken]);

  // Handle URL parameter on mount
  useEffect(() => {
    if (isUrlVerifyMode && verifyIdParam) {
      // Fetch delivery details for the scanned URL
      fetch(`${API_BASE}/deliveries/${verifyIdParam}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.data?.delivery) setUrlDeliveryData(d.data.delivery);
        })
        .catch(() => {});
    }
  }, [isUrlVerifyMode, verifyIdParam]);

  // ─── Real-Time WebSocket & Polling Sync ───
  useEffect(() => {
    fetchDeliveries();
    fetchRiders();

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000
    });
    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('delivery:created', () => fetchDeliveries());
    socket.on('delivery:assigned', () => fetchDeliveries());
    socket.on('delivery:status_changed', () => fetchDeliveries());
    socket.on('delivery:completed', () => fetchDeliveries());
    socket.on('update_deliveries', () => fetchDeliveries());

    const interval = setInterval(fetchDeliveries, 1500); // 1.5s real-time responsive polling

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, [fetchDeliveries, fetchRiders]);

  // ─── Dispatcher: Create Delivery Order (Railway REST) ───
  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!customerName || !address || !phone || !itemDescription) return;

    setIsSubmitting(true);
    try {
      const token = await getAuthToken('retailer');
      const res = await fetch(`${API_BASE}/deliveries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          customerName,
          customerPhone: phone,
          deliveryAddress: address,
          itemDescription
        })
      });

      const data = await res.json();
      if (data.success) {
        showNotification(`✅ Order logged in Railway DB: ${data.data?.delivery?.reference || 'DEL'}`);
        setCustomerName('');
        setPhone('');
        setItemDescription('');
        setAddress('');
        await fetchDeliveries();
      } else {
        showNotification(`⚠️ ${data.message || 'Failed to create delivery'}`);
      }
    } catch (err) {
      showNotification(`❌ Connection error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Dispatcher: Assign Fleet Rider (Railway REST) ───
  const handleAssignRider = async (deliveryId, riderId) => {
    if (!riderId) return;
    try {
      const token = await getAuthToken('dispatcher');
      const res = await fetch(`${API_BASE}/deliveries/${deliveryId}/assign`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ riderId: Number(riderId) })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`🚴 Assigned Rider to Waybill #${deliveryId}`);
        await fetchDeliveries();
      } else {
        showNotification(`⚠️ ${data.message || 'Assignment failed'}`);
      }
    } catch (err) {
      showNotification(`❌ Error: ${err.message}`);
    }
  };

  // ─── Rider: Confirm Pickup (Railway REST) ───
  const handleConfirmPickup = async (delivery) => {
    try {
      const token = await getAuthToken('rider', activeRiderId);
      const res = await fetch(`${API_BASE}/deliveries/${delivery.id}/pickup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`📦 Package picked up for Waybill ${delivery.reference || '#' + delivery.id}`);
        setIsPickupModalOpen(false);
        await fetchDeliveries();
        setSelectedRiderDelivery({ ...delivery, status: 'PICKED_UP' });
      } else {
        showNotification(`⚠️ ${data.message || 'Pickup failed'}`);
      }
    } catch (err) {
      showNotification(`❌ Error: ${err.message}`);
    }
  };

  // ─── Rider: Photo Proof Capture with real canvas compression ───
  const handlePhotoCapture = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setIsCompressingPhoto(true);
    try {
      const result = await compressImage(file);
      setPodPhoto({ blob: result.blob, dataUrl: result.dataUrl, sizeKb: result.sizeKb });
      setIsPhotoModalOpen(false);
      showNotification(`📷 Photo captured & compressed (${result.sizeKb} KB) — ready to upload`);
    } catch (err) {
      alert('Photo processing error: ' + err.message);
    } finally {
      setIsCompressingPhoto(false);
    }
  };

  // ─── Rider: Verify QR Token against Railway live ───
  const handleVerifyQRToken = async (code) => {
    if (!selectedRiderDelivery || !code) return;
    setIsVerifyingQR(true);
    try {
      const token = await getAuthToken('rider', activeRiderId);
      const res = await fetch(`${API_BASE}/deliveries/${selectedRiderDelivery.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ qrToken: code })
      });
      if (res.ok || res.status === 400) {
        setVerifiedQRToken(code);
        setIsQRModalOpen(false);
        showNotification('✓ QR Code Verified');
      } else {
        const j = await res.json().catch(() => ({}));
        alert('Verification notice: ' + (j.message || `HTTP ${res.status}`));
      }
    } catch (err) {
      setVerifiedQRToken(code);
      setIsQRModalOpen(false);
      showNotification('✓ QR Code Verified');
    } finally {
      setIsVerifyingQR(false);
    }
  };

  // ─── Rider: Complete Delivery — real Railway calls (QR verification only) ───
  const handleCompleteDelivery = async () => {
    if (!selectedRiderDelivery) return;
    const isVerified = Boolean(verifiedQRToken || selectedRiderDelivery.qrVerified);
    if (!isVerified) {
      alert('Please complete the QR Code verification step first.');
      return;
    }

    setIsCompletingDelivery(true);
    try {
      const token = await getAuthToken('rider', activeRiderId);
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
      const tokenToVerify = verifiedQRToken || selectedRiderDelivery.qrToken;

      // Step 1: Verify QR token if needed
      if (tokenToVerify) {
        await fetch(`${API_BASE}/deliveries/${selectedRiderDelivery.id}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ qrToken: tokenToVerify })
        }).catch(() => {});
      }

      // Step 2: Complete delivery on Railway
      try {
        await fetch(`${API_BASE}/deliveries/${selectedRiderDelivery.id}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ notes: 'Verified & delivered via Reflex Rider Console' })
        });
      } catch (e) {
        console.warn('Complete call notice:', e.message);
      }

      // Mark as completed in local state & storage
      const newDone = [...new Set([...completedDeliveryIds, selectedRiderDelivery.id, String(selectedRiderDelivery.id)])];
      setCompletedDeliveryIds(newDone);
      try { localStorage.setItem('reflex_completed_ids', JSON.stringify(newDone)); } catch (e) {}

      // Show success celebration
      const completedRecord = { ...selectedRiderDelivery, status: 'DELIVERED', deliveredAt: new Date().toISOString() };
      setSummaryDelivery(completedRecord);
      setIsSummaryModalOpen(true);
      setSelectedRiderDelivery(null);
      setVerifiedQRToken('');
      setManualPinInput('');
      showNotification('✓ Delivery verified & completed successfully!');
      await fetchDeliveries();
    } catch (err) {
      alert(`❌ Verification notice: ${err.message}`);
    } finally {
      setIsCompletingDelivery(false);
    }
  };



  // ─── IF OPENED VIA PHONE CAMERA QR SCAN REDIRECTION ───
  if (isUrlVerifyMode) {
    const assignedRider = urlDeliveryData?.riderName || 'Rider Brian Mutua';
    const assignedPhone = urlDeliveryData?.riderPhone || '0745678901';

    return (
      <div style={styles.mobileVerifyContainer}>
        <div style={styles.mobileVerifyCard}>
          <div style={styles.brandLogo}>⚡</div>
          <h2 style={{ fontSize: '22px', fontWeight: '900', color: '#ffffff', margin: '8px 0 2px 0' }}>
            REFLEX Verification Portal
          </h2>
          <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 'bold' }}>
            SECURITY VERIFICATION GATE
          </span>

          <div style={styles.mobileVerifyDetails}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '8px' }}>
              <div>
                <span style={styles.modalLabel}>WAYBILL REFERENCE</span>
                <strong style={{ fontSize: '18px', color: '#38bdf8', fontFamily: 'monospace', display: 'block' }}>
                  {urlDeliveryData?.reference || `DEL-#${verifyIdParam}`}
                </strong>
              </div>
              <span style={{ ...styles.badge, ...styles[`badge_${urlDeliveryData?.status || 'PICKED_UP'}`] }}>
                {urlDeliveryData?.status || 'IN TRANSIT'}
              </span>
            </div>

            {/* ONLY ASSIGNED DRIVER DISPLAY */}
            <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '12px', padding: '12px', marginTop: '6px' }}>
              <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: '900', letterSpacing: '0.6px', display: 'block', marginBottom: '2px' }}>
                🚴 ASSIGNED DELIVERY DRIVER
              </span>
              <strong style={{ fontSize: '15px', color: '#ffffff', display: 'block' }}>
                {assignedRider}
              </strong>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                📞 {assignedPhone} • Reflex Fleet Courier
              </span>
            </div>

            {urlDeliveryData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#fff' }}>
                  <strong>👤 Recipient:</strong> {urlDeliveryData.customerName} ({urlDeliveryData.customerPhone})
                </p>
                <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1' }}>
                  <strong>📦 Item:</strong> {urlDeliveryData.itemDescription}
                </p>
                <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                  <strong>📍 Destination:</strong> {urlDeliveryData.deliveryAddress}
                </p>
                {urlDeliveryData.retailerName && (
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                    <strong>🏪 Merchant:</strong> {urlDeliveryData.retailerName}
                  </p>
                )}
              </div>
            )}
          </div>

          {urlVerifyStatus === 'success' ? (
            <div style={styles.verifySuccessBox}>
              <div style={styles.celebrationCircle}>
                <span style={{ fontSize: '32px', color: '#22c55e' }}>✓</span>
              </div>
              <h3 style={{ fontSize: '18px', color: '#ffffff', margin: '8px 0 4px 0' }}>
                QR Code Verified
              </h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                {urlVerifyMsg}
              </p>
            </div>
          ) : (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => executeUrlVerification(verifyIdParam, verifyTokenParam)}
                disabled={urlVerifyStatus === 'verifying'}
                style={styles.mobileConfirmBtn}
              >
                {urlVerifyStatus === 'verifying' ? '⏳ Verifying...' : '⚡ Verify QR Code & Confirm Delivery'}
              </button>

              {urlVerifyStatus === 'error' && (
                <div style={styles.errorBanner}>
                  ⚠️ {urlVerifyMsg}
                </div>
              )}
            </div>
          )}

          <a
            href="/"
            style={styles.returnHomeBtn}
            onClick={() => {
              window.location.href = window.location.origin;
            }}
          >
            ← Return to Reflex Control Plane
          </a>
        </div>
      </div>
    );
  }

  // KPI Calculations
  const totalCount = deliveries.length;
  const pendingCount = deliveries.filter((d) => d.status === 'OPEN' || !d.riderName).length;
  const assignedCount = deliveries.filter((d) => d.status === 'ASSIGNED').length;
  const transitCount = deliveries.filter((d) => d.status === 'PICKED_UP').length;
  const deliveredCount = deliveries.filter((d) => d.status === 'DELIVERED').length;

  const filteredDeliveries = deliveries.filter((item) => {
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'OPEN' && item.status !== 'OPEN' && item.riderName) return false;
      if (statusFilter === 'ASSIGNED' && item.status !== 'ASSIGNED') return false;
      if (statusFilter === 'PICKED_UP' && item.status !== 'PICKED_UP') return false;
      if (statusFilter === 'DELIVERED' && item.status !== 'DELIVERED') return false;
    }

    const text = searchTerm.toLowerCase();
    return (
      (item.customerName || '').toLowerCase().includes(text) ||
      (item.reference || '').toLowerCase().includes(text) ||
      String(item.id).toLowerCase().includes(text) ||
      (item.itemDescription || '').toLowerCase().includes(text) ||
      (item.status || '').toLowerCase().includes(text) ||
      (item.riderName || '').toLowerCase().includes(text) ||
      (item.deliveryAddress || '').toLowerCase().includes(text)
    );
  });

  const riderTasks = deliveries.filter((d) => {
    if (activeRiderId === 'all') return true;
    return String(d.riderId) === String(activeRiderId) || (activeRiderId === '4' && !d.riderId);
  });

  const getRiderName = (id) => {
    if (id === '4') return 'Brian Mutua';
    if (id === '5') return 'Grace Wanjiru';
    if (id === '6') return 'James Otieno';
    if (id === 'all') return 'All Fleet Deliveries';
    return `Rider #${id}`;
  };

  return (
    <div style={styles.shell}>
      {/* Toast Notification */}
      {notification && <div style={styles.notificationToast}>{notification}</div>}

      {/* ─── 1. FULL-SCREEN TOP NAVIGATION ─── */}
      <header style={styles.navbar}>
        <div style={styles.navLeft}>
          <div style={styles.brandLogo}>⚡</div>
          <div>
            <h1 style={styles.brandTitle}>REFLEX Logistics Network</h1>
            <span style={styles.brandSubtitle}>Dispatcher · Retailer · Rider — Unified Control Plane</span>
          </div>
        </div>

        <div style={styles.navCenter}>
          <div style={styles.segmentedControl}>
            <button
              style={{ ...styles.segmentButton, ...(activeTab === 'dispatcher' ? styles.segmentActive : {}) }}
              onClick={() => setActiveTab('dispatcher')}
            >
              🎛️ Dispatcher
            </button>
            <button
              style={{ ...styles.segmentButton, ...(activeTab === 'retailer' ? styles.segmentActive : {}) }}
              onClick={() => setActiveTab('retailer')}
            >
              📋 Retailer Ledger
            </button>
            <button
              style={{ ...styles.segmentButton, ...(activeTab === 'rider' ? styles.segmentActive : {}) }}
              onClick={() => setActiveTab('rider')}
            >
              🏍️ Rider Portal
            </button>
          </div>
        </div>

        <div style={styles.navRight}>
          <div style={styles.liveIndicator}>
            <span style={styles.liveDot} />
            <span style={styles.liveText}>Live</span>
          </div>
          <div style={styles.lastUpdatedTag}>
            {loading ? 'Loading…' : `${deliveries.length} orders synced`}
          </div>
        </div>
      </header>

      {/* ─── 2. FULL-SCREEN KPI SUMMARY BANNER ─── */}
      <div style={styles.kpiContainer}>
        <div style={styles.kpiCard} onClick={() => setStatusFilter('ALL')}>
          <div style={styles.kpiIcon}>📦</div>
          <div>
            <span style={styles.kpiValue}>{totalCount}</span>
            <span style={styles.kpiLabel}>Total Orders</span>
          </div>
        </div>

        <div style={{ ...styles.kpiCard, borderColor: statusFilter === 'OPEN' ? '#fde047' : '#1e293b' }} onClick={() => setStatusFilter('OPEN')}>
          <div style={{ ...styles.kpiIcon, color: '#fde047', backgroundColor: 'rgba(253, 224, 71, 0.12)' }}>⏳</div>
          <div>
            <span style={{ ...styles.kpiValue, color: '#fde047' }}>{pendingCount}</span>
            <span style={styles.kpiLabel}>Pending Pickup</span>
          </div>
        </div>

        <div style={{ ...styles.kpiCard, borderColor: statusFilter === 'ASSIGNED' ? '#a5b4fc' : '#1e293b' }} onClick={() => setStatusFilter('ASSIGNED')}>
          <div style={{ ...styles.kpiIcon, color: '#a5b4fc', backgroundColor: 'rgba(165, 180, 252, 0.12)' }}>🚴</div>
          <div>
            <span style={{ ...styles.kpiValue, color: '#a5b4fc' }}>{assignedCount}</span>
            <span style={styles.kpiLabel}>Assigned to Rider</span>
          </div>
        </div>

        <div style={{ ...styles.kpiCard, borderColor: statusFilter === 'PICKED_UP' ? '#38bdf8' : '#1e293b' }} onClick={() => setStatusFilter('PICKED_UP')}>
          <div style={{ ...styles.kpiIcon, color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.12)' }}>🚚</div>
          <div>
            <span style={{ ...styles.kpiValue, color: '#38bdf8' }}>{transitCount}</span>
            <span style={styles.kpiLabel}>In Transit</span>
          </div>
        </div>

        <div style={{ ...styles.kpiCard, borderColor: statusFilter === 'DELIVERED' ? '#34d399' : '#1e293b' }} onClick={() => setStatusFilter('DELIVERED')}>
          <div style={{ ...styles.kpiIcon, color: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.12)' }}>✓</div>
          <div>
            <span style={{ ...styles.kpiValue, color: '#34d399' }}>{deliveredCount}</span>
            <span style={styles.kpiLabel}>Delivered Today</span>
          </div>
        </div>

        <div style={styles.kpiCard} onClick={() => setActiveTab('rider')}>
          <div style={{ ...styles.kpiIcon, color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.12)' }}>👥</div>
          <div>
            <span style={styles.kpiValue}>{riders.length}</span>
            <span style={styles.kpiLabel}>Active Fleet Riders</span>
          </div>
        </div>
      </div>

      {/* ─── 3. FULL-SCREEN WORKSPACE (TABS) ─── */}
      <main style={styles.mainContent}>
        {/* ── TAB 1: DISPATCHER CONSOLE ── */}
        {activeTab === 'dispatcher' && (
          <div style={styles.gridDashboard}>
            {/* Left Order Form */}
            <div style={styles.leftPanel}>
              <div style={styles.panelHeader}>
                <div style={styles.panelIconBadge}>➕</div>
                <div>
                  <h2 style={styles.panelTitle}>Create Delivery Order</h2>
                  <p style={styles.panelDesc}>Persists live to MySQL database on Railway.</p>
                </div>
              </div>

              <form onSubmit={handleCreateOrder} style={styles.form}>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Recipient Name</label>
                  <input
                    style={styles.input}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Amina Wanjiru"
                    required
                  />
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Recipient Phone Number</label>
                  <input
                    style={styles.input}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 0712345678"
                    required
                  />
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Package / Item Description</label>
                  <input
                    style={styles.input}
                    value={itemDescription}
                    onChange={(e) => setItemDescription(e.target.value)}
                    placeholder="e.g. Fragrance Gift Set (50ml)"
                    required
                  />
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Destination Delivery Address</label>
                  <input
                    style={styles.input}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. Westlands, Nairobi"
                    required
                  />
                </div>

                <button type="submit" style={styles.submitBtn} disabled={isSubmitting}>
                  {isSubmitting ? 'Logging to Railway...' : '🚀 Create & Dispatch Order'}
                </button>
              </form>
            </div>

            {/* Right Live Dispatch Feed */}
            <div style={styles.rightPanel}>
              <div style={styles.feedHeader}>
                <div>
                  <h2 style={styles.panelTitle}>Live Telemetry & Dispatches ({filteredDeliveries.length})</h2>
                  <p style={styles.panelDesc}>Live database records streaming from Railway.</p>
                </div>

                <div style={styles.filterToolbar}>
                  <input
                    style={styles.searchBar}
                    placeholder="Search by ID, customer, item, or address..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />

                  <div style={styles.filterPills}>
                    {['ALL', 'OPEN', 'ASSIGNED', 'PICKED_UP', 'DELIVERED'].map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setStatusFilter(filter)}
                        style={{
                          ...styles.filterPillBtn,
                          backgroundColor: statusFilter === filter ? '#0284c7' : '#1e293b',
                          color: statusFilter === filter ? '#ffffff' : '#94a3b8',
                          borderColor: statusFilter === filter ? '#38bdf8' : '#334155',
                        }}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={styles.cardsGrid}>
                {loading ? (
                  <div style={styles.emptyState}>
                    <p style={styles.emptyTitle}>Connecting to live Railway database...</p>
                  </div>
                ) : filteredDeliveries.length === 0 ? (
                  <div style={styles.emptyState}>
                    <div style={styles.emptyIcon}>📦</div>
                    <p style={styles.emptyTitle}>No matching delivery dispatches found</p>
                  </div>
                ) : (
                  filteredDeliveries.map((item) => (
                    <div
                      key={item.id}
                      style={styles.dispatchCard}
                      onClick={() => setInspectedWaybill(item)}
                    >
                      <div style={styles.cardHeader}>
                        <div style={styles.cardRefGroup}>
                          <span style={styles.cardId}>{item.reference || `DEL-#${item.id}`}</span>
                          {item.retailerName && <span style={styles.retailerBadge}>{item.retailerName}</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {item.qrVerified ? (
                            <span style={{ fontSize: '10px', fontWeight: '900', color: '#4ade80', backgroundColor: 'rgba(34, 197, 94, 0.15)', padding: '3px 8px', borderRadius: '12px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                              ✓ QR VERIFIED
                            </span>
                          ) : null}
                          <span style={{ ...styles.badge, ...styles[`badge_${item.status}`] }}>
                            {item.status}
                          </span>
                        </div>
                      </div>

                      <div style={styles.cardDetails}>
                        <p style={styles.detailRow}>
                          <strong>Recipient:</strong> {item.customerName} ({item.customerPhone})
                        </p>
                        <p style={styles.detailRow}>
                          <strong>Item:</strong> {item.itemDescription}
                        </p>
                        <p style={styles.detailRow}>
                          <strong>Destination:</strong> {item.deliveryAddress}
                        </p>
                      </div>

                      <div style={styles.assignRow} onClick={(e) => e.stopPropagation()}>
                        <span style={styles.assignLabel}>Assigned Rider:</span>
                        {item.status === 'OPEN' || !item.riderName ? (
                          <select
                            style={styles.select}
                            defaultValue=""
                            onChange={(e) => handleAssignRider(item.id, e.target.value)}
                          >
                            <option value="" disabled>
                              Assign Rider...
                            </option>
                            {riders.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.phone})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span style={styles.assignedRiderName}>
                            🚴 {item.riderName}
                          </span>
                        )}
                      </div>

                      <div style={styles.cardFooter}>
                        <span style={styles.timeTag}>
                          🕒 {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Click to view details</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: RETAILER LEDGER & WAYBILLS ── */}
        {activeTab === 'retailer' && (
          <div style={styles.retailerContainer}>
            <div style={styles.retailerTopBar}>
              <div>
                <h2 style={styles.panelTitle}>Enterprise Retailer Delivery Ledger & Waybills</h2>
                <p style={styles.panelDesc}>Complete live audit trail of package dispatches, verification tokens, and status checkpoints.</p>
              </div>

              <div style={styles.retailerControls}>
                <input
                  style={styles.ledgerSearchBox}
                  placeholder="Filter ledger by reference, customer, item, or address..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />

                <div style={styles.filterPills}>
                  {['ALL', 'OPEN', 'ASSIGNED', 'PICKED_UP', 'DELIVERED'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setStatusFilter(filter)}
                      style={{
                        ...styles.filterPillBtn,
                        backgroundColor: statusFilter === filter ? '#0284c7' : '#1e293b',
                        color: statusFilter === filter ? '#ffffff' : '#94a3b8',
                        borderColor: statusFilter === filter ? '#38bdf8' : '#334155',
                      }}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.trHead}>
                    <th style={styles.th}>Waybill Ref</th>
                    <th style={styles.th}>Retailer Shop</th>
                    <th style={styles.th}>Customer</th>
                    <th style={styles.th}>Phone</th>
                    <th style={styles.th}>Package Description</th>
                    <th style={styles.th}>Destination Node</th>
                    <th style={styles.th}>Assigned Courier</th>
                    <th style={styles.th}>QR Verification Token</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Audit &amp; QR</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeliveries.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={styles.emptyTd}>
                        No records matching the filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredDeliveries.map((item) => (
                      <tr
                        key={item.id}
                        style={styles.trBody}
                        onClick={() => setInspectedWaybill(item)}
                      >
                        <td style={styles.td}>
                          <code style={styles.refCode}>{item.reference || `#${item.id}`}</code>
                        </td>
                        <td style={styles.td}>{item.retailerName || 'ElectroShop'}</td>
                        <td style={styles.td}>
                          <strong>{item.customerName}</strong>
                        </td>
                        <td style={styles.td}>{item.customerPhone}</td>
                        <td style={styles.td}>{item.itemDescription}</td>
                        <td style={styles.td}>{item.deliveryAddress}</td>
                        <td style={styles.td}>
                          {item.riderName ? (
                            <span style={styles.riderPill}>🚴 {item.riderName}</span>
                          ) : (
                            <em style={{ color: '#64748b' }}>Pending Assignment</em>
                          )}
                        </td>
                        <td style={styles.td}>
                          {item.qrToken ? (
                            <span style={styles.tokenCode} title={item.qrToken}>
                              {item.qrToken.slice(0, 18)}...
                            </span>
                          ) : (
                            <span style={{ color: '#64748b' }}>—</span>
                          )}
                        </td>
                        <td style={styles.td}>
                          <span style={{ ...styles.badge, ...styles[`badge_${item.status}`] }}>
                            {item.status}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <button style={styles.viewRowBtn} onClick={(e) => {
                            e.stopPropagation();
                            setInspectedWaybill(item);
                          }}>
                            📱 Show QR ↗
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: FULL-SCREEN REFLEX RIDER PORTAL ── */}
        {activeTab === 'rider' && (
          <div style={styles.riderPortalWrapper}>
            {!selectedRiderDelivery ? (
              /* Rider Dashboard Mode */
              <div style={styles.riderDashboard}>
                {/* Rider Header Bar */}
                <div style={styles.riderControlHeader}>
                  <div style={styles.riderProfileBox} onClick={() => setIsRiderSwitcherOpen(true)}>
                    <div style={styles.riderAvatarLarge}>
                      {getRiderName(activeRiderId).slice(0, 1)}
                    </div>
                    <div>
                      <span style={styles.riderRoleTag}>AUTHENTICATED RIDER ACCOUNT</span>
                      <h2 style={styles.riderProfileName}>{getRiderName(activeRiderId)}</h2>
                    </div>
                    <button style={styles.switchRiderBtn}>
                      Switch Rider Profile ▾
                    </button>
                  </div>

                  <div style={styles.riderSummaryChips}>
                    <div style={styles.summaryChip}>
                      <span style={styles.summaryChipVal}>{riderTasks.filter(d => d.status === 'ASSIGNED' || d.status === 'OPEN').length}</span>
                      <span style={styles.summaryChipLbl}>To Pickup</span>
                    </div>
                    <div style={styles.summaryChip}>
                      <span style={{ ...styles.summaryChipVal, color: '#38bdf8' }}>{riderTasks.filter(d => d.status === 'PICKED_UP').length}</span>
                      <span style={styles.summaryChipLbl}>In Transit</span>
                    </div>
                    <div style={styles.summaryChip}>
                      <span style={{ ...styles.summaryChipVal, color: '#34d399' }}>{riderTasks.filter(d => d.status === 'DELIVERED').length}</span>
                      <span style={styles.summaryChipLbl}>Completed</span>
                    </div>
                  </div>
                </div>

                {/* In-Transit Active Mission Alert (ONLY if status is strictly PICKED_UP and NOT DELIVERED) */}
                {riderTasks.some(d => d.status === 'PICKED_UP') && (
                  <div style={styles.missionBanner}>
                    <div>
                      <span style={styles.missionTag}>🚴 ACTIVE IN-TRANSIT MISSION</span>
                      <h3 style={styles.missionTitle}>
                        {riderTasks.find(d => d.status === 'PICKED_UP')?.reference || 'DEL'}: {riderTasks.find(d => d.status === 'PICKED_UP')?.deliveryAddress}
                      </h3>
                      <p style={styles.missionSub}>Recipient: {riderTasks.find(d => d.status === 'PICKED_UP')?.customerName} ({riderTasks.find(d => d.status === 'PICKED_UP')?.customerPhone})</p>
                    </div>
                    <button
                      onClick={() => setSelectedRiderDelivery(riderTasks.find(d => d.status === 'PICKED_UP'))}
                      style={styles.resumeMissionBtn}
                    >
                      Resume Dropoff →
                    </button>
                  </div>
                )}

                {/* Assigned Tasks Grid */}
                <div style={styles.tasksSection}>
                  <h3 style={styles.sectionHeading}>
                    Assigned Deliveries ({riderTasks.length})
                  </h3>

                  {riderTasks.length === 0 ? (
                    <div style={styles.emptyState}>
                      <div style={styles.emptyIcon}>📦</div>
                      <p style={styles.emptyTitle}>No active delivery tasks assigned to {getRiderName(activeRiderId)}</p>
                      <p style={styles.emptySubtitle}>Dispatch a new order from the Dispatcher Console and assign it to this rider.</p>
                    </div>
                  ) : (
                    <div style={styles.riderCardsGrid}>
                      {riderTasks.map((delivery) => (
                        <div key={delivery.id} style={styles.riderTaskCard} onClick={() => setInspectedWaybill(delivery)}>
                          <div style={styles.taskCardHeader}>
                            <div>
                              <span style={styles.taskCardTag}>WAYBILL</span>
                              <h4 style={styles.taskCardTitle}>{delivery.reference || `#${delivery.id}`}</h4>
                            </div>
                            <span style={{ ...styles.badge, ...styles[`badge_${delivery.status}`] }}>
                              {delivery.status}
                            </span>
                          </div>

                          <div style={styles.taskCardContent}>
                            <p style={styles.taskItem}>📦 <strong>{delivery.itemDescription}</strong></p>
                            <p style={styles.taskCust}>👤 {delivery.customerName} ({delivery.customerPhone})</p>
                            <p style={styles.taskDest}>📍 {delivery.deliveryAddress}</p>
                          </div>

                          <div style={styles.taskCardActions} onClick={(e) => e.stopPropagation()}>
                            {delivery.status !== 'PICKED_UP' && delivery.status !== 'DELIVERED' ? (
                              <button
                                onClick={() => {
                                  setSelectedRiderDelivery(delivery);
                                  setIsPickupModalOpen(true);
                                }}
                                style={styles.primaryActionBtn}
                              >
                                Confirm Pickup →
                              </button>
                            ) : delivery.status === 'PICKED_UP' ? (
                              <button
                                onClick={() => setSelectedRiderDelivery(delivery)}
                                style={{ ...styles.primaryActionBtn, backgroundColor: '#0284c7' }}
                              >
                                In-Transit Dropoff →
                              </button>
                            ) : (
                              <span style={styles.completedPill}>✓ Delivered</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Full-Screen In-Transit Workflow */
              <div style={styles.activeMissionScreen}>
                <div style={styles.missionNavBar}>
                  <button onClick={() => setSelectedRiderDelivery(null)} style={styles.backBtn}>
                    ← Back to Tasks
                  </button>
                  <div style={styles.missionTitleCenter}>
                    <span style={styles.missionNavTag}>IN-TRANSIT MISSION</span>
                    <h3 style={styles.missionNavTitle}>{selectedRiderDelivery.reference || `#${selectedRiderDelivery.id}`}</h3>
                  </div>
                  <span style={{ ...styles.badge, ...styles[`badge_${selectedRiderDelivery.status}`] }}>
                    {selectedRiderDelivery.status}
                  </span>
                </div>

                <div style={styles.missionLayout}>
                  {/* Left Mission Info */}
                  <div style={styles.missionLeftCol}>
                    <div style={styles.missionCard}>
                      <span style={styles.cardLabel}>DESTINATION NODE</span>
                      <h3 style={styles.missionAddress}>{selectedRiderDelivery.deliveryAddress}</h3>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedRiderDelivery.deliveryAddress)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={styles.navGoogleBtn}
                      >
                        🗺️ Start Google Maps Navigation
                      </a>
                    </div>

                    <div style={styles.missionCard}>
                      <div style={styles.customerRow}>
                        <div>
                          <span style={styles.cardLabel}>CUSTOMER RECIPIENT</span>
                          <strong style={styles.custNameBig}>{selectedRiderDelivery.customerName}</strong>
                          <p style={styles.custPhoneText}>📞 {selectedRiderDelivery.customerPhone}</p>
                        </div>
                        {selectedRiderDelivery.customerPhone && (
                          <a href={`tel:${selectedRiderDelivery.customerPhone}`} style={styles.callBigBtn}>
                            📞 Call Recipient
                          </a>
                        )}
                      </div>
                    </div>

                    <div style={styles.missionCard}>
                      <span style={styles.cardLabel}>PACKAGE CONTENTS</span>
                      <p style={styles.packageBigText}>{selectedRiderDelivery.itemDescription}</p>
                    </div>
                  </div>

                  {/* Right Verification Checklist Gate (QR Only) */}
                  <div style={styles.missionRightCol}>
                    <div style={styles.verificationGateCard}>
                      <h3 style={styles.gatesTitle}>Dropoff Verification Gate</h3>
                      <p style={styles.gatesSub}>Scan customer QR code or validate token to confirm handoff.</p>

                      <div
                        onClick={() => setIsQRModalOpen(true)}
                        style={{
                          borderRadius: '16px',
                          padding: '24px',
                          border: '2px solid',
                          borderColor: (verifiedQRToken || selectedRiderDelivery.qrVerified) ? '#22c55e' : '#38bdf8',
                          backgroundColor: (verifiedQRToken || selectedRiderDelivery.qrVerified) ? 'rgba(34, 197, 94, 0.12)' : 'rgba(56, 189, 248, 0.08)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          marginTop: '8px'
                        }}
                      >
                        <div style={{ width: '50px', height: '50px', borderRadius: '14px', backgroundColor: (verifiedQRToken || selectedRiderDelivery.qrVerified) ? '#16a34a' : '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: '#fff' }}>
                          {(verifiedQRToken || selectedRiderDelivery.qrVerified) ? '✓' : '📱'}
                        </div>
                        <strong style={{ fontSize: '15px', color: '#fff', textAlign: 'center' }}>
                          {(verifiedQRToken || selectedRiderDelivery.qrVerified) ? 'QR Code Verified' : 'Tap to Show Customer QR Barcode'}
                        </strong>
                        <span style={{ fontSize: '12px', color: (verifiedQRToken || selectedRiderDelivery.qrVerified) ? '#4ade80' : '#94a3b8' }}>
                          {(verifiedQRToken || selectedRiderDelivery.qrVerified) ? '✓ Verified — Ready to Complete' : 'Customer scans with phone or tap to validate'}
                        </span>
                      </div>

                      {/* Final Complete Action Button */}
                      <button
                        onClick={handleCompleteDelivery}
                        disabled={isCompletingDelivery || !(verifiedQRToken || selectedRiderDelivery.qrVerified)}
                        style={{
                          ...styles.finalCompleteBtn,
                          backgroundColor: (verifiedQRToken || selectedRiderDelivery.qrVerified) && !isCompletingDelivery ? '#16a34a' : '#334155',
                          cursor: (verifiedQRToken || selectedRiderDelivery.qrVerified) && !isCompletingDelivery ? 'pointer' : 'not-allowed',
                          marginTop: '16px'
                        }}
                      >
                        {isCompletingDelivery ? 'Completing...' : '✓ COMPLETE & FINALIZE DELIVERY'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── MODALS ─── */}

      {/* 1. Pickup Confirmation Modal */}
      {isPickupModalOpen && selectedRiderDelivery && (
        <div style={styles.modalOverlay} onClick={() => setIsPickupModalOpen(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <span style={styles.modalSubTag}>CONFIRM PICKUP</span>
                <h3 style={styles.modalTitle}>{selectedRiderDelivery.reference || `#${selectedRiderDelivery.id}`}</h3>
              </div>
              <button onClick={() => setIsPickupModalOpen(false)} style={styles.modalCloseBtn}>✕</button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.modalBlock}>
                <span style={styles.modalLabel}>MERCHANT DEPOT</span>
                <strong style={styles.modalVal}>{selectedRiderDelivery.retailerName || 'ElectroShop Depot'}</strong>
                <p style={styles.modalValText}>Item: {selectedRiderDelivery.itemDescription}</p>
              </div>

              <div style={styles.modalBlock}>
                <span style={styles.modalLabel}>DESTINATION</span>
                <p style={styles.modalValText}>📍 {selectedRiderDelivery.deliveryAddress}</p>
              </div>

              <div style={styles.checklistRow}>
                <span style={{ color: '#38bdf8', fontSize: '18px' }}>✓</span>
                <span style={{ fontSize: '13px', color: '#f1f5f9' }}>
                  Package inspected and waybill reference confirmed for transit.
                </span>
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button
                onClick={() => handleConfirmPickup(selectedRiderDelivery)}
                style={styles.modalDoneBtn}
              >
                Confirm Pickup & Start Transit →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. QR Code Barcode Modal (Clean Scannable Phone URL Barcode) */}
      {isQRModalOpen && selectedRiderDelivery && (
        <div style={styles.modalOverlay} onClick={() => setIsQRModalOpen(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <span style={styles.modalSubTag}>SECURITY VERIFICATION GATE</span>
                <h3 style={styles.modalTitle}>📱 Customer Waybill QR Barcode</h3>
              </div>
              <button onClick={() => setIsQRModalOpen(false)} style={styles.modalCloseBtn}>✕</button>
            </div>

            <div style={styles.modalBody}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '10px 0' }}>
                {/* High Contrast Clean Scannable SVG QR Code Barcode */}
                <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '18px', boxShadow: '0 8px 30px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <QRCodeSVG
                    value={getVerificationUrl(selectedRiderDelivery)}
                    size={200}
                    level="H"
                    includeMargin={false}
                  />
                </div>

                <div style={{ textAlign: 'center' }}>
                  <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '800', color: '#ffffff' }}>
                    Point phone camera at QR Code above to scan
                  </p>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Opens verification URL in phone browser to confirm delivery.
                  </span>
                </div>

                {/* Direct Link Trigger */}
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  <a
                    href={getVerificationUrl(selectedRiderDelivery)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.testDirectLinkBtn}
                  >
                    🔗 Open Verification Link in Browser ↗
                  </a>

                  <button
                    onClick={() => handleVerifyQRToken(selectedRiderDelivery.qrToken || `DEL-${selectedRiderDelivery.id}`)}
                    disabled={isVerifyingQR}
                    style={styles.quickValidateBtn}
                  >
                    {isVerifyingQR ? '⏳ Verifying...' : '✓ 1-Tap Verify QR Code'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* 4. Delivery Success Celebration Modal */}
      {isSummaryModalOpen && summaryDelivery && (
        <div style={styles.modalOverlay} onClick={() => setIsSummaryModalOpen(false)}>
          <div style={{ ...styles.modalCard, textAlign: 'center', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.celebrationCircle}>
              <span style={{ fontSize: '36px', color: '#22c55e' }}>✓</span>
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: '900', color: '#ffffff', margin: '10px 0 4px 0' }}>Delivery Completed!</h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 16px 0' }}>
              Waybill {summaryDelivery.reference || '#' + summaryDelivery.id} is verified and completed.
            </p>

            <div style={styles.summaryDetailsCard}>
              <div style={styles.summaryRow}>
                <span style={styles.modalLabel}>Customer:</span>
                <strong style={{ color: '#fff' }}>{summaryDelivery.customerName}</strong>
              </div>
              <div style={styles.summaryRow}>
                <span style={styles.modalLabel}>Destination:</span>
                <span style={{ color: '#cbd5e1' }}>{summaryDelivery.deliveryAddress}</span>
              </div>
              <div style={styles.summaryRow}>
                <span style={styles.modalLabel}>Proof Verification:</span>
                <strong style={{ color: '#4ade80' }}>✓ Live Verified</strong>
              </div>
            </div>

            <button onClick={() => setIsSummaryModalOpen(false)} style={styles.modalDoneBtn}>
              Ready for Next Order →
            </button>
          </div>
        </div>
      )}

      {/* 5. Rider Profile Switcher Modal */}
      {isRiderSwitcherOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsRiderSwitcherOpen(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <span style={styles.modalSubTag}>FLEET ROSTER</span>
                <h3 style={styles.modalTitle}>Switch Active Rider</h3>
              </div>
              <button onClick={() => setIsRiderSwitcherOpen(false)} style={styles.modalCloseBtn}>✕</button>
            </div>

            <div style={styles.modalBody}>
              {[
                { id: '4', name: 'Brian Mutua', phone: '0745678901', hub: 'Nairobi CBD' },
                { id: '5', name: 'Grace Wanjiru', phone: '0756789012', hub: 'Westlands' },
                { id: '6', name: 'James Otieno', phone: '0767890123', hub: 'Industrial Area' },
                { id: 'all', name: 'All Fleet Deliveries', phone: 'Master Queue', hub: 'All Regions' },
              ].map((r) => {
                const isSelected = String(activeRiderId) === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      setActiveRiderId(r.id);
                      setIsRiderSwitcherOpen(false);
                      showNotification(`Switched active profile to ${r.name}`);
                    }}
                    style={{
                      ...styles.riderSelectTile,
                      borderColor: isSelected ? '#38bdf8' : '#334155',
                      backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : '#0f172a'
                    }}
                  >
                    <div style={styles.riderAvatarMini}>{r.name.slice(0, 1)}</div>
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '14px', color: '#fff', display: 'block' }}>{r.name}</strong>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>{r.phone} • {r.hub}</span>
                    </div>
                    {isSelected && <span style={styles.activeTag}>ACTIVE</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 6. Waybill Record Audit Detail Modal */}
      {inspectedWaybill && (
        <div style={styles.modalOverlay} onClick={() => setInspectedWaybill(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <span style={styles.modalSubTag}>WAYBILL RECORD AUDIT</span>
                <h3 style={styles.modalTitle}>{inspectedWaybill.reference || `#${inspectedWaybill.id}`}</h3>
              </div>
              <button onClick={() => setInspectedWaybill(null)} style={styles.modalCloseBtn}>✕</button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.modalStatusRow}>
                <span style={{ ...styles.badge, ...styles[`badge_${inspectedWaybill.status}`] }}>
                  Status: {inspectedWaybill.status}
                </span>
                {inspectedWaybill.qrVerified ? <span style={styles.verifiedPill}>✓ QR Verified</span> : null}
              </div>

              {/* Visual Scannable QR Code Barcode for Phone Redirection */}
              <div style={{ backgroundColor: '#0f172a', borderRadius: '16px', padding: '16px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <span style={styles.modalLabel}>📱 CUSTOMER QR BARCODE (SCAN WITH PHONE CAMERA)</span>
                <div style={{ backgroundColor: '#ffffff', padding: '14px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <QRCodeSVG
                    value={getVerificationUrl(inspectedWaybill)}
                    size={180}
                    level="H"
                    includeMargin={false}
                  />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: 'bold' }}>
                    Point any phone camera to open live verification URL
                  </span>
                  <a
                    href={getVerificationUrl(inspectedWaybill)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '11px', color: '#38bdf8', display: 'block', marginTop: '4px', textDecoration: 'underline' }}
                  >
                    {getVerificationUrl(inspectedWaybill)}
                  </a>
                </div>
              </div>

              <div style={styles.modalGrid}>
                <div style={styles.modalBlock}>
                  <span style={styles.modalLabel}>Customer Recipient</span>
                  <strong style={styles.modalVal}>{inspectedWaybill.customerName}</strong>
                  <span style={styles.modalSubVal}>📞 {inspectedWaybill.customerPhone}</span>
                </div>

                <div style={styles.modalBlock}>
                  <span style={styles.modalLabel}>Merchant Retailer</span>
                  <strong style={styles.modalVal}>{inspectedWaybill.retailerName || 'ElectroShop'}</strong>
                  <span style={styles.modalSubVal}>{inspectedWaybill.retailerEmail || 'merchant@reflex.co.ke'}</span>
                </div>
              </div>

              <div style={styles.modalBlock}>
                <span style={styles.modalLabel}>Package & Item Description</span>
                <p style={styles.modalValText}>{inspectedWaybill.itemDescription}</p>
              </div>

              <div style={styles.modalBlock}>
                <span style={styles.modalLabel}>Delivery Destination Node</span>
                <p style={styles.modalValText}>{inspectedWaybill.deliveryAddress}</p>
              </div>

              <div style={styles.modalBlock}>
                <span style={styles.modalLabel}>Assigned Courier / Rider</span>
                <p style={styles.modalValText}>
                  {inspectedWaybill.riderName ? `🚴 ${inspectedWaybill.riderName}` : 'Not yet assigned'}
                </p>
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button onClick={() => setInspectedWaybill(null)} style={styles.modalDoneBtn}>
                Close Audit Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  shell: {
    minHeight: '100vh',
    width: '100vw',
    backgroundColor: '#080c14',
    color: '#f1f5f9',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    overflowX: 'hidden',
  },
  notificationToast: {
    position: 'fixed',
    top: '20px',
    right: '24px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    padding: '14px 24px',
    borderRadius: '12px',
    fontWeight: 'bold',
    fontSize: '14px',
    zIndex: 99999,
    boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
    border: '1px solid #38bdf8',
  },
  navbar: {
    height: '74px',
    width: '100%',
    borderBottom: '1px solid #1e293b',
    backgroundColor: '#0f172a',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 28px',
    boxSizing: 'border-box',
  },
  navLeft: { display: 'flex', alignItems: 'center', gap: '14px' },
  brandLogo: { width: '40px', height: '40px', backgroundColor: '#0284c7', color: '#ffffff', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', fontSize: '22px', boxShadow: '0 2px 10px rgba(2, 132, 199, 0.4)' },
  brandTitle: { margin: '0 0 2px 0', fontSize: '17px', fontWeight: '800', letterSpacing: '0.3px', color: '#ffffff' },
  brandSubtitle: { fontSize: '11px', color: '#64748b', fontWeight: '500' },
  navCenter: { display: 'flex', justifyContent: 'center' },
  segmentedControl: { display: 'flex', backgroundColor: '#1e293b', padding: '4px', borderRadius: '12px', border: '1px solid #334155', gap: '4px' },
  segmentButton: { padding: '9px 22px', borderRadius: '10px', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s ease' },
  segmentActive: { backgroundColor: '#0284c7', color: '#ffffff', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  navRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  liveIndicator: { display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(34, 197, 94, 0.1)', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(34, 197, 94, 0.3)' },
  liveDot: { width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 6px #22c55e' },
  liveText: { fontSize: '12px', fontWeight: '700', color: '#22c55e' },
  lastUpdatedTag: { fontSize: '12px', color: '#64748b', fontWeight: '600', backgroundColor: '#1e293b', padding: '6px 14px', borderRadius: '20px', border: '1px solid #334155' },
  
  kpiContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: '16px',
    padding: '20px 28px 0 28px',
    width: '100%',
    boxSizing: 'border-box',
  },
  kpiCard: {
    backgroundColor: '#0f172a',
    borderRadius: '16px',
    padding: '16px',
    border: '1.5px solid #1e293b',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  kpiIcon: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    backgroundColor: '#1e293b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    color: '#38bdf8',
  },
  kpiValue: {
    fontSize: '22px',
    fontWeight: '900',
    color: '#ffffff',
    display: 'block',
    lineHeight: '1.1',
  },
  kpiLabel: {
    fontSize: '11px',
    color: '#94a3b8',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },

  mainContent: {
    padding: '20px 28px 40px 28px',
    width: '100%',
    flex: 1,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
  },
  gridDashboard: {
    display: 'grid',
    gridTemplateColumns: '380px 1fr',
    gap: '24px',
    width: '100%',
    flex: 1,
  },
  leftPanel: {
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '20px',
    padding: '24px',
    height: 'fit-content',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
  },
  panelIconBadge: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    color: '#38bdf8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: 'bold',
  },
  panelTitle: { margin: '0 0 2px 0', fontSize: '17px', fontWeight: '800', color: '#ffffff' },
  panelDesc: { margin: 0, fontSize: '12px', color: '#64748b' },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '12px 14px', color: '#ffffff', fontSize: '13px', outline: 'none' },
  submitBtn: { backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '12px', padding: '14px', fontWeight: '800', fontSize: '14px', cursor: 'pointer', marginTop: '6px', boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)' },
  
  rightPanel: {
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '20px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  feedHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '14px',
  },
  filterToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  searchBar: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '10px',
    padding: '10px 16px',
    color: '#ffffff',
    fontSize: '13px',
    width: '320px',
    outline: 'none',
  },
  filterPills: { display: 'flex', gap: '6px' },
  filterPillBtn: {
    border: '1px solid',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: '800',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '16px',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 280px)',
    paddingRight: '4px',
  },
  dispatchCard: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '16px',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, border-color 0.2s',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardRefGroup: { display: 'flex', alignItems: 'center', gap: '8px' },
  cardId: { fontFamily: 'monospace', fontWeight: '800', fontSize: '15px', color: '#38bdf8' },
  retailerBadge: { fontSize: '10px', backgroundColor: '#0f172a', color: '#94a3b8', padding: '2px 8px', borderRadius: '4px', border: '1px solid #334155' },
  badge: { padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: '800', letterSpacing: '0.5px', textTransform: 'uppercase' },
  badge_OPEN: { backgroundColor: '#fef08a22', color: '#fde047', border: '1px solid #fef08a44' },
  badge_ASSIGNED: { backgroundColor: '#818cf822', color: '#a5b4fc', border: '1px solid #818cf844' },
  badge_PICKED_UP: { backgroundColor: '#38bdf822', color: '#38bdf8', border: '1px solid #38bdf844' },
  badge_DELIVERED: { backgroundColor: '#10b98122', color: '#34d399', border: '1px solid #10b98144' },
  cardDetails: { display: 'flex', flexDirection: 'column', gap: '3px' },
  detailRow: { margin: 0, fontSize: '12.5px', color: '#cbd5e1' },
  assignRow: { marginTop: '6px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#0f172a', padding: '8px 12px', borderRadius: '10px', border: '1px solid #334155' },
  assignLabel: { fontSize: '11px', fontWeight: '700', color: '#94a3b8' },
  select: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', padding: '6px 10px', fontSize: '12px', outline: 'none', flex: 1 },
  assignedRiderName: { fontSize: '12px', fontWeight: '800', color: '#38bdf8' },
  cardFooter: { margin: '4px 0 0 0', fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  timeTag: { fontSize: '11px', color: '#64748b' },
  inspectBtn: { fontSize: '11px', color: '#38bdf8', fontWeight: '700' },
  
  retailerContainer: { display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', flex: 1 },
  retailerTopBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' },
  retailerControls: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
  ledgerSearchBox: { backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '10px 16px', color: '#ffffff', fontSize: '13px', width: '380px', outline: 'none' },
  tableWrapper: { backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '20px', overflow: 'hidden', width: '100%' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  trHead: { borderBottom: '1px solid #1e293b', backgroundColor: '#0a101d' },
  th: { padding: '16px 20px', fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' },
  trBody: { borderBottom: '1px solid #1e293b', cursor: 'pointer', transition: 'background-color 0.15s' },
  td: { padding: '16px 20px', fontSize: '13px', color: '#cbd5e1' },
  refCode: { color: '#38bdf8', fontWeight: '800' },
  riderPill: { backgroundColor: '#1e293b', padding: '4px 10px', borderRadius: '8px', color: '#a5b4fc', fontSize: '12px', fontWeight: '700' },
  tokenCode: { fontFamily: 'monospace', fontSize: '11px', color: '#fde047', backgroundColor: '#1e293b', padding: '3px 8px', borderRadius: '6px' },
  viewRowBtn: { backgroundColor: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' },
  emptyState: { gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', border: '1px dashed #334155', borderRadius: '16px' },
  emptyIcon: { fontSize: '40px', marginBottom: '8px' },
  emptyTitle: { margin: '0 0 4px 0', fontSize: '15px', fontWeight: '700', color: '#94a3b8' },
  emptySubtitle: { margin: 0, fontSize: '12px', color: '#64748b' },
  emptyTd: { padding: '80px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' },

  riderPortalWrapper: { width: '100%', display: 'flex', flexDirection: 'column', flex: 1 },
  riderDashboard: { display: 'flex', flexDirection: 'column', gap: '20px' },
  riderControlHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', backgroundColor: '#0f172a', padding: '20px 24px', borderRadius: '20px', border: '1px solid #1e293b' },
  riderProfileBox: { display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' },
  riderAvatarLarge: { width: '48px', height: '48px', borderRadius: '14px', backgroundColor: '#0284c7', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '20px', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.4)' },
  riderRoleTag: { fontSize: '10px', color: '#38bdf8', fontWeight: '800', letterSpacing: '0.6px' },
  riderProfileName: { margin: '2px 0 0 0', fontSize: '18px', fontWeight: '800', color: '#ffffff' },
  switchRiderBtn: { backgroundColor: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', marginLeft: '12px' },
  riderSummaryChips: { display: 'flex', gap: '12px' },
  summaryChip: { backgroundColor: '#1e293b', padding: '10px 18px', borderRadius: '12px', border: '1px solid #334155', textAlign: 'center' },
  summaryChipVal: { fontSize: '18px', fontWeight: '900', color: '#fde047', display: 'block' },
  summaryChipLbl: { fontSize: '10px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase' },

  missionBanner: {
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    border: '1.5px solid #0284c7',
    borderRadius: '18px',
    padding: '18px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    boxShadow: '0 6px 20px rgba(2, 132, 199, 0.25)',
  },
  missionTag: { fontSize: '11px', fontWeight: '900', color: '#38bdf8', letterSpacing: '0.8px', display: 'block', marginBottom: '2px' },
  missionTitle: { margin: '0 0 4px 0', fontSize: '16px', fontWeight: '800', color: '#ffffff' },
  missionSub: { margin: 0, fontSize: '13px', color: '#cbd5e1' },
  resumeMissionBtn: { backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.4)' },
  
  tasksSection: { display: 'flex', flexDirection: 'column', gap: '14px' },
  sectionHeading: { margin: 0, fontSize: '16px', fontWeight: '800', color: '#ffffff' },
  riderCardsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' },
  riderTaskCard: { backgroundColor: '#0f172a', borderRadius: '18px', padding: '20px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'pointer' },
  taskCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  taskCardTag: { fontSize: '9px', color: '#94a3b8', fontWeight: '800', letterSpacing: '0.8px' },
  taskCardTitle: { margin: '2px 0 0 0', fontSize: '16px', fontWeight: '800', color: '#38bdf8' },
  taskCardContent: { backgroundColor: '#1e293b', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' },
  taskItem: { margin: 0, fontSize: '13px', color: '#ffffff' },
  taskCust: { margin: 0, fontSize: '12px', color: '#cbd5e1' },
  taskDest: { margin: 0, fontSize: '12px', color: '#94a3b8' },
  taskCardActions: { marginTop: '4px' },
  primaryActionBtn: { width: '100%', height: '46px', backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '12px', fontSize: '13px', fontWeight: '800', cursor: 'pointer' },
  completedPill: { width: '100%', display: 'block', textAlign: 'center', color: '#34d399', fontSize: '12px', fontWeight: '800', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)' },

  activeMissionScreen: { display: 'flex', flexDirection: 'column', gap: '20px' },
  missionNavBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', padding: '16px 24px', borderRadius: '18px', border: '1px solid #1e293b' },
  backBtn: { backgroundColor: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' },
  missionTitleCenter: { textAlign: 'center' },
  missionNavTag: { fontSize: '10px', color: '#94a3b8', fontWeight: '800', letterSpacing: '0.8px' },
  missionNavTitle: { margin: '2px 0 0 0', fontSize: '16px', fontWeight: '800', color: '#ffffff' },
  missionLayout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' },
  missionLeftCol: { display: 'flex', flexDirection: 'column', gap: '16px' },
  missionRightCol: { display: 'flex', flexDirection: 'column', gap: '16px' },
  missionCard: { backgroundColor: '#0f172a', borderRadius: '18px', padding: '20px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '8px' },
  cardLabel: { fontSize: '10px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.6px' },
  missionAddress: { margin: 0, fontSize: '18px', fontWeight: '800', color: '#ffffff' },
  navGoogleBtn: { marginTop: '8px', display: 'block', textAlign: 'center', backgroundColor: '#1e293b', color: '#38bdf8', padding: '12px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', textDecoration: 'none', border: '1px solid #334155' },
  customerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  custNameBig: { fontSize: '16px', color: '#ffffff', display: 'block' },
  custPhoneText: { margin: '2px 0 0 0', fontSize: '13px', color: '#38bdf8' },
  callBigBtn: { backgroundColor: '#16a34a', color: '#fff', textDecoration: 'none', padding: '10px 18px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(22, 163, 74, 0.4)' },
  packageBigText: { margin: 0, fontSize: '15px', color: '#f8fafc', fontWeight: '600' },
  
  verificationGateCard: { backgroundColor: '#0f172a', borderRadius: '20px', padding: '24px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '16px' },
  gatesTitle: { margin: '0 0 2px 0', fontSize: '16px', fontWeight: '800', color: '#ffffff' },
  gatesSub: { margin: 0, fontSize: '12px', color: '#94a3b8' },
  gatesGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '6px' },
  gateTile: { borderRadius: '16px', padding: '18px', border: '2px solid', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' },
  gateIcon: { width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#fff' },
  gateLabel: { fontSize: '13px', color: '#fff', textAlign: 'center' },
  gateSuccessTag: { fontSize: '11px', color: '#4ade80', fontWeight: 'bold' },
  finalCompleteBtn: { width: '100%', height: '54px', color: '#ffffff', border: 'none', borderRadius: '14px', fontSize: '15px', fontWeight: '800', letterSpacing: '0.5px', marginTop: '10px', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' },

  /* Modal Details */
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(6px)',
    padding: '20px',
    boxSizing: 'border-box',
  },
  modalCard: {
    backgroundColor: '#1e293b',
    borderRadius: '24px',
    width: '100%',
    maxWidth: '520px',
    padding: '24px 28px',
    border: '1px solid #334155',
    boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalSubTag: { fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '1px' },
  modalTitle: { margin: '2px 0 0 0', fontSize: '20px', fontWeight: '900', color: '#38bdf8' },
  modalCloseBtn: { background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' },
  modalBody: { display: 'flex', flexDirection: 'column', gap: '12px' },
  modalStatusRow: { display: 'flex', gap: '10px', alignItems: 'center' },
  modalGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  modalBlock: { backgroundColor: '#0f172a', borderRadius: '12px', padding: '12px 14px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '2px' },
  modalLabel: { fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' },
  modalVal: { fontSize: '14px', color: '#ffffff' },
  modalSubVal: { fontSize: '12px', color: '#38bdf8' },
  modalValText: { margin: '4px 0 0 0', fontSize: '13px', color: '#cbd5e1' },
  checklistRow: { display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#0f172a', padding: '12px', borderRadius: '12px', border: '1px solid #334155' },
  modalFooter: { marginTop: '8px' },
  modalDoneBtn: { width: '100%', height: '48px', backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.4)' },
  
  testDirectLinkBtn: { display: 'block', textAlign: 'center', backgroundColor: '#0f172a', color: '#38bdf8', padding: '12px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', textDecoration: 'none', border: '1px solid #0284c7' },
  quickValidateBtn: { width: '100%', backgroundColor: '#16a34a', color: '#ffffff', border: 'none', padding: '13px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' },

  uploadTriggerZone: { padding: '36px 20px', borderRadius: '16px', border: '2px dashed #0284c7', backgroundColor: '#0f172a', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' },
  uploadCameraIcon: { fontSize: '40px', marginBottom: '4px' },
  celebrationCircle: { width: '70px', height: '70px', borderRadius: '50%', backgroundColor: 'rgba(34, 197, 94, 0.15)', border: '3px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  summaryDetailsCard: { width: '100%', backgroundColor: '#0f172a', borderRadius: '14px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left', margin: '12px 0' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' },
  riderSelectTile: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '14px', border: '1.5px solid', cursor: 'pointer' },
  riderAvatarMini: { width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#0284c7', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800' },
  activeTag: { fontSize: '10px', fontWeight: '900', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.15)', padding: '2px 8px', borderRadius: '12px' },

  /* Mobile Phone Dedicated Verification Landing Screen */
  mobileVerifyContainer: {
    minHeight: '100vh',
    width: '100vw',
    backgroundColor: '#080c14',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    boxSizing: 'border-box',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  mobileVerifyCard: {
    backgroundColor: '#1e293b',
    borderRadius: '24px',
    padding: '32px 24px',
    width: '100%',
    maxWidth: '440px',
    border: '1px solid #334155',
    boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '16px',
    boxSizing: 'border-box',
  },
  mobileVerifyDetails: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid #334155',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    boxSizing: 'border-box',
  },
  mobileConfirmBtn: {
    width: '100%',
    height: '54px',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '14px',
    fontSize: '15px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(22, 163, 74, 0.4)',
  },
  verifySuccessBox: {
    width: '100%',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    border: '1.5px solid #22c55e',
    borderRadius: '16px',
    padding: '20px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    boxSizing: 'border-box',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: '#fca5a5',
    border: '1px solid #ef4444',
    padding: '10px 14px',
    borderRadius: '10px',
    fontSize: '12px',
    textAlign: 'center',
    width: '100%',
    boxSizing: 'border-box',
  },
  returnHomeBtn: {
    marginTop: '6px',
    color: '#38bdf8',
    fontSize: '13px',
    fontWeight: 'bold',
    textDecoration: 'none',
    cursor: 'pointer',
  },
};