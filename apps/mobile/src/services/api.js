import {
  queueMutation,
  cacheDeliveries,
  getCachedDeliveries,
  updateCachedDeliveryStatus,
} from './outboxStore';

const REMOTE_RAILWAY_API = 'https://backend-production-7f0d0.up.railway.app/api';
const LOCAL_PROXY_API = '/api';

// Cached token per rider
const riderTokens = {};

/**
 * Get rider credentials
 */
function getRiderCredentials(riderId) {
  const id = String(riderId || '4');
  if (id === '5') {
    return {
      email: import.meta.env.VITE_RIDER_ID_5_EMAIL || 'grace@rider.co.ke',
      password: import.meta.env.VITE_RIDER_ID_5_PASSWORD || 'Password123!',
    };
  }
  if (id === '6') {
    return {
      email: import.meta.env.VITE_RIDER_ID_6_EMAIL || 'james@rider.co.ke',
      password: import.meta.env.VITE_RIDER_ID_6_PASSWORD || 'Password123!',
    };
  }
  return {
    email: import.meta.env.VITE_RIDER_ID_4_EMAIL || 'brian@rider.co.ke',
    password: import.meta.env.VITE_RIDER_ID_4_PASSWORD || 'Password123!',
  };
}

/**
 * Log in to Railway Backend to retrieve JWT Auth Token
 */
async function getRiderAuthToken(riderId) {
  const key = String(riderId || '4');
  if (riderTokens[key]) return riderTokens[key];

  const creds = getRiderCredentials(riderId);

  // Try via Vite proxy first, fallback to direct Railway URL
  const endpoints = [`${LOCAL_PROXY_API}/auth/login`, `${REMOTE_RAILWAY_API}/auth/login`];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data?.token) {
          riderTokens[key] = data.data.token;
          return data.data.token;
        }
      }
    } catch (err) {
      console.warn(`Auth login attempt via ${endpoint} failed:`, err.message);
    }
  }

  // Fallback to Brian's login if rider specific failed
  if (key !== '4') {
    try {
      const res = await fetch(`${REMOTE_RAILWAY_API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'brian@rider.co.ke', password: 'Password123!' }),
      });
      const data = await res.json();
      if (data.success && data.data?.token) {
        riderTokens[key] = data.data.token;
        return data.data.token;
      }
    } catch (err) {
      console.warn('Fallback login failed:', err.message);
    }
  }

  return null;
}

/**
 * Validate rider onboarding invitation token.
 */
export async function validateOnboardingToken(token) {
  try {
    let res = await fetch(`${LOCAL_PROXY_API}/rider/onboarding/${token}`).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch(`${REMOTE_RAILWAY_API}/rider/onboarding/${token}`).catch(() => null);
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
export async function getAssignedDeliveries(riderId = '4') {
  if (!navigator.onLine) {
    return await getCachedDeliveries();
  }

  const token = await getRiderAuthToken(riderId);
  const endpoints = [`${LOCAL_PROXY_API}/deliveries`, `${REMOTE_RAILWAY_API}/deliveries`];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.ok) {
        const data = await res.json();
        const rawList = data.data?.deliveries || (Array.isArray(data) ? data : []);

        if (rawList && rawList.length > 0) {
          const rId = String(riderId || '4');
          const normalized = rawList.map((d) => ({
            id: String(d.id),
            reference: d.reference || `DEL-${String(d.id).padStart(6, '0')}`,
            status: d.status || 'OPEN',
            customerName: d.customerName || d.customer || 'Customer',
            customerPhone: d.customerPhone || d.phone || '+254712345678',
            dropoffAddress: d.deliveryAddress || d.dropoffAddress || d.address || 'Nairobi, Kenya',
            pickupAddress: d.retailerName ? `${d.retailerName} Depot, Nairobi` : 'Merchant Warehouse',
            packageDetails: d.itemDescription || d.item || 'Express Package',
            verificationCode: d.qrToken ? d.qrToken.slice(-6).toUpperCase() : '748291',
            qrToken: d.qrToken,
            qrVerified: Boolean(d.qrVerified),
            riderId: String(d.riderId || ''),
            riderName: d.riderName || 'Assigned Courier',
            createdAt: d.createdAt || new Date().toISOString(),
            dropoffLat: d.dropoffLat || -1.2644,
            dropoffLng: d.dropoffLng || 36.8041,
          }));

          // Return all or filtered by rider ID
          const filtered = normalized.filter((d) => !rId || rId === 'all' || d.riderId === rId || !d.riderId);
          const result = filtered.length > 0 ? filtered : normalized;

          await cacheDeliveries(result);
          return result;
        }
      }
    } catch (err) {
      console.warn(`Fetch deliveries via ${endpoint} failed:`, err.message);
    }
  }

  // Fallback to cache if network calls did not return
  const cached = await getCachedDeliveries();
  if (cached && cached.length > 0) return cached;

  return [];
}

/**
 * Confirm package pickup at merchant on Railway backend.
 */
export async function confirmPickup(deliveryId, riderId = '4') {
  const token = await getRiderAuthToken(riderId);
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Optimistic local update
  await updateCachedDeliveryStatus(deliveryId, 'PICKED_UP', { pickedUpAt: new Date().toISOString() });

  const url = `${LOCAL_PROXY_API}/deliveries/${deliveryId}/pickup`;
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
      // Fallback to direct Railway URL
      await fetch(`${REMOTE_RAILWAY_API}/deliveries/${deliveryId}/pickup`, {
        method: 'POST',
        headers,
      }).catch(() => null);
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
export async function verifyAndCompleteDelivery(deliveryId, verificationCode, proofImageDataUrlOrBlob, riderId = '4') {
  const token = await getRiderAuthToken(riderId);
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  // 1. Verify QR token / Code
  let verifyRes;
  try {
    verifyRes = await fetch(`${API_BASE}/deliveries/${deliveryId}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ qrToken: verificationCode }),
    });
  } catch (networkErr) {
    throw new Error(`Network error during verification: ${networkErr.message}`);
  }

  // Handle verification response
  if (!verifyRes.ok) {
    let errorMessage = 'Verification failed';
    
    try {
      const errData = await verifyRes.json();
      errorMessage = errData.message || errorMessage;
    } catch {
      // Response is not JSON, use status code message
    }

    if (verifyRes.status === 400) {
      // Invalid code - user entered wrong code
      throw new Error(errorMessage || 'Invalid verification code. Please try again.');
    } else if (verifyRes.status === 409) {
      // Conflict - delivery already completed or reassigned
      throw new Error(errorMessage || 'Delivery status has changed. Please refresh and try again.');
    } else if (verifyRes.status >= 500) {
      // Server error - temporary unavailability
      throw new Error('Verification service temporarily unavailable. Please try again in a few moments.');
    } else {
      // Other errors
      throw new Error(errorMessage || `Verification failed with error ${verifyRes.status}`);
    }
  }

  // Validate verification response
  let verifyData;
  try {
    verifyData = await verifyRes.json();
    if (!verifyData.success) {
      throw new Error(verifyData.message || 'Verification failed');
    }
  } catch (parseErr) {
    throw new Error(`Invalid server response during verification: ${parseErr.message}`);
  }

  // 2. Upload Proof of Delivery (multipart/form-data)
  let proofBlob;
  try {
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
  } catch (imageErr) {
    console.warn('Image conversion failed, continuing without proof:', imageErr.message);
    proofBlob = null;
  }

  if (proofBlob) {
    const formData = new FormData();
    formData.append('proof', proofBlob, `pod-${deliveryId}.jpg`);

    try {
      const proofRes = await fetch(`${API_BASE}/deliveries/${deliveryId}/proof`, {
        method: 'POST',
        headers: {
          ...authHeader,
        },
        body: formData,
      });

      if (!proofRes.ok) {
        try {
          const errJson = await proofRes.json();
          console.warn('Proof upload warning:', errJson.message || 'Proof upload failed');
        } catch {
          console.warn('Proof upload failed with status:', proofRes.status);
        }
        // Don't fail delivery completion if proof upload fails
      }
    } catch (proofErr) {
      console.warn('Proof upload network error:', proofErr.message);
      // Don't fail delivery completion if proof upload fails
    }
  }

  // 3. Complete delivery
  let completeRes;
  try {
    completeRes = await fetch(`${API_BASE}/deliveries/${deliveryId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ notes: 'Delivered and verified via Reflex Mobile' }),
    });
  } catch (networkErr) {
    throw new Error(`Network error during completion: ${networkErr.message}`);
  }

  if (!completeRes.ok) {
    let errorMessage = 'Delivery completion failed';
    try {
      const errJson = await completeRes.json();
      errorMessage = errJson.message || errorMessage;
    } catch {
      // Response is not JSON
    }
    throw new Error(errorMessage);
  }

  // Validate completion response
  try {
    const completeData = await completeRes.json();
    if (!completeData.success && completeData.success !== undefined) {
      throw new Error(completeData.message || 'Delivery completion failed');
    }
  } catch (parseErr) {
    if (parseErr.message.includes('Delivery completion failed')) {
      throw parseErr;
    }
    // Some servers may not return JSON on success
    console.warn('Completion response parse warning:', parseErr.message);
  }

  // Optimistic local update
  await updateCachedDeliveryStatus(deliveryId, 'DELIVERED', {
    deliveredAt: new Date().toISOString(),
  });

  return { success: true, offline: false };
}