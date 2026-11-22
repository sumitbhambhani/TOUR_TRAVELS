from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BookingViewSet
from .report_views import (
    ReportSummaryView, BookingReportView,
    MostBookedToursView, ChartDataView,
)

router = DefaultRouter()
router.register(r'', BookingViewSet, basename='booking')

urlpatterns = [
    # Report endpoints (must come before router to avoid conflict)
    path('reports/summary/', ReportSummaryView.as_view(), name='report-summary'),
    path('reports/bookings/', BookingReportView.as_view(), name='report-bookings'),
    path('reports/most-booked/', MostBookedToursView.as_view(), name='report-most-booked'),
    path('reports/charts/', ChartDataView.as_view(), name='report-charts'),
    path('', include(router.urls)),
]
