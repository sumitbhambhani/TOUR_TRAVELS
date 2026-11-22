from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from decimal import Decimal
import math

from apps.core.permissions import IsAdminUser
from rest_framework.permissions import IsAuthenticated
from .models import HotelPricingConfig, CarPricingConfig, CustomPackage
from .serializers_quotation import (
    HotelPricingConfigSerializer,
    CarPricingConfigSerializer,
    AdminEnterParametersSerializer,
    AdminUpdateStatusSerializer,
    QuotationBreakdownSerializer,
)

class HotelPricingConfigViewSet(viewsets.ModelViewSet):
    queryset = HotelPricingConfig.objects.all()
    serializer_class = HotelPricingConfigSerializer
    permission_classes = [IsAdminUser]


class PublicHotelPricingConfigViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Public read-only endpoint for customers to browse available hotels
    from the pricing config (independent of tour management Hotel model).
    """
    serializer_class = HotelPricingConfigSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = HotelPricingConfig.objects.filter(is_active=True)
        location = self.request.query_params.get('location')
        tier = self.request.query_params.get('tier')
        room_type = self.request.query_params.get('room_type')
        if location:
            qs = qs.filter(location__icontains=location)
        if tier:
            qs = qs.filter(hotel_tier__iexact=tier)
        if room_type:
            qs = qs.filter(room_type__iexact=room_type)
        return qs


class CarPricingConfigViewSet(viewsets.ModelViewSet):
    queryset = CarPricingConfig.objects.all()
    serializer_class = CarPricingConfigSerializer
    permission_classes = [IsAdminUser]


class AdminCustomPackageViewSet(viewsets.ModelViewSet):
    queryset = CustomPackage.objects.all().order_by('-created_at')
    permission_classes = [IsAdminUser]
    
    # We don't specify serializer_class here generally for all because it varies by action,
    # but we can import CustomPackageSerializer for list/retrieve
    # Since we didn't put CustomPackageSerializer in serializers_quotation, we import it
    from .serializers import CustomPackageSerializer
    serializer_class = CustomPackageSerializer

    @action(detail=True, methods=['post'], url_path='enter-parameters')
    def enter_parameters(self, request, pk=None):
        custom_package = self.get_object()

        if custom_package.status not in ['PENDING', 'PROCESSING', 'QUOTED']:
             return Response({"error": "Cannot quote a package that is confirmed/cancelled"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = AdminEnterParametersSerializer(custom_package, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        # Values from validated data
        params = serializer.validated_data
        transport = custom_package.transportation_choice.lower() if custom_package.transportation_choice else ''
        participants = custom_package.participants_count or 1
        
        # 1. Calculate Travel Cost (per person)
        travel_cost_per_person = Decimal('0.00')
        kms_distance = params.get('admin_kms_distance')
        direct_price = params.get('admin_direct_travel_price')
        selected_car_config_id = request.data.get('admin_selected_car_config')
        car_price_per_km = None
        total_travel_cost = Decimal('0.00')
        
        if transport == 'car' and kms_distance:
            # Use the selected car config if provided, else fall back to first active
            if selected_car_config_id:
                try:
                    car_config = CarPricingConfig.objects.get(id=selected_car_config_id, is_active=True)
                except CarPricingConfig.DoesNotExist:
                    return Response({"error": "Selected car pricing config not found or inactive."}, status=status.HTTP_400_BAD_REQUEST)
            else:
                car_config = CarPricingConfig.objects.filter(is_active=True).first()
                if not car_config:
                    return Response({"error": "No active CarPricingConfig exists. Please configure car rates first."}, status=status.HTTP_400_BAD_REQUEST)
            car_price_per_km = car_config.price_per_km
            # Car cost is per km, multiplied by distance and participants
            travel_cost_per_person = kms_distance * car_price_per_km
            total_travel_cost = travel_cost_per_person * participants
        elif direct_price:
            # Flight/train/bus price is PER PERSON
            travel_cost_per_person = direct_price
            total_travel_cost = direct_price * participants

        # 2. Calculate Hotel Cost
        hotel_cost_total = Decimal('0.00')
        hotel_cost_per_person = Decimal('0.00')
        hotel_tier = params.get('admin_confirmed_hotel_tier')
        room_type = params.get('admin_confirmed_room_type')
        total_nights = custom_package.total_nights or 0
        rooms_needed = 0
        price_per_night = Decimal('0.00')
        
        if total_nights > 0:
            tier_config = None
            selected_hotel_id = request.data.get('admin_selected_hotel')
            
            # Prioritize the specifically allocated hotel
            if selected_hotel_id:
                tier_config = HotelPricingConfig.objects.filter(id=selected_hotel_id).first()
            
            # Fallback to tier/room mapping if no specific hotel was allocated
            if not tier_config and hotel_tier and room_type:
                tier_config = HotelPricingConfig.objects.filter(
                    hotel_tier=hotel_tier, room_type=room_type, is_active=True
                ).first()
            
            if tier_config:
                price_per_night = tier_config.price_per_night
                
                # Calculate cost directly based on participants
                rooms_needed = 0  # Removing room tracking for math purposes
                
                hotel_cost_total = price_per_night * total_nights * participants
                hotel_cost_per_person = price_per_night * total_nights
            else:
                if selected_hotel_id or (hotel_tier and room_type):
                    return Response(
                        {"error": "No active pricing config found for the selected hotel or tier."},
                        status=status.HTTP_404_NOT_FOUND
                    )

        # 3. Math Time — per-person then multiply by participants
        base_cost_per_person = travel_cost_per_person + hotel_cost_per_person
        total_base_cost = base_cost_per_person * participants
        margin_amount = total_base_cost * Decimal('0.20')
        final_quoted_price = total_base_cost + margin_amount

        # 4. Save admin_response if provided
        admin_response_text = request.data.get('admin_response', '')
        
        # 5. Look up selected hotel name from HotelPricingConfig if provided
        selected_hotel_id = request.data.get('admin_selected_hotel')
        selected_hotel_name = None
        if selected_hotel_id:
            try:
                hotel_config_obj = HotelPricingConfig.objects.get(id=selected_hotel_id)
                selected_hotel_name = hotel_config_obj.hotel_name
            except HotelPricingConfig.DoesNotExist:
                pass  # Not critical — hotel allocation is informational

        # 6. Save to model
        serializer.save()
        
        # Save cost metrics
        custom_package.travel_cost = total_travel_cost
        custom_package.hotel_cost = hotel_cost_total
        custom_package.base_cost = total_base_cost
        custom_package.margin_amount = margin_amount
        custom_package.final_quoted_price = final_quoted_price
        custom_package.quoted_price = final_quoted_price  # Legacy field update for backward compatibility
        
        if admin_response_text:
            custom_package.admin_response = admin_response_text
        
        # Build quotation breakdown
        breakdown = {
            "transportation": {
                "type": transport,
                "kms_distance": float(kms_distance) if kms_distance else None,
                "direct_price_per_person": float(direct_price) if direct_price else None,
                "price_per_km": float(car_price_per_km) if car_price_per_km else None,
                "travel_cost_per_person": float(travel_cost_per_person),
                "total_travel_cost": float(total_travel_cost)
            },
            "accommodation": {
                "hotel_tier": hotel_tier,
                "room_type": room_type,
                "price_per_night": float(price_per_night),
                "nights": total_nights,
                "participants": participants,
                "rooms_needed": rooms_needed,
                "hotel_cost_per_person": float(hotel_cost_per_person),
                "total_hotel_cost": float(hotel_cost_total),
                "selected_hotel_id": str(selected_hotel_id) if selected_hotel_id else None,
                "selected_hotel_name": selected_hotel_name
            },
            "summary": {
                "base_cost_per_person": float(base_cost_per_person),
                "participants": participants,
                "total_base_cost": float(total_base_cost),
                "margin_20_percent": float(margin_amount),
                "final_quoted_price": float(final_quoted_price)
            }
        }
        custom_package.quotation_breakdown = breakdown
        custom_package.status = 'QUOTED'
        custom_package.quotation_generated_at = timezone.now()
        
        custom_package.save()
        
        return Response({
            "message": "Quotation generated successfully", 
            "breakdown": breakdown,
            "final_quoted_price": final_quoted_price
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['patch'], url_path='update-status')
    def update_status(self, request, pk=None):
        custom_package = self.get_object()
        serializer = AdminUpdateStatusSerializer(custom_package, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
