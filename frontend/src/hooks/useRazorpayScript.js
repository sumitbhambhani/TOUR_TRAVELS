import { useState, useEffect } from 'react';

export function useRazorpayScript() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (window.Razorpay) {
      setLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => setLoaded(true);
    script.onerror = () => {
      console.error('Razorpay SDK failed to load');
      setLoaded(false);
    };
    document.body.appendChild(script);
  }, []);

  return loaded;
}
