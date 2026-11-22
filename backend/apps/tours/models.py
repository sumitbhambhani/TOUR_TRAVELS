"""
Tours models for Tours & Travels backend
Implements tour packages, destinations, and related functionality
"""

from django.db import models
from django.utils.text import slugify
from django.core.validators import MinValueValidator, MaxValueValidator
from django.conf import settings
from apps.core.models import BaseModel


class Season(BaseModel):
    """
    Season model for seasonal pricing with date ranges
    """
    MONTH_CHOICES = [
        (1, 'January'), (2, 'February'), (3, 'March'), (4, 'April'),
        (5, 'May'), (6, 'June'), (7, 'July'), (8, 'August'),
        (9, 'September'), (10, 'October'), (11, 'November'), (12, 'December'),
    ]

    name = models.CharField(max_length=100, unique=True)
    start_month = models.PositiveSmallIntegerField(choices=MONTH_CHOICES)
    end_month = models.PositiveSmallIntegerField(choices=MONTH_CHOICES)
    start_date = models.DateField(
        help_text="Season start date (e.g., July 1, 2025)",
        null=True,
        blank=True
    )
    end_date = models.DateField(
        help_text="Season end date (e.g., September 30, 2025)",
        null=True,
        blank=True
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'tours_season'
        ordering = ['start_month']
        verbose_name = 'Season'
        verbose_name_plural = 'Seasons'

    def __str__(self):
        if self.start_date and self.end_date:
            return f"{self.name} ({self.start_date.strftime('%b %d')} - {self.end_date.strftime('%b %d')})"
        return self.name

    @property
    def date_range_display(self):
        """Display date range in readable format"""
        if self.start_date and self.end_date:
            return f"{self.start_date.strftime('%d %B, %Y')} to {self.end_date.strftime('%d %B, %Y')}"
        return "Date range not set"


class TourPricing(BaseModel):
    """
    Seasonal pricing for tours with detailed breakdown
    """
    tour = models.ForeignKey(
        'Tour',
        related_name='seasonal_pricings',
        on_delete=models.CASCADE
    )
    season = models.ForeignKey(
        Season,
        related_name='tour_pricings',
        on_delete=models.CASCADE
    )
    
    # Detailed pricing breakdown
    two_sharing_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text="Price per person for 2-sharing accommodation",
        null=True,
        blank=True
    )
    three_sharing_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text="Price per person for 3-sharing accommodation",
        null=True,
        blank=True
    )
    child_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text="Price for child (4-11 years) without bed",
        null=True,
        blank=True
    )
    
    # Specific dates
    available_dates = models.JSONField(
        default=list,
        help_text="List of specific available dates: ['10', '17', '24']"
    )
    
    # Additional details
    includes_return_air = models.BooleanField(
        default=True,
        help_text="Whether price includes return air travel"
    )
    description = models.TextField(blank=True)
    
    # Legacy field for backward compatibility
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text="Base price (usually same as two_sharing_price)"
    )

    class Meta:
        db_table = 'tours_tourpricing'
        unique_together = ['tour', 'season']
        verbose_name = 'Tour Pricing'
        verbose_name_plural = 'Tour Pricings'

    def save(self, *args, **kwargs):
        # Set base price to two_sharing_price if not set
        if not self.price and self.two_sharing_price:
            self.price = self.two_sharing_price
        super().save(*args, **kwargs)

    def __str__(self):
        price_display = self.two_sharing_price or self.price
        return f"{self.tour.name} - {self.season.name}: ₹{price_display}"


class TourItinerary(BaseModel):
    """
    Day-by-day itinerary for tours/destinations
    """
    destination = models.ForeignKey(
        'Destination',
        related_name='itineraries',
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    tour = models.ForeignKey(
        'Tour',
        related_name='detailed_itineraries',
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    day_number = models.PositiveIntegerField()
    title = models.CharField(max_length=200)
    description = models.TextField()

    class Meta:
        db_table = 'tours_touritinerary'
        ordering = ['day_number']
        verbose_name = 'Tour Itinerary'
        verbose_name_plural = 'Tour Itineraries'

    def __str__(self):
        return f"Day {self.day_number}: {self.title}"


class Destination(BaseModel):
    """
    Destination model for tour locations
    """
    name = models.CharField(max_length=200, unique=True)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    description = models.TextField(blank=True)
    places = models.TextField(
        blank=True, 
        help_text="Comma-separated list of places to visit"
    )
    country = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'tours_destination'
        ordering = ['name']
        verbose_name = 'Destination'
        verbose_name_plural = 'Destinations'

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class DestinationImage(BaseModel):
    """
    Multiple images for a destination (for Hero Carousel)
    """
    destination = models.ForeignKey(
        Destination,
        related_name='images',
        on_delete=models.CASCADE
    )
    image = models.ImageField(upload_to='destinations/images/')
    caption = models.CharField(max_length=200, blank=True)
    is_featured = models.BooleanField(default=False)

    class Meta:
        db_table = 'tours_destinationimage'
        verbose_name = 'Destination Image'
        verbose_name_plural = 'Destination Images'

    def __str__(self):
        return f"Image for {self.destination.name}"


class Tour(BaseModel):
    """
    Main Tour model with comprehensive tour information
    """
    DIFFICULTY_CHOICES = [
        ('EASY', 'Easy'),
        ('MODERATE', 'Moderate'),
        ('CHALLENGING', 'Challenging'),
    ]
    
    CATEGORY_CHOICES = [
        ('ADVENTURE', 'Adventure'),
        ('CULTURAL', 'Cultural'),
        ('RELAXATION', 'Relaxation'),
        ('BUSINESS', 'Business'),
        ('WILDLIFE', 'Wildlife'),
        ('SPIRITUAL', 'Spiritual'),
        ('FAMILY', 'Family Tours'),
        ('HONEYMOON', 'Honeymoon Packages'),
    ]

    TOUR_TYPE_CHOICES = [
        ('DOMESTIC', 'Domestic'),
        ('INTERNATIONAL', 'International'),
    ]

    name = models.CharField(max_length=200, unique=True)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    description = models.TextField()
    destinations = models.ManyToManyField(
        Destination, 
        related_name='tours',
        help_text="Multiple destinations covered in this tour"
    )
    primary_destination = models.ForeignKey(
        Destination,
        related_name='primary_tours',
        on_delete=models.CASCADE,
        help_text="Main destination for this tour"
    )
    duration_days = models.PositiveIntegerField(
        validators=[MinValueValidator(1)]
    )
    max_capacity = models.PositiveIntegerField(
        default=10,
        validators=[MinValueValidator(1)]
    )
    child_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        validators=[MinValueValidator(0)],
        default=0,
        help_text="Child Price per person (4-11 years)"
    )
    tour_type = models.CharField(
        max_length=20,
        choices=TOUR_TYPE_CHOICES,
        default='DOMESTIC'
    )
    is_active = models.BooleanField(default=True)
    available_dates = models.JSONField(
        default=list,
        blank=True,
        help_text="Direct list of available dates (YYYY-MM-DD)"
    )
    featured_image = models.ImageField(
        upload_to='tours/images/', 
        null=True, 
        blank=True
    )
    brochure = models.FileField(
        upload_to='tours/brochures/',
        null=True,
        blank=True,
        help_text="Upload PDF brochure for this tour"
    )
    gallery_images = models.JSONField(
        default=list,
        blank=True,
        help_text="List of image URLs for tour gallery"
    )
    inclusions = models.JSONField(
        default=list,
        blank=True,
        help_text="List of included services"
    )
    exclusions = models.JSONField(
        default=list,
        blank=True,
        help_text="List of excluded services"
    )
    itinerary = models.JSONField(
        default=list,
        blank=True,
        help_text="Day-by-day tour schedule"
    )
    difficulty_level = models.CharField(
        max_length=15,
        choices=DIFFICULTY_CHOICES,
        default='EASY'
    )
    category = models.CharField(
        max_length=15,
        choices=CATEGORY_CHOICES,
        default='CULTURAL'
    )
    
    # Enhanced brochure fields
    hotel_details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Hotel details by destination: {destination_id: {hotel_name: 'Hotel Name', hotel_type: 'Type'}}"
    )
    vehicle_details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Vehicle information: {type: 'AC INNOVA/XYLO', note: 'AC will not work in hill area'}"
    )
    pricing_details = models.JSONField(
        default=dict,
        blank=True,
        help_text="DEPRECATED: Use seasonal_pricings relation instead"
    )
    special_notes = models.TextField(
        blank=True,
        help_text="Special notes and conditions"
    )
    
    class Meta:
        db_table = 'tours_tour'
        ordering = ['-created_at']
        verbose_name = 'Tour'
        verbose_name_plural = 'Tours'
        indexes = [
            models.Index(fields=['primary_destination']),
            models.Index(fields=['category']),
            models.Index(fields=['is_active']),
            models.Index(fields=['difficulty_level']),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    @property
    def average_rating(self):
        """Calculate average rating from reviews"""
        reviews = self.reviews.filter(is_verified=True)
        if reviews.exists():
            return reviews.aggregate(
                avg_rating=models.Avg('rating')
            )['avg_rating']
        return 0

    @property
    def review_count(self):
        """Get total number of verified reviews"""
        return self.reviews.filter(is_verified=True).count()

    @property
    def available_capacity(self):
        """Calculate available capacity based on confirmed bookings"""
        from apps.bookings.models import Booking
        confirmed_bookings = Booking.objects.filter(
            tour=self,
            status='CONFIRMED'
        ).aggregate(
            total_participants=models.Sum('travelers_count')
        )['total_participants'] or 0
        
        return max(0, self.max_capacity - confirmed_bookings)

    def get_current_price(self, season=None):
        """Get current price based on season with fallback to legacy pricing_details and seasonal_pricings"""
        if season:
            try:
                pricing = self.seasonal_pricings.get(season=season)
                return pricing.price
            except TourPricing.DoesNotExist:
                # Check legacy pricing_details as fallback
                if isinstance(self.pricing_details, dict):
                    # Try to find by season name
                    season_name = season if isinstance(season, str) else season.name
                    season_pricing = self.pricing_details.get(season_name)
                    if season_pricing:
                        if isinstance(season_pricing, dict):
                            return season_pricing.get('price') or season_pricing.get('two_sharing_price', 0)
                        return season_pricing
        
        # Fallback to minimum from pricing_details (can be list or dict)
        if self.pricing_details:
            prices = []
            details = self.pricing_details
            
            # Convert to list if it's a dict for easier processing
            if isinstance(details, dict):
                details = list(details.values())
            
            if isinstance(details, list):
                for sp in details:
                    if isinstance(sp, dict):
                        p = sp.get('price') or sp.get('two_sharing_price')
                        if p: 
                            try:
                                prices.append(float(p))
                            except (ValueError, TypeError):
                                pass
                    elif isinstance(sp, (int, float, str)):
                        try:
                            prices.append(float(sp))
                        except (ValueError, TypeError):
                            pass
            
            if prices:
                return min(prices)
        
        # New Fallback: Check seasonal_pricings table if no season was specified or pricing_details is empty
        seasonal_prices = self.seasonal_pricings.values_list('price', flat=True)
        if seasonal_prices:
            # Return the minimum available seasonal price
            valid_prices = [float(p) for p in seasonal_prices if p and p > 0]
            if valid_prices:
                return min(valid_prices)
                
        return 0

    def get_seasonal_prices(self):
        """Get all seasonal prices for this tour"""
        return self.seasonal_pricings.select_related('season').all()

    @property
    def destination_names(self):
        """Get comma-separated list of destination names"""
        return ", ".join([dest.name for dest in self.destinations.all()])

    @property
    def all_destinations(self):
        """Get all destinations for this tour"""
        return self.destinations.all()

    def get_hotel_by_destination(self, destination_id):
        """Get hotel details for a specific destination"""
        return self.hotel_details.get(str(destination_id), {})

    def get_pricing_for_season(self, season_name):
        """Get detailed pricing for a specific season"""
        return self.pricing_details.get(season_name, {})


class TourPackage(BaseModel):
    """
    Tour package variants with different pricing tiers
    """
    PACKAGE_TYPE_CHOICES = [
        ('STANDARD', 'Standard'),
        ('PREMIUM', 'Premium'),
        ('LUXURY', 'Luxury'),
    ]

    tour = models.ForeignKey(
        Tour, 
        related_name='packages', 
        on_delete=models.CASCADE
    )
    name = models.CharField(max_length=100)
    price_modifier = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=0,
        help_text="Additional cost over base tour price"
    )
    max_participants = models.PositiveIntegerField(
        validators=[MinValueValidator(1)]
    )
    additional_inclusions = models.JSONField(
        default=list,
        blank=True,
        help_text="Additional services included in this package"
    )
    package_type = models.CharField(
        max_length=10,
        choices=PACKAGE_TYPE_CHOICES,
        default='STANDARD'
    )
    is_available = models.BooleanField(default=True)

    class Meta:
        db_table = 'tours_tourpackage'
        ordering = ['price_modifier']
        verbose_name = 'Tour Package'
        verbose_name_plural = 'Tour Packages'
        unique_together = ['tour', 'name']

    def __str__(self):
        return f"{self.tour.name} - {self.name}"

    @property
    def total_price(self):
        """Calculate total price including tour's minimum seasonal price and modifier"""
        tour_price = self.tour.get_current_price()
        return tour_price + self.price_modifier

    @property
    def available_capacity(self):
        """Calculate available capacity for this package"""
        from apps.bookings.models import Booking
        confirmed_bookings = Booking.objects.filter(
            package=self,
            status='CONFIRMED'
        ).aggregate(
            total_participants=models.Sum('travelers_count')
        )['total_participants'] or 0
        
        return max(0, self.max_participants - confirmed_bookings)


class Hotel(BaseModel):
    """
    Hotel information for destinations
    """
    destination = models.ForeignKey(
        Destination, 
        related_name='hotels', 
        on_delete=models.CASCADE
    )
    name = models.CharField(max_length=250)
    address = models.TextField(blank=True)
    image = models.ImageField(
        upload_to='hotels/', 
        null=True, 
        blank=True
    )
    hotel_type = models.CharField(max_length=50, blank=True)
    star_rating = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'tours_hotel'
        ordering = ['name']
        verbose_name = 'Hotel'
        verbose_name_plural = 'Hotels'

    def __str__(self):
        return f"{self.name} ({self.destination.name})"


class RoomType(BaseModel):
    """
    Specific room types for hotels (Deluxe, Suite, etc.)
    """
    hotel = models.ForeignKey(
        Hotel,
        related_name='room_types',
        on_delete=models.CASCADE
    )
    name = models.CharField(max_length=100)  # e.g., Deluxe, Super Deluxe, Suite
    capacity = models.PositiveIntegerField(default=2)
    price_modifier = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Additional cost per night for this room type"
    )
    description = models.TextField(blank=True)
    
    class Meta:
        db_table = 'tours_roomtype'
        verbose_name = 'Room Type'
        verbose_name_plural = 'Room Types'

    def __str__(self):
        return f"{self.name} - {self.hotel.name}"


class Vehicle(BaseModel):
    """
    Vehicle information for tours
    """
    vehicle_no = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=200, blank=True)
    capacity = models.PositiveIntegerField(default=1)
    vehicle_type = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'tours_vehicle'
        ordering = ['name']
        verbose_name = 'Vehicle'
        verbose_name_plural = 'Vehicles'

    def __str__(self):
        return f"{self.name} - {self.vehicle_no}"


class Offer(BaseModel):
    """
    Special offers and discounts for tours
    """
    DISCOUNT_TYPE_CHOICES = [
        ('PERCENTAGE', 'Percentage'),
        ('FIXED_AMOUNT', 'Fixed Amount'),
    ]
    
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    discount_type = models.CharField(
        max_length=15,
        choices=DISCOUNT_TYPE_CHOICES,
        default='PERCENTAGE',
        help_text="Type of discount: percentage or fixed amount"
    )
    discount_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Enter percentage value (e.g., 10 for 10%)",
        null=True,
        blank=True
    )
    discount_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text="Enter fixed discount amount (e.g., 500 for ₹500 off)",
        null=True,
        blank=True
    )
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=True)
    applicable_tours = models.ManyToManyField(
        Tour,
        related_name='offers',
        blank=True
    )

    class Meta:
        db_table = 'tours_offer'
        ordering = ['-start_date']
        verbose_name = 'Offer'
        verbose_name_plural = 'Offers'

    def clean(self):
        """Validate that appropriate discount field is set based on discount_type"""
        from django.core.exceptions import ValidationError
        
        if self.discount_type == 'PERCENTAGE':
            if not self.discount_percentage:
                raise ValidationError({'discount_percentage': 'Discount percentage is required for percentage-based offers.'})
            if self.discount_amount:
                raise ValidationError({'discount_amount': 'Discount amount should not be set for percentage-based offers.'})
        elif self.discount_type == 'FIXED_AMOUNT':
            if not self.discount_amount:
                raise ValidationError({'discount_amount': 'Discount amount is required for fixed amount offers.'})
            if self.discount_percentage:
                raise ValidationError({'discount_percentage': 'Discount percentage should not be set for fixed amount offers.'})

    def save(self, *args, **kwargs):
        """Override save to run clean validation"""
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        if self.discount_type == 'PERCENTAGE':
            return f"{self.name} - {self.discount_percentage}%"
        else:
            return f"{self.name} - ₹{self.discount_amount}"

    @property
    def is_valid(self):
        """Check if offer is currently valid"""
        from django.utils import timezone
        today = timezone.now().date()
        return self.is_active and self.start_date <= today <= self.end_date

    @property
    def discount_display(self):
        """Get formatted discount display"""
        if self.discount_type == 'PERCENTAGE':
            return f"{self.discount_percentage}%"
        else:
            return f"₹{self.discount_amount}"

    def calculate_discounted_price(self, original_price):
        """Calculate discounted price based on discount type"""
        if not self.is_valid:
            return original_price
            
        if self.discount_type == 'PERCENTAGE':
            discount_amount = (original_price * self.discount_percentage) / 100
            return max(0, original_price - discount_amount)
        else:  # FIXED_AMOUNT
            return max(0, original_price - self.discount_amount)

    def get_discount_amount(self, original_price):
        """Get the actual discount amount for a given price"""
        if not self.is_valid:
            return 0
            
        if self.discount_type == 'PERCENTAGE':
            return (original_price * self.discount_percentage) / 100
        else:  # FIXED_AMOUNT
            return min(self.discount_amount, original_price)  # Don't exceed original price


class HotelPricingConfig(BaseModel):
    """
    Hotel registry for custom quotations — independent of tour management Hotel model.
    Admin adds hotel name, location, tier, room type, and pricing here.
    Customer-facing Customization page fetches hotels from this table.
    """
    ROOM_TYPE_CHOICES = [
        ('single', 'Single Occupancy'),
        ('double', 'Double Sharing'),
        ('triple', 'Triple Sharing'),
    ]

    hotel_name = models.CharField(
        max_length=200,
        help_text="Display name of the hotel (e.g. 'Hotel Taj Palace')",
        default=''
    )
    hotel_tier = models.CharField(max_length=50, help_text="e.g. budget, 3-star, 4-star, 5-star, resort, homestay, boutique, heritage")
    room_type = models.CharField(max_length=20, choices=ROOM_TYPE_CHOICES, default='Doublesharing')
    location = models.CharField(
        max_length=200,
        help_text="City/location of the hotel (e.g. 'Goa', 'Manali', 'Paris')",
        default=''
    )
    price_per_night = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    description = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'tours_hotelpricingconfig'
        verbose_name = 'Hotel Pricing Config'
        verbose_name_plural = 'Hotel Pricing Configs'
        ordering = ['location', 'hotel_tier', 'hotel_name']

    def __str__(self):
        return f"{self.hotel_name} ({self.hotel_tier}, {self.get_room_type_display()}) — {self.location} — ₹{self.price_per_night}/night"


class CarPricingConfig(BaseModel):
    """
    Pricing configuration for car travel per km in custom quotations
    """
    price_per_km = models.DecimalField(max_digits=8, decimal_places=2, validators=[MinValueValidator(0)])
    description = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'tours_carpricingconfig'
        verbose_name = 'Car Pricing Config'
        verbose_name_plural = 'Car Pricing Configs'

    def __str__(self):
        return f"Car Rate - ₹{self.price_per_km}/km"


class CustomPackage(BaseModel):
    """
    Custom package requests from customers
    """
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('PROCESSING', 'Processing'),
        ('QUOTED', 'Quoted'),
        ('CONFIRMED', 'Confirmed'),
        ('CANCELLED', 'Cancelled'),
    ]

    BUDGET_CHOICES = [
        ('under-25000', 'Under ₹25,000'),
        ('25000-50000', '₹25,000 - ₹50,000'),
        ('50000-100000', '₹50,000 - ₹1,00,000'),
        ('100000-200000', '₹1,00,000 - ₹2,00,000'),
        ('above-200000', 'Above ₹2,00,000'),
        ('200000-500000', '₹2,00,000 - ₹5,00,000'),
        ('above-500000', 'Above ₹5,00,000'),
    ]

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='custom_packages',
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    # Store customer details for anonymous submissions
    customer_name = models.CharField(max_length=100, blank=True)
    customer_email = models.EmailField(blank=True)
    contact_number = models.CharField(max_length=30)
    from_city = models.CharField(max_length=100, blank=True)
    destination = models.CharField(max_length=100)
    duration = models.CharField(max_length=50)
    total_nights = models.PositiveIntegerField(default=1)
    start_date = models.DateField()
    participants_count = models.PositiveIntegerField()
    hotel_preference = models.CharField(max_length=100, blank=True) # Luxury, Budget etc
    room_type = models.CharField(max_length=100, blank=True) # Double, Single, etc
    transportation_choice = models.CharField(
        max_length=50, 
        blank=True,
        help_text="Car, Train, Flight, etc."
    )
    package_type = models.CharField(max_length=50, blank=True)
    special_requirements = models.TextField(blank=True)
    budget_range = models.CharField(
        max_length=20,
        choices=BUDGET_CHOICES,
        blank=True
    )
    detailed_itinerary = models.JSONField(
        blank=True,
        null=True,
        help_text="Detailed customization data including destinations, activities, and preferences"
    )
    traveler_details = models.JSONField(
        default=list,
        blank=True,
        help_text="List of traveler details: [{'name': 'John Doe', 'age': 30, 'gender': 'Male'}, ...]"
    )
    status = models.CharField(
        max_length=15,
        choices=STATUS_CHOICES,
        default='PENDING'
    )
    admin_notes = models.TextField(blank=True)
    admin_response = models.TextField(
        blank=True,
        help_text="Admin response to the custom package request"
    )
    
    # New Fields for automated quotation system
    admin_kms_distance = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Total kms entered by admin when transport = car"
    )
    admin_direct_travel_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Direct travel cost entered when transport = flight/train/bus"
    )
    admin_confirmed_hotel_tier = models.CharField(
        max_length=50, null=True, blank=True,
        help_text="Hotel tier admin confirms"
    )
    admin_confirmed_room_type = models.CharField(
        max_length=50, null=True, blank=True,
        help_text="Room type admin confirms"
    )
    hotel_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    travel_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    base_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    margin_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="base_cost × 0.20 — stored for audit trail"
    )
    final_quoted_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="base_cost × 1.20 — shown to customer (Replaces original quoted_price logic)"
    )
    quotation_breakdown = models.JSONField(
        null=True, blank=True,
        help_text="Full JSON with all calculation steps — stored permanently"
    )
    quotation_generated_at = models.DateTimeField(null=True, blank=True)
    
    # Legacy field
    quoted_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Legacy field, now superseded generally by final_quoted_price"
    )
    customer_response = models.CharField(
        max_length=20,
        choices=[
            ('PENDING', 'Pending'),
            ('ACCEPTED', 'Accepted'),
            ('REJECTED', 'Rejected'),
        ],
        default='PENDING',
        help_text="Customer response to admin quote"
    )
    customer_response_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When customer responded to the quote"
    )

    class Meta:
        db_table = 'tours_custompackage'
        ordering = ['-created_at']
        verbose_name = 'Custom Package'
        verbose_name_plural = 'Custom Packages'

    def __str__(self):
        if self.customer:
            return f"Custom Package #{self.id} by {self.customer.email}"
        elif self.customer_email:
            return f"Custom Package #{self.id} by {self.customer_email}"
        else:
            return f"Custom Package #{self.id} (Anonymous)"

    @property
    def customer_display_name(self):
        """Get customer display name"""
        if self.customer:
            return self.customer.get_full_name() or self.customer.username
        return self.customer_name or "Anonymous"

    @property
    def customer_display_email(self):
        """Get customer display email"""
        if self.customer:
            return self.customer.email
        return self.customer_email or "N/A"


class Inquiry(BaseModel):
    """
    General inquiries about tours
    """
    STATUS_CHOICES = [
        ('NEW', 'New'),
        ('RESPONDED', 'Responded'),
        ('CLOSED', 'Closed'),
    ]

    tour = models.ForeignKey(
        Tour,
        related_name='inquiries',
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='inquiries',
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    name = models.CharField(max_length=100)
    email = models.EmailField()
    contact_number = models.CharField(max_length=30)
    inquiry_date = models.DateField()
    message = models.TextField()
    status = models.CharField(
        max_length=15,
        choices=STATUS_CHOICES,
        default='NEW'
    )
    admin_response = models.TextField(blank=True)
    # Field to track anonymous inquiries for abandoned cart-like flow
    anonymous_token = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text="Token to identify anonymous inquiries before user login"
    )

    class Meta:
        db_table = 'tours_inquiry'
        ordering = ['-created_at']
        verbose_name = 'Inquiry'
        verbose_name_plural = 'Inquiries'

    def __str__(self):
        return f"Inquiry #{self.id} by {self.name}"
