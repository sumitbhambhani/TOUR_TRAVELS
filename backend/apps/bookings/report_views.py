"""
Reports API views for admin analytics.
Provides summary stats, filtered booking reports, most-booked tours, and chart data.
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from apps.core.permissions import IsAdminUser
from django.db.models import Count, Sum, Q, F, Value, DecimalField
from django.db.models.functions import TruncDate, TruncMonth, Coalesce
from django.utils.dateparse import parse_date
from decimal import Decimal
from .models import Booking
from apps.tours.models import Tour
import logging

logger = logging.getLogger(__name__)


def _parse_filters(request):
    """Extract and validate common filters from query params."""
    start_date = parse_date(request.query_params.get('start_date', ''))
    end_date = parse_date(request.query_params.get('end_date', ''))
    order_type = request.query_params.get('order_type', 'all')
    tour_id = request.query_params.get('tour_id', '')

    filters = Q()
    if start_date:
        filters &= Q(booking_date__date__gte=start_date)
    if end_date:
        filters &= Q(booking_date__date__lte=end_date)
    if tour_id:
        filters &= Q(tour_id=tour_id)

    # Order type filtering
    if order_type == 'tour_package':
        filters &= Q(tour__isnull=False)
    elif order_type == 'custom_tour_package':
        filters &= Q(tour__isnull=True)

    return filters, start_date, end_date, order_type, tour_id


class ReportSummaryView(APIView):
    """GET /bookings/reports/summary/ — Dashboard summary cards."""
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        try:
            filters, start_date, end_date, order_type, tour_id = _parse_filters(request)

            bookings_qs = Booking.objects.filter(filters)

            total_bookings = bookings_qs.count()
            total_customers = bookings_qs.values('user').distinct().count()
            total_revenue = bookings_qs.aggregate(
                total=Sum('total_price')
            )['total'] or Decimal('0')

            # Active tours
            active_tours = Tour.objects.filter(is_active=True).count()

            return Response({
                'success': True,
                'data': {
                    'total_bookings': total_bookings,
                    'total_customers': total_customers,
                    'total_revenue': float(total_revenue),
                    'active_tours': active_tours,
                }
            })
        except Exception as e:
            logger.error(f"Report summary error: {e}", exc_info=True)
            return Response(
                {'success': False, 'message': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class BookingReportView(APIView):
    """GET /bookings/reports/bookings/ — Paginated booking report table."""
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        try:
            filters, start_date, end_date, order_type, tour_id = _parse_filters(request)

            page = int(request.query_params.get('page', 1))
            page_size = int(request.query_params.get('page_size', 50))

            bookings_qs = Booking.objects.filter(filters).select_related(
                'user', 'tour', 'tour__primary_destination', 'package'
            ).order_by('-booking_date')

            total_count = bookings_qs.count()

            # Paginate
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            bookings = bookings_qs[start_idx:end_idx]

            results = []
            for b in bookings:
                # Determine order type label
                if b.tour:
                    o_type = 'Tour Package Booking'
                else:
                    o_type = 'Custom Tour Package'

                # Safe destination access
                dest = 'N/A'
                try:
                    if b.tour and b.tour.primary_destination:
                        dest = b.tour.primary_destination.name
                except Exception:
                    pass

                results.append({
                    'id': str(b.id),
                    'customer_name': (b.user.get_full_name() or b.user.username) if b.user else 'N/A',
                    'customer_email': b.user.email if b.user else 'N/A',
                    'tour_name': b.tour.name if b.tour else 'N/A',
                    'destination': dest,
                    'travelers_count': b.travelers_count,
                    'status': b.status,
                    'booking_date': b.booking_date.isoformat() if b.booking_date else None,
                    'total_amount': float(b.total_price),
                    'order_type': o_type,
                })

            return Response({
                'success': True,
                'data': {
                    'results': results,
                    'total_count': total_count,
                    'page': page,
                    'page_size': page_size,
                    'total_pages': max(1, (total_count + page_size - 1) // page_size),
                }
            })
        except Exception as e:
            logger.error(f"Booking report error: {e}", exc_info=True)
            return Response(
                {'success': False, 'message': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class MostBookedToursView(APIView):
    """GET /bookings/reports/most-booked/ — Top 10 most-booked tours."""
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        try:
            start_date = parse_date(request.query_params.get('start_date', ''))
            end_date = parse_date(request.query_params.get('end_date', ''))

            # Build booking date filters
            date_filter = Q()
            if start_date:
                date_filter &= Q(bookings__booking_date__date__gte=start_date)
            if end_date:
                date_filter &= Q(bookings__booking_date__date__lte=end_date)

            tours = (
                Tour.objects
                .annotate(
                    total_bookings=Count('bookings', filter=date_filter if date_filter.children else None),
                    total_revenue=Sum('bookings__total_price', filter=date_filter if date_filter.children else None),
                )
                .filter(total_bookings__gt=0)
                .order_by('-total_bookings')[:10]
            )

            results = []
            for t in tours:
                dest = 'N/A'
                try:
                    if t.primary_destination:
                        dest = t.primary_destination.name
                except Exception:
                    pass

                results.append({
                    'tour_name': t.name,
                    'destination': dest,
                    'total_bookings': t.total_bookings or 0,
                    'total_revenue': float(t.total_revenue or 0),
                })

            return Response({'success': True, 'data': results})
        except Exception as e:
            logger.error(f"Most booked tours error: {e}", exc_info=True)
            return Response(
                {'success': False, 'message': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ChartDataView(APIView):
    """GET /bookings/reports/charts/ — Aggregated chart data."""
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        try:
            from datetime import timedelta
            from django.utils import timezone

            filters, start_date, end_date, order_type, tour_id = _parse_filters(request)

            # Standard filtered queryset for most booked tours chart
            bookings_qs = Booking.objects.filter(filters)

            # Fixed 6-months queryset for trends
            six_months_ago = timezone.now().date() - timedelta(days=6*30)
            six_months_qs = Booking.objects.filter(booking_date__date__gte=six_months_ago)

            # 1. Booking trend by date (last 6 months)
            booking_trend = list(
                six_months_qs
                .annotate(date=TruncDate('booking_date'))
                .exclude(date__isnull=True)
                .values('date')
                .annotate(count=Count('id'))
                .order_by('date')
            )
            booking_trend_data = [
                {'date': str(item['date']), 'count': item['count']}
                for item in booking_trend if item['date']
            ]

            # 2. Revenue trend by month (last 6 months) — always show all 6 months
            revenue_trend = list(
                six_months_qs
                .annotate(month=TruncMonth('booking_date'))
                .exclude(month__isnull=True)
                .values('month')
                .annotate(revenue=Sum('total_price'))
                .order_by('month')
            )
            # Build a dict of existing month data
            revenue_by_month = {
                item['month'].strftime('%Y-%m'): float(item['revenue'] or 0)
                for item in revenue_trend if item['month']
            }
            # Generate all 6 months (including current), fill gaps with 0
            today = timezone.now().date()
            revenue_trend_data = []
            for i in range(5, -1, -1):
                # Subtract months using simple date math
                month = today.month - i
                year = today.year
                while month <= 0:
                    month += 12
                    year -= 1
                key = f"{year}-{month:02d}"
                revenue_trend_data.append({
                    'month': key,
                    'revenue': revenue_by_month.get(key, 0),
                })

            # 3. Most booked tours (top 5 for bar chart)
            most_booked = (
                Tour.objects
                .annotate(count=Count('bookings', filter=filters if filters.children else None))
                .filter(count__gt=0)
                .order_by('-count')[:5]
            )
            most_booked_data = [
                {'tour_name': item.name or 'Unknown', 'count': item.count}
                for item in most_booked
            ]

            return Response({
                'success': True,
                'data': {
                    'booking_trend': booking_trend_data,
                    'revenue_trend': revenue_trend_data,
                    'most_booked': most_booked_data,
                }
            })
        except Exception as e:
            logger.error(f"Chart data error: {e}", exc_info=True)
            return Response(
                {'success': False, 'message': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
