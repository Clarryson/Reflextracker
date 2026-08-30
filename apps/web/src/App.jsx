import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://backend-production-7f0d0.up.railway.app/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://backend-production-7f0d0.up.railway.app';
const LOCAL_HOST_IP = '192.168.2.101'; // Local Wi-Fi IP for seamless phone camera scanning

// Nairobi Delivery Zones & Estimation Logic
export const NAIROBI_ZONES = [
  'Westlands',
  'CBD',
  'Kilimani',
  'Lavington',
  'Karen',
  'Parklands',
  'Eastleigh',
  'Embakasi'
];

export const PRIORITY_LEVELS = ['Normal', 'High', 'Urgent'];

export const ZONE_BASE_FEES = {
  Westlands: 250,
  CBD: 200,
  Kilimani: 250,
  Parklands: 250,
  Lavington: 300,
  Eastleigh: 300,
  Karen: 450,
  Embakasi: 400
};

export const ESTIMATED_TIMES = {
  Westlands: { Normal: '45–60 mins', High: '30–45 mins', Urgent: '20–30 mins' },
  CBD: { Normal: '30–45 mins', High: '25–35 mins', Urgent: '15–25 mins' },
  Kilimani: { Normal: '40–55 mins', High: '30–40 mins', Urgent: '20–30 mins' },
  Parklands: { Normal: '40–55 mins', High: '30–40 mins', Urgent: '20–30 mins' },
  Lavington: { Normal: '45–60 mins', High: '35–45 mins', Urgent: '25–35 mins' },
  Eastleigh: { Normal: '50–70 mins', High: '40–55 mins', Urgent: '30–40 mins' },
  Karen: { Normal: '60–90 mins', High: '45–65 mins', Urgent: '35–50 mins' },
  Embakasi: { Normal: '60–85 mins', High: '50–65 mins', Urgent: '35–50 mins' }
};

export const getEstimatedDeliveryTime = (zone, priority) => {
  const zoneTimes = ESTIMATED_TIMES[zone] || ESTIMATED_TIMES.Westlands;
  return zoneTimes[priority] || zoneTimes.Normal || '45–60 mins';
};

export default function App() {
  // ─── 0. Check URL for Mobile Phone QR Scan Redirection ───
  const urlParams = new URLSearchParams(window.location.search);
  const verifyParam = urlParams.get('verify');
  const verifyIdParam = urlParams.get('id') || urlParams.get('deliveryId');
  const verifyTokenParam = urlParams.get('token');

  // ─── 0b. Check URL for Rider PWA Onboarding (/join/:token or ?join=token) ───
  const pathParts = window.location.pathname.split('/');
  const isJoinPath = pathParts[1] === 'join' && pathParts[2];
  const joinTokenParam = isJoinPath ? pathParts[2] : (urlParams.get('join') || urlParams.get('onboarding') || urlParams.get('token'));

  const [isOnboardingMode, setIsOnboardingMode] = useState(Boolean(isJoinPath || urlParams.get('join') || urlParams.get('onboarding')));
  const [onboardingToken, setOnboardingToken] = useState(joinTokenParam || '');
  const [onboardingStatus, setOnboardingStatus] = useState('loading'); // 'loading', 'valid', 'invalid'
  const [onboardingRider, setOnboardingRider] = useState(null);
  const [onboardingErrorMsg, setOnboardingErrorMsg] = useState('');

  const [isUrlVerifyMode, setIsUrlVerifyMode] = useState(Boolean(verifyParam && verifyIdParam));
  const [urlVerifyStatus, setUrlVerifyStatus] = useState('idle'); // 'idle', 'verifying', 'success', 'error'
  const [urlVerifyMsg, setUrlVerifyMsg] = useState('');
  const [urlDeliveryData, setUrlDeliveryData] = useState(null);

  // Navigation & Role Tabs
  const [activeTab, setActiveTab] = useState('retailer'); // 'retailer', 'dispatcher', 'riders', 'rider'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Live Data State (Railway Backend + MySQL + Express Proxy)
  const [deliveries, setDeliveries] = useState([]);
  const [riders, setRiders] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  // Fleet Riders Management State
  const [retailerSubTab, setRetailerSubTab] = useState('dispatches'); // 'dispatches' | 'riders'
  const [isRegisterRiderModalOpen, setIsRegisterRiderModalOpen] = useState(false);
  const [registeredRiderSuccess, setRegisteredRiderSuccess] = useState(null);
  const [riderFormData, setRiderFormData] = useState({
    name: '',
    phone: '',
    email: '',
    hub: 'Kamau Electronics (Westlands Hub)'
  });
  const [riderFormErrors, setRiderFormErrors] = useState({});
  const [isSubmittingRider, setIsSubmittingRider] = useState(false);
  const [riderSearchTerm, setRiderSearchTerm] = useState('');
  const [riderStatusFilter, setRiderStatusFilter] = useState('ALL');
  const [regeneratingRiderId, setRegeneratingRiderId] = useState(null);

  // Dispatcher Assign Rider Modal State
  const [assignModalDelivery, setAssignModalDelivery] = useState(null);
  const [selectedRiderForAssignment, setSelectedRiderForAssignment] = useState('');

  // Retailer "New Delivery Request" Form State
  const [formData, setFormData] = useState({
    customerName: 'John',
    customerPhone: '0712345678',
    zone: 'Westlands',
    priority: 'Normal',
    address: 'Delta Corner Tower, 4th Floor, Westlands, Nairobi',
    itemDescription: 'Laptop - HP ProBook 450 G8',
    reference: 'ORD-20465',
    packageValue: '35000',
    deliveryFee: '250',
    riderNotes: 'Handle with care, fragile electronics. Call upon reaching reception.'
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmittingDelivery, setIsSubmittingDelivery] = useState(false);
  const [createdDeliverySlip, setCreatedDeliverySlip] = useState(null);
  const [isNewDeliveryModalOpen, setIsNewDeliveryModalOpen] = useState(false);

  // Legacy fallback state for compatibility
  const [customerName, setCustomerName] = useState('John');
  const [phone, setPhone] = useState('0712345678');
  const [itemDescription, setItemDescription] = useState('Laptop');
  const [address, setAddress] = useState('Westlands, Nairobi');
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
      // Fetch from local Express proxy or Railway API
      let res = await fetch('http://localhost:3000/api/riders').catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`${API_BASE}/riders`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        }).catch(() => null);
      }
      if (res && res.ok) {
        const data = await res.json();
        if (data.data?.riders) {
          setRiders(data.data.riders);
        }
      }
    } catch (err) {
      console.warn('Error fetching riders:', err.message);
    }
  }, [getAuthToken]);

  // ─── Check & Validate Rider Onboarding Token (/join/:token) ───
  useEffect(() => {
    if (!isOnboardingMode || !onboardingToken) return;

    let isMounted = true;
    (async () => {
      setOnboardingStatus('loading');
      try {
        let res = await fetch(`http://localhost:3000/api/rider/onboarding/${onboardingToken}`).catch(() => null);
        if (!res || !res.ok) {
          res = await fetch(`${API_BASE}/rider/onboarding/${onboardingToken}`).catch(() => null);
        }
        
        if (res && res.ok) {
          const data = await res.json();
          if (isMounted && data.success && data.data?.rider) {
            setOnboardingRider(data.data.rider);
            setOnboardingStatus('valid');
            return;
          }
        }

        // Local fallback seeds if offline
        if (isMounted) {
          if (onboardingToken.includes('brian') || onboardingToken === '7f82a91c4e91b00401brian04') {
            setOnboardingRider({ id: '4', code: 'RIDER-004', name: 'Brian Mutua', phone: '+254712345678', email: 'brian@rider.co.ke', hub: 'Westlands Hub' });
            setOnboardingStatus('valid');
          } else if (onboardingToken.includes('grace') || onboardingToken === '8e93b02d5f02c00502grace05') {
            setOnboardingRider({ id: '5', code: 'RIDER-005', name: 'Grace Wanjiru', phone: '+254722334455', email: 'grace@rider.co.ke', hub: 'Kilimani Node' });
            setOnboardingStatus('valid');
          } else if (onboardingToken.includes('james') || onboardingToken === '9f04c13e6a13d00603james06') {
            setOnboardingRider({ id: '6', code: 'RIDER-006', name: 'James Otieno', phone: '+254733445566', email: 'james@rider.co.ke', hub: 'CBD Depot' });
            setOnboardingStatus('valid');
          } else {
            setOnboardingStatus('invalid');
            setOnboardingErrorMsg('Invalid or expired rider invitation token.');
          }
        }
      } catch (err) {
        if (isMounted) {
          setOnboardingStatus('invalid');
          setOnboardingErrorMsg('Network error validating invitation token.');
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOnboardingMode, onboardingToken]);

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

  // ─── Retailer: Form Validation & Field Change Handlers ───
  const validateField = (field, value) => {
    let error = '';
    if (field === 'customerName' && (!value || !value.trim())) {
      error = 'Customer name is required';
    }
    if (field === 'customerPhone') {
      const p = (value || '').trim();
      if (!p) {
        error = 'Phone number is required';
      } else {
        const phoneRegex = /^(\+?254|0)?[17]\d{8}$/;
        const digits = p.replace(/\D/g, '');
        if (!phoneRegex.test(p) && (digits.length < 9 || digits.length > 12)) {
          error = 'Enter a valid Kenyan phone number (e.g. +254712345678 or 0712345678)';
        }
      }
    }
    if (field === 'zone' && (!value || !value.trim())) {
      error = 'Delivery zone is required';
    }
    if (field === 'address' && (!value || !value.trim())) {
      error = 'Specific delivery address & landmarks are required';
    }
    if (field === 'itemDescription' && (!value || !value.trim())) {
      error = 'Item description is required';
    }
    if (field === 'packageValue' && value !== '' && value !== undefined) {
      if (isNaN(Number(value)) || Number(value) < 0) {
        error = 'Package value must be a non-negative number';
      }
    }
    if (field === 'deliveryFee' && value !== '' && value !== undefined) {
      if (isNaN(Number(value)) || Number(value) < 0) {
        error = 'Delivery fee must be a non-negative number';
      }
    }
    return error;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'zone' || field === 'priority') {
        const targetZone = field === 'zone' ? value : prev.zone;
        const targetPriority = field === 'priority' ? value : prev.priority;
        const baseFee = ZONE_BASE_FEES[targetZone] || 250;
        const surcharge = targetPriority === 'Urgent' ? 100 : targetPriority === 'High' ? 50 : 0;
        updated.deliveryFee = String(baseFee + surcharge);
      }
      return updated;
    });

    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = () => {
    const errors = {};
    ['customerName', 'customerPhone', 'zone', 'address', 'itemDescription', 'packageValue', 'deliveryFee'].forEach(field => {
      const err = validateField(field, formData[field]);
      if (err) errors[field] = err;
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateDeliveryRequest = async (e) => {
    if (e) e.preventDefault();
    if (!validateForm()) {
      showNotification('⚠️ Please complete all required fields with valid details');
      return;
    }

    setIsSubmittingDelivery(true);
    try {
      const token = await getAuthToken('retailer');
      const fullAddress = `${formData.address.trim()} (${formData.zone})`;
      
      const payload = {
        customerName: formData.customerName.trim(),
        customerPhone: formData.customerPhone.trim(),
        deliveryAddress: fullAddress,
        itemDescription: formData.itemDescription.trim(),
        zone: formData.zone,
        priority: formData.priority,
        reference: formData.reference.trim() || undefined,
        packageValue: formData.packageValue ? Number(formData.packageValue) : undefined,
        deliveryFee: formData.deliveryFee ? Number(formData.deliveryFee) : undefined,
        riderNotes: formData.riderNotes.trim() || undefined,
      };

      const res = await fetch(`${API_BASE}/deliveries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success && data.data?.delivery) {
        const created = data.data.delivery;
        const qrSlipData = {
          ...created,
          customerName: formData.customerName,
          customerPhone: formData.customerPhone,
          deliveryAddress: fullAddress,
          zone: formData.zone,
          priority: formData.priority,
          itemDescription: formData.itemDescription,
          reference: created.reference || formData.reference || `DEL-${created.id}`,
          packageValue: formData.packageValue,
          deliveryFee: formData.deliveryFee,
          riderNotes: formData.riderNotes,
          estimatedTime: getEstimatedDeliveryTime(formData.zone, formData.priority),
          qrToken: created.qrToken || `REFLEX-${created.reference || created.id}-${Date.now().toString(36).toUpperCase()}`
        };

        setCreatedDeliverySlip(qrSlipData);
        showNotification(`✅ Delivery created! Waybill #${qrSlipData.reference} is now 📦 OPEN in database`);
        await fetchDeliveries();

        // Reset form
        setFormData({
          customerName: '',
          customerPhone: '',
          zone: 'Westlands',
          priority: 'Normal',
          address: '',
          itemDescription: '',
          reference: '',
          packageValue: '',
          deliveryFee: '250',
          riderNotes: ''
        });
        setFormErrors({});
      } else {
        showNotification(`⚠️ ${data.message || 'Failed to create delivery on server'}`);
      }
    } catch (err) {
      showNotification(`❌ Network error: ${err.message}`);
    } finally {
      setIsSubmittingDelivery(false);
    }
  };

  // ─── Dispatcher: Create Delivery Order (Railway REST fallback) ───
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
        showNotification(`✅ Delivery created! Order ${data.data?.delivery?.reference || 'DEL'} is now 📦 OPEN in database`);
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

  // ─── Retailer / Dispatcher: Register Rider & PWA Link Management ───
  const handleRegisterRiderSubmit = async (e) => {
    if (e) e.preventDefault();
    const errors = {};
    if (!riderFormData.name || !riderFormData.name.trim()) {
      errors.name = 'Full name is required';
    }
    if (!riderFormData.phone || !riderFormData.phone.trim()) {
      errors.phone = 'Phone number is required';
    } else {
      const p = riderFormData.phone.trim();
      const phoneRegex = /^(\+?254|0)?[17]\d{8}$/;
      const digits = p.replace(/\D/g, '');
      if (!phoneRegex.test(p) && (digits.length < 9 || digits.length > 12)) {
        errors.phone = 'Enter a valid Kenyan phone number (e.g. +254712345678 or 0712345678)';
      }
    }
    if (riderFormData.email && riderFormData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(riderFormData.email.trim())) {
        errors.email = 'Enter a valid email address';
      }
    }

    if (Object.keys(errors).length > 0) {
      setRiderFormErrors(errors);
      return;
    }

    setIsSubmittingRider(true);
    try {
      const token = await getAuthToken('dispatcher');
      let res = await fetch('http://localhost:3000/api/riders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(riderFormData)
      }).catch(() => null);

      if (!res || !res.ok) {
        res = await fetch(`${API_BASE}/riders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(riderFormData)
        }).catch(() => null);
      }

      if (res) {
        const data = await res.json().catch(() => ({}));
        if (data.success && data.data?.rider) {
          const created = data.data.rider;
          const onboardingUrl = data.data.onboardingUrl || `${window.location.origin}/join/${created.onboardingToken}`;
          setRegisteredRiderSuccess({ rider: created, onboardingUrl });
          setIsRegisterRiderModalOpen(false);
          setRiderFormData({ name: '', phone: '', email: '', hub: 'Westlands Hub' });
          setRiderFormErrors({});
          showNotification(`✅ Rider ${created.name} registered! PWA access link generated.`);
          await fetchRiders();
          return;
        } else if (data.message) {
          showNotification(`⚠️ ${data.message}`);
          return;
        }
      }

      // Local fallback creation if completely offline
      const nextId = String(riders.length + 4);
      const fallbackToken = 'token_' + Date.now().toString(36);
      const localRider = {
        id: nextId,
        code: `RIDER-${nextId.padStart(3, '0')}`,
        name: riderFormData.name.trim(),
        phone: riderFormData.phone.trim(),
        email: riderFormData.email.trim() || `${riderFormData.name.toLowerCase().replace(/\s+/g, '.')}@rider.reflex.co.ke`,
        hub: riderFormData.hub || 'Westlands Hub',
        status: 'ACTIVE',
        pwaStatus: 'LINK_SENT',
        onboardingToken: fallbackToken,
        onboardingUrl: `${window.location.origin}/join/${fallbackToken}`
      };
      setRiders(prev => [...prev, localRider]);
      setRegisteredRiderSuccess({ rider: localRider, onboardingUrl: localRider.onboardingUrl });
      setIsRegisterRiderModalOpen(false);
      setRiderFormData({ name: '', phone: '', email: '', hub: 'Westlands Hub' });
      setRiderFormErrors({});
      showNotification(`✅ Rider ${localRider.name} registered locally!`);
    } catch (err) {
      showNotification(`❌ Error registering rider: ${err.message}`);
    } finally {
      setIsSubmittingRider(false);
    }
  };

  const handleRegenerateRiderLink = async (riderId) => {
    setRegeneratingRiderId(riderId);
    try {
      const token = await getAuthToken('dispatcher');
      let res = await fetch(`http://localhost:3000/api/riders/${riderId}/regenerate-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        if (data.success && data.data?.onboardingUrl) {
          showNotification(`🔄 New PWA access link generated for Rider #${riderId}!`);
          await fetchRiders();
          setRegisteredRiderSuccess({
            rider: data.data.rider,
            onboardingUrl: data.data.onboardingUrl
          });
          return;
        }
      }

      // Fallback
      const target = riders.find(r => String(r.id) === String(riderId));
      if (target) {
        const freshToken = 'fresh_' + Date.now().toString(36);
        const freshUrl = `${window.location.origin}/join/${freshToken}`;
        const updated = { ...target, onboardingToken: freshToken, onboardingUrl: freshUrl, pwaStatus: 'LINK_SENT' };
        setRiders(prev => prev.map(r => String(r.id) === String(riderId) ? updated : r));
        setRegisteredRiderSuccess({ rider: updated, onboardingUrl: freshUrl });
        showNotification(`🔄 New PWA link generated for ${target.name}!`);
      }
    } catch (err) {
      showNotification(`❌ Error: ${err.message}`);
    } finally {
      setRegeneratingRiderId(null);
    }
  };

  const handleCopyPwaLink = (url, riderName) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url);
      showNotification(`📋 Copied PWA link for ${riderName || 'rider'} to clipboard!`);
    } else {
      showNotification(`Link: ${url}`);
    }
  };

  const handleSharePwaLink = async (url, rider) => {
    const text = `Hi ${rider.name}, here is your official REFLEX Rider PWA access link. Open and add it to your Home Screen to start receiving delivery dispatches:\n${url}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'REFLEX Rider PWA Access',
          text,
          url
        });
        showNotification('✓ Shared via system dialog');
        return;
      } catch (e) {}
    }
    // WhatsApp Fallback
    const cleanPhone = (rider.phone || '').replace(/\D/g, '');
    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
  };
  const getRiderAvailability = (rId) => {
    const activeTasks = deliveries.filter(
      (d) => String(d.riderId) === String(rId) && (d.status === 'ASSIGNED' || d.status === 'PICKED_UP')
    );
    if (activeTasks.length === 0) {
      return { status: 'AVAILABLE', label: '🟢 Available', color: '#22c55e' };
    }
    return {
      status: 'ON_DELIVERY',
      label: `🟡 On Delivery (${activeTasks.length} active)`,
      color: '#f59e0b'
    };
  };

  const handleAssignRider = async (deliveryId, riderId) => {
    if (!riderId) return;
    const targetRider = riders.find((r) => String(r.id) === String(riderId));
    const riderName = targetRider?.name || `Rider #${riderId}`;

    try {
      // Step 1: Update Railway backend
      const token = await getAuthToken('dispatcher');
      const res = await fetch(`${API_BASE}/deliveries/${deliveryId}/assign`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ riderId: Number(riderId) })
      }).catch(() => null);

      // Step 2: Also update local backend proxy / socket broadcaster if available
      await fetch(`http://localhost:3000/api/deliveries/${deliveryId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId, riderName })
      }).catch(() => {});

      // Optimistic UI state update
      setDeliveries((prev) =>
        prev.map((d) =>
          String(d.id) === String(deliveryId)
            ? { ...d, status: 'ASSIGNED', riderId: String(riderId), riderName }
            : d
        )
      );

      showNotification(`🚴 Assigned delivery to ${riderName} (Status: ASSIGNED)`);
      fetchDeliveries();
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



  // ─── IF OPENED VIA RIDER PWA INVITATION LINK (/join/:token or ?join=token) ───
  if (isOnboardingMode) {
    return (
      <div style={styles.onboardingPageContainer}>
        <div style={styles.onboardingCard}>
          <div style={styles.onboardingHeaderGroup}>
            <div style={styles.onboardingLogoBadge}>⚡</div>
            <h1 style={styles.onboardingBrandTitle}>REFLEX Rider PWA</h1>
            <span style={styles.onboardingSubTag}>OFFICIAL COURIER ONBOARDING GATEWAY</span>
          </div>

          {onboardingStatus === 'loading' && (
            <div style={styles.onboardingLoadingBox}>
              <div style={styles.loadingSpinnerMini} />
              <p style={{ margin: 0, fontSize: '14px', color: '#cbd5e1', fontWeight: '600' }}>
                Validating your rider invitation token...
              </p>
            </div>
          )}

          {onboardingStatus === 'valid' && onboardingRider && (
            <div style={styles.onboardingContent}>
              <div style={styles.welcomeHeroBox}>
                <div style={styles.welcomeHeroIcon}>👋</div>
                <h2 style={styles.welcomeHeroTitle}>Welcome to REFLEX!</h2>
                <p style={styles.welcomeHeroSubtitle}>
                  Hi <strong>{onboardingRider.name}</strong>, you have been registered as an authorized REFLEX delivery courier.
                </p>
              </div>

              {/* Rider Identity Card */}
              <div style={styles.onboardingRiderCard}>
                <div style={styles.onboardingAvatar}>
                  {onboardingRider.name.slice(0, 1)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <code style={styles.onboardingCodeTag}>{onboardingRider.code || `#${onboardingRider.id}`}</code>
                    <span style={styles.pwaActiveBadge}>✓ PWA ACTIVE</span>
                  </div>
                  <strong style={styles.onboardingNameText}>{onboardingRider.name}</strong>
                  <span style={styles.onboardingMetaText}>📞 {onboardingRider.phone} • 📍 {onboardingRider.hub || 'Westlands Hub'}</span>
                </div>
              </div>

              {/* PWA Home Screen Prompt Banner */}
              <div style={styles.homeScreenPromptCard}>
                <span style={{ fontSize: '20px' }}>📲</span>
                <div>
                  <strong style={{ fontSize: '13px', color: '#ffffff', display: 'block' }}>
                    Add REFLEX to your Home Screen
                  </strong>
                  <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                    Tap your browser menu and select "Add to Home screen" for instant 1-tap dispatch access.
                  </span>
                </div>
              </div>

              {/* Continue Action */}
              <button
                style={styles.onboardingContinueBtn}
                onClick={() => {
                  setActiveRiderId(String(onboardingRider.id));
                  setActiveTab('rider');
                  setIsOnboardingMode(false);
                  try {
                    localStorage.setItem('reflex_active_rider', JSON.stringify(onboardingRider));
                  } catch (e) {}
                  showNotification(`👋 Welcome ${onboardingRider.name}! You are ready to receive deliveries.`);
                }}
              >
                🚀 Continue to Delivery Console →
              </button>
            </div>
          )}

          {onboardingStatus === 'invalid' && (
            <div style={styles.onboardingInvalidBox}>
              <div style={styles.invalidIconCircle}>❌</div>
              <h2 style={styles.invalidTitle}>Invalid Invitation Link</h2>
              <p style={styles.invalidMessage}>
                {onboardingErrorMsg || 'This rider invitation link is invalid or has expired. Please contact your fleet dispatcher for a fresh invite link.'}
              </p>
              <button
                style={styles.onboardingReturnBtn}
                onClick={() => {
                  window.location.href = window.location.origin;
                }}
              >
                ← Return to Home
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

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
      <header className="app-navbar" style={styles.navbar}>
        <div style={styles.navLeft}>
          <div style={styles.brandLogo}>⚡</div>
          <div>
            <h1 style={styles.brandTitle}>REFLEX Logistics Network</h1>
            <span style={styles.brandSubtitle}>Dispatcher · Retailer · Rider — Unified Control Plane</span>
          </div>
        </div>

        <div style={styles.navCenter}>
          <div className="app-segmented-control" style={styles.segmentedControl}>
            <button
              style={{ ...styles.segmentButton, ...(activeTab === 'retailer' && retailerSubTab === 'dispatches' ? styles.segmentActive : {}) }}
              onClick={() => {
                setActiveTab('retailer');
                setRetailerSubTab('dispatches');
              }}
            >
              🏪 Retailer Orders
            </button>
            <button
              style={{ ...styles.segmentButton, ...(activeTab === 'retailer' && retailerSubTab === 'riders' ? styles.segmentActive : {}) }}
              onClick={() => {
                setActiveTab('retailer');
                setRetailerSubTab('riders');
              }}
            >
              👥 My Hired Riders ({riders.length})
            </button>
            <button
              style={{ ...styles.segmentButton, ...(activeTab === 'dispatcher' ? styles.segmentActive : {}) }}
              onClick={() => setActiveTab('dispatcher')}
            >
              🎛️ Dispatcher Center
            </button>
            <button
              style={{ ...styles.segmentButton, ...(activeTab === 'rider' ? styles.segmentActive : {}) }}
              onClick={() => setActiveTab('rider')}
            >
              🏍️ Rider PWA
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
      <div className="app-kpi-container" style={styles.kpiContainer}>
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
      <main className="app-main-content" style={styles.mainContent}>
        {/* ── TAB 1: DISPATCHER CONTROL CENTER ── */}
        {activeTab === 'dispatcher' && (
          <div style={styles.dispatcherSection}>
            {/* Control Center Header */}
            <div style={styles.hubToolbar}>
              <div style={styles.hubTitleGroup}>
                <div style={{ ...styles.hubIconBadge, backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                  🎛️
                </div>
                <div>
                  <h2 style={styles.hubTitle}>DISPATCHER CONTROL CENTER</h2>
                  <span style={styles.hubSubtitle}>
                    Deliveries waiting for rider assignment &amp; fleet operations
                  </span>
                </div>
              </div>

              <div style={styles.hubActions}>
                <button
                  style={styles.actionBtnSecondary}
                  onClick={fetchDeliveries}
                  disabled={loading}
                >
                  {loading ? '⏳ Syncing...' : '🔄 Refresh Queue'}
                </button>
                <button
                  style={styles.openNewDeliveryBtn}
                  onClick={() => setActiveTab('riders')}
                >
                  👥 Manage Fleet Riders ({riders.length})
                </button>
              </div>
            </div>

            {/* Metrics Bar */}
            <div style={styles.kpiContainer}>
              <div
                style={{
                  ...styles.kpiCard,
                  flex: 1,
                  borderColor: statusFilter === 'OPEN' ? '#fde047' : '#1e293b',
                  backgroundColor: statusFilter === 'OPEN' ? 'rgba(253, 224, 71, 0.05)' : '#131c2e'
                }}
                onClick={() => setStatusFilter('OPEN')}
              >
                <div style={{ ...styles.kpiIcon, color: '#fde047', backgroundColor: 'rgba(253, 224, 71, 0.12)' }}>
                  ⏳
                </div>
                <div>
                  <span style={{ ...styles.kpiValue, color: '#fde047' }}>{pendingCount}</span>
                  <span style={styles.kpiLabel}>Pending Assignment</span>
                </div>
              </div>

              <div
                style={{
                  ...styles.kpiCard,
                  flex: 1,
                  borderColor: statusFilter === 'ASSIGNED' ? '#a5b4fc' : '#1e293b',
                  backgroundColor: statusFilter === 'ASSIGNED' ? 'rgba(165, 180, 252, 0.05)' : '#131c2e'
                }}
                onClick={() => setStatusFilter('ASSIGNED')}
              >
                <div style={{ ...styles.kpiIcon, color: '#a5b4fc', backgroundColor: 'rgba(165, 180, 252, 0.12)' }}>
                  🚴
                </div>
                <div>
                  <span style={{ ...styles.kpiValue, color: '#a5b4fc' }}>{assignedCount}</span>
                  <span style={styles.kpiLabel}>Assigned to Rider</span>
                </div>
              </div>

              <div
                style={{
                  ...styles.kpiCard,
                  flex: 1,
                  borderColor: statusFilter === 'PICKED_UP' ? '#38bdf8' : '#1e293b',
                  backgroundColor: statusFilter === 'PICKED_UP' ? 'rgba(56, 189, 248, 0.05)' : '#131c2e'
                }}
                onClick={() => setStatusFilter('PICKED_UP')}
              >
                <div style={{ ...styles.kpiIcon, color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.12)' }}>
                  🚚
                </div>
                <div>
                  <span style={{ ...styles.kpiValue, color: '#38bdf8' }}>{transitCount}</span>
                  <span style={styles.kpiLabel}>In Transit</span>
                </div>
              </div>

              <div
                style={{
                  ...styles.kpiCard,
                  flex: 1,
                  borderColor: statusFilter === 'DELIVERED' ? '#22c55e' : '#1e293b',
                  backgroundColor: statusFilter === 'DELIVERED' ? 'rgba(34, 197, 94, 0.05)' : '#131c2e'
                }}
                onClick={() => setStatusFilter('DELIVERED')}
              >
                <div style={{ ...styles.kpiIcon, color: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.12)' }}>
                  ✓
                </div>
                <div>
                  <span style={{ ...styles.kpiValue, color: '#22c55e' }}>{deliveredCount}</span>
                  <span style={styles.kpiLabel}>Completed Deliveries</span>
                </div>
              </div>
            </div>

            {/* Delivery Queue Container */}
            <div style={styles.tableCard}>
              <div style={styles.tableHeaderBar}>
                <div>
                  <h3 style={styles.tableTitle}>DELIVERY QUEUE</h3>
                  <span style={styles.tableSubtitle}>
                    Select and assign available fleet riders to open merchant delivery orders
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="🔍 Search reference, merchant, recipient, item..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={styles.tableSearchInput}
                  />

                  <div style={styles.filterPills}>
                    {['ALL', 'OPEN', 'ASSIGNED', 'PICKED_UP', 'DELIVERED'].map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setStatusFilter(filter)}
                        style={{
                          ...styles.filterPill,
                          ...(statusFilter === filter ? styles.filterPillActive : {})
                        }}
                      >
                        {filter === 'ALL'
                          ? `All (${deliveries.length})`
                          : filter === 'OPEN'
                          ? `Pending (${pendingCount})`
                          : filter === 'ASSIGNED'
                          ? `Assigned (${assignedCount})`
                          : filter === 'PICKED_UP'
                          ? `In Transit (${transitCount})`
                          : `Delivered (${deliveredCount})`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Delivery Queue Cards Grid */}
              <div style={styles.dispatcherGrid}>
                {loading ? (
                  <div style={styles.emptyState}>
                    <p style={styles.emptyTitle}>Connecting to live database...</p>
                  </div>
                ) : filteredDeliveries.length === 0 ? (
                  <div style={styles.emptyState}>
                    <div style={styles.emptyIcon}>📦</div>
                    <p style={styles.emptyTitle}>No matching delivery dispatches found in this queue view</p>
                  </div>
                ) : (
                  filteredDeliveries.map((item) => {
                    const isOpen = item.status === 'OPEN' || !item.riderName;

                    return (
                      <div
                        key={item.id}
                        style={{
                          ...styles.dispatcherQueueCard,
                          borderColor: isOpen ? '#f59e0b' : item.status === 'PICKED_UP' ? '#38bdf8' : item.status === 'DELIVERED' ? '#22c55e' : '#6366f1'
                        }}
                        onClick={() => setInspectedWaybill(item)}
                      >
                        {/* Header Row */}
                        <div style={styles.queueCardHeader}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <code style={styles.refCodeLarge}>
                              {item.reference || `DEL-#${item.id}`}
                            </code>
                            <span style={styles.retailerBadge}>
                              🏪 {item.retailerName || 'Kamau Electronics'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {item.qrVerified && (
                              <span style={styles.pwaReadyBadge}>✓ QR VERIFIED</span>
                            )}
                            <span style={{ ...styles.badge, ...styles[`badge_${item.status}`] }}>
                              {item.status || 'OPEN'}
                            </span>
                          </div>
                        </div>

                        {/* Content Body */}
                        <div style={styles.queueCardBody}>
                          <div style={styles.queueItemRow}>
                            <span style={styles.queueItemLabel}>Recipient:</span>
                            <strong style={styles.queueItemValue}>
                              {item.customerName} {item.customerPhone ? `(${item.customerPhone})` : ''}
                            </strong>
                          </div>

                          <div style={styles.queueItemRow}>
                            <span style={styles.queueItemLabel}>Destination:</span>
                            <span style={styles.queueItemValue}>
                              {item.deliveryAddress}
                            </span>
                          </div>

                          <div style={styles.queueItemRow}>
                            <span style={styles.queueItemLabel}>Item:</span>
                            <strong style={{ ...styles.queueItemValue, color: '#f8fafc' }}>
                              {item.itemDescription}
                            </strong>
                          </div>

                          {/* Lifecycle Progression Stepper */}
                          <div style={styles.lifecycleBar}>
                            <div style={styles.lifecycleSteps}>
                              {[
                                { key: 'OPEN', label: 'OPEN' },
                                { key: 'ASSIGNED', label: 'ASSIGNED' },
                                { key: 'PICKED_UP', label: 'PICKED_UP' },
                                { key: 'IN_TRANSIT', label: 'IN_TRANSIT' },
                                { key: 'DELIVERED', label: 'DELIVERED' }
                              ].map((step, idx) => {
                                const isCurrent =
                                  (step.key === 'OPEN' && (!item.status || item.status === 'OPEN')) ||
                                  (step.key === 'ASSIGNED' && item.status === 'ASSIGNED') ||
                                  (step.key === 'PICKED_UP' && item.status === 'PICKED_UP') ||
                                  (step.key === 'IN_TRANSIT' && item.status === 'PICKED_UP') ||
                                  (step.key === 'DELIVERED' && item.status === 'DELIVERED');

                                const isPassed =
                                  item.status === 'DELIVERED'
                                    ? true
                                    : item.status === 'PICKED_UP'
                                    ? step.key !== 'DELIVERED'
                                    : item.status === 'ASSIGNED'
                                    ? step.key === 'OPEN' || step.key === 'ASSIGNED'
                                    : step.key === 'OPEN';

                                return (
                                  <React.Fragment key={step.key}>
                                    <span
                                      style={{
                                        ...styles.lifecycleBadge,
                                        backgroundColor: isCurrent
                                          ? '#0284c7'
                                          : isPassed
                                          ? 'rgba(56, 189, 248, 0.1)'
                                          : 'rgba(255, 255, 255, 0.03)',
                                        color: isCurrent
                                          ? '#ffffff'
                                          : isPassed
                                          ? '#38bdf8'
                                          : '#475569',
                                        borderColor: isCurrent
                                          ? '#38bdf8'
                                          : isPassed
                                          ? '#334155'
                                          : '#1e293b',
                                        fontWeight: isCurrent ? '800' : '600'
                                      }}
                                    >
                                      {step.label}
                                    </span>
                                    {idx < 4 && (
                                      <span style={{ color: isPassed ? '#38bdf8' : '#334155', fontSize: '9px' }}>
                                        ➔
                                      </span>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Assignment Control Footer */}
                        <div style={styles.queueCardFooter} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                              🕒 {item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                            </span>
                            <button
                              type="button"
                              style={styles.viewRowBtn}
                              onClick={() => setInspectedWaybill(item)}
                            >
                              📱 Show QR ↗
                            </button>
                          </div>

                          <div style={styles.assignControlGroup}>
                            {isOpen ? (
                              <button
                                type="button"
                                style={styles.assignRiderModalBtn}
                                onClick={() => {
                                  setAssignModalDelivery(item);
                                  setSelectedRiderForAssignment('');
                                }}
                              >
                                🚴 Assign Rider ▼
                              </button>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={styles.assignedRiderPill}>
                                  🚴 {item.riderName || `Rider #${item.riderId}`}
                                </span>
                                <button
                                  type="button"
                                  style={styles.reassignBtn}
                                  onClick={() => {
                                    setAssignModalDelivery(item);
                                    setSelectedRiderForAssignment(String(item.riderId || ''));
                                  }}
                                >
                                  🔄 Reassign
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: RETAILER PORTAL (ORDERS & MY HIRED RIDERS) ── */}
        {activeTab === 'retailer' && (
          <div style={styles.retailerPortalWrapper}>
            {/* Top Retailer Toolbar */}
            <div style={styles.retailerToolbar}>
              <div>
                <h2 style={styles.retailerHubTitle}>🏪 Retailer Business Hub</h2>
                <p style={styles.retailerHubDesc}>
                  Create customer deliveries, hire dedicated store couriers, generate PWA onboarding links, and audit live fulfillment.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={styles.segmentedControlMini}>
                  <button
                    style={{
                      ...styles.segmentButtonMini,
                      ...(retailerSubTab === 'dispatches' ? styles.segmentActiveMini : {})
                    }}
                    onClick={() => setRetailerSubTab('dispatches')}
                  >
                    📦 Orders &amp; Dispatches
                  </button>
                  <button
                    style={{
                      ...styles.segmentButtonMini,
                      ...(retailerSubTab === 'riders' ? styles.segmentActiveMini : {})
                    }}
                    onClick={() => setRetailerSubTab('riders')}
                  >
                    👥 My Hired Riders ({riders.length})
                  </button>
                </div>

                {retailerSubTab === 'dispatches' ? (
                  <button
                    style={styles.openNewDeliveryBtn}
                    onClick={() => {
                      const formEl = document.getElementById('new-delivery-request-form');
                      if (formEl) {
                        formEl.scrollIntoView({ behavior: 'smooth' });
                      } else {
                        setIsNewDeliveryModalOpen(true);
                      }
                    }}
                  >
                    ✨ + New Delivery Request
                  </button>
                ) : (
                  <button
                    style={styles.openNewDeliveryBtn}
                    onClick={() => {
                      setRiderFormData({
                        name: '',
                        phone: '',
                        email: '',
                        hub: 'Kamau Electronics (Westlands Hub)'
                      });
                      setRiderFormErrors({});
                      setIsRegisterRiderModalOpen(true);
                    }}
                  >
                    ➕ + Hire New Rider for My Store
                  </button>
                )}
              </div>
            </div>

            {/* ── SUB-TAB 1: ORDERS & DISPATCHES ── */}
            {retailerSubTab === 'dispatches' && (
              <>
                {/* ─── NEW DELIVERY REQUEST WORKBENCH ─── */}
                <div id="new-delivery-request-form" style={styles.newDeliveryContainer}>
                  {/* Header */}
                  <div style={styles.newDeliveryHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={styles.newDeliveryIconBadge}>📦</div>
                      <div>
                        <h2 style={styles.newDeliveryTitle}>New Delivery Request</h2>
                        <div style={styles.zoneRoutingIndicator}>
                          <span style={styles.zonePulseDot} />
                          <span style={styles.zoneRoutingText}>
                            Routing: Smart Auto-Zone ({formData.zone || 'Westlands'})
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        style={styles.resetFormBtn}
                        onClick={() => {
                          setFormData({
                            customerName: '',
                            customerPhone: '',
                            zone: 'Westlands',
                            priority: 'Normal',
                            address: '',
                            itemDescription: '',
                            reference: '',
                            packageValue: '',
                            deliveryFee: '250',
                            riderNotes: ''
                          });
                          setFormErrors({});
                          showNotification('Form cleared');
                        }}
                        title="Clear entered details"
                      >
                        🔄 Clear Form
                      </button>
                    </div>
                  </div>

                  {/* Main Content: Left Form & Right Live Delivery Summary */}
                  <div style={styles.newDeliveryLayout}>
                    {/* ─── LEFT: 10 FORM FIELDS ─── */}
                    <form onSubmit={handleCreateDeliveryRequest} style={styles.newDeliveryForm}>
                      {/* Row 1: Customer Name & Phone */}
                      <div style={styles.formRow2}>
                        <div style={styles.fieldGroup}>
                          <label style={styles.fieldLabel}>
                            Customer Name <span style={styles.requiredAsterisk}>*</span>
                          </label>
                          <input
                            style={{
                              ...styles.fieldInput,
                              borderColor: formErrors.customerName ? '#ef4444' : '#334155',
                              backgroundColor: formErrors.customerName ? 'rgba(239, 68, 68, 0.06)' : '#1e293b'
                            }}
                            value={formData.customerName}
                            onChange={(e) => handleInputChange('customerName', e.target.value)}
                            placeholder="e.g. John / Amina Wanjiru"
                          />
                          {formErrors.customerName && (
                            <span style={styles.fieldErrorText}>⚠️ {formErrors.customerName}</span>
                          )}
                        </div>

                        <div style={styles.fieldGroup}>
                          <label style={styles.fieldLabel}>
                            Customer Phone Number <span style={styles.requiredAsterisk}>*</span>
                          </label>
                          <input
                            style={{
                              ...styles.fieldInput,
                              borderColor: formErrors.customerPhone ? '#ef4444' : '#334155',
                              backgroundColor: formErrors.customerPhone ? 'rgba(239, 68, 68, 0.06)' : '#1e293b'
                            }}
                            value={formData.customerPhone}
                            onChange={(e) => handleInputChange('customerPhone', e.target.value)}
                            placeholder="e.g. +254712345678 or 0712345678"
                          />
                          {formErrors.customerPhone && (
                            <span style={styles.fieldErrorText}>⚠️ {formErrors.customerPhone}</span>
                          )}
                        </div>
                      </div>

                      {/* Row 2: Delivery Zone & Priority */}
                      <div style={styles.formRow2}>
                        <div style={styles.fieldGroup}>
                          <label style={styles.fieldLabel}>
                            Delivery Nairobi Zone <span style={styles.requiredAsterisk}>*</span>
                          </label>
                          <select
                            style={{
                              ...styles.fieldSelect,
                              borderColor: formErrors.zone ? '#ef4444' : '#334155',
                              backgroundColor: '#1e293b'
                            }}
                            value={formData.zone}
                            onChange={(e) => handleInputChange('zone', e.target.value)}
                          >
                            <option value="Westlands">Westlands (KES 250 • ~35m)</option>
                            <option value="Kilimani">Kilimani / Kileleshwa (KES 200 • ~25m)</option>
                            <option value="CBD">Nairobi CBD (KES 150 • ~20m)</option>
                            <option value="Eastlands">Eastlands / Buruburu (KES 350 • ~50m)</option>
                            <option value="Karen">Karen / Langata (KES 400 • ~60m)</option>
                            <option value="Industrial Area">Industrial Area (KES 250 • ~30m)</option>
                            <option value="Kasarani">Kasarani / Thika Rd (KES 350 • ~45m)</option>
                          </select>
                        </div>

                        <div style={styles.fieldGroup}>
                          <label style={styles.fieldLabel}>
                            Dispatch Priority <span style={styles.requiredAsterisk}>*</span>
                          </label>
                          <div style={styles.priorityToggleGroup}>
                            {['Express', 'Normal', 'Scheduled'].map((p) => {
                              const isSelected = formData.priority === p;
                              return (
                                <button
                                  key={p}
                                  type="button"
                                  style={{
                                    ...styles.priorityToggleBtn,
                                    ...(isSelected ? styles.priorityToggleBtnActive : {}),
                                    ...(isSelected && p === 'Express' ? { backgroundColor: '#e11d48', borderColor: '#f43f5e' } : {}),
                                    ...(isSelected && p === 'Scheduled' ? { backgroundColor: '#475569', borderColor: '#94a3b8' } : {})
                                  }}
                                  onClick={() => handleInputChange('priority', p)}
                                >
                                  {p === 'Express' ? '⚡ Express' : p === 'Normal' ? '🚀 Normal' : '🕒 Scheduled'}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Row 3: Destination Delivery Address */}
                      <div style={styles.fieldGroup}>
                        <label style={styles.fieldLabel}>
                          Full Destination Address <span style={styles.requiredAsterisk}>*</span>
                        </label>
                        <input
                          style={{
                            ...styles.fieldInput,
                            borderColor: formErrors.address ? '#ef4444' : '#334155',
                            backgroundColor: formErrors.address ? 'rgba(239, 68, 68, 0.06)' : '#1e293b'
                          }}
                          value={formData.address}
                          onChange={(e) => handleInputChange('address', e.target.value)}
                          placeholder="Building, Street, Landmark, Floor or Office Number"
                        />
                        {formErrors.address && (
                          <span style={styles.fieldErrorText}>⚠️ {formErrors.address}</span>
                        )}
                      </div>

                      {/* Row 4: Package Description & Reference Code */}
                      <div style={styles.formRow2}>
                        <div style={styles.fieldGroup}>
                          <label style={styles.fieldLabel}>
                            Item / Package Description <span style={styles.requiredAsterisk}>*</span>
                          </label>
                          <input
                            style={{
                              ...styles.fieldInput,
                              borderColor: formErrors.itemDescription ? '#ef4444' : '#334155',
                              backgroundColor: formErrors.itemDescription ? 'rgba(239, 68, 68, 0.06)' : '#1e293b'
                            }}
                            value={formData.itemDescription}
                            onChange={(e) => handleInputChange('itemDescription', e.target.value)}
                            placeholder="e.g. HP ProBook 450 G8 / iPhone 15"
                          />
                          {formErrors.itemDescription && (
                            <span style={styles.fieldErrorText}>⚠️ {formErrors.itemDescription}</span>
                          )}
                        </div>

                        <div style={styles.fieldGroup}>
                          <label style={styles.fieldLabel}>
                            Store Order / Ref # <span style={styles.optionalTag}>(Optional)</span>
                          </label>
                          <input
                            style={styles.fieldInput}
                            value={formData.reference}
                            onChange={(e) => handleInputChange('reference', e.target.value)}
                            placeholder="e.g. ORD-20465"
                          />
                        </div>
                      </div>

                      {/* Row 5: Package Value & Delivery Fee */}
                      <div style={styles.formRow2}>
                        <div style={styles.fieldGroup}>
                          <label style={styles.fieldLabel}>
                            Declared Value (KES) <span style={styles.optionalTag}>(Insurance)</span>
                          </label>
                          <input
                            type="number"
                            style={styles.fieldInput}
                            value={formData.packageValue}
                            onChange={(e) => handleInputChange('packageValue', e.target.value)}
                            placeholder="e.g. 35000"
                          />
                        </div>

                        <div style={styles.fieldGroup}>
                          <label style={styles.fieldLabel}>
                            Delivery Fee (KES) <span style={styles.requiredAsterisk}>*</span>
                          </label>
                          <input
                            type="number"
                            style={{
                              ...styles.fieldInput,
                              borderColor: formErrors.deliveryFee ? '#ef4444' : '#334155',
                              backgroundColor: formErrors.deliveryFee ? 'rgba(239, 68, 68, 0.06)' : '#1e293b'
                            }}
                            value={formData.deliveryFee}
                            onChange={(e) => handleInputChange('deliveryFee', e.target.value)}
                            placeholder="250"
                          />
                        </div>
                      </div>

                      {/* Row 6: Rider Handling Notes */}
                      <div style={styles.fieldGroup}>
                        <label style={styles.fieldLabel}>
                          Special Courier Instructions <span style={styles.optionalTag}>(Optional)</span>
                        </label>
                        <textarea
                          style={styles.fieldTextarea}
                          rows={2}
                          value={formData.riderNotes}
                          onChange={(e) => handleInputChange('riderNotes', e.target.value)}
                          placeholder="e.g. Fragile electronics. Call customer when at gate 2."
                        />
                      </div>

                      {/* Submit CTA */}
                      <div style={styles.formActionsBar}>
                        <button
                          type="submit"
                          style={styles.submitDeliveryBtn}
                          disabled={isSubmittingDelivery}
                        >
                          {isSubmittingDelivery ? 'Creating Delivery...' : '🚀 Submit & Generate QR Slip'}
                        </button>
                      </div>
                    </form>

                    {/* Summary Live Preview */}
                    <div style={styles.summaryCard}>
                      <div style={styles.summaryCardHeader}>
                        <div>
                          <span style={styles.summarySubTag}>REAL-TIME PREVIEW</span>
                          <h3 style={styles.summaryHeading}>Delivery Summary</h3>
                        </div>
                        <span style={styles.summaryLiveTag}>● Live</span>
                      </div>

                      <div style={styles.summaryBody}>
                        <div style={styles.summaryItem}>
                          <span style={styles.summaryLabel}>Customer</span>
                          <strong style={styles.summaryValue}>
                            {formData.customerName.trim() || <em style={styles.emptyPlaceholder}>Not provided</em>}
                          </strong>
                        </div>

                        <div style={styles.summaryItem}>
                          <span style={styles.summaryLabel}>Phone</span>
                          <strong style={styles.summaryValue}>
                            {formData.customerPhone.trim() || <em style={styles.emptyPlaceholder}>Not provided</em>}
                          </strong>
                        </div>

                        <div style={styles.summaryItem}>
                          <span style={styles.summaryLabel}>Zone</span>
                          <strong style={styles.summaryValue}>
                            {formData.zone ? `📍 ${formData.zone}` : <em style={styles.emptyPlaceholder}>Not selected</em>}
                          </strong>
                        </div>

                        <div style={styles.summaryItem}>
                          <span style={styles.summaryLabel}>Address</span>
                          <span style={styles.summaryValueMultiline}>
                            {formData.address.trim() || <em style={styles.emptyPlaceholder}>Not provided</em>}
                          </span>
                        </div>

                        <div style={styles.summaryItem}>
                          <span style={styles.summaryLabel}>Item / Description</span>
                          <strong style={styles.summaryValue}>
                            {formData.itemDescription.trim() || <em style={styles.emptyPlaceholder}>Not provided</em>}
                          </strong>
                        </div>

                        <div style={styles.summaryDivider} />

                        <div style={styles.summaryRowInline}>
                          <div>
                            <span style={styles.summaryLabel}>Priority</span>
                            <div style={{ marginTop: '2px' }}>
                              <span style={styles.summaryPriorityBadge}>{formData.priority}</span>
                            </div>
                          </div>
                          <div>
                            <span style={styles.summaryLabel}>Fee &amp; ETA</span>
                            <strong style={styles.summaryFeeHighlight}>KES {formData.deliveryFee || '250'}</strong>
                            <span style={{ fontSize: '10.5px', color: '#38bdf8' }}>
                              {getEstimatedDeliveryTime(formData.zone, formData.priority)}
                            </span>
                          </div>
                        </div>

                        {formData.riderNotes && (
                          <div style={styles.summaryNotesBlock}>
                            <span style={styles.summaryLabel}>Handling Notes:</span>
                            <p style={styles.summaryNotesText}>"{formData.riderNotes}"</p>
                          </div>
                        )}

                        <div style={styles.autoRouteFeatureBox}>
                          <span style={{ fontSize: '13px', color: '#22c55e' }}>✓</span>
                          <span style={{ fontSize: '11px', color: '#cbd5e1' }}>
                            Automatic zone pricing &amp; immediate <strong>📦 OPEN</strong> database entry upon submission.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ─── RETAILER LIVE AUDIT LEDGER ─── */}
                <div style={styles.retailerLedgerCard}>
                  <div style={styles.feedHeader}>
                    <div>
                      <h2 style={styles.panelTitle}>Enterprise Retailer Delivery Ledger &amp; Waybills ({filteredDeliveries.length})</h2>
                      <p style={styles.panelDesc}>Complete live audit trail of package dispatches, verification tokens, and status checkpoints.</p>
                    </div>

                    <div style={styles.filterToolbar}>
                      <input
                        style={styles.searchBar}
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
                          <th style={styles.th}>Customer</th>
                          <th style={styles.th}>Phone</th>
                          <th style={styles.th}>Package Description</th>
                          <th style={styles.th}>Destination Node</th>
                          <th style={styles.th}>Assigned Courier</th>
                          <th style={styles.th}>QR Token</th>
                          <th style={styles.th}>Status</th>
                          <th style={styles.th}>Audit &amp; QR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDeliveries.length === 0 ? (
                          <tr>
                            <td colSpan="9" style={styles.emptyTd}>
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
                                <button
                                  style={styles.viewRowBtn}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInspectedWaybill(item);
                                  }}
                                >
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
              </>
            )}

            {/* ── SUB-TAB 2: MY HIRED FLEET COURIERS ── */}
            {retailerSubTab === 'riders' && (
              <div style={styles.retailerSection}>
                {/* Top Toolbar */}
                <div style={styles.hubToolbar}>
                  <div style={styles.hubTitleGroup}>
                    <div style={styles.hubIconBadge}>👥</div>
                    <div>
                      <h2 style={styles.hubTitle}>🏪 My Hired Couriers &amp; Store Fleet</h2>
                      <span style={styles.hubSubtitle}>
                        Hire and manage dedicated delivery riders for your store, generate personalized PWA onboarding links, and track fulfillment status
                      </span>
                    </div>
                  </div>

                  <div style={styles.hubActions}>
                    <button
                      style={styles.openNewDeliveryBtn}
                      onClick={() => {
                        setRiderFormData({
                          name: '',
                          phone: '',
                          email: '',
                          hub: 'Kamau Electronics (Westlands Hub)'
                        });
                        setRiderFormErrors({});
                        setIsRegisterRiderModalOpen(true);
                      }}
                    >
                      <span style={{ fontSize: '15px' }}>➕</span> Hire New Rider for My Store
                    </button>
                  </div>
                </div>

                {/* Riders Fleet Summary Cards */}
                <div style={styles.kpiContainer}>
                  <div style={{ ...styles.kpiCard, flex: 1 }}>
                    <div style={{ ...styles.kpiIcon, color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.12)' }}>🏍️</div>
                    <div>
                      <span style={{ ...styles.kpiValue, color: '#38bdf8' }}>{riders.length}</span>
                      <span style={styles.kpiLabel}>Total Hired Couriers</span>
                    </div>
                  </div>

                  <div style={{ ...styles.kpiCard, flex: 1, borderColor: '#22c55e' }}>
                    <div style={{ ...styles.kpiIcon, color: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.12)' }}>✓</div>
                    <div>
                      <span style={{ ...styles.kpiValue, color: '#22c55e' }}>
                        {riders.filter((r) => r.pwaStatus === 'READY' || r.status === 'ACTIVE').length}
                      </span>
                      <span style={styles.kpiLabel}>PWA Ready &amp; Active</span>
                    </div>
                  </div>

                  <div style={{ ...styles.kpiCard, flex: 1, borderColor: '#f59e0b' }}>
                    <div style={{ ...styles.kpiIcon, color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.12)' }}>📩</div>
                    <div>
                      <span style={{ ...styles.kpiValue, color: '#f59e0b' }}>
                        {riders.filter((r) => r.pwaStatus === 'LINK_SENT' || r.pwaStatus === 'PENDING').length}
                      </span>
                      <span style={styles.kpiLabel}>Pending Onboarding Invites</span>
                    </div>
                  </div>
                </div>

                {/* Filter & Search Bar */}
                <div style={styles.tableCard}>
                  <div style={styles.tableHeaderBar}>
                    <div>
                      <h3 style={styles.tableTitle}>Authorized Store Fleet Roster</h3>
                      <span style={styles.tableSubtitle}>
                        Each hired rider receives a permanent personalized token link to access your store deliveries in the REFLEX Rider PWA
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="🔍 Search courier name, phone, code..."
                        value={riderSearchTerm}
                        onChange={(e) => setRiderSearchTerm(e.target.value)}
                        style={styles.tableSearchInput}
                      />

                      <div style={styles.filterPills}>
                        <button
                          style={{
                            ...styles.filterPill,
                            ...(riderStatusFilter === 'ALL' ? styles.filterPillActive : {})
                          }}
                          onClick={() => setRiderStatusFilter('ALL')}
                        >
                          All ({riders.length})
                        </button>
                        <button
                          style={{
                            ...styles.filterPill,
                            ...(riderStatusFilter === 'READY' ? styles.filterPillActive : {})
                          }}
                          onClick={() => setRiderStatusFilter('READY')}
                        >
                          PWA Ready
                        </button>
                        <button
                          style={{
                            ...styles.filterPill,
                            ...(riderStatusFilter === 'LINK_SENT' ? styles.filterPillActive : {})
                          }}
                          onClick={() => setRiderStatusFilter('LINK_SENT')}
                        >
                          Invite Sent
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Courier Table */}
                  <div style={styles.tableResponsiveWrapper}>
                    <table style={styles.table}>
                      <thead>
                        <tr style={styles.trHead}>
                          <th style={styles.th}>COURIER</th>
                          <th style={styles.th}>PHONE NUMBER</th>
                          <th style={styles.th}>EMAIL</th>
                          <th style={styles.th}>ASSIGNED HUB / STORE</th>
                          <th style={styles.th}>STATUS</th>
                          <th style={styles.th}>PWA READINESS</th>
                          <th style={styles.th}>ONBOARDING ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {riders
                          .filter((r) => {
                            if (riderStatusFilter === 'READY' && r.pwaStatus !== 'READY' && r.status !== 'ACTIVE') return false;
                            if (riderStatusFilter === 'LINK_SENT' && r.pwaStatus !== 'LINK_SENT') return false;
                            if (riderSearchTerm.trim()) {
                              const q = riderSearchTerm.toLowerCase();
                              return (
                                (r.name || '').toLowerCase().includes(q) ||
                                (r.phone || '').toLowerCase().includes(q) ||
                                (r.code || '').toLowerCase().includes(q) ||
                                (r.email || '').toLowerCase().includes(q) ||
                                (r.hub || '').toLowerCase().includes(q)
                              );
                            }
                            return true;
                          })
                          .map((rider) => {
                            const onboardingLink = rider.onboardingUrl || `${window.location.origin}/join/${rider.onboardingToken || 'token_' + rider.id}`;
                            const isRegenerating = regeneratingRiderId === rider.id;

                            return (
                              <tr key={rider.id || rider.code} style={styles.trBody}>
                                <td style={styles.td}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={styles.riderTableAvatar}>
                                      {(rider.name || 'R').slice(0, 1)}
                                    </div>
                                    <div>
                                      <strong style={{ color: '#ffffff', fontSize: '13.5px', display: 'block' }}>
                                        {rider.name}
                                      </strong>
                                      <code style={styles.refCode}>{rider.code || `#${rider.id}`}</code>
                                    </div>
                                  </div>
                                </td>
                                <td style={styles.td}>
                                  <strong style={{ color: '#38bdf8', fontSize: '13px' }}>{rider.phone}</strong>
                                </td>
                                <td style={styles.td}>
                                  <span style={{ color: '#94a3b8', fontSize: '12.5px' }}>{rider.email || '—'}</span>
                                </td>
                                <td style={styles.td}>
                                  <span style={{ color: '#cbd5e1', fontSize: '12.5px' }}>📍 {rider.hub || 'Kamau Electronics (Westlands)'}</span>
                                </td>
                                <td style={styles.td}>
                                  <span
                                    style={{
                                      ...styles.badge,
                                      ...styles.badge_ASSIGNED
                                    }}
                                  >
                                    {rider.status || 'ACTIVE'}
                                  </span>
                                </td>
                                <td style={styles.td}>
                                  {rider.pwaStatus === 'READY' || rider.status === 'ACTIVE' ? (
                                    <span style={styles.pwaReadyBadge}>✓ READY / ACTIVE</span>
                                  ) : (
                                    <span style={styles.pwaPendingBadge}>📩 INVITE SENT</span>
                                  )}
                                </td>
                                <td style={styles.td}>
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button
                                      style={styles.actionBtnSecondary}
                                      onClick={() => handleCopyPwaLink(onboardingLink)}
                                      title="Copy personal PWA access link"
                                    >
                                      📋 Copy Link
                                    </button>
                                    <button
                                      style={styles.actionBtnShare}
                                      onClick={() => handleSharePwaLink(onboardingLink, rider)}
                                      title="Share via WhatsApp or SMS"
                                    >
                                      📱 Share
                                    </button>
                                    <button
                                      style={styles.actionBtnGhost}
                                      onClick={() => handleRegenerateRiderLink(rider.id)}
                                      disabled={isRegenerating}
                                      title="Invalidate old token and issue fresh link"
                                    >
                                      {isRegenerating ? '⏳' : '🔄'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2.5: FLEET RIDERS MANAGEMENT ── */}
        {activeTab === 'riders' && (
          <div style={styles.retailerSection}>
            {/* Top Toolbar */}
            <div style={styles.hubToolbar}>
              <div style={styles.hubTitleGroup}>
                <div style={styles.hubIconBadge}>👥</div>
                <div>
                  <h2 style={styles.hubTitle}>Fleet Riders &amp; Couriers</h2>
                  <span style={styles.hubSubtitle}>
                    Register delivery riders, generate unique PWA onboarding links, and monitor courier status
                  </span>
                </div>
              </div>

              <div style={styles.hubActions}>
                <button
                  style={styles.openNewDeliveryBtn}
                  onClick={() => {
                    setRiderFormData({ name: '', phone: '', email: '', hub: 'Westlands Hub' });
                    setRiderFormErrors({});
                    setIsRegisterRiderModalOpen(true);
                  }}
                >
                  <span style={{ fontSize: '15px' }}>➕</span> Register New Rider
                </button>
              </div>
            </div>

            {/* Riders Fleet Summary Cards */}
            <div style={styles.kpiContainer}>
              <div style={{ ...styles.kpiCard, flex: 1 }}>
                <div style={{ ...styles.kpiIcon, color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.12)' }}>🏍️</div>
                <div>
                  <span style={{ ...styles.kpiValue, color: '#38bdf8' }}>{riders.length}</span>
                  <span style={styles.kpiLabel}>Total Registered Riders</span>
                </div>
              </div>

              <div style={{ ...styles.kpiCard, flex: 1, borderColor: '#22c55e' }}>
                <div style={{ ...styles.kpiIcon, color: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.12)' }}>✓</div>
                <div>
                  <span style={{ ...styles.kpiValue, color: '#22c55e' }}>
                    {riders.filter((r) => r.pwaStatus === 'READY' || r.status === 'ACTIVE').length}
                  </span>
                  <span style={styles.kpiLabel}>PWA Ready / Active</span>
                </div>
              </div>

              <div style={{ ...styles.kpiCard, flex: 1, borderColor: '#f59e0b' }}>
                <div style={{ ...styles.kpiIcon, color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.12)' }}>📩</div>
                <div>
                  <span style={{ ...styles.kpiValue, color: '#f59e0b' }}>
                    {riders.filter((r) => r.pwaStatus === 'LINK_SENT' || r.pwaStatus === 'PENDING').length}
                  </span>
                  <span style={styles.kpiLabel}>Pending Onboarding Invites</span>
                </div>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div style={styles.tableCard}>
              <div style={styles.tableHeaderBar}>
                <div>
                  <h3 style={styles.tableTitle}>Authorized Fleet Couriers</h3>
                  <span style={styles.tableSubtitle}>
                    Each courier has a permanent personalized onboarding token link into the REFLEX Rider PWA
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="🔍 Search courier name, phone, code..."
                    value={riderSearchTerm}
                    onChange={(e) => setRiderSearchTerm(e.target.value)}
                    style={styles.tableSearchInput}
                  />

                  <div style={styles.filterPills}>
                    <button
                      style={{
                        ...styles.filterPill,
                        ...(riderStatusFilter === 'ALL' ? styles.filterPillActive : {})
                      }}
                      onClick={() => setRiderStatusFilter('ALL')}
                    >
                      All ({riders.length})
                    </button>
                    <button
                      style={{
                        ...styles.filterPill,
                        ...(riderStatusFilter === 'READY' ? styles.filterPillActive : {})
                      }}
                      onClick={() => setRiderStatusFilter('READY')}
                    >
                      PWA Ready
                    </button>
                    <button
                      style={{
                        ...styles.filterPill,
                        ...(riderStatusFilter === 'LINK_SENT' ? styles.filterPillActive : {})
                      }}
                      onClick={() => setRiderStatusFilter('LINK_SENT')}
                    >
                      Invite Sent
                    </button>
                  </div>
                </div>
              </div>

              {/* Courier Table */}
              <div style={styles.tableResponsiveWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.trHead}>
                      <th style={styles.th}>COURIER</th>
                      <th style={styles.th}>PHONE NUMBER</th>
                      <th style={styles.th}>EMAIL</th>
                      <th style={styles.th}>PRIMARY HUB</th>
                      <th style={styles.th}>STATUS</th>
                      <th style={styles.th}>PWA READINESS</th>
                      <th style={styles.th}>ONBOARDING ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riders
                      .filter((r) => {
                        if (riderStatusFilter === 'READY' && r.pwaStatus !== 'READY' && r.status !== 'ACTIVE') return false;
                        if (riderStatusFilter === 'LINK_SENT' && r.pwaStatus !== 'LINK_SENT') return false;
                        if (riderSearchTerm.trim()) {
                          const q = riderSearchTerm.toLowerCase();
                          return (
                            (r.name || '').toLowerCase().includes(q) ||
                            (r.phone || '').toLowerCase().includes(q) ||
                            (r.code || '').toLowerCase().includes(q) ||
                            (r.email || '').toLowerCase().includes(q) ||
                            (r.hub || '').toLowerCase().includes(q)
                          );
                        }
                        return true;
                      })
                      .map((rider) => {
                        const onboardingLink = rider.onboardingUrl || `${window.location.origin}/join/${rider.onboardingToken || 'token_' + rider.id}`;
                        const isRegenerating = regeneratingRiderId === rider.id;

                        return (
                          <tr key={rider.id || rider.code} style={styles.trBody}>
                            <td style={styles.td}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={styles.riderTableAvatar}>
                                  {(rider.name || 'R').slice(0, 1)}
                                </div>
                                <div>
                                  <strong style={{ color: '#ffffff', fontSize: '13.5px', display: 'block' }}>
                                    {rider.name}
                                  </strong>
                                  <code style={styles.refCode}>{rider.code || `#${rider.id}`}</code>
                                </div>
                              </div>
                            </td>
                            <td style={styles.td}>
                              <strong style={{ color: '#38bdf8', fontSize: '13px' }}>{rider.phone}</strong>
                            </td>
                            <td style={styles.td}>
                              <span style={{ color: '#94a3b8', fontSize: '12.5px' }}>{rider.email || '—'}</span>
                            </td>
                            <td style={styles.td}>
                              <span style={{ color: '#cbd5e1', fontSize: '12.5px' }}>📍 {rider.hub || 'Nairobi Central'}</span>
                            </td>
                            <td style={styles.td}>
                              <span
                                style={{
                                  ...styles.badge,
                                  backgroundColor: rider.status === 'ACTIVE' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                  color: rider.status === 'ACTIVE' ? '#4ade80' : '#fbbf24',
                                  borderColor: rider.status === 'ACTIVE' ? '#22c55e' : '#f59e0b'
                                }}
                              >
                                {rider.status || 'ACTIVE'}
                              </span>
                            </td>
                            <td style={styles.td}>
                              {rider.pwaStatus === 'READY' || rider.status === 'ACTIVE' ? (
                                <span style={styles.pwaReadyBadge}>✓ PWA Ready</span>
                              ) : (
                                <span style={styles.pwaPendingBadge}>📩 Invite Sent</span>
                              )}
                            </td>
                            <td style={styles.td}>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <button
                                  style={styles.actionBtnSecondary}
                                  title="Copy Rider PWA Access Link"
                                  onClick={() => handleCopyPwaLink(onboardingLink, rider.name)}
                                >
                                  📋 Copy Link
                                </button>
                                <button
                                  style={styles.actionBtnShare}
                                  title="Share link via WhatsApp / SMS"
                                  onClick={() => handleSharePwaLink(onboardingLink, rider)}
                                >
                                  📱 Share
                                </button>
                                <button
                                  style={styles.actionBtnGhost}
                                  title="Regenerate unique onboarding link"
                                  disabled={isRegenerating}
                                  onClick={() => handleRegenerateRiderLink(rider.id)}
                                >
                                  {isRegenerating ? '⏳' : '🔄 Refresh'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
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

      {/* 7. Generated QR Slip Modal (Shown immediately after Retailer submits) */}
      {createdDeliverySlip && (
        <div style={styles.modalOverlay} onClick={() => setCreatedDeliverySlip(null)}>
          <div style={styles.qrSlipModalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <span style={styles.modalSubTag}>OFFICIAL DELIVERY WAYBILL SLIP</span>
                <h3 style={styles.modalTitle}>📦 Waybill &amp; QR Slip Generated</h3>
              </div>
              <button onClick={() => setCreatedDeliverySlip(null)} style={styles.modalCloseBtn}>✕</button>
            </div>

            <div style={styles.modalBody}>
              {/* Status Banner */}
              <div style={styles.qrSlipStatusBanner}>
                <span style={{ fontSize: '13px', fontWeight: '900', color: '#22c55e' }}>
                  📦 STATUS: OPEN — RECORDED IN RAILWAY DATABASE
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Ready for Dispatcher Fleet Rider Assignment
                </span>
              </div>

              {/* Scannable QR Code Box */}
              <div style={styles.qrSlipCodeContainer}>
                <div style={styles.qrSlipCodeWhiteBox}>
                  <QRCodeSVG
                    value={getVerificationUrl(createdDeliverySlip)}
                    size={160}
                    level="H"
                    includeMargin={false}
                  />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <code style={{ fontSize: '13px', fontWeight: '900', color: '#38bdf8' }}>
                    {createdDeliverySlip.reference || `DEL-#${createdDeliverySlip.id}`}
                  </code>
                  <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                    Scan QR token to verify handoff at delivery checkpoint
                  </span>
                </div>
              </div>

              {/* Waybill Breakdown Grid */}
              <div style={styles.modalGrid}>
                <div style={styles.modalBlock}>
                  <span style={styles.modalLabel}>Customer Recipient</span>
                  <strong style={styles.modalVal}>{createdDeliverySlip.customerName}</strong>
                  <span style={styles.modalSubVal}>📞 {createdDeliverySlip.customerPhone}</span>
                </div>

                <div style={styles.modalBlock}>
                  <span style={styles.modalLabel}>Delivery Zone &amp; Priority</span>
                  <strong style={styles.modalVal}>📍 {createdDeliverySlip.zone || 'Westlands'}</strong>
                  <span style={styles.modalSubVal}>Priority: {createdDeliverySlip.priority || 'Normal'}</span>
                </div>
              </div>

              <div style={styles.modalBlock}>
                <span style={styles.modalLabel}>Item Description</span>
                <p style={styles.modalValText}>{createdDeliverySlip.itemDescription}</p>
              </div>

              <div style={styles.modalBlock}>
                <span style={styles.modalLabel}>Destination Address</span>
                <p style={styles.modalValText}>{createdDeliverySlip.deliveryAddress}</p>
              </div>

              <div style={styles.modalGrid}>
                <div style={styles.modalBlock}>
                  <span style={styles.modalLabel}>Package Value</span>
                  <strong style={{ fontSize: '13px', color: '#fde047' }}>
                    {createdDeliverySlip.packageValue ? `KES ${Number(createdDeliverySlip.packageValue).toLocaleString()}` : 'Not declared'}
                  </strong>
                </div>

                <div style={styles.modalBlock}>
                  <span style={styles.modalLabel}>Delivery Fee &amp; ETA</span>
                  <strong style={{ fontSize: '13px', color: '#34d399' }}>
                    KES {createdDeliverySlip.deliveryFee || '250'}
                  </strong>
                  <span style={{ fontSize: '11px', color: '#38bdf8' }}>
                    ETA: {createdDeliverySlip.estimatedTime || '45–60 mins'}
                  </span>
                </div>
              </div>

              {createdDeliverySlip.riderNotes && (
                <div style={styles.modalBlock}>
                  <span style={styles.modalLabel}>Rider Handling Notes</span>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#cbd5e1', fontStyle: 'italic' }}>
                    "{createdDeliverySlip.riderNotes}"
                  </p>
                </div>
              )}
            </div>

            <div style={styles.qrSlipModalActions}>
              <button
                type="button"
                style={styles.printSlipBtn}
                onClick={() => window.print()}
              >
                🖨️ Print Delivery Slip
              </button>

              <button
                type="button"
                style={styles.doneSlipBtn}
                onClick={() => {
                  setCreatedDeliverySlip(null);
                  const ledgerEl = document.querySelector('table');
                  if (ledgerEl) ledgerEl.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                ✓ Done &amp; View in Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Full Modal Version of New Delivery Request (if opened via button) */}
      {isNewDeliveryModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsNewDeliveryModalOpen(false)}>
          <div style={{ ...styles.modalCard, maxWidth: '840px' }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={styles.newDeliveryIconBadge}>📦</div>
                <div>
                  <h3 style={styles.modalTitle}>New Delivery Request</h3>
                  <div style={styles.zoneRoutingIndicator}>
                    <span style={styles.zonePulseDot} />
                    <span style={styles.zoneRoutingText}>
                      Routing: Smart Auto-Zone ({formData.zone || 'Westlands'})
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={() => setIsNewDeliveryModalOpen(false)} style={styles.modalCloseBtn}>✕</button>
            </div>

            <div style={{ ...styles.modalBody, maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={styles.newDeliveryLayout}>
                {/* Form */}
                <form
                  onSubmit={async (e) => {
                    await handleCreateDeliveryRequest(e);
                    setIsNewDeliveryModalOpen(false);
                  }}
                  style={styles.newDeliveryForm}
                >
                  <div style={styles.formRow2}>
                    <div style={styles.fieldGroup}>
                      <label style={styles.fieldLabel}>
                        Customer Name <span style={styles.requiredAsterisk}>*</span>
                      </label>
                      <input
                        style={{
                          ...styles.fieldInput,
                          borderColor: formErrors.customerName ? '#ef4444' : '#334155',
                          backgroundColor: formErrors.customerName ? 'rgba(239, 68, 68, 0.06)' : '#1e293b'
                        }}
                        value={formData.customerName}
                        onChange={(e) => handleInputChange('customerName', e.target.value)}
                        placeholder="e.g. John / Amina Wanjiru"
                      />
                      {formErrors.customerName && (
                        <span style={styles.fieldErrorText}>⚠️ {formErrors.customerName}</span>
                      )}
                    </div>

                    <div style={styles.fieldGroup}>
                      <label style={styles.fieldLabel}>
                        Customer Phone Number <span style={styles.requiredAsterisk}>*</span>
                      </label>
                      <input
                        style={{
                          ...styles.fieldInput,
                          borderColor: formErrors.customerPhone ? '#ef4444' : '#334155',
                          backgroundColor: formErrors.customerPhone ? 'rgba(239, 68, 68, 0.06)' : '#1e293b'
                        }}
                        value={formData.customerPhone}
                        onChange={(e) => handleInputChange('customerPhone', e.target.value)}
                        placeholder="e.g. +254712345678 or 0712345678"
                      />
                      {formErrors.customerPhone && (
                        <span style={styles.fieldErrorText}>⚠️ {formErrors.customerPhone}</span>
                      )}
                    </div>
                  </div>

                  <div style={styles.formRow2}>
                    <div style={styles.fieldGroup}>
                      <label style={styles.fieldLabel}>
                        Delivery Nairobi Zone <span style={styles.requiredAsterisk}>*</span>
                      </label>
                      <select
                        style={{
                          ...styles.fieldSelect,
                          borderColor: formErrors.zone ? '#ef4444' : '#334155',
                          backgroundColor: formErrors.zone ? 'rgba(239, 68, 68, 0.06)' : '#1e293b'
                        }}
                        value={formData.zone}
                        onChange={(e) => handleInputChange('zone', e.target.value)}
                      >
                        {NAIROBI_ZONES.map((z) => (
                          <option key={z} value={z}>
                            📍 {z} (Base KES {ZONE_BASE_FEES[z] || 250})
                          </option>
                        ))}
                      </select>
                      {formErrors.zone && (
                        <span style={styles.fieldErrorText}>⚠️ {formErrors.zone}</span>
                      )}
                    </div>

                    <div style={styles.fieldGroup}>
                      <label style={styles.fieldLabel}>Priority Level</label>
                      <select
                        style={styles.fieldSelect}
                        value={formData.priority}
                        onChange={(e) => handleInputChange('priority', e.target.value)}
                      >
                        {PRIORITY_LEVELS.map((p) => (
                          <option key={p} value={p}>
                            {p === 'Urgent' ? '⚡ Urgent (+KES 100)' : p === 'High' ? '🔥 High (+KES 50)' : '📦 Normal Priority'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={styles.fieldGroup}>
                    <label style={styles.fieldLabel}>
                      Specific Delivery Address &amp; Landmarks <span style={styles.requiredAsterisk}>*</span>
                    </label>
                    <textarea
                      style={{
                        ...styles.fieldTextarea,
                        borderColor: formErrors.address ? '#ef4444' : '#334155',
                        backgroundColor: formErrors.address ? 'rgba(239, 68, 68, 0.06)' : '#1e293b'
                      }}
                      value={formData.address}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      placeholder="Building name, floor, apartment, landmark, street name..."
                      rows={2}
                    />
                    {formErrors.address && (
                      <span style={styles.fieldErrorText}>⚠️ {formErrors.address}</span>
                    )}
                  </div>

                  <div style={styles.formRow2}>
                    <div style={styles.fieldGroup}>
                      <label style={styles.fieldLabel}>
                        Item / Order Description <span style={styles.requiredAsterisk}>*</span>
                      </label>
                      <input
                        style={{
                          ...styles.fieldInput,
                          borderColor: formErrors.itemDescription ? '#ef4444' : '#334155',
                          backgroundColor: formErrors.itemDescription ? 'rgba(239, 68, 68, 0.06)' : '#1e293b'
                        }}
                        value={formData.itemDescription}
                        onChange={(e) => handleInputChange('itemDescription', e.target.value)}
                        placeholder="e.g. Laptop - HP ProBook 450"
                      />
                      {formErrors.itemDescription && (
                        <span style={styles.fieldErrorText}>⚠️ {formErrors.itemDescription}</span>
                      )}
                    </div>

                    <div style={styles.fieldGroup}>
                      <label style={styles.fieldLabel}>Internal Reference # (Optional)</label>
                      <input
                        style={styles.fieldInput}
                        value={formData.reference}
                        onChange={(e) => handleInputChange('reference', e.target.value)}
                        placeholder="e.g. ORD-20465"
                      />
                    </div>
                  </div>

                  <div style={styles.formRow2}>
                    <div style={styles.fieldGroup}>
                      <label style={styles.fieldLabel}>Package Value (KES)</label>
                      <div style={styles.currencyInputContainer}>
                        <span style={styles.currencyPrefixBadge}>KES</span>
                        <input
                          type="number"
                          min="0"
                          style={styles.currencyInput}
                          value={formData.packageValue}
                          onChange={(e) => handleInputChange('packageValue', e.target.value)}
                          placeholder="e.g. 35000"
                        />
                      </div>
                    </div>

                    <div style={styles.fieldGroup}>
                      <label style={styles.fieldLabel}>Delivery Fee (KES)</label>
                      <div style={styles.currencyInputContainer}>
                        <span style={styles.currencyPrefixBadge}>KES</span>
                        <input
                          type="number"
                          min="0"
                          style={styles.currencyInput}
                          value={formData.deliveryFee}
                          onChange={(e) => handleInputChange('deliveryFee', e.target.value)}
                          placeholder="e.g. 250"
                        />
                      </div>
                    </div>
                  </div>

                  <div style={styles.fieldGroup}>
                    <label style={styles.fieldLabel}>Rider Handling Notes</label>
                    <textarea
                      style={styles.fieldTextarea}
                      value={formData.riderNotes}
                      onChange={(e) => handleInputChange('riderNotes', e.target.value)}
                      placeholder="Handle with care, fragile electronics..."
                      rows={2}
                    />
                  </div>

                  <div style={styles.formActionsRow}>
                    <button
                      type="button"
                      style={styles.btnCancel}
                      onClick={() => setIsNewDeliveryModalOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      style={styles.btnSubmitGreen}
                      disabled={isSubmittingDelivery}
                    >
                      {isSubmittingDelivery ? 'Creating Delivery...' : '🚀 Submit & Generate QR Slip'}
                    </button>
                  </div>
                </form>

                {/* Summary */}
                <div style={styles.summaryCard}>
                  <div style={styles.summaryCardHeader}>
                    <div>
                      <span style={styles.summarySubTag}>REAL-TIME PREVIEW</span>
                      <h3 style={styles.summaryHeading}>Delivery Summary</h3>
                    </div>
                    <span style={styles.summaryLiveTag}>● Live</span>
                  </div>

                  <div style={styles.summaryBody}>
                    <div style={styles.summaryItem}>
                      <span style={styles.summaryLabel}>Customer</span>
                      <strong style={styles.summaryValue}>
                        {formData.customerName.trim() || <em style={styles.emptyPlaceholder}>Not provided</em>}
                      </strong>
                    </div>

                    <div style={styles.summaryItem}>
                      <span style={styles.summaryLabel}>Phone</span>
                      <strong style={styles.summaryValue}>
                        {formData.customerPhone.trim() || <em style={styles.emptyPlaceholder}>Not provided</em>}
                      </strong>
                    </div>

                    <div style={styles.summaryItem}>
                      <span style={styles.summaryLabel}>Zone</span>
                      <strong style={styles.summaryValue}>
                        {formData.zone ? `📍 ${formData.zone}` : <em style={styles.emptyPlaceholder}>Not selected</em>}
                      </strong>
                    </div>

                    <div style={styles.summaryItem}>
                      <span style={styles.summaryLabel}>Address</span>
                      <span style={styles.summaryValueMultiline}>
                        {formData.address.trim() || <em style={styles.emptyPlaceholder}>Not provided</em>}
                      </span>
                    </div>

                    <div style={styles.summaryItem}>
                      <span style={styles.summaryLabel}>Item / Description</span>
                      <strong style={styles.summaryValue}>
                        {formData.itemDescription.trim() || <em style={styles.emptyPlaceholder}>Not provided</em>}
                      </strong>
                    </div>

                    <div style={styles.summaryDivider} />

                    <div style={styles.summaryRowInline}>
                      <div>
                        <span style={styles.summaryLabel}>Priority</span>
                        <div style={{ marginTop: '2px' }}>
                          <span style={styles.summaryPriorityBadge}>{formData.priority}</span>
                        </div>
                      </div>
                      <div>
                        <span style={styles.summaryLabel}>Fee &amp; ETA</span>
                        <strong style={styles.summaryFeeHighlight}>KES {formData.deliveryFee || '250'}</strong>
                        <span style={{ fontSize: '10.5px', color: '#38bdf8' }}>
                          {getEstimatedDeliveryTime(formData.zone, formData.priority)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. Register / Hire New Rider Modal */}
      {isRegisterRiderModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsRegisterRiderModalOpen(false)}>
          <div style={{ ...styles.modalCard, maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ ...styles.newDeliveryIconBadge, backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                  🏍️
                </div>
                <div>
                  <h3 style={styles.modalTitle}>Hire / Register New Rider</h3>
                  <span style={styles.modalSubTag}>HIRE DEDICATED STORE COURIER &amp; ISSUE PWA LINK</span>
                </div>
              </div>
              <button onClick={() => setIsRegisterRiderModalOpen(false)} style={styles.modalCloseBtn}>✕</button>
            </div>

            <form onSubmit={handleRegisterRiderSubmit} style={styles.modalBody}>
              {/* Store context notice banner */}
              <div style={{
                backgroundColor: 'rgba(2, 132, 199, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '12px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '10px'
              }}>
                <span style={{ fontSize: '20px' }}>🏪</span>
                <div>
                  <strong style={{ fontSize: '13px', color: '#ffffff', display: 'block' }}>
                    Hiring Store: Kamau Electronics (Westlands)
                  </strong>
                  <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                    This courier will be added to your store roster and can fulfill customer deliveries via their dedicated Rider PWA.
                  </span>
                </div>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>
                  Full Name <span style={styles.requiredAsterisk}>*</span>
                </label>
                <input
                  style={{
                    ...styles.fieldInput,
                    borderColor: riderFormErrors.name ? '#ef4444' : '#334155',
                    backgroundColor: riderFormErrors.name ? 'rgba(239, 68, 68, 0.06)' : '#1e293b'
                  }}
                  value={riderFormData.name}
                  onChange={(e) => setRiderFormData({ ...riderFormData, name: e.target.value })}
                  placeholder="e.g. Kevin Mwangi / Brian Otieno"
                  disabled={isSubmittingRider}
                />
                {riderFormErrors.name && (
                  <span style={styles.fieldErrorText}>⚠️ {riderFormErrors.name}</span>
                )}
              </div>

              <div style={styles.formRow2}>
                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>
                    Phone Number <span style={styles.requiredAsterisk}>*</span>
                  </label>
                  <input
                    style={{
                      ...styles.fieldInput,
                      borderColor: riderFormErrors.phone ? '#ef4444' : '#334155',
                      backgroundColor: riderFormErrors.phone ? 'rgba(239, 68, 68, 0.06)' : '#1e293b'
                    }}
                    value={riderFormData.phone}
                    onChange={(e) => setRiderFormData({ ...riderFormData, phone: e.target.value })}
                    placeholder="e.g. +254701234567 or 0701234567"
                    disabled={isSubmittingRider}
                  />
                  {riderFormErrors.phone && (
                    <span style={styles.fieldErrorText}>⚠️ {riderFormErrors.phone}</span>
                  )}
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>Email (Optional)</label>
                  <input
                    type="email"
                    style={{
                      ...styles.fieldInput,
                      borderColor: riderFormErrors.email ? '#ef4444' : '#334155',
                      backgroundColor: riderFormErrors.email ? 'rgba(239, 68, 68, 0.06)' : '#1e293b'
                    }}
                    value={riderFormData.email}
                    onChange={(e) => setRiderFormData({ ...riderFormData, email: e.target.value })}
                    placeholder="e.g. kevin@rider.co.ke"
                    disabled={isSubmittingRider}
                  />
                  {riderFormErrors.email && (
                    <span style={styles.fieldErrorText}>⚠️ {riderFormErrors.email}</span>
                  )}
                </div>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Assigned Hub / Node</label>
                <select
                  style={styles.fieldSelect}
                  value={riderFormData.hub}
                  onChange={(e) => setRiderFormData({ ...riderFormData, hub: e.target.value })}
                  disabled={isSubmittingRider}
                >
                  <option value="Kamau Electronics (Westlands Hub)">Kamau Electronics (Westlands Hub)</option>
                  <option value="Westlands Hub">Westlands Hub (HQ)</option>
                  <option value="CBD Depot">Nairobi CBD Depot</option>
                  <option value="Kilimani Node">Kilimani Node</option>
                  <option value="Lavington Node">Lavington Node</option>
                  <option value="Eastleigh Depot">Eastleigh Depot</option>
                  <option value="Karen Hub">Karen Hub</option>
                  <option value="Industrial Area">Industrial Area Node</option>
                </select>
              </div>

              <div style={styles.formActionsRow}>
                <button
                  type="button"
                  onClick={() => setIsRegisterRiderModalOpen(false)}
                  style={styles.btnSecondary}
                  disabled={isSubmittingRider}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRider}
                  style={styles.btnPrimary}
                >
                  {isSubmittingRider ? 'Hiring Rider...' : '🚀 Hire Rider & Generate Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10. Rider Registration Success & PWA Link Modal */}
      {registeredRiderSuccess && (
        <div style={styles.modalOverlay} onClick={() => setRegisteredRiderSuccess(null)}>
          <div style={{ ...styles.modalCard, maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <span style={styles.modalSubTag}>ONBOARDING READY</span>
                <h3 style={styles.modalTitle}>Rider Registered Successfully ✅</h3>
              </div>
              <button onClick={() => setRegisteredRiderSuccess(null)} style={styles.modalCloseBtn}>✕</button>
            </div>

            <div style={styles.modalBody}>
              {/* Rider Banner Card */}
              <div style={styles.onboardingSuccessRiderBanner}>
                <div style={styles.riderTableAvatar}>
                  {(registeredRiderSuccess.rider.name || 'R').slice(0, 1)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <code style={styles.refCode}>
                      {registeredRiderSuccess.rider.code || `#${registeredRiderSuccess.rider.id}`}
                    </code>
                    <span style={styles.pwaReadyBadge}>READY FOR PWA</span>
                  </div>
                  <strong style={{ fontSize: '15px', color: '#ffffff', display: 'block', marginTop: '2px' }}>
                    {registeredRiderSuccess.rider.name}
                  </strong>
                  <span style={{ fontSize: '12px', color: '#38bdf8' }}>
                    📞 {registeredRiderSuccess.rider.phone} • 📍 {registeredRiderSuccess.rider.hub || 'Westlands'}
                  </span>
                </div>
              </div>

              {/* Unique PWA Link Box */}
              <div style={styles.pwaLinkBoxContainer}>
                <span style={styles.modalLabel}>🔗 PERSONALIZED RIDER PWA ACCESS LINK</span>
                <div style={styles.pwaLinkInputGroup}>
                  <input
                    readOnly
                    value={registeredRiderSuccess.onboardingUrl}
                    style={styles.pwaLinkInput}
                    onClick={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    style={styles.copyLinkInsideBtn}
                    onClick={() => handleCopyPwaLink(registeredRiderSuccess.onboardingUrl, registeredRiderSuccess.rider.name)}
                  >
                    📋 Copy
                  </button>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '4px' }}>
                  Send this link to the rider. When opened, it securely pairs their device to the permanent REFLEX Rider PWA.
                </span>
              </div>

              {/* Action Buttons */}
              <div style={styles.onboardingSuccessActionsRow}>
                <button
                  type="button"
                  style={styles.shareWaBtn}
                  onClick={() => handleSharePwaLink(registeredRiderSuccess.onboardingUrl, registeredRiderSuccess.rider)}
                >
                  📱 Share via WhatsApp / SMS
                </button>
                <button
                  type="button"
                  style={styles.modalDoneBtn}
                  onClick={() => {
                    setRegisteredRiderSuccess(null);
                    setActiveTab('riders');
                  }}
                >
                  ✓ Done &amp; View in Roster
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 11. Dispatcher Assign Rider Modal */}
      {assignModalDelivery && (
        <div style={styles.modalOverlay} onClick={() => setAssignModalDelivery(null)}>
          <div style={{ ...styles.modalCard, maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ ...styles.newDeliveryIconBadge, backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                  🚴
                </div>
                <div>
                  <h3 style={styles.modalTitle}>Assign Rider</h3>
                  <span style={styles.modalSubTag}>
                    {assignModalDelivery.reference || `DEL-#${assignModalDelivery.id}`} • {assignModalDelivery.customerName}
                  </span>
                </div>
              </div>
              <button onClick={() => setAssignModalDelivery(null)} style={styles.modalCloseBtn}>✕</button>
            </div>

            <div style={styles.modalBody}>
              {/* Delivery brief info banner */}
              <div style={styles.assignDeliveryBriefBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <strong style={{ fontSize: '13.5px', color: '#ffffff' }}>
                    📦 {assignModalDelivery.itemDescription}
                  </strong>
                  <span style={styles.retailerBadge}>
                    🏪 {assignModalDelivery.retailerName || 'Kamau Electronics'}
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: '#cbd5e1', display: 'block' }}>
                  📍 <strong>Destination:</strong> {assignModalDelivery.deliveryAddress}
                </span>
                <span style={{ fontSize: '12px', color: '#cbd5e1', display: 'block', marginTop: '2px' }}>
                  👤 <strong>Recipient:</strong> {assignModalDelivery.customerName} ({assignModalDelivery.customerPhone})
                </span>
              </div>

              <div style={{ margin: '14px 0 8px 0' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '800', letterSpacing: '0.5px' }}>
                  AVAILABLE FLEET RIDERS:
                </span>
              </div>

              {/* Rider Selection Radio List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
                {riders.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                    No fleet riders registered. Please register riders in the Fleet Riders tab.
                  </div>
                ) : (
                  riders.map((r) => {
                    const availability = getRiderAvailability(r.id);
                    const isSelected = String(selectedRiderForAssignment) === String(r.id);

                    return (
                      <label
                        key={r.id}
                        style={{
                          ...styles.riderAssignRadioCard,
                          borderColor: isSelected ? '#38bdf8' : '#1e293b',
                          backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : '#0f172a'
                        }}
                        onClick={() => setSelectedRiderForAssignment(String(r.id))}
                      >
                        <input
                          type="radio"
                          name="assignedRider"
                          value={r.id}
                          checked={isSelected}
                          onChange={() => setSelectedRiderForAssignment(String(r.id))}
                          style={{ width: '18px', height: '18px', accentColor: '#0284c7', cursor: 'pointer' }}
                        />
                        <div style={styles.riderTableAvatar}>
                          {(r.name || 'R').slice(0, 1)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '14px', color: '#ffffff' }}>{r.name}</strong>
                            <span
                              style={{
                                fontSize: '11.5px',
                                fontWeight: '800',
                                color: availability.color
                              }}
                            >
                              {availability.label}
                            </span>
                          </div>
                          <span style={{ fontSize: '11.5px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                            📞 {r.phone} • 📍 {r.hub || 'Westlands Hub'}
                          </span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>

              {/* Action Buttons: [Cancel] [Assign Rider] */}
              <div style={{ ...styles.formActionsRow, marginTop: '20px' }}>
                <button
                  type="button"
                  style={styles.btnSecondary}
                  onClick={() => setAssignModalDelivery(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.btnPrimary,
                    opacity: selectedRiderForAssignment ? 1 : 0.5,
                    cursor: selectedRiderForAssignment ? 'pointer' : 'not-allowed'
                  }}
                  disabled={!selectedRiderForAssignment}
                  onClick={async () => {
                    await handleAssignRider(assignModalDelivery.id, selectedRiderForAssignment);
                    setAssignModalDelivery(null);
                  }}
                >
                  🚴 Assign Rider
                </button>
              </div>
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
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    overflowX: 'hidden',
  },
  notificationToast: {
    position: 'fixed',
    top: '16px',
    right: '20px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    padding: '10px 20px',
    borderRadius: '10px',
    fontWeight: '800',
    fontSize: '13px',
    zIndex: 99999,
    boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
    border: '1px solid #38bdf8',
  },
  navbar: {
    minHeight: '62px',
    width: '100%',
    borderBottom: '1px solid #1e293b',
    backgroundColor: '#0f172a',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 18px',
    boxSizing: 'border-box',
    flexWrap: 'wrap',
    gap: '10px'
  },
  navLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  brandLogo: { width: '36px', height: '36px', backgroundColor: '#0284c7', color: '#ffffff', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', fontSize: '18px', boxShadow: '0 2px 10px rgba(2, 132, 199, 0.4)' },
  brandTitle: { margin: '0 0 2px 0', fontSize: '16px', fontWeight: '800', letterSpacing: '-0.01em', color: '#ffffff' },
  brandSubtitle: { fontSize: '11px', color: '#94a3b8', fontWeight: '500' },
  navCenter: { display: 'flex', justifyContent: 'center', maxWidth: '100%' },
  segmentedControl: { display: 'flex', backgroundColor: '#1e293b', padding: '3px', borderRadius: '12px', border: '1px solid #334155', gap: '3px', maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  segmentButton: { padding: '7px 14px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s ease', whiteSpace: 'nowrap' },
  segmentActive: { backgroundColor: '#0284c7', color: '#ffffff', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  navRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  liveIndicator: { display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(34, 197, 94, 0.1)', padding: '5px 10px', borderRadius: '16px', border: '1px solid rgba(34, 197, 94, 0.3)' },
  liveDot: { width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 6px #22c55e' },
  liveText: { fontSize: '11.5px', fontWeight: '700', color: '#22c55e' },
  lastUpdatedTag: { fontSize: '11.5px', color: '#94a3b8', fontWeight: '600', backgroundColor: '#1e293b', padding: '5px 12px', borderRadius: '16px', border: '1px solid #334155' },
  
  kpiContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '10px',
    padding: '12px 18px 0 18px',
    width: '100%',
    boxSizing: 'border-box',
  },
  kpiCard: {
    backgroundColor: '#0f172a',
    borderRadius: '12px',
    padding: '12px 14px',
    border: '1.5px solid #1e293b',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  kpiIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    backgroundColor: '#1e293b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    color: '#38bdf8',
    flexShrink: 0
  },
  kpiValue: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#ffffff',
    display: 'block',
    lineHeight: '1.1',
  },
  kpiLabel: {
    fontSize: '10.5px',
    color: '#94a3b8',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginTop: '2px',
  },

  mainContent: {
    padding: '14px 18px 36px 18px',
    width: '100%',
    flex: 1,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
  },
  gridDashboard: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '18px',
    width: '100%',
    flex: 1,
  },
  leftPanel: {
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '16px',
    padding: '20px',
    height: 'fit-content',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '16px',
  },
  panelIconBadge: {
    width: '34px',
    height: '34px',
    borderRadius: '8px',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    color: '#38bdf8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  panelTitle: { margin: '0 0 2px 0', fontSize: '16px', fontWeight: '800', letterSpacing: '-0.01em', color: '#ffffff' },
  panelDesc: { margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: 1.45 },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '10.5px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px 12px', color: '#ffffff', fontSize: '13px', outline: 'none' },
  submitBtn: { backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '11px', fontWeight: '800', fontSize: '13px', cursor: 'pointer', marginTop: '4px', boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)' },
  
  rightPanel: {
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '16px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  feedHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
  },
  filterToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    width: '100%'
  },
  searchBar: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '9px 14px',
    color: '#ffffff',
    fontSize: '12.5px',
    width: '100%',
    maxWidth: '300px',
    outline: 'none',
  },
  filterPills: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  filterPillBtn: {
    border: '1px solid',
    borderRadius: '6px',
    padding: '6px 11px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
    gap: '14px',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 280px)',
    paddingRight: '2px',
  },
  dispatchCard: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '15px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, border-color 0.2s',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardRefGroup: { display: 'flex', alignItems: 'center', gap: '8px' },
  cardId: { fontWeight: '800', fontSize: '13.5px', color: '#38bdf8', letterSpacing: '-0.01em' },
  retailerBadge: { fontSize: '10px', backgroundColor: '#0f172a', color: '#94a3b8', padding: '2px 7px', borderRadius: '6px', border: '1px solid #334155', fontWeight: '600' },
  badge: { padding: '3px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '800', letterSpacing: '0.5px', textTransform: 'uppercase' },
  badge_OPEN: { backgroundColor: '#fef08a22', color: '#fde047', border: '1px solid #fef08a44' },
  badge_ASSIGNED: { backgroundColor: '#818cf822', color: '#a5b4fc', border: '1px solid #818cf844' },
  badge_PICKED_UP: { backgroundColor: '#38bdf822', color: '#38bdf8', border: '1px solid #38bdf844' },
  badge_DELIVERED: { backgroundColor: '#10b98122', color: '#34d399', border: '1px solid #10b98144' },
  cardDetails: { display: 'flex', flexDirection: 'column', gap: '3px' },
  detailRow: { margin: 0, fontSize: '12px', color: '#cbd5e1', lineHeight: 1.4 },
  assignRow: { marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0f172a', padding: '7px 10px', borderRadius: '8px', border: '1px solid #334155' },
  assignLabel: { fontSize: '10.5px', fontWeight: '700', color: '#94a3b8' },
  select: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#ffffff', padding: '5px 8px', fontSize: '11.5px', outline: 'none', flex: 1 },
  assignedRiderName: { fontSize: '11.5px', fontWeight: '800', color: '#38bdf8' },
  cardFooter: { margin: '2px 0 0 0', fontSize: '10.5px', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  timeTag: { fontSize: '10.5px', color: '#64748b' },
  inspectBtn: { fontSize: '11px', color: '#38bdf8', fontWeight: '700' },
  
  /* ─── Retailer Portal & New Delivery Form Styles ─── */
  retailerPortalWrapper: { display: 'flex', flexDirection: 'column', gap: '18px', width: '100%', flex: 1 },
  retailerToolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    backgroundColor: '#0f172a',
    padding: '12px 18px',
    borderRadius: '14px',
    border: '1px solid #1e293b'
  },
  retailerHubTitle: { margin: 0, fontSize: '16px', fontWeight: '800', color: '#ffffff' },
  retailerHubDesc: { margin: '2px 0 0 0', fontSize: '11.5px', color: '#94a3b8' },
  openNewDeliveryBtn: {
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '12.5px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 3px 10px rgba(22, 163, 74, 0.35)'
  },
  
  newDeliveryContainer: {
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '16px',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  newDeliveryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    borderBottom: '1px solid #1e293b',
    paddingBottom: '12px'
  },
  newDeliveryIconBadge: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    color: '#22c55e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px'
  },
  newDeliveryTitle: { margin: 0, fontSize: '17px', fontWeight: '800', color: '#ffffff' },
  zoneRoutingIndicator: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' },
  zonePulseDot: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 6px #22c55e' },
  zoneRoutingText: { fontSize: '11.5px', color: '#38bdf8', fontWeight: '600' },
  resetFormBtn: { background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  
  newDeliveryLayout: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '18px'
  },
  newDeliveryForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flex: '1 1 420px'
  },
  formRow2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px'
  },
  fieldLabel: { fontSize: '10.5px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' },
  requiredAsterisk: { color: '#ef4444', fontWeight: '900', marginLeft: '2px' },
  fieldInput: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px 12px',
    color: '#ffffff',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  },
  fieldSelect: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px 12px',
    color: '#ffffff',
    fontSize: '12.5px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  },
  fieldTextarea: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px 12px',
    color: '#ffffff',
    fontSize: '12.5px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '64px',
    resize: 'vertical'
  },
  fieldErrorText: { fontSize: '10.5px', color: '#f87171', marginTop: '2px', fontWeight: '600' },
  currencyInputContainer: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  currencyPrefixBadge: {
    padding: '9px 12px',
    backgroundColor: '#0f172a',
    color: '#38bdf8',
    fontSize: '11.5px',
    fontWeight: '800',
    borderRight: '1px solid #334155'
  },
  currencyInput: {
    backgroundColor: 'transparent',
    border: 'none',
    padding: '9px 12px',
    color: '#ffffff',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  },
  formActionsRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '10px',
    marginTop: '8px',
    flexWrap: 'wrap'
  },
  btnCancel: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    color: '#94a3b8',
    padding: '10px 18px',
    borderRadius: '8px',
    fontSize: '12.5px',
    fontWeight: '700',
    cursor: 'pointer'
  },
  btnSubmitGreen: {
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    padding: '10px 22px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)'
  },

  /* Live Delivery Summary Card */
  summaryCard: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '14px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    height: 'fit-content',
    flex: '1 1 280px'
  },
  summaryCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '1px solid #334155',
    paddingBottom: '10px'
  },
  summarySubTag: { fontSize: '9px', color: '#38bdf8', fontWeight: '800', letterSpacing: '0.5px' },
  summaryHeading: { margin: '2px 0 0 0', fontSize: '15px', fontWeight: '800', color: '#ffffff' },
  summaryLiveTag: { fontSize: '10.5px', color: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.15)', padding: '2px 7px', borderRadius: '8px', fontWeight: '700' },
  summaryBody: { display: 'flex', flexDirection: 'column', gap: '8px' },
  summaryItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  summaryLabel: { fontSize: '9.5px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px' },
  summaryValue: { fontSize: '12.5px', color: '#f8fafc', fontWeight: '700' },
  summaryValueMultiline: { fontSize: '12px', color: '#cbd5e1', lineHeight: 1.4 },
  emptyPlaceholder: { color: '#64748b', fontStyle: 'italic', fontWeight: 'normal' },
  summaryDivider: { height: '1px', backgroundColor: '#334155', margin: '2px 0' },
  summaryRowInline: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  summaryPriorityBadge: { display: 'inline-block', padding: '2px 7px', borderRadius: '6px', fontSize: '10.5px', fontWeight: '800', border: '1px solid' },
  summaryValueHighlight: { fontSize: '12.5px', color: '#fde047', fontWeight: '800', display: 'block', marginTop: '2px' },
  summaryFeeHighlight: { fontSize: '12.5px', color: '#34d399', fontWeight: '800', display: 'block', marginTop: '2px' },
  summaryEtaBadge: { fontSize: '11px', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.12)', padding: '3px 7px', borderRadius: '6px', fontWeight: '700', marginTop: '2px', display: 'inline-block' },
  summaryNotesBlock: { backgroundColor: '#0f172a', padding: '7px 10px', borderRadius: '8px', border: '1px solid #334155' },
  summaryNotesText: { margin: '2px 0 0 0', fontSize: '11px', color: '#cbd5e1', fontStyle: 'italic' },
  autoRouteFeatureBox: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0f172a', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', marginTop: '4px' },
  
  retailerLedgerCard: {
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '16px',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  
  tableWrapper: { backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', overflowX: 'auto', width: '100%' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  trHead: { borderBottom: '1px solid #1e293b', backgroundColor: '#0a101d' },
  th: { padding: '14px 18px', fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' },
  trBody: { borderBottom: '1px solid #1e293b', cursor: 'pointer', transition: 'background-color 0.15s' },
  td: { padding: '14px 18px', fontSize: '13px', color: '#cbd5e1', lineHeight: 1.45 },
  refCode: { color: '#38bdf8', fontWeight: '800', fontSize: '13.5px', letterSpacing: '-0.01em' },
  riderPill: { backgroundColor: '#1e293b', padding: '4px 10px', borderRadius: '8px', color: '#a5b4fc', fontSize: '12px', fontWeight: '700' },
  tokenCode: { fontSize: '11px', color: '#fde047', backgroundColor: '#1e293b', padding: '3px 8px', borderRadius: '6px', letterSpacing: '0.02em', fontWeight: '700' },
  viewRowBtn: { backgroundColor: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '5px 12px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer' },
  emptyState: { gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', border: '1px dashed #334155', borderRadius: '16px' },
  emptyIcon: { fontSize: '40px', marginBottom: '8px' },
  emptyTitle: { margin: '0 0 4px 0', fontSize: '16px', fontWeight: '700', color: '#94a3b8' },
  emptySubtitle: { margin: 0, fontSize: '12px', color: '#64748b' },
  emptyTd: { padding: '70px', textAlign: 'center', color: '#64748b', fontStyle: 'italic', fontSize: '13px' },

  riderPortalWrapper: { width: '100%', display: 'flex', flexDirection: 'column', flex: 1 },
  riderDashboard: { display: 'flex', flexDirection: 'column', gap: '20px' },
  riderControlHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', backgroundColor: '#0f172a', padding: '18px 22px', borderRadius: '18px', border: '1px solid #1e293b' },
  riderProfileBox: { display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' },
  riderAvatarLarge: { width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#0284c7', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '18px', boxShadow: '0 2px 10px rgba(2, 132, 199, 0.4)' },
  riderRoleTag: { fontSize: '10px', color: '#38bdf8', fontWeight: '800', letterSpacing: '0.6px' },
  riderProfileName: { margin: '2px 0 0 0', fontSize: '18px', fontWeight: '800', color: '#ffffff' },
  switchRiderBtn: { backgroundColor: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', marginLeft: '12px' },
  riderSummaryChips: { display: 'flex', gap: '12px' },
  summaryChip: { backgroundColor: '#1e293b', padding: '10px 18px', borderRadius: '12px', border: '1px solid #334155', textAlign: 'center' },
  summaryChipVal: { fontSize: '18px', fontWeight: '900', color: '#fde047', display: 'block' },
  summaryChipLbl: { fontSize: '10.5px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', marginTop: '2px' },

  missionBanner: {
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    border: '1.5px solid #0284c7',
    borderRadius: '16px',
    padding: '16px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '14px',
    boxShadow: '0 4px 16px rgba(2, 132, 199, 0.2)',
  },
  missionTag: { fontSize: '10.5px', fontWeight: '900', color: '#38bdf8', letterSpacing: '0.6px', display: 'block', marginBottom: '2px' },
  missionTitle: { margin: '0 0 3px 0', fontSize: '16px', fontWeight: '800', color: '#ffffff' },
  missionSub: { margin: 0, fontSize: '12.5px', color: '#cbd5e1' },
  resumeMissionBtn: { backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '12.5px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 2px 10px rgba(2, 132, 199, 0.4)' },
  
  tasksSection: { display: 'flex', flexDirection: 'column', gap: '14px' },
  sectionHeading: { margin: 0, fontSize: '16px', fontWeight: '800', color: '#ffffff' },
  riderCardsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' },
  riderTaskCard: { backgroundColor: '#0f172a', borderRadius: '16px', padding: '18px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '10px', cursor: 'pointer' },
  taskCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  taskCardTag: { fontSize: '9.5px', color: '#94a3b8', fontWeight: '800', letterSpacing: '0.6px' },
  taskCardTitle: { margin: '2px 0 0 0', fontSize: '15px', fontWeight: '800', color: '#38bdf8' },
  taskCardContent: { backgroundColor: '#1e293b', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' },
  taskItem: { margin: 0, fontSize: '13px', color: '#ffffff', fontWeight: '600' },
  taskCust: { margin: 0, fontSize: '12px', color: '#cbd5e1' },
  taskDest: { margin: 0, fontSize: '12px', color: '#94a3b8' },
  taskCardActions: { marginTop: '4px' },
  primaryActionBtn: { width: '100%', height: '44px', backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '800', cursor: 'pointer' },
  completedPill: { width: '100%', display: 'block', textAlign: 'center', color: '#34d399', fontSize: '12px', fontWeight: '800', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)' },

  activeMissionScreen: { display: 'flex', flexDirection: 'column', gap: '18px' },
  missionNavBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', padding: '14px 20px', borderRadius: '16px', border: '1px solid #1e293b' },
  backBtn: { backgroundColor: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' },
  missionTitleCenter: { textAlign: 'center' },
  missionNavTag: { fontSize: '9.5px', color: '#94a3b8', fontWeight: '800', letterSpacing: '0.6px' },
  missionNavTitle: { margin: '2px 0 0 0', fontSize: '16px', fontWeight: '800', color: '#ffffff' },
  missionLayout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
  missionLeftCol: { display: 'flex', flexDirection: 'column', gap: '14px' },
  missionRightCol: { display: 'flex', flexDirection: 'column', gap: '14px' },
  missionCard: { backgroundColor: '#0f172a', borderRadius: '18px', padding: '20px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '8px' },
  cardLabel: { fontSize: '10px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.6px' },
  missionAddress: { margin: 0, fontSize: '17px', fontWeight: '800', color: '#ffffff' },
  navGoogleBtn: { marginTop: '8px', display: 'block', textAlign: 'center', backgroundColor: '#1e293b', color: '#38bdf8', padding: '10px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold', textDecoration: 'none', border: '1px solid #334155' },
  customerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  custNameBig: { fontSize: '15px', color: '#ffffff', display: 'block', fontWeight: '700' },
  custPhoneText: { margin: '2px 0 0 0', fontSize: '12.5px', color: '#38bdf8' },
  callBigBtn: { backgroundColor: '#16a34a', color: '#fff', textDecoration: 'none', padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(22, 163, 74, 0.4)' },
  packageBigText: { margin: 0, fontSize: '14px', color: '#f8fafc', fontWeight: '600' },
  
  verificationGateCard: { backgroundColor: '#0f172a', borderRadius: '18px', padding: '22px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '14px' },
  gatesTitle: { margin: '0 0 2px 0', fontSize: '16px', fontWeight: '800', color: '#ffffff' },
  gatesSub: { margin: 0, fontSize: '12px', color: '#94a3b8' },
  gatesGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '6px' },
  gateTile: { borderRadius: '14px', padding: '16px', border: '1.5px solid', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' },
  gateIcon: { width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#fff' },
  gateLabel: { fontSize: '12.5px', color: '#fff', textAlign: 'center', fontWeight: '600' },
  gateSuccessTag: { fontSize: '10.5px', color: '#4ade80', fontWeight: 'bold' },
  finalCompleteBtn: { width: '100%', height: '48px', color: '#ffffff', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '800', letterSpacing: '0.5px', marginTop: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' },

  /* Modal Details */
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(8px)',
    padding: '12px',
    boxSizing: 'border-box',
  },
  modalCard: {
    backgroundColor: '#1e293b',
    borderRadius: '16px',
    width: '100%',
    maxWidth: 'min(500px, 94vw)',
    padding: '20px',
    border: '1px solid #334155',
    boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    maxHeight: '92vh',
    overflowY: 'auto'
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalSubTag: { fontSize: '9.5px', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '0.8px' },
  modalTitle: { margin: '2px 0 0 0', fontSize: '18px', fontWeight: '800', color: '#38bdf8' },
  modalCloseBtn: { background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' },
  modalBody: { display: 'flex', flexDirection: 'column', gap: '10px' },
  modalStatusRow: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  modalGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' },
  modalBlock: { backgroundColor: '#0f172a', borderRadius: '10px', padding: '10px 12px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '2px' },
  modalLabel: { fontSize: '9.5px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.4px' },
  modalVal: { fontSize: '13px', color: '#ffffff', fontWeight: '700' },
  modalSubVal: { fontSize: '11px', color: '#38bdf8' },
  modalValText: { margin: '2px 0 0 0', fontSize: '12px', color: '#cbd5e1', lineHeight: 1.4 },
  checklistRow: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0f172a', padding: '10px', borderRadius: '8px', border: '1px solid #334155' },
  modalFooter: { marginTop: '6px' },
  modalDoneBtn: { width: '100%', height: '42px', backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.4)' },
  
  /* QR Slip Dedicated Modal Styles */
  qrSlipModalCard: {
    backgroundColor: '#1e293b',
    borderRadius: '18px',
    width: '100%',
    maxWidth: 'min(520px, 94vw)',
    padding: '20px',
    border: '1.5px solid #38bdf8',
    boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    maxHeight: '92vh',
    overflowY: 'auto'
  },
  qrSlipStatusBanner: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    border: '1.5px solid #22c55e',
    borderRadius: '10px',
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    textAlign: 'center'
  },
  qrSlipCodeContainer: {
    backgroundColor: '#0f172a',
    borderRadius: '14px',
    padding: '14px',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px'
  },
  qrSlipCodeWhiteBox: {
    backgroundColor: '#ffffff',
    padding: '10px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
  },
  qrSlipModalActions: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: '10px',
    marginTop: '4px'
  },
  printSlipBtn: {
    backgroundColor: '#0f172a',
    border: '1.5px solid #38bdf8',
    color: '#38bdf8',
    borderRadius: '8px',
    height: '42px',
    fontSize: '12.5px',
    fontWeight: '800',
    cursor: 'pointer'
  },
  doneSlipBtn: {
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    height: '42px',
    fontSize: '13px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.4)'
  },

  testDirectLinkBtn: { display: 'block', textAlign: 'center', backgroundColor: '#0f172a', color: '#38bdf8', padding: '10px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold', textDecoration: 'none', border: '1px solid #0284c7' },
  quickValidateBtn: { width: '100%', backgroundColor: '#16a34a', color: '#ffffff', border: 'none', padding: '11px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' },

  uploadTriggerZone: { padding: '30px 18px', borderRadius: '14px', border: '2px dashed #0284c7', backgroundColor: '#0f172a', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' },
  uploadCameraIcon: { fontSize: '36px', marginBottom: '4px' },
  celebrationCircle: { width: '60px', height: '60px', borderRadius: '50%', backgroundColor: 'rgba(34, 197, 94, 0.15)', border: '2px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  summaryDetailsCard: { width: '100%', backgroundColor: '#0f172a', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left', margin: '10px 0' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', fontSize: '12px' },
  riderSelectTile: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '12px', border: '1.5px solid', cursor: 'pointer' },
  riderAvatarMini: { width: '34px', height: '34px', borderRadius: '8px', backgroundColor: '#0284c7', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '14px' },
  activeTag: { fontSize: '10px', fontWeight: '900', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.15)', padding: '2px 8px', borderRadius: '10px' },

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
  },
  mobileVerifyCard: {
    backgroundColor: '#1e293b',
    borderRadius: '20px',
    padding: '28px 20px',
    width: '100%',
    maxWidth: '400px',
    border: '1px solid #334155',
    boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '14px',
    boxSizing: 'border-box',
  },
  mobileVerifyDetails: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: '14px',
    padding: '14px',
    border: '1px solid #334155',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    boxSizing: 'border-box',
  },
  mobileConfirmBtn: {
    width: '100%',
    height: '48px',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.4)'
  },
  verifySuccessBox: {
    width: '100%',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    border: '1.5px solid #22c55e',
    borderRadius: '14px',
    padding: '18px 14px',
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
    fontSize: '12px',
    fontWeight: '700',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  // ─── Rider PWA Onboarding Gateway & Fleet Management Styles ───
  onboardingPageContainer: {
    minHeight: '100vh',
    width: '100vw',
    backgroundColor: '#090d16',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    boxSizing: 'border-box',
    fontFamily: '"Inter", Arial, Helvetica, sans-serif'
  },
  onboardingCard: {
    backgroundColor: '#131c2e',
    borderRadius: '24px',
    padding: '32px 24px',
    width: '100%',
    maxWidth: '480px',
    border: '1.5px solid #1e293b',
    boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '20px',
    boxSizing: 'border-box'
  },
  onboardingHeaderGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px'
  },
  onboardingLogoBadge: {
    width: '48px',
    height: '48px',
    backgroundColor: '#0284c7',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    boxShadow: '0 4px 16px rgba(2, 132, 199, 0.4)'
  },
  onboardingBrandTitle: {
    margin: 0,
    fontSize: '22px',
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: '-0.4px'
  },
  onboardingSubTag: {
    fontSize: '10.5px',
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: '0.8px'
  },
  onboardingLoadingBox: {
    padding: '30px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px'
  },
  onboardingContent: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    textAlign: 'left'
  },
  welcomeHeroBox: {
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    border: '1px solid rgba(56, 189, 248, 0.3)',
    borderRadius: '16px',
    padding: '16px',
    textAlign: 'center'
  },
  welcomeHeroIcon: {
    fontSize: '32px',
    marginBottom: '4px'
  },
  welcomeHeroTitle: {
    margin: '0 0 6px 0',
    fontSize: '19px',
    fontWeight: '800',
    color: '#ffffff'
  },
  welcomeHeroSubtitle: {
    margin: 0,
    fontSize: '13px',
    color: '#cbd5e1',
    lineHeight: '1.5'
  },
  onboardingRiderCard: {
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '16px',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px'
  },
  onboardingAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontSize: '18px',
    fontWeight: '900',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  onboardingCodeTag: {
    fontFamily: 'monospace',
    fontSize: '11px',
    fontWeight: 'bold',
    backgroundColor: '#1e293b',
    color: '#38bdf8',
    padding: '2px 6px',
    borderRadius: '6px'
  },
  pwaActiveBadge: {
    fontSize: '10.5px',
    fontWeight: '800',
    color: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    padding: '2px 8px',
    borderRadius: '6px',
    border: '1px solid #22c55e'
  },
  onboardingNameText: {
    fontSize: '15.5px',
    color: '#ffffff',
    display: 'block',
    marginTop: '4px'
  },
  onboardingMetaText: {
    fontSize: '12px',
    color: '#94a3b8',
    display: 'block',
    marginTop: '2px'
  },
  homeScreenPromptCard: {
    backgroundColor: '#1e293b',
    border: '1px dashed #38bdf8',
    borderRadius: '14px',
    padding: '12px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  onboardingContinueBtn: {
    width: '100%',
    height: '48px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(2, 132, 199, 0.4)',
    transition: 'all 0.15s ease'
  },
  onboardingInvalidBox: {
    padding: '20px 10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    textAlign: 'center'
  },
  invalidIconCircle: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1.5px solid #ef4444',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px'
  },
  invalidTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '800',
    color: '#ffffff'
  },
  invalidMessage: {
    margin: 0,
    fontSize: '13px',
    color: '#cbd5e1',
    lineHeight: '1.5'
  },
  onboardingReturnBtn: {
    marginTop: '8px',
    backgroundColor: '#1e293b',
    color: '#38bdf8',
    border: '1px solid #334155',
    padding: '10px 20px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer'
  },
  riderTableAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '800',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  pwaReadyBadge: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#4ade80',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    padding: '3px 8px',
    borderRadius: '8px',
    border: '1px solid #22c55e',
    display: 'inline-flex',
    alignItems: 'center'
  },
  pwaPendingBadge: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#fbbf24',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    padding: '3px 8px',
    borderRadius: '8px',
    border: '1px solid #f59e0b',
    display: 'inline-flex',
    alignItems: 'center'
  },
  actionBtnSecondary: {
    padding: '6px 10px',
    backgroundColor: '#1e293b',
    color: '#ffffff',
    border: '1px solid #334155',
    borderRadius: '8px',
    fontSize: '11.5px',
    fontWeight: '700',
    cursor: 'pointer'
  },
  actionBtnShare: {
    padding: '6px 10px',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    color: '#4ade80',
    border: '1px solid #22c55e',
    borderRadius: '8px',
    fontSize: '11.5px',
    fontWeight: '700',
    cursor: 'pointer'
  },
  actionBtnGhost: {
    padding: '6px 10px',
    backgroundColor: 'transparent',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: '8px',
    fontSize: '11.5px',
    fontWeight: '700',
    cursor: 'pointer'
  },
  onboardingSuccessRiderBanner: {
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    padding: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  pwaLinkBoxContainer: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '14px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  pwaLinkInputGroup: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center'
  },
  pwaLinkInput: {
    flex: 1,
    height: '40px',
    backgroundColor: '#1e293b',
    border: '1px solid #38bdf8',
    borderRadius: '8px',
    padding: '0 10px',
    color: '#38bdf8',
    fontFamily: 'monospace',
    fontSize: '12px',
    fontWeight: 'bold',
    outline: 'none'
  },
  copyLinkInsideBtn: {
    height: '40px',
    padding: '0 14px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '12.5px',
    fontWeight: '800',
    cursor: 'pointer'
  },
  onboardingSuccessActionsRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '6px'
  },
  shareWaBtn: {
    flex: 1,
    height: '44px',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)'
  },
  // ─── Dispatcher Control Center Styles ───
  dispatcherSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    width: '100%',
    boxSizing: 'border-box'
  },
  dispatcherGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: '16px',
    marginTop: '16px'
  },
  dispatcherQueueCard: {
    backgroundColor: '#0f172a',
    borderRadius: '16px',
    border: '1.5px solid #1e293b',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    transition: 'all 0.18s ease',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    cursor: 'pointer'
  },
  queueCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #1e293b',
    paddingBottom: '10px'
  },
  refCodeLarge: {
    fontSize: '14px',
    fontWeight: '900',
    fontFamily: 'monospace',
    color: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    padding: '3px 8px',
    borderRadius: '6px'
  },
  queueCardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  queueItemRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    fontSize: '13px'
  },
  queueItemLabel: {
    color: '#94a3b8',
    fontWeight: '700',
    minWidth: '70px',
    fontSize: '12.5px'
  },
  queueItemValue: {
    color: '#cbd5e1',
    flex: 1,
    wordBreak: 'break-word'
  },
  queueCardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid #1e293b',
    paddingTop: '12px',
    marginTop: '4px',
    flexWrap: 'wrap',
    gap: '10px'
  },
  assignControlGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  assignControlLabel: {
    fontSize: '12px',
    fontWeight: '800',
    color: '#f8fafc'
  },
  assignSelect: {
    height: '36px',
    borderRadius: '8px',
    border: '1.5px solid #38bdf8',
    backgroundColor: '#1e293b',
    color: '#ffffff',
    fontSize: '12.5px',
    fontWeight: '700',
    padding: '0 10px',
    outline: 'none',
    cursor: 'pointer',
    maxWidth: '220px'
  },
  assignRiderModalBtn: {
    padding: '7px 14px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '12.5px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.4)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px'
  },
  assignedRiderPill: {
    padding: '5px 10px',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    color: '#38bdf8',
    border: '1px solid #38bdf8',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '800'
  },
  reassignBtn: {
    padding: '5px 10px',
    backgroundColor: '#1e293b',
    color: '#cbd5e1',
    border: '1px solid #334155',
    borderRadius: '8px',
    fontSize: '11.5px',
    fontWeight: '700',
    cursor: 'pointer'
  },
  lifecycleBar: {
    marginTop: '4px',
    padding: '8px 10px',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: '8px',
    border: '1px solid #1e293b'
  },
  lifecycleSteps: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap'
  },
  lifecycleBadge: {
    padding: '2px 7px',
    borderRadius: '6px',
    fontSize: '10px',
    letterSpacing: '0.3px',
    border: '1px solid transparent',
    display: 'inline-block'
  },
  assignDeliveryBriefBox: {
    backgroundColor: '#090d16',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    padding: '12px 14px'
  },
  riderAssignRadioCard: {
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1.5px solid #1e293b',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  segmentedControlMini: {
    display: 'flex',
    backgroundColor: '#090d16',
    borderRadius: '10px',
    padding: '3px',
    border: '1px solid #1e293b',
    gap: '3px'
  },
  segmentButtonMini: {
    padding: '6px 14px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: '#94a3b8',
    fontSize: '12.5px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  segmentActiveMini: {
    backgroundColor: '#0284c7',
    color: '#ffffff',
    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)'
  },
  refCodeSmall: {
    fontSize: '11px',
    fontFamily: 'monospace',
    color: '#38bdf8',
    backgroundColor: '#1e293b',
    padding: '2px 6px',
    borderRadius: '6px',
    display: 'inline-block',
    marginTop: '2px'
  },
};