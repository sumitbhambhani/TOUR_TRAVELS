import random
import datetime
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.text import slugify
from apps.tours.models import (
    Destination, DestinationImage, Hotel, RoomType, Vehicle, Tour, TourPackage, 
    Season, TourPricing, TourItinerary, Offer, CustomPackage, Inquiry
)
from apps.bookings.models import Booking
from apps.payments.models import Payment, Refund, Invoice
from apps.reviews.models import Review

User = get_user_model()

class Command(BaseCommand):
    help = 'Seeds database with comprehensive dummy data for tours system'

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('Starting database seeding...'))
        
        # ==================== 1. CREATE USERS ====================
        self.stdout.write('Creating users...')
        User.objects.filter(role='ADMIN').delete()
        
        admin, _ = User.objects.get_or_create(
            email='sujaljain984@gmail.com',
            defaults={
                'username': 'sujaljain',
                'first_name': 'Sujal',
                'last_name': 'Jain',
                'is_staff': True,
                'is_superuser': True,
                'role': 'ADMIN'
            }
        )
        admin.set_password('admin123')
        admin.save()
        self.stdout.write(f'✓ Admin: {admin.email}')

        customers_data = [
            ('john.doe@example.com', 'john_doe', 'John', 'Doe'),
            ('jane.smith@example.com', 'jane_smith', 'Jane', 'Smith'),
            ('robert.wilson@example.com', 'robert_wilson', 'Robert', 'Wilson'),
            ('emily.brown@example.com', 'emily_brown', 'Emily', 'Brown'),
            ('michael.davis@example.com', 'michael_davis', 'Michael', 'Davis'),
            ('sarah.johnson@example.com', 'sarah_johnson', 'Sarah', 'Johnson'),
        ]
        
        customers = []
        for email, username, fname, lname in customers_data:
            user, _ = User.objects.get_or_create(
                email=email,
                defaults={'username': username, 'first_name': fname, 'last_name': lname, 'role': 'CUSTOMER'}
            )
            user.set_password('password123')
            user.save()
            customers.append(user)
        self.stdout.write(f'✓ {len(customers)} customers')

        # ==================== 2. DESTINATIONS ====================
        self.stdout.write('Creating destinations...')
        destinations_data = [
            {'name': 'Manali', 'desc': 'Himalayan resort town with snow-capped mountains', 
             'places': 'Rohtang Pass, Solang Valley, Hadimba Temple', 'country': 'India'},
            {'name': 'Goa', 'desc': 'Beaches, Portuguese heritage, vibrant nightlife', 
             'places': 'Baga Beach, Fort Aguada, Basilica of Bom Jesus', 'country': 'India'},
            {'name': 'Sikkim', 'desc': 'Himalayan landscapes and Buddhist monasteries', 
             'places': 'Tsomgo Lake, Nathula Pass, Rumtek Monastery', 'country': 'India'},
            {'name': 'Kerala', 'desc': 'Backwaters, beaches, Ayurvedic treatments', 
             'places': 'Alleppey, Munnar, Thekkady Wildlife', 'country': 'India'},
            {'name': 'Rajasthan', 'desc': 'Forts, palaces, desert landscapes', 
             'places': 'Jaipur, Udaipur, Jaisalmer Fort', 'country': 'India'},
            {'name': 'Ladakh', 'desc': 'High passes and mountain landscapes', 
             'places': 'Pangong Lake, Nubra Valley, Khardung La', 'country': 'India'},
            {'name': 'Dubai', 'desc': 'Luxury shopping and modern architecture', 
             'places': 'Burj Khalifa, Dubai Mall, Palm Jumeirah', 'country': 'UAE'},
            {'name': 'Bali', 'desc': 'Rice paddies, beaches, coral reefs', 
             'places': 'Ubud, Tanah Lot Temple, Seminyak Beach', 'country': 'Indonesia'},
        ]
        
        destinations = []
        for d in destinations_data:
            dest, _ = Destination.objects.get_or_create(
                name=d['name'],
                defaults={'slug': slugify(d['name']), 'description': d['desc'], 
                         'places': d['places'], 'country': d['country'], 'is_active': True}
            )
            destinations.append(dest)
            for i in range(2):
                DestinationImage.objects.get_or_create(
                    destination=dest, caption=f'{dest.name} View {i+1}',
                    defaults={'is_featured': i == 0}
                )
        self.stdout.write(f'✓ {len(destinations)} destinations')

        # ==================== 3. HOTELS ====================
        self.stdout.write('Creating hotels...')
        hotels = []
        for dest in destinations:
            for i in range(2):
                hotel, _ = Hotel.objects.get_or_create(
                    name=f'{dest.name} Resort {i+1}',
                    destination=dest,
                    defaults={'address': f'{random.randint(1,999)} Main Road, {dest.name}',
                             'star_rating': random.choice([3,4,5]), 'hotel_type': 'Resort', 'is_active': True}
                )
                hotels.append(hotel)
                for room_name, cap, mod in [('Deluxe', 2, '0'), ('Suite', 3, '3000')]:
                    RoomType.objects.get_or_create(
                        hotel=hotel, name=room_name,
                        defaults={'capacity': cap, 'price_modifier': Decimal(mod)}
                    )
        self.stdout.write(f'✓ {len(hotels)} hotels')

        # ==================== 4. VEHICLES ====================
        self.stdout.write('Creating vehicles...')
        vehicles_data = [
            ('DL-01-1234', 'Toyota Innova', 7, 'SUV'),
            ('MH-02-5678', 'Mahindra Scorpio', 7, 'SUV'),
            ('KA-03-9012', 'Toyota Fortuner', 7, 'SUV'),
            ('RJ-04-3456', 'Honda City', 4, 'Sedan'),
        ]
        vehicles = []
        for v_no, v_name, cap, v_type in vehicles_data:
            vehicle, _ = Vehicle.objects.get_or_create(
                vehicle_no=v_no,
                defaults={'name': v_name, 'capacity': cap, 'vehicle_type': v_type, 'is_active': True}
            )
            vehicles.append(vehicle)
        self.stdout.write(f'✓ {len(vehicles)} vehicles')

        # ==================== 5. SEASONS ====================
        self.stdout.write('Creating seasons...')
        seasons_data = [
            {'name': 'Summer', 'sm': 4, 'em': 6, 'sd': '2025-04-01', 'ed': '2025-06-30'},
            {'name': 'Monsoon', 'sm': 7, 'em': 9, 'sd': '2025-07-01', 'ed': '2025-09-30'},
            {'name': 'Winter', 'sm': 11, 'em': 2, 'sd': '2025-11-01', 'ed': '2026-02-28'},
            {'name': 'Peak', 'sm': 12, 'em': 1, 'sd': '2025-12-15', 'ed': '2026-01-15'},
        ]
        seasons = []
        for s in seasons_data:
            season, _ = Season.objects.get_or_create(
                name=s['name'],
                defaults={'start_month': s['sm'], 'end_month': s['em'], 
                         'start_date': s['sd'], 'end_date': s['ed'], 'is_active': True}
            )
            seasons.append(season)
        self.stdout.write(f'✓ {len(seasons)} seasons')

        # ==================== 6. TOURS ====================
        self.stdout.write('Creating tours...')
        tours_data = [
            {'name': 'Manali Adventure 5D/4N', 'dest': 'Manali', 'cat': 'ADVENTURE', 'days': 5, 'price': '18000',
             'desc': 'Paragliding, Rohtang Pass, Hadimba Temple, riverside stays'},
            {'name': 'Goa Beach Paradise 4D/3N', 'dest': 'Goa', 'cat': 'HONEYMOON', 'days': 4, 'price': '15000',
             'desc': 'Beaches, churches, sunset cruise, romantic getaway'},
            {'name': 'Sikkim Himalayan Tour 6D/5N', 'dest': 'Sikkim', 'cat': 'CULTURAL', 'days': 6, 'price': '22000',
             'desc': 'Gangtok, Tsomgo Lake, monasteries, mountain views'},
            {'name': 'Kerala Backwaters 5D/4N', 'dest': 'Kerala', 'cat': 'RELAXATION', 'days': 5, 'price': '20000',
             'desc': 'Houseboat, Munnar tea gardens, Ayurvedic spa'},
            {'name': 'Rajasthan Heritage 7D/6N', 'dest': 'Rajasthan', 'cat': 'CULTURAL', 'days': 7, 'price': '25000',
             'desc': 'Jaipur, Udaipur, Jaisalmer forts and palaces'},
            {'name': 'Ladakh Adventure 8D/7N', 'dest': 'Ladakh', 'cat': 'ADVENTURE', 'days': 8, 'price': '35000',
             'desc': 'Pangong Lake, Nubra Valley, high altitude passes'},
            {'name': 'Dubai Luxury 5D/4N', 'dest': 'Dubai', 'cat': 'BUSINESS', 'days': 5, 'price': '45000',
             'desc': 'Burj Khalifa, Dubai Mall, desert safari, luxury hotels'},
            {'name': 'Bali Island Escape 6D/5N', 'dest': 'Bali', 'cat': 'HONEYMOON', 'days': 6, 'price': '40000',
             'desc': 'Ubud rice terraces, temples, beaches, spa treatments'},
        ]
        
        tours = []
        for t in tours_data:
            dest = Destination.objects.get(name=t['dest'])
            tour_type = 'INTERNATIONAL' if dest.country != 'India' else 'DOMESTIC'
            
            tour, _ = Tour.objects.get_or_create(
                name=t['name'],
                defaults={
                    'slug': slugify(t['name']),
                    'description': t['desc'],
                    'duration_days': t['days'],
                    'primary_destination': dest,
                    'max_capacity': 15,
                    'child_price': Decimal(str(int(t['price']) // 2)),
                    'category': t['cat'],
                    'tour_type': tour_type,
                    'difficulty_level': 'MODERATE',
                    'is_active': True,
                    'available_dates': ['2026-04-15', '2026-05-01', '2026-06-10'],
                    'inclusions': ['Accommodation', 'Meals', 'Transport', 'Guide'],
                    'exclusions': ['Airfare', 'Personal expenses', 'Insurance'],
                    'hotel_details': {str(dest.id): {'hotel_name': f'{dest.name} Resort', 'hotel_type': '4-Star'}},
                    'vehicle_details': {'type': 'AC SUV', 'note': 'Private vehicle'},
                }
            )
            tour.destinations.add(dest)
            tours.append(tour)
            
            # Itinerary
            for day in range(1, t['days'] + 1):
                TourItinerary.objects.get_or_create(
                    tour=tour, day_number=day,
                    defaults={'title': f'Day {day} Activities', 
                             'description': f'Explore {dest.name} attractions on day {day}'}
                )
            
            # Seasonal Pricing
            for season in seasons:
                base = Decimal(t['price'])
                multiplier = Decimal('1.2') if season.name == 'Peak' else Decimal('1.0')
                TourPricing.objects.get_or_create(
                    tour=tour, season=season,
                    defaults={
                        'two_sharing_price': base * multiplier,
                        'three_sharing_price': base * multiplier * Decimal('0.9'),
                        'child_price': base * multiplier * Decimal('0.5'),
                        'price': base * multiplier,
                        'available_dates': ['05', '12', '19', '26'],
                        'includes_return_air': tour_type == 'INTERNATIONAL'
                    }
                )
            
            # Tour Packages
            for pkg_name, pkg_type, modifier in [('Standard', 'STANDARD', '0'), ('Premium', 'PREMIUM', '5000')]:
                TourPackage.objects.get_or_create(
                    tour=tour, name=pkg_name,
                    defaults={
                        'package_type': pkg_type,
                        'price_modifier': Decimal(modifier),
                        'max_participants': 10,
                        'is_available': True,
                        'additional_inclusions': ['Welcome drink', 'City tour'] if pkg_type == 'PREMIUM' else []
                    }
                )
        
        self.stdout.write(f'✓ {len(tours)} tours with itineraries, pricing, packages')

        # ==================== 7. OFFERS ====================
        self.stdout.write('Creating offers...')
        offers_data = [
            {'name': 'Early Bird 15%', 'type': 'PERCENTAGE', 'percent': '15', 'amount': None,
             'start': '2025-03-01', 'end': '2025-03-31'},
            {'name': 'Flat ₹5000 Off', 'type': 'FIXED_AMOUNT', 'percent': None, 'amount': '5000',
             'start': '2025-04-01', 'end': '2025-04-30'},
            {'name': 'Summer Special 20%', 'type': 'PERCENTAGE', 'percent': '20', 'amount': None,
             'start': '2025-05-01', 'end': '2025-06-30'},
        ]
        
        offers = []
        for o in offers_data:
            offer, _ = Offer.objects.get_or_create(
                name=o['name'],
                defaults={
                    'discount_type': o['type'],
                    'discount_percentage': Decimal(o['percent']) if o['percent'] else None,
                    'discount_amount': Decimal(o['amount']) if o['amount'] else None,
                    'start_date': o['start'],
                    'end_date': o['end'],
                    'is_active': True
                }
            )
            offer.applicable_tours.set(tours[:3])
            offers.append(offer)
        self.stdout.write(f'✓ {len(offers)} offers')

        # ==================== 8. BOOKINGS ====================
        self.stdout.write('Creating bookings...')
        bookings = []
        
        # Confirmed booking
        b1 = Booking.objects.create(
            user=customers[0], tour=tours[0], travelers_count=2,
            total_price=Decimal('36000'), base_amount=Decimal('36000'),
            status='CONFIRMED', travel_date=timezone.now().date() + datetime.timedelta(days=30),
            contact_number='+91-9876543210', emergency_contact='+91-9876543211',
            traveler_details=[
                {'name': 'John Doe', 'age': 30, 'gender': 'Male'},
                {'name': 'Jane Doe', 'age': 28, 'gender': 'Female'}
            ]
        )
        bookings.append(b1)
        
        # Pending booking
        b2 = Booking.objects.create(
            user=customers[1], tour=tours[1], travelers_count=1,
            total_price=Decimal('15000'), base_amount=Decimal('15000'),
            status='PENDING', travel_date=timezone.now().date() + datetime.timedelta(days=45),
            contact_number='+91-9876543220'
        )
        bookings.append(b2)
        
        # Completed booking
        b3 = Booking.objects.create(
            user=customers[2], tour=tours[2], travelers_count=3,
            total_price=Decimal('60000'), base_amount=Decimal('66000'), discount_amount=Decimal('6000'),
            applied_offer_id=str(offers[0].id),
            status='COMPLETED', travel_date=timezone.now().date() - datetime.timedelta(days=10),
            contact_number='+91-9876543230',
            traveler_details=[
                {'name': 'Robert Wilson', 'age': 35, 'gender': 'Male'},
                {'name': 'Mary Wilson', 'age': 32, 'gender': 'Female'},
                {'name': 'Tom Wilson', 'age': 8, 'gender': 'Male'}
            ]
        )
        bookings.append(b3)
        
        # Cancelled booking
        b4 = Booking.objects.create(
            user=customers[3], tour=tours[3], travelers_count=2,
            total_price=Decimal('40000'), base_amount=Decimal('40000'),
            status='CANCELLED', travel_date=timezone.now().date() + datetime.timedelta(days=60),
            contact_number='+91-9876543240',
            cancellation_reason='Change of plans'
        )
        bookings.append(b4)
        
        self.stdout.write(f'✓ {len(bookings)} bookings')

        # ==================== 9. PAYMENTS ====================
        self.stdout.write('Creating payments...')
        payments = []
        
        p1 = Payment.objects.create(
            booking=b1, amount=Decimal('36000'), payment_method='CREDIT_CARD',
            status='SUCCESS', transaction_id='TXN-2026-001',
            processed_at=timezone.now(), gateway_response={'status': 'success', 'ref': 'PAY001'}
        )
        payments.append(p1)
        
        p2 = Payment.objects.create(
            booking=b2, amount=Decimal('15000'), payment_method='UPI',
            status='PENDING', transaction_id='TXN-2026-002'
        )
        payments.append(p2)
        
        p3 = Payment.objects.create(
            booking=b3, amount=Decimal('60000'), payment_method='DEBIT_CARD',
            status='SUCCESS', transaction_id='TXN-2026-003',
            processed_at=timezone.now() - datetime.timedelta(days=15)
        )
        payments.append(p3)
        
        self.stdout.write(f'✓ {len(payments)} payments')

        # ==================== 10. INVOICES ====================
        self.stdout.write('Creating invoices...')
        invoices = []
        
        inv1 = Invoice.objects.create(
            booking=b1, amount=Decimal('36000'), tax_amount=Decimal('1800'),
            status='PAID', due_date=timezone.now().date()
        )
        invoices.append(inv1)
        
        inv2 = Invoice.objects.create(
            booking=b3, amount=Decimal('60000'), tax_amount=Decimal('3000'),
            status='PAID', due_date=timezone.now().date() - datetime.timedelta(days=15)
        )
        invoices.append(inv2)
        
        self.stdout.write(f'✓ {len(invoices)} invoices')

        # ==================== 11. REFUNDS ====================
        self.stdout.write('Creating refunds...')
        
        refund = Refund.objects.create(
            payment=p3, booking=b4, amount=Decimal('20000'),
            reason='Cancelled 15 days before travel', status='APPROVED',
            admin_notes='50% refund as per policy', processed_by=admin,
            processed_at=timezone.now()
        )
        self.stdout.write('✓ 1 refund')

        # ==================== 12. REVIEWS ====================
        self.stdout.write('Creating reviews...')
        reviews = []
        
        reviews_data = [
            (customers[2], tours[2], 5, 'Amazing experience! Highly recommended.', True),
            (customers[0], tours[0], 4, 'Great tour, well organized.', True),
            (customers[1], tours[1], 5, 'Perfect honeymoon destination!', True),
        ]
        
        for user, tour, rating, comment, verified in reviews_data:
            review, _ = Review.objects.get_or_create(
                user=user, tour=tour,
                defaults={'rating': rating, 'comment': comment, 'is_verified': verified}
            )
            reviews.append(review)
        
        self.stdout.write(f'✓ {len(reviews)} reviews')

        # ==================== 13. CUSTOM PACKAGES ====================
        self.stdout.write('Creating custom packages...')
        custom_packages = []
        
        cp1 = CustomPackage.objects.create(
            customer=customers[4], customer_name='Michael Davis',
            customer_email=customers[4].email, contact_number='+91-9876543250',
            from_city='Mumbai', destination='Kashmir', duration='7 Days / 6 Nights',
            total_nights=6, start_date=timezone.now().date() + datetime.timedelta(days=90),
            participants_count=4, hotel_preference='Luxury',
            room_type='Double', transportation_choice='Flight + Car',
            package_type='Honeymoon', budget_range='100000-200000',
            special_requirements='Need wheelchair accessible rooms',
            status='PENDING',
            traveler_details=[
                {'name': 'Michael Davis', 'age': 32, 'gender': 'Male'},
                {'name': 'Anna Davis', 'age': 30, 'gender': 'Female'}
            ]
        )
        custom_packages.append(cp1)
        
        cp2 = CustomPackage.objects.create(
            customer=customers[5], customer_name='Sarah Johnson',
            customer_email=customers[5].email, contact_number='+91-9876543260',
            from_city='Delhi', destination='Maldives', duration='5 Days / 4 Nights',
            total_nights=4, start_date=timezone.now().date() + datetime.timedelta(days=120),
            participants_count=2, hotel_preference='Premium',
            room_type='Suite', transportation_choice='Flight',
            package_type='Honeymoon', budget_range='above-200000',
            status='QUOTED', quoted_price=Decimal('250000'),
            admin_response='We have prepared a luxury package for you.',
            admin_notes='Contacted customer, sent detailed itinerary'
        )
        custom_packages.append(cp2)
        
        self.stdout.write(f'✓ {len(custom_packages)} custom packages')

        # ==================== 14. INQUIRIES ====================
        self.stdout.write('Creating inquiries...')
        inquiries = []
        
        inq1 = Inquiry.objects.create(
            tour=tours[0], customer=customers[0],
            name='John Doe', email=customers[0].email,
            contact_number='+91-9876543210',
            inquiry_date=timezone.now().date(),
            message='What is the best time to visit Manali?',
            status='RESPONDED',
            admin_response='Best time is March to June for pleasant weather.'
        )
        inquiries.append(inq1)
        
        inq2 = Inquiry.objects.create(
            tour=tours[4], customer=customers[3],
            name='Emily Brown', email=customers[3].email,
            contact_number='+91-9876543240',
            inquiry_date=timezone.now().date(),
            message='Do you provide vegetarian food options?',
            status='NEW'
        )
        inquiries.append(inq2)
        
        self.stdout.write(f'✓ {len(inquiries)} inquiries')

        # ==================== SUMMARY ====================
        self.stdout.write(self.style.SUCCESS('\n' + '='*60))
        self.stdout.write(self.style.SUCCESS('DATABASE SEEDING COMPLETED SUCCESSFULLY!'))
        self.stdout.write(self.style.SUCCESS('='*60))
        self.stdout.write(f'Users: 1 admin + {len(customers)} customers')
        self.stdout.write(f'Destinations: {len(destinations)} with images')
        self.stdout.write(f'Hotels: {len(hotels)} with room types')
        self.stdout.write(f'Vehicles: {len(vehicles)}')
        self.stdout.write(f'Seasons: {len(seasons)}')
        self.stdout.write(f'Tours: {len(tours)} with itineraries, pricing, packages')
        self.stdout.write(f'Offers: {len(offers)}')
        self.stdout.write(f'Bookings: {len(bookings)}')
        self.stdout.write(f'Payments: {len(payments)}')
        self.stdout.write(f'Invoices: {len(invoices)}')
        self.stdout.write(f'Refunds: 1')
        self.stdout.write(f'Reviews: {len(reviews)}')
        self.stdout.write(f'Custom Packages: {len(custom_packages)}')
        self.stdout.write(f'Inquiries: {len(inquiries)}')
        self.stdout.write(self.style.SUCCESS('='*60))
        self.stdout.write(self.style.SUCCESS('\nLogin Credentials:'))
        self.stdout.write(f'Admin: sujaljain984@gmail.com / admin123')
        self.stdout.write(f'Customer: john.doe@example.com / password123')
        self.stdout.write(self.style.SUCCESS('='*60))
