from rest_framework import serializers
from .models import Payment, Refund, Invoice

class PaymentSerializer(serializers.ModelSerializer):
    booking_details = serializers.SerializerMethodField()
    
    class Meta:
        model = Payment
        fields = [
            'id', 'booking', 'booking_details', 'amount', 'payment_method',
            'status', 'transaction_id', 'gateway_response', 'processed_at',
            'razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature',
            'context_type', 'context_id',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_booking_details(self, obj):
        if obj.booking:
            return {
                'id': obj.booking.id,
                'tour_name': obj.booking.tour.name if getattr(obj.booking, 'tour', None) else 'Customized',
                'user_email': obj.booking.user.email if getattr(obj.booking, 'user', None) else None,
                'travel_date': obj.booking.travel_date,
            }
        return {
            'id': None,
            'tour_name': 'Customized',
            'user_email': None,
            'travel_date': None,
        }


class RefundSerializer(serializers.ModelSerializer):
    payment_details = serializers.SerializerMethodField()
    booking_details = serializers.SerializerMethodField()
    processed_by_name = serializers.CharField(source='processed_by.email', read_only=True)
    
    class Meta:
        model = Refund
        fields = [
            'id', 'payment', 'payment_details', 'booking', 'booking_details',
            'amount', 'reason', 'status', 'admin_notes', 'processed_by',
            'processed_by_name', 'processed_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'processed_by', 'processed_at', 'created_at', 'updated_at']

    def get_payment_details(self, obj):
        return {
            'id': obj.payment.id,
            'amount': obj.payment.amount,
            'transaction_id': obj.payment.transaction_id,
        }

    def get_booking_details(self, obj):
        return {
            'id': getattr(obj, 'booking', None).id if getattr(obj, 'booking', None) else None,
            'tour_name': obj.booking.tour.name if getattr(obj.booking, 'tour', None) else 'Customized',
            'user_email': obj.booking.user.email if getattr(obj.booking, 'user', None) else None,
            'travel_date': getattr(obj.booking, 'travel_date', None) if getattr(obj, 'booking', None) else None,
        }


class InvoiceSerializer(serializers.ModelSerializer):
    booking_details = serializers.SerializerMethodField()
    
    class Meta:
        model = Invoice
        fields = [
            'id', 'booking', 'booking_details', 'invoice_number', 'amount',
            'tax_amount', 'total_amount', 'status', 'due_date', 'issued_date',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'invoice_number', 'issued_date', 'created_at', 'updated_at']

    def get_booking_details(self, obj):
        return {
            'id': getattr(obj, 'booking', None).id if getattr(obj, 'booking', None) else None,
            'tour_name': obj.booking.tour.name if getattr(obj.booking, 'tour', None) else 'Customized',
            'user_email': obj.booking.user.email if getattr(obj.booking, 'user', None) else None,
            'travel_date': getattr(obj.booking, 'travel_date', None) if getattr(obj, 'booking', None) else None,
            'total_price': getattr(obj.booking, 'total_price', None) if getattr(obj, 'booking', None) else None,
        }
