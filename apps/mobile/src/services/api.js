import {
  queueMutation,
  cacheDeliveries,
  getCachedDeliveries,
  updateCachedDeliveryStatus,
} from './outboxStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

function getHeaders(riderId, customHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-user-role': 'RIDER',
    ...customHeaders,
  };
  if (riderId) {
    headers['x-user-id'] = riderId;
  }
  return headers;
}

/**
 * Fetch deliveries assigned to a rider.
 * Falls back to IndexedDB cached records when offline.
 */
export async function getAssignedDeliveries(riderId) {
  if (!navigator.onLine) {
    return await getCachedDeliveries();
  }

  try {
    const url = `${API_BASE}/deliveries?riderId=${encodeURIComponent(riderId)}&status=ASSIGNED,PICKED_UP`;
    const res = await fetch(url, {
      method: 'GET',
      headers: getHeaders(riderId),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch deliveries (HTTP ${res.status})`);
    }

    const data = await res.json();
    const deliveries = data.deliveries || (Array.isArray(data) ? data : []);
    await cacheDeliveries(deliveries);
    return deliveries;
  } catch (err) {
    console.warn('Network fetch failed, serving cached deliveries:', err.message);
    return await getCachedDeliveries();
  }
}

/**
 * Confirm package pickup at merchant.
 */
export async function confirmPickup(deliveryId, riderId) {
  const url = `${API_BASE}/deliveries/${deliveryId}/pickup`;
  const body = { riderId, pickedUpAt: new Date().toISOString() };
  const headers = getHeaders(riderId);

  // Optimistic local update
  await updateCachedDeliveryStatus(deliveryId, 'PICKED_UP', { pickedUpAt: body.pickedUpAt });

  if (!navigator.onLine) {
    await queueMutation({ url, method: 'PATCH', headers, body });
    return { success: true, offline: true };
  }

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok && res.status !== 409) {
      throw new Error(`Pickup failed with HTTP ${res.status}`);
    }

    return { success: true, offline: false };
  } catch (err) {
    console.warn('Confirm pickup failed over network, queued in outbox:', err.message);
    await queueMutation({ url, method: 'PATCH', headers, body });
    return { success: true, offline: true };
  }
}

/**
 * Verify dropoff with QR / PIN code and upload photo proof.
 */
export async function verifyAndCompleteDelivery(deliveryId, verificationCode, proofImageDataUrl, riderId) {
  const url = `${API_BASE}/deliveries/${deliveryId}/verify`;
  const body = {
    verificationCode: verificationCode.trim(),
    proofImage: proofImageDataUrl,
    deliveredAt: new Date().toISOString(),
  };
  const headers = getHeaders(riderId);

  // Optimistic local update
  await updateCachedDeliveryStatus(deliveryId, 'DELIVERED', {
    deliveredAt: body.deliveredAt,
    proofOfDelivery: proofImageDataUrl,
  });

  if (!navigator.onLine) {
    await queueMutation({ url, method: 'POST', headers, body });
    return { success: true, offline: true };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let errMessage = 'Verification failed';
      try {
        const errJson = await res.json();
        errMessage = errJson.message || errMessage;
      } catch {
        // use default message
      }
      throw new Error(errMessage);
    }

    return { success: true, offline: false };
  } catch (err) {
    // If it is a network error (not 400 bad code), queue for sync
    if (err.message.includes('fetch') || err.message.includes('NetworkError') || err.message.includes('Failed to fetch')) {
      await queueMutation({ url, method: 'POST', headers, body });
      return { success: true, offline: true };
    }
    throw err;
  }
}