from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from apps.core.viewsets import BaseViewSet
from apps.core.permissions import IsAdminUser
from apps.core.response import APIResponse
from .models import Payment, Refund, Invoice
from .serializers import PaymentSerializer, RefundSerializer, InvoiceSerializer
import logging
from decimal import Decimal, ROUND_HALF_UP

logger = logging.getLogger(__name__)


class PaymentViewSet(BaseViewSet):
    """ViewSet for managing payments"""
    queryset = Payment.objects.select_related('booking', 'booking__tour', 'booking__user').all()
    serializer_class = PaymentSerializer

    def get_permissions(self):
        """Set permissions based on action"""
        if self.action == 'create':
            permission_classes = []  # Allow booking creation to create payments
        elif self.action in ['create_order', 'verify_payment']:
            from rest_framework.permissions import IsAuthenticated
            permission_classes = [IsAuthenticated]
        else:
            permission_classes = [IsAdminUser]
        return [permission() for permission in permission_classes]

    def create(self, request, *args, **kwargs):
        """Create a new payment"""
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            # Generate transaction ID if not provided
            if not serializer.validated_data.get('transaction_id'):
                import uuid
                serializer.validated_data['transaction_id'] = f"TXN-{uuid.uuid4().hex[:12].upper()}"
            
            payment = serializer.save()
            logger.info(f"Payment created: {payment.transaction_id}")
            
            self._sync_invoice_for_payment(payment)
            
            return APIResponse.success(
                data=serializer.data,
                message="Payment created successfully",
                status_code=status.HTTP_201_CREATED
            )
        else:
            return APIResponse.error(
                message="Payment creation failed",
                errors=serializer.errors,
                status_code=status.HTTP_400_BAD_REQUEST
            )

    def _sync_invoice_for_payment(self, payment):
        try:
            if payment.status == 'SUCCESS' and getattr(payment, 'booking', None):
                booking = payment.booking
                invoice = getattr(booking, 'invoice', None)
                if invoice:
                    expected_total = Decimal(str(booking.total_price)) if booking.total_price else Decimal(str(payment.amount))
                    if not invoice.total_amount or Decimal(str(invoice.total_amount)) != expected_total:
                        amount = (expected_total / Decimal('1.05')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                        tax = (expected_total - amount).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                        invoice.amount = amount
                        invoice.tax_amount = tax
                        invoice.total_amount = expected_total
                    
                    from django.db.models import Sum
                    total_paid = booking.payments.filter(status='SUCCESS').aggregate(t=Sum('amount'))['t'] or Decimal('0')
                    
                    if total_paid >= expected_total:
                        invoice.status = 'PAID'
                    else:
                        invoice.status = 'ISSUED'
                        
                    invoice.save()
        except Exception as e:
            logger.error(f"Failed to sync invoice with payment {getattr(payment, 'id', 'unknown')}: {e}")

    @action(detail=False, methods=['post'], url_path='create-order')
    def create_order(self, request):
        amount = request.data.get('amount')
        currency = request.data.get('currency', 'INR')
        context_type = request.data.get('context_type')
        context_id = request.data.get('context_id')
        
        if not amount:
            return APIResponse.error("Amount is required", status_code=status.HTTP_400_BAD_REQUEST)
            
        booking = None
        if context_type in ['booking', 'custom_package_advance'] and context_id:
            from apps.bookings.models import Booking
            try:
                booking = Booking.objects.get(id=context_id)
            except Booking.DoesNotExist:
                return APIResponse.error("Booking not found", status_code=status.HTTP_404_NOT_FOUND)
                
        try:
            from .services import create_razorpay_order
            order = create_razorpay_order(
                amount_paise=amount, currency=currency,
                context_type=context_type, context_id=context_id, booking=booking
            )
            return APIResponse.success(data=order, message="Order created successfully")
        except Exception as e:
            return APIResponse.error(str(e), status_code=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='verify')
    def verify_payment(self, request):
        razorpay_order_id = request.data.get('razorpay_order_id')
        razorpay_payment_id = request.data.get('razorpay_payment_id')
        razorpay_signature = request.data.get('razorpay_signature')
        
        if not all([razorpay_order_id, razorpay_payment_id, razorpay_signature]):
            return APIResponse.error("Missing razorpay parameters", status_code=status.HTTP_400_BAD_REQUEST)
            
        try:
            from .services import verify_razorpay_payment
            payment = verify_razorpay_payment(razorpay_order_id, razorpay_payment_id, razorpay_signature)
            
            # Post-processing syncing
            self._sync_invoice_for_payment(payment)
            
            # Additional booking status check can be placed here if needed.
            # Only auto-confirm regular bookings. Leave custom package advances PENDING for admin review.
            if getattr(payment, 'booking', None):
                booking = payment.booking
                if payment.context_type == 'booking' and booking.status in ['PENDING']:
                    booking.status = 'CONFIRMED'
                    booking.save()

            return APIResponse.success(data=PaymentSerializer(payment).data, message="Payment successfully verified")
        except Exception as e:
            return APIResponse.error(str(e), status_code=status.HTTP_400_BAD_REQUEST)


class RefundViewSet(BaseViewSet):
    """ViewSet for managing refunds"""
    queryset = Refund.objects.select_related(
        'payment', 'booking', 'booking__tour', 'booking__user', 'processed_by'
    ).all()
    serializer_class = RefundSerializer
    permission_classes = [IsAdminUser]

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a refund"""
        refund = self.get_object()
        
        if refund.status != 'PENDING':
            return APIResponse.error(
                message="Only pending refunds can be approved",
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        refund.status = 'APPROVED'
        refund.processed_by = request.user
        refund.processed_at = timezone.now()
        refund.admin_notes = request.data.get('admin_notes', '')
        refund.save()
        
        # Sync with booking status
        if refund.booking:
            refund.booking.status = 'CANCELLED_REFUNDED'
            refund.booking.save()
            logger.info(f"Booking {refund.booking.id} status updated to CANCELLED_REFUNDED")
        
        logger.info(f"Refund {refund.id} approved by {request.user.email}")
        
        return APIResponse.success(
            data=RefundSerializer(refund).data,
            message="Refund approved successfully"
        )

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a refund"""
        refund = self.get_object()
        
        if refund.status != 'PENDING':
            return APIResponse.error(
                message="Only pending refunds can be rejected",
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        refund.status = 'REJECTED'
        refund.processed_by = request.user
        refund.processed_at = timezone.now()
        refund.admin_notes = request.data.get('admin_notes', 'Refund rejected by admin')
        refund.save()
        
        # Sync with booking status
        if refund.booking:
            refund.booking.status = 'CANCELLED_NOT_REFUNDED'
            refund.booking.save()
            logger.info(f"Booking {refund.booking.id} status updated to CANCELLED_NOT_REFUNDED")
        
        logger.info(f"Refund {refund.id} rejected by {request.user.email}")
        
        return APIResponse.success(
            data=RefundSerializer(refund).data,
            message="Refund rejected"
        )

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """Mark refund as processed"""
        refund = self.get_object()
        
        if refund.status != 'APPROVED':
            return APIResponse.error(
                message="Only approved refunds can be processed",
                status_code=status.HTTP_400_BAD_REQUEST
            )
        
        refund.status = 'PROCESSED'
        refund.processed_by = request.user
        refund.processed_at = timezone.now()
        refund.save()
        
        # Update original payment status
        refund.payment.status = 'REFUNDED'
        refund.payment.save()
        
        logger.info(f"Refund {refund.id} processed by {request.user.email}")
        
        return APIResponse.success(
            data=RefundSerializer(refund).data,
            message="Refund processed successfully"
        )


class InvoiceViewSet(BaseViewSet):
    """ViewSet for managing invoices"""
    queryset = Invoice.objects.select_related('booking', 'booking__tour', 'booking__user').all()
    serializer_class = InvoiceSerializer
    
    def _heal_invoice_amounts(self, invoices):
        """Repair missing invoice amounts from related bookings/payments"""
        for invoice in invoices:
            try:
                if not invoice or not hasattr(invoice, 'booking') or not invoice.booking:
                    continue
                
                total = Decimal('0')
                if invoice.booking.total_price and invoice.booking.total_price > 0:
                    total = Decimal(str(invoice.booking.total_price))
                elif invoice.booking.payments.filter(status='SUCCESS').exists():
                    latest_payment = invoice.booking.payments.filter(status='SUCCESS').order_by('-created_at').first()
                    if latest_payment and latest_payment.amount:
                        total = Decimal(str(latest_payment.amount))
                
                if total > 0 and (not invoice.total_amount or invoice.total_amount == 0):
                    # Calculate components (assuming 5% tax included in total)
                    amount = (total / Decimal('1.05')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    tax = (total - amount).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    
                    invoice.amount = amount
                    invoice.tax_amount = tax
                    invoice.total_amount = total
                    invoice.save(update_fields=['amount', 'tax_amount', 'total_amount'])
                    logger.info(f"Healed invoice {invoice.invoice_number}: Total {total}")
            except Exception as e:
                logger.error(f"Error healing invoice {getattr(invoice, 'id', 'unknown')}: {e}")
                continue

    def get_permissions(self):
        """Set permissions based on action"""
        if self.action in ['list', 'retrieve']:
            # Allow authenticated users to view their own invoices
            from rest_framework.permissions import IsAuthenticated
            permission_classes = [IsAuthenticated]
        else:
            # Only admin can create, update, delete invoices
            permission_classes = [IsAdminUser]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        """Filter invoices based on user role"""
        user = self.request.user
        if not user.is_authenticated:
            return Invoice.objects.none()
            
        # Comprehensive admin check
        is_admin = (
            getattr(user, 'role', '') == 'ADMIN' or 
            getattr(user, 'is_admin', False) or 
            user.is_staff or 
            user.is_superuser
        )
        
        # Base queryset with necessary relations
        qs = Invoice.objects.select_related('booking', 'booking__tour', 'booking__user')
        
        if is_admin:
            logger.debug(f"Admin {user.email} accessing all invoices")
            return qs.all()
        else:
            logger.debug(f"Customer {user.email} accessing personal invoices")
            return qs.filter(booking__user=user)
    
    def list(self, request, *args, **kwargs):
        logger.debug(f"InvoiceViewSet.list called by user: {request.user.email}")
        queryset = self.filter_queryset(self.get_queryset())
        logger.debug(f"Final filtered queryset count: {queryset.count()}")
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            self._heal_invoice_amounts(page)
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
            
        self._heal_invoice_amounts(queryset)
        serializer = self.get_serializer(queryset, many=True)
        return APIResponse.success(
            data=serializer.data,
            message="Invoice list retrieved successfully"
        )
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        self._heal_invoice_amounts([instance])
        serializer = self.get_serializer(instance)
        return APIResponse.success(
            data=serializer.data,
            message="Invoice retrieved successfully"
        )

    def create(self, request, *args, **kwargs):
        """Create a new invoice with granular logging"""
        logger.info(f"Invoice creation request received for booking: {request.data.get('booking')}")
        try:
            serializer = self.get_serializer(data=request.data)
            logger.debug("Validating invoice serializer")
            if serializer.is_valid():
                logger.debug("Serializer valid, saving invoice")
                try:
                    invoice = serializer.save()
                    logger.info(f"Invoice created successfully: {invoice.invoice_number}")
                    
                    return APIResponse.success(
                        data=serializer.data,
                        message="Invoice created successfully",
                        status_code=status.HTTP_201_CREATED
                    )
                except Exception as save_error:
                    from django.db import IntegrityError
                    if isinstance(save_error, IntegrityError):
                        logger.warning(f"Integrity error during invoice save: {save_error}")
                        return APIResponse.error(
                            message="Invoice creation failed: A record with this booking might already exist.",
                            errors={"booking": ["An invoice for this booking already exists."]},
                            status_code=status.HTTP_400_BAD_REQUEST
                        )
                    logger.exception(f"Unexpected error during invoice save: {save_error}")
                    raise
            else:
                logger.warning(f"Invoice serializer invalid: {serializer.errors}")
                return APIResponse.error(
                    message="Invoice creation failed",
                    errors=serializer.errors,
                    status_code=status.HTTP_400_BAD_REQUEST
                )
        except Exception as e:
            logger.exception(f"Critical failure in InvoiceViewSet.create: {e}")
            return APIResponse.error(
                message=f"Server error during invoice creation: {str(e)}",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def mark_paid(self, request, pk=None):
        """Mark invoice as paid"""
        invoice = self.get_object()
        # Ensure totals are set correctly before marking as PAID
        try:
            total = None
            if getattr(invoice, 'booking', None) and invoice.booking and invoice.booking.total_price:
                total = Decimal(str(invoice.booking.total_price))
            if (total is None or total == Decimal('0')) and getattr(invoice, 'booking', None):
                latest_payment = invoice.booking.payments.order_by('-created_at').first()
                if latest_payment and latest_payment.amount:
                    total = Decimal(str(latest_payment.amount))
            if total is not None and total > 0:
                if not invoice.amount or not invoice.tax_amount or not invoice.total_amount or Decimal(str(invoice.total_amount)) != total:
                    amount = (total / Decimal('1.05')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    tax = (total - amount).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    invoice.amount = amount
                    invoice.tax_amount = tax
                    invoice.total_amount = total
        except Exception:
            pass
        invoice.status = 'PAID'
        invoice.save()
        
        logger.info(f"Invoice {invoice.invoice_number} marked as paid")
        
        return APIResponse.success(
            data=InvoiceSerializer(invoice).data,
            message="Invoice marked as paid"
        )

    @action(detail=True, methods=['post'])
    def send_invoice(self, request, pk=None):
        """Send invoice to customer"""
        invoice = self.get_object()
        
        invoice.status = 'SENT'
        invoice.save()
        
        # TODO: Implement email sending logic here
        
        logger.info(f"Invoice {invoice.invoice_number} sent to customer")
        
        return APIResponse.success(
            data=InvoiceSerializer(invoice).data,
            message="Invoice sent to customer"
        )
