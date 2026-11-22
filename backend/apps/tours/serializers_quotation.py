from rest_framework import serializers
from .models import HotelPricingConfig, CarPricingConfig, CustomPackage
from decimal import Decimal

class HotelPricingConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = HotelPricingConfig
        fields = ['id', 'hotel_name', 'hotel_tier', 'room_type', 'location', 'price_per_night', 'description', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class CarPricingConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = CarPricingConfig
        fields = ['id', 'price_per_km', 'description', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class AdminEnterParametersSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomPackage
        fields = [
            'admin_kms_distance', 
            'admin_direct_travel_price',
            'admin_confirmed_hotel_tier',
            'admin_confirmed_room_type'
        ]

    def validate(self, data):
        package = self.instance
        
        # Validation for travel
        transport = (package.transportation_choice or '').lower()
        if transport == 'car':
            if not data.get('admin_kms_distance'):
                raise serializers.ValidationError({"admin_kms_distance": "KMs distance is required when transportation is Car."})
        elif transport in ['flight', 'train', 'bus']:
            if not data.get('admin_direct_travel_price'):
                raise serializers.ValidationError({"admin_direct_travel_price": f"Direct travel price required for {transport}."})
                
        # Hotel tier and room type are optional - if one is given, both must be given
        hotel_tier = data.get('admin_confirmed_hotel_tier')
        room_type = data.get('admin_confirmed_room_type')
        if hotel_tier and not room_type:
            raise serializers.ValidationError({"admin_confirmed_room_type": "Please confirm the room type when hotel tier is selected."})
        if room_type and not hotel_tier:
            raise serializers.ValidationError({"admin_confirmed_hotel_tier": "Please confirm the hotel tier when room type is selected."})

        return data


class QuotationBreakdownSerializer(serializers.Serializer):
    hotel_cost = serializers.DecimalField(max_digits=12, decimal_places=2)
    travel_cost = serializers.DecimalField(max_digits=12, decimal_places=2)
    base_cost = serializers.DecimalField(max_digits=12, decimal_places=2)
    margin_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    final_quoted_price = serializers.DecimalField(max_digits=12, decimal_places=2)


class AdminUpdateStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomPackage
        fields = ['status']


class UserQuotationResponseSerializer(serializers.ModelSerializer):
    response = serializers.ChoiceField(choices=['ACCEPTED', 'REJECTED'])
    
    class Meta:
        model = CustomPackage
        fields = ['response']
