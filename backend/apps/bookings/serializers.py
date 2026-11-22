from rest_framework import serializers
from .models import Booking
from apps.tours.serializers import TourListSerializer, TourPackageSerializer

class BookingSerializer(serializers.ModelSerializer):
    tour_details = TourListSerializer(source='tour', read_only=True)
    package_details = TourPackageSerializer(source='package', read_only=True)
    tour_name = serializers.SerializerMethodField()
    user_details = serializers.SerializerMethodField()
    payment_details = serializers.SerializerMethodField()
    custom_package_details = serializers.SerializerMethodField()
    can_review = serializers.ReadOnlyField()
    can_cancel = serializers.ReadOnlyField()
    total_paid = serializers.SerializerMethodField()
    balance_due = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'user', 'user_details', 'tour', 'tour_name', 'package', 'custom_package',
            'travelers_count',
            'total_price', 'status', 'booking_date', 'travel_date',
            'special_requests', 'traveler_details', 'contact_number',
            'emergency_contact', 'cancellation_reason', 'can_review', 'can_cancel',
            'tour_details', 'package_details', 'payment_details', 'custom_package_details',
            'total_paid', 'balance_due',
            'aadhar_card',
            'applied_offer_id', 'base_amount', 'discount_amount',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'user', 'booking_date', 'created_at', 'updated_at']

    def get_tour_name(self, obj):
        """Null-safe tour name — falls back to custom package destination"""
        if obj.tour:
            return obj.tour.name
        if obj.custom_package:
            return f"Custom: {obj.custom_package.destination}"
        return "Customized Trip"

    def get_user_details(self, obj):
        if obj.user:
            return {
                'id': obj.user.id,
                'username': obj.user.username,
                'email': obj.user.email,
                'first_name': obj.user.first_name,
                'last_name': obj.user.last_name,
                'full_name': obj.user.get_full_name(),
            }
        return None

    def get_payment_details(self, obj):
        # Get the latest payment for this booking
        payment = obj.payments.order_by('-created_at').first()
        if payment:
            return {
                'id': payment.id,
                'amount': payment.amount,
                'payment_method': payment.payment_method,
                'status': payment.status,
                'transaction_id': payment.transaction_id,
                'processed_at': payment.processed_at,
                'created_at': payment.created_at,
            }
        return {
            'status': 'PENDING',
            'amount': obj.total_price,
            'payment_method': None,
            'transaction_id': None,
            'processed_at': None,
            'created_at': None,
        }

    def get_custom_package_details(self, obj):
        """Return full custom package details when booking originated from a custom package"""
        cp = obj.custom_package
        if not cp:
            return None
        return {
            'id': str(cp.id),
            'destination': cp.destination,
            'from_city': cp.from_city,
            'duration': cp.duration,
            'total_nights': cp.total_nights,
            'start_date': str(cp.start_date) if cp.start_date else None,
            'participants_count': cp.participants_count,
            'hotel_preference': cp.hotel_preference,
            'room_type': cp.room_type,
            'transportation_choice': cp.transportation_choice,
            'package_type': cp.package_type,
            'special_requirements': cp.special_requirements,
            'budget_range': cp.budget_range,
            'status': cp.status,
            'admin_response': cp.admin_response,
            'quoted_price': float(cp.quoted_price) if cp.quoted_price else None,
            'final_quoted_price': float(cp.final_quoted_price) if cp.final_quoted_price else None,
            'quotation_breakdown': cp.quotation_breakdown,
            'traveler_details': cp.traveler_details,
            'detailed_itinerary': cp.detailed_itinerary,
            'customer_response': cp.customer_response,
            'customer_response_date': str(cp.customer_response_date) if cp.customer_response_date else None,
        }

    def validate_traveler_details(self, value):
        """Validate traveler details format. Handles JSON string from multipart form."""
        import json
        
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                raise serializers.ValidationError("Invalid JSON format for traveler_details")

        if not isinstance(value, list):
            raise serializers.ValidationError("Traveler details must be a list")
        
        for traveler in value:
            if not isinstance(traveler, dict):
                raise serializers.ValidationError("Each traveler must be an object")
            
            required_fields = ['name', 'age']
            for field in required_fields:
                if field not in traveler:
                    raise serializers.ValidationError(f"Traveler missing required field: {field}")
        
        return value

    def get_total_paid(self, obj):
        from django.db.models import Sum
        total = obj.payments.filter(status='SUCCESS').aggregate(total_amount=Sum('amount'))['total_amount']
        return total or 0

    def get_balance_due(self, obj):
        total_price = obj.total_price or 0
        total_paid = self.get_total_paid(obj)
        return max(0, total_price - total_paid)

    def validate_travel_date(self, value):
        """Validate travel date is at least 15 days in the future"""
        if value:
            from django.utils import timezone
            from datetime import timedelta
            
            min_date = timezone.now().date() + timedelta(days=10)
            if value < min_date:
                raise serializers.ValidationError("Bookings must be made at least 15 days in advance.")
        return value
