import os
import hmac
import hashlib
import razorpay
from django.conf import settings
from .models import Payment

def get_razorpay_client():
    key_id = os.environ.get('RAZORPAY_KEY_ID', getattr(settings, 'RAZORPAY_KEY_ID', None))
    key_secret = os.environ.get('RAZORPAY_KEY_SECRET', getattr(settings, 'RAZORPAY_KEY_SECRET', None))
    if not key_id or not key_secret:
        raise ValueError("Razorpay credentials not found in environment")
    return razorpay.Client(auth=(key_id, key_secret))

def create_razorpay_order(amount_paise, currency='INR', context_type=None, context_id=None, user_id=None, booking=None):
    """
    Creates an order on Razorpay and a corresponding Payment record in PENDING state.
    """
    client = get_razorpay_client()
    
    rz_order = client.order.create({
        'amount': int(amount_paise),
        'currency': currency,
        'payment_capture': 1, # Auto-capture
    })
    
    amount_in_rupees = amount_paise / 100

    # Ensure booking context if passed
    payment_kwargs = {
        'razorpay_order_id': rz_order['id'],
        'amount': amount_in_rupees,
        'status': 'PENDING',
        'context_type': context_type,
        'context_id': str(context_id) if context_id else None,
    }
    
    if booking:
        payment_kwargs['booking'] = booking

    payment = Payment.objects.create(**payment_kwargs)
    return rz_order

def verify_razorpay_payment(razorpay_order_id, razorpay_payment_id, razorpay_signature):
    """
    Verifies the payment signature natively and updates the Payment status to SUCCESS.
    Returns the updated Payment object.
    """
    key_secret_str = os.environ.get('RAZORPAY_KEY_SECRET', getattr(settings, 'RAZORPAY_KEY_SECRET', ''))
    key_secret = key_secret_str.encode('utf-8')
    msg = f"{razorpay_order_id}|{razorpay_payment_id}".encode('utf-8')
    expected_signature = hmac.new(key_secret, msg, hashlib.sha256).hexdigest()
    
    if not hmac.compare_digest(expected_signature, razorpay_signature):
        raise ValueError("Invalid payment signature")
    
    # Signature is valid, update db record
    try:
        payment = Payment.objects.get(razorpay_order_id=razorpay_order_id)
    except Payment.DoesNotExist:
        raise ValueError("Payment record for this order ID not found")
        
    payment.razorpay_payment_id = razorpay_payment_id
    payment.razorpay_signature = razorpay_signature
    payment.status = 'SUCCESS'
    payment.transaction_id = f"RZP-{razorpay_payment_id}"
    
    # We could also use timezone.now() for processed_at
    from django.utils import timezone
    payment.processed_at = timezone.now()
    payment.save()
    
    return payment
