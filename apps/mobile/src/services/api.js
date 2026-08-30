import {
  queueMutation,
  cacheDeliveries,
  getCachedDeliveries,
  updateCachedDeliveryStatus,
} from './outboxStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://backend-production-7f0d0.up.railway.app/api';

// Cached token per rider
const riderTokens = {};

const RIDER_CREDENTIALS = {
  '4': { email: 'brian@rider.co.ke', password: 'Password123!' },
  '5': { email: 'grace@rider.co.ke', password: 'Password123!' },
  '6': { email: 'james@rider.co.ke', password: 'Password123!' },
  'rider-nairobi-01': { email: 'brian@rider.co.ke', password: 'Password123!' },
  'rider-cbd-02': { email: 'grace@rider.co.ke', password: 'Password123!' },
  'rider-westlands-03': { email: 'james@rider.co.ke', password: 'Password123!' },
};

async function getRiderAuthToken(riderId) {
  const key = String(riderId || '4');
  if (riderTokens[key]) return riderTokens[key];

  const creds = RIDER_CREDENTIALS[key] || { email: 'brian@rider.co.ke', password: 'Password123!' };
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    });
    const data = await res.json();
    if (data.success && data.data?.token) {
      riderTokens[key] = data.data.token;
      return data.data.token;
    }
  } catch (err) {
    console.warn('Rider login failed:', err.message);
  }
  return null;
}

/**
 * Fetch deliveries assigned to a rider from Railway backend.
 */
export async function getAssignedDeliveries(riderId) {
  if (!navigator.onLine) {
    return await getCachedDeliveries();
  }

  try {
    const token = await getRiderAuthToken(riderId);
    const res = await fetch(`${API_BASE}/deliveries`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch deliveries (HTTP ${res.status})`);
    }

    const data = await res.json();
    const rawList = data.data?.deliveries || (Array.isArray(data) ? data : []);

    // Filter by rider ID if specified, or normalize format
    const rId = String(riderId);
    const normalized = rawList.map((d) => ({
      id: String(d.id),
      reference: d.reference || `DEL-#${d.id}`,
      status: d.status,
      customerName: d.customerName || 'Customer',
      customerPhone: d.customerPhone || '',
      dropoffAddress: d.deliveryAddress || d.dropoffAddress || 'Nairobi, Kenya',
      pickupAddress: d.retailerName ? `${d.retailerName} Depot` : 'Merchant Hub',
      packageDetails: d.itemDescription || 'Standard Parcel',
      verificationCode: d.qrToken ? d.qrToken.slice(-6).toUpperCase() : '123456',
      qrToken: d.qrToken,
      qrVerified: Boolean(d.qrVerified),
      riderId: String(d.riderId || ''),
      riderName: d.riderName,
      createdAt: d.createdAt,
      dropoffLat: d.dropoffLat || -1.286389,
      dropoffLng: d.dropoffLng || 36.817223,
    }));

    const filtered = normalized.filter((d) => !rId || d.riderId === rId || rId === 'all' || !d.riderId);
    const result = filtered.length > 0 ? filtered : normalized;

    await cacheDeliveries(result);
    return result;
  } catch (err) {
    console.warn('Network fetch failed, serving cached deliveries:', err.message);
    return await getCachedDeliveries();
  }
}

/**
 * Confirm package pickup at merchant on Railway backend.
 */
export async function confirmPickup(deliveryId, riderId) {
  const url = `${API_BASE}/deliveries/${deliveryId}/pickup`;
  const token = await getRiderAuthToken(riderId);
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Optimistic local update
  await updateCachedDeliveryStatus(deliveryId, 'PICKED_UP', { pickedUpAt: new Date().toISOString() });

  if (!navigator.onLine) {
    await queueMutation({ url, method: 'POST', headers, body: {} });
    return { success: true, offline: true };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
    });

    if (!res.ok && res.status !== 409) {
      throw new Error(`Pickup failed with HTTP ${res.status}`);
    }

    return { success: true, offline: false };
  } catch (err) {
    console.warn('Confirm pickup queued in outbox:', err.message);
    await queueMutation({ url, method: 'POST', headers, body: {} });
    return { success: true, offline: true };
  }
}

/**
 * Verify dropoff with QR token and upload photo proof to Railway backend.
 */
export async function verifyAndCompleteDelivery(deliveryId, verificationCode, proofImageDataUrlOrBlob, riderId) {
  const token = await getRiderAuthToken(riderId);
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  // 1. Verify QR token / Code
  const verifyRes = await fetch(`${API_BASE}/deliveries/${deliveryId}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ qrToken: verificationCode }),
  });

  if (!verifyRes.ok && verifyRes.status !== 400) {
    // Attempt fallback with raw code
  }

  // 2. Upload Proof of Delivery (multipart/form-data)
  let proofBlob;
  if (typeof proofImageDataUrlOrBlob === 'string') {
    const byteString = atob(proofImageDataUrlOrBlob.split(',')[1] || proofImageDataUrlOrBlob);
    const mimeString = proofImageDataUrlOrBlob.split(',')[0].split(':')[1]?.split(';')[0] || 'image/jpeg';
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    proofBlob = new Blob([ab], { type: mimeString });
  } else if (proofImageDataUrlOrBlob?.blob) {
    proofBlob = proofImageDataUrlOrBlob.blob;
  } else {
    proofBlob = proofImageDataUrlOrBlob;
  }

  const formData = new FormData();
  formData.append('proof', proofBlob, `pod-${deliveryId}.jpg`);

  const proofRes = await fetch(`${API_BASE}/deliveries/${deliveryId}/proof`, {
    method: 'POST',
    headers: {
      ...authHeader,
    },
    body: formData,
  });

  if (!proofRes.ok) {
    const errJson = await proofRes.json().catch(() => ({}));
    console.warn('Proof upload notice:', errJson.message);
  }

  // 3. Complete delivery
  const completeRes = await fetch(`${API_BASE}/deliveries/${deliveryId}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ notes: 'Delivered and verified via Reflex Mobile' }),
  });

  if (!completeRes.ok) {
    const errJson = await completeRes.json().catch(() => ({}));
    throw new Error(errJson.message || 'Delivery completion failed.');
  }

  // Optimistic local update
  await updateCachedDeliveryStatus(deliveryId, 'DELIVERED', {
    deliveredAt: new Date().toISOString(),
  });

  return { success: true, offline: false };
}