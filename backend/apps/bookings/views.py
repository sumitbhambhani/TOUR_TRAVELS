from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Booking
from .serializers import BookingSerializer
from apps.core.response import APIResponse
from apps.reviews.models import Review
from apps.reviews.serializers import ReviewSerializer
import logging

logger = logging.getLogger(__name__)

class BookingViewSet(viewsets.ModelViewSet):
    queryset = Booking.objects.all()
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_admin:
            return Booking.objects.select_related('tour', 'user').all()
        return Booking.objects.filter(user=self.request.user).select_related('tour')

    def perform_create(self, serializer):
        from apps.tours.models import Season, TourPricing
        from apps.payments.models import Invoice
        from decimal import Decimal, ROUND_HALF_UP
        import datetime

        # Enhanced price calculation logic
        tour = serializer.validated_data.get('tour')
        package = serializer.validated_data.get('package')
        travel_date = serializer.validated_data.get('travel_date')
        traveler_details = serializer.validated_data.get('traveler_details', [])
        
        # Get offer information from request data
        applied_offer_id = self.request.data.get('applied_offer_id')
        discount_amount = Decimal(str(self.request.data.get('discount_amount', 0)))
        base_amount = Decimal(str(self.request.data.get('base_amount', 0)))
        
        # 1. Count Adults & Children
        adult_count = 0
        child_count = 0
        
        if traveler_details and isinstance(traveler_details, list):
            for traveler in traveler_details:
                age = int(traveler.get('age', 25))
                if age < 12:
                    child_count += 1
                else:
                    adult_count += 1
            total_travelers = serializer.validated_data.get('travelers_count', 1)
            if adult_count + child_count != total_travelers:
                if adult_count == 0 and child_count == 0:
                    adult_count = total_travelers
        else:
            adult_count = serializer.validated_data.get('travelers_count', 1)

        # 2. Determine Pricing - Use seasonal pricing only
        adult_price = 0
        child_price = 0
        
        # Check Season - REQUIRED for pricing
        if travel_date and tour:
            # First try exact date match
            active_season = Season.objects.filter(
                start_date__lte=travel_date,
                end_date__gte=travel_date,
                is_active=True
            ).first()
            
            # If no exact date match, fall back to month-based matching
            if not active_season:
                travel_month = travel_date.month
                
                # Check for active seasons, handling year wrap-around (e.g., Nov to Feb)
                for season in Season.objects.filter(is_active=True):
                    if season.start_month <= season.end_month:
                        if season.start_month <= travel_month <= season.end_month:
                            active_season = season
                            break
                    else: # Wraps around the year (e.g. 11 to 2)
                        if travel_month >= season.start_month or travel_month <= season.end_month:
                            active_season = season
                            break
            
            if active_season:
                seasonal_pricing = TourPricing.objects.filter(tour=tour, season=active_season).first()
                if seasonal_pricing:
                    adult_price = seasonal_pricing.two_sharing_price or seasonal_pricing.price or 0
                    child_price = seasonal_pricing.child_price or 0
                    logger.info(f"Applied seasonal pricing '{active_season.name}' for booking")
                else:
                    logger.warning(f"No seasonal pricing found for tour {tour.name} in season {active_season.name}")
            else:
                logger.warning(f"No active season found for travel date {travel_date}")

        # 3. Apply Package Modifier
        if package:
            adult_price += package.price_modifier
            child_price += package.price_modifier
            
        # 4. Calculate total price (before GST)
        calculated_total = (Decimal(adult_count) * Decimal(adult_price)) + (Decimal(child_count) * Decimal(child_price))
        
        # 5. Prefer frontend base_amount when provided (>0); fallback to calculated price
        if base_amount > 0:
            # Trust client-provided base when seasonal pricing is missing or mismatched
            final_total = base_amount - (discount_amount if discount_amount > 0 else Decimal('0'))
            logger.info(f"Using client-provided base_amount: Base {base_amount}, Discount {discount_amount}, Final {final_total}")
        else:
            # No base from client; rely on calculated totals
            final_total = calculated_total
            base_amount = calculated_total
            # Keep discount only when an offer id is present and calculated total > 0
            if not applied_offer_id:
                discount_amount = Decimal('0')
            if discount_amount > 0 and applied_offer_id:
                final_total = (calculated_total - discount_amount)
                logger.info(f"Applied offer {applied_offer_id} on calculated total: Base {calculated_total}, Discount {discount_amount}, Final {final_total}")
        
        # Ensure proper decimal precision
        final_total = final_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        base_amount = base_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        discount_amount = discount_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        
        # Calculate GST (5%) - Add to final total
        gst_amount = (final_total * Decimal('0.05')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        total_with_gst = (final_total + gst_amount).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        
        logger.info(f"Price Calc: {adult_count} Adults @ {adult_price}, {child_count} Children @ {child_price} = {final_total} + GST {gst_amount} = {total_with_gst}")
        
        # 6. Save Booking with GST-inclusive total price
        booking = serializer.save(
            user=self.request.user, 
            total_price=total_with_gst,  # Store GST-inclusive amount
            applied_offer_id=applied_offer_id,
            base_amount=base_amount,
            discount_amount=discount_amount
        )
        
        # 7. Generate Invoice Automatically
        try:
            Invoice.objects.create(
                booking=booking,
                amount=final_total,  # Amount before GST
                tax_amount=gst_amount,  # GST amount
                total_amount=total_with_gst,  # Total with GST
                due_date=datetime.date.today() + datetime.timedelta(days=1),
                status='DRAFT'
            )
            logger.info(f"Auto-generated invoice for booking {booking.id}: Amount={final_total}, GST={gst_amount}, Total={total_with_gst}")
        except Exception as e:
            logger.error(f"Failed to auto-generate invoice: {e}")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            self.perform_create(serializer)
            return APIResponse.success(
                data=serializer.data,
                message="Booking created successfully",
                status_code=status.HTTP_201_CREATED
            )
        
        # Log validation errors for debugging
        logger.error(f"Booking validation errors: {serializer.errors}")
        logger.error(f"Request data: {request.data}")
        
        return APIResponse.error(
            message="Booking creation failed",
            errors=serializer.errors,
            status_code=status.HTTP_400_BAD_REQUEST
        )

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a booking with automatic refund calculation"""
        booking = self.get_object()
        
        if not booking.can_cancel:
            return APIResponse.error(
                message="This booking cannot be cancelled",
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        # Calculate refund amount based on policy
        refund_amount, refund_reason = booking.calculate_refund_amount()
        
        # Update booking status
        if refund_amount > 0:
            booking.status = 'REFUND_PENDING'
        else:
            booking.status = 'CANCELLED_NOT_REFUNDED'
            
        booking.cancellation_reason = request.data.get('cancellation_reason', '')
        booking.save()
        
        # Create refund request if there's a refund amount and successful payment
        refund_created = False
        if refund_amount > 0:
            try:
                from apps.payments.models import Payment, Refund
                payment = booking.payments.filter(status='SUCCESS').first()
                if payment:
                    refund, created = Refund.objects.get_or_create(
                        payment=payment,
                        booking=booking,
                        defaults={
                            'amount': refund_amount,
                            'reason': f"{refund_reason}. User reason: {booking.cancellation_reason}",
                            'status': 'APPROVED'  # Auto-approve based on policy
                        }
                    )
                    refund_created = True
                    logger.info(f"Refund request created for booking {booking.id}: ₹{refund_amount}")
            except ImportError:
                logger.error("Could not import Payment/Refund models in BookingViewSet.cancel")
            except Exception as e:
                logger.error(f"Error creating refund object: {str(e)}")
        
        logger.info(f"Booking {booking.id} cancelled by user {request.user.email}. Refund: ₹{refund_amount}")
        
        response_data = {
            'booking': BookingSerializer(booking).data,
            'refund_info': {
                'refund_amount': refund_amount,
                'refund_percentage': (refund_amount / float(booking.total_price)) * 100 if booking.total_price > 0 else 0,
                'reason': refund_reason,
                'refund_created': refund_created
            }
        }
        
        if refund_amount > 0:
            message = f"Booking cancelled successfully. Refund of ₹{refund_amount:.2f} will be processed."
        else:
            message = f"Booking cancelled. {refund_reason}"
            
        return APIResponse.success(
            data=response_data,
            message=message
        )

    @action(detail=True, methods=['get'])
    def refund_policy(self, request, pk=None):
        """Get refund policy information for a booking"""
        booking = self.get_object()
        
        if not booking.can_cancel:
            return APIResponse.error(
                message="This booking cannot be cancelled",
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        policy_info = booking.refund_policy_status
        
        return APIResponse.success(
            data=policy_info,
            message="Refund policy information retrieved successfully"
        )

    @action(detail=True, methods=['post'])
    def add_review(self, request, pk=None):
        """Add a review for a completed booking"""
        booking = self.get_object()
        
        if not booking.can_review:
            return APIResponse.error(
                message="You can only review completed bookings",
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if user already reviewed this tour
        existing_review = Review.objects.filter(user=request.user, tour=booking.tour).first()
        if existing_review:
            return APIResponse.error(
                message="You have already reviewed this tour",
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        review_data = request.data.copy()
        review_data['tour'] = booking.tour.id
        
        review_serializer = ReviewSerializer(data=review_data)
        if review_serializer.is_valid():
            review_serializer.save(user=request.user)
            
            logger.info(f"Review added by user {request.user.email} for tour {booking.tour.name}")
            
            return APIResponse.success(
                data=review_serializer.data,
                message="Review submitted successfully. It will be visible after verification."
            )
        
        return APIResponse.error(
            message="Review submission failed",
            errors=review_serializer.errors,
            status_code=status.HTTP_400_BAD_REQUEST
        )
