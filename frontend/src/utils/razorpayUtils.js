import { apiClient } from '../services/api'; 

export async function createRazorpayOrder({ amount, currency = 'INR', contextType, contextId }) {
  try {
    // amount expected in paise
    const response = await apiClient.post('/payments/create-order/', {
      amount,
      currency,
      context_type: contextType,
      context_id: contextId,
    });
    return response.data; // should return { order_id, amount, currency } inside data.data usually, based on APIResponse.
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Order creation failed');
  }
}

/** Step 2: Open Razorpay popup */
export function openRazorpayCheckout({ orderId, amount, currency, prefill, theme, onSuccess, onFailure }) {
  // Read key id from env variable
  const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
  
  if (!keyId) {
     console.error('Razorpay key id is not defined in env');
     onFailure({ reason: 'configuration_error' });
     return;
  }

  const options = {
    key: keyId,
    amount, 
    currency, 
    order_id: orderId,
    name: 'Tours And Travels',
    description: 'Secure Payment',
    prefill: { 
      name: prefill?.name || '', 
      email: prefill?.email || '',
      contact: prefill?.phone || '' 
    },
    theme: { color: theme?.color || '#1a56c4' },
    handler: async (response) => {
      try {
        await verifyRazorpayPayment(response);
        onSuccess(response);
      } catch (e) {
        console.error('Verification error:', e);
        onFailure(e);
      }
    },
    modal: {
      ondismiss: () => onFailure({ reason: 'dismissed' }),
    },
  };
  
  if (window.Razorpay) {
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response){
          onFailure(response.error);
      });
      rzp.open();
  } else {
    onFailure({ reason: 'sdk_not_loaded' });
  }
}

/** Step 3: Verify payment signature on backend */
export async function verifyRazorpayPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const response = await apiClient.post('/payments/verify/', {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });
  return response.data;
}
