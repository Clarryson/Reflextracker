import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_BASE_URL || 'http://localhost:4000';

export function useRiderSocket({ riderId, onAssignmentReceived, onOrderCancelled, onStatusChanged }) {
  const [isConnected, setIsConnected] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const socketRef = useRef(null);

  // Request system push notification permission
  const requestNotificationPermission = useCallback(async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        return permission;
      } catch (err) {
        console.warn('Could not request notification permission:', err);
      }
    }
    return 'default';
  }, []);

  // Multi-sensory notification alert (Audio Chime + Haptic Vibration + System Push)
  const triggerNotificationAlert = useCallback((delivery = null) => {
    // 1. Haptic Vibration
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([300, 150, 300, 150, 600]);
      } catch {
        // Ignored if user hasn't interacted
      }
    }

    // 2. Audio Chime (Dual tone D5 -> A5 with harmonic gain)
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
      }
    } catch {
      // Audio context might be restricted before first click
    }

    // 3. System Push Notification
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const title = 'âš¡ Reflex: New Delivery Assigned!';
        const options = {
          body: delivery
            ? `Pickup: ${delivery.pickupAddress}\nDropoff: ${delivery.dropoffAddress}`
            : 'A new delivery task has been assigned to you by Dispatch.',
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          tag: 'delivery-assignment',
          vibrate: [300, 150, 300, 150, 600],
        };
        new Notification(title, options);
      } catch (err) {
        console.warn('Push notification failed:', err);
      }
    }
  }, []);

  useEffect(() => {
    if (!riderId) return;

    const socket = io(WS_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('rider:join', { riderId });
      
      // Catch-up: Fetch authoritative state from backend after reconnection
      // This ensures we don't miss any deliveries reassigned during downtime
      const performCatchUp = async () => {
        try {
          const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
          const { getAssignedDeliveries } = await import('../services/api.js');
          
          // Fetch fresh delivery list from backend
          const freshDeliveries = await getAssignedDeliveries(riderId);
          
          // Notify parent component to reconcile state
          if (onStatusChanged) {
            onStatusChanged({ 
              type: 'catch_up', 
              deliveries: freshDeliveries,
              timestamp: new Date().toISOString()
            });
          }
          
          console.log('Socket reconnect: Caught up with backend state, received', freshDeliveries?.length, 'deliveries');
        } catch (error) {
          console.warn('Catch-up fetch failed after reconnect:', error.message);
        }
      };
      
      // Delay catch-up slightly to let server process the rider:join event
      setTimeout(performCatchUp, 500);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('delivery:assigned', (payload) => {
      const delivery = payload.delivery || payload;
      triggerNotificationAlert(delivery);
      if (onAssignmentReceived) {
        onAssignmentReceived(delivery);
      }
    });

    socket.on('delivery:cancelled', (payload) => {
      triggerNotificationAlert(null);
      if (onOrderCancelled) {
        onOrderCancelled(payload);
      }
    });

    socket.on('delivery:reassigned', (payload) => {
      triggerNotificationAlert(null);
      if (onOrderCancelled) {
        onOrderCancelled(payload);
      }
    });

    socket.on('delivery:status_changed', (payload) => {
      if (onStatusChanged) {
        onStatusChanged(payload);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [riderId, onAssignmentReceived, onOrderCancelled, onStatusChanged, triggerNotificationAlert]);

  const emitLocation = (locationPayload) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('rider:location_update', locationPayload);
    }
  };

  return {
    socket: socketRef.current,
    isConnected,
    notificationPermission,
    requestNotificationPermission,
    triggerNotificationAlert,
    emitLocation,
  };
}