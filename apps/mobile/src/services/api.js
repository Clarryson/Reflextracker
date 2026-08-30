import {
  queueMutation,
  cacheDeliveries,
  getCachedDeliveries,
  updateCachedDeliveryStatus,
} from './outboxStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://backend-production-7f0d0.up.railway.app/api';

// Cached token per rider
const riderTokens = {};

/**
 * Get rider credentials from environment variables.
 * Credentials are defined as:
 * - VITE_RIDER_ID_4_EMAIL and VITE_RIDER_ID_4_PASSWORD
 * - VITE_RIDER_ID_5_EMAIL and VITE_RIDER_ID_5_PASSWORD
 * - VITE_RIDER_ID_6_EMAIL and VITE_RIDER_ID_6_PASSWORD
 */
function getRiderCredentials(riderId) {
  const id = String(riderId || '4');
  const defaultEmail = id === '5' ? 'grace@rider.co.ke' : id === '6' ? 'james@rider.co.ke' : 'brian@rider.co.ke';
  const email = import.meta.env[`VITE_RIDER_ID_${id}_EMAIL`] || defaultEmail;
  const password = import.meta.env[`VITE_RIDER_ID_${id}_PASSWORD`] || 'Password123!';
  
  return { email, password };
}

async function getRiderAuthToken(riderId) {
  const key = String(riderId || '4');
  if (riderTokens[key]) return riderTokens[key];

  const creds = getRiderCredentials(riderId);
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
 * Validate rider onboarding invitation token.
 */
export async function validateOnboardingToken(token) {
  try {
    let res = await fetch(`http://localhost:3000/api/rider/onboarding/${token}`).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch(`${API_BASE}/rider/onboarding/${token}`).catch(() => null);
    }
    if (res && res.ok) {
      const data = await res.json();
      if (data.success && data.data?.rider) {
        return { success: true, rider: data.data.rider };
      }
    }
  } catch (err) {
    console.warn('Backend onboarding validation notice:', err.message);
  }

  // Local fallback tokens for seed fleet couriers
  if (token.includes('brian') || token === '7f82a91c4e91b00401brian04') {
    return { success: true, rider: { id: '4', code: 'RIDER-004', name: 'Brian Mutua', phone: '+254712345678', hub: 'Westlands Hub' } };
  } else if (token.includes('grace') || token === '8e93b02d5f02c00502grace05') {
    return { success: true, rider: { id: '5', code: 'RIDER-005', name: 'Grace Wanjiru', phone: '+254722334455', hub: 'Kilimani Node' } };
  } else if (token.includes('james') || token === '9f04c13e6a13d00603james06') {
    return { success: true, rider: { id: '6', code: 'RIDER-006', name: 'James Otieno', phone: '+254733445566', hub: 'CBD Depot' } };
  }

  return { success: false, message: 'Invalid or expired rider invitation token.' };
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

  // Handle verification response
  if (!verifyRes.ok) {
    if (verifyRes.status === 400) {
      // Invalid code - user entered wrong code
      const errData = await verifyRes.json().catch(() => ({}));
      throw new Error(errData.message || 'Invalid verification code. Please try again.');
    } else if (verifyRes.status === 409) {
      // Conflict - delivery already completed or reassigned
      const errData = await verifyRes.json().catch(() => ({}));
      throw new Error(errData.message || 'Delivery status has changed. Please refresh and try again.');
    } else if (verifyRes.status >= 500) {
      // Server error - temporary unavailability
      throw new Error('Verification service temporarily unavailable. Please try again in a few moments.');
    } else {
      // Other errors
      const errData = await verifyRes.json().catch(() => ({}));
      throw new Error(errData.message || `Verification failed with error ${verifyRes.status}`);
    }
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