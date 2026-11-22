import React, { useState } from 'react';
import { useRazorpayScript } from '../../hooks/useRazorpayScript';
import { createRazorpayOrder, openRazorpayCheckout } from '../../utils/razorpayUtils';

export default function RazorpayButton({
  amount,                     // in paise: ₹500 → 50000
  currency = 'INR',
  contextType,                // 'booking' | 'custom_package'
  contextId,                  // ID of the booking
  prefill = {},               // { name, email, phone }
  label = 'Pay Now',
  theme = {},
  onSuccess,                  // (paymentResponse) => void
  onFailure,                  // (error) => void
  className = '',
}) {
  const scriptLoaded = useRazorpayScript();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleClick() {
    if (!scriptLoaded) return;
    setLoading(true);
    setError(null);
    try {
      const orderRes = await createRazorpayOrder({
        amount, 
        currency, 
        contextType, 
        contextId
      });
      // The API Response format is { success: boolean, message: string, data: { id, amount, ... } }
      const order = orderRes.data;

      openRazorpayCheckout({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        prefill,
        theme,
        onSuccess: (res) => {
          setLoading(false);
          if (onSuccess) onSuccess(res);
        },
        onFailure: (err) => {
          setLoading(false);
          const errMsg = err?.reason || err?.description || 'Payment failed or cancelled';
          setError(errMsg);
          if (onFailure) onFailure(err);
        },
      });
    } catch (e) {
      setLoading(false);
      setError(e.message || 'Something went wrong while initiating payment.');
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={handleClick}
        disabled={loading || !scriptLoaded}
        className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium ${className}`}
      >
        {loading ? 'Processing...' : label}
      </button>
      {error && <span className="text-sm text-red-500 font-medium">{error}</span>}
    </div>
  );
}
