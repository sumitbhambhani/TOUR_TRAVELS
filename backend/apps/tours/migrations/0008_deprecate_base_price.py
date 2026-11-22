# Generated migration to deprecate base_price field
# Run: python manage.py migrate tours

from django.db import migrations


def ensure_seasonal_pricing(apps, schema_editor):
    """
    Ensure all tours have seasonal pricing.
    Log tours that don't have seasonal pricing for manual review.
    """
    Tour = apps.get_model('tours', 'Tour')
    TourPricing = apps.get_model('tours', 'TourPricing')
    
    tours_without_pricing = []
    
    for tour in Tour.objects.all():
        pricing_count = TourPricing.objects.filter(tour=tour).count()
        if pricing_count == 0:
            tours_without_pricing.append(f"Tour ID {tour.id}: {tour.name}")
    
    if tours_without_pricing:
        print("\n" + "="*80)
        print("WARNING: The following tours do not have seasonal pricing:")
        print("="*80)
        for tour_info in tours_without_pricing:
            print(f"  - {tour_info}")
        print("\nPlease add seasonal pricing for these tours in the admin panel.")
        print("Tours without seasonal pricing will not be bookable.")
        print("="*80 + "\n")


class Migration(migrations.Migration):

    dependencies = [
        ('tours', '0004_tour_brochure'),  # Updated to actual latest migration
    ]

    operations = [
        migrations.RunPython(ensure_seasonal_pricing, reverse_code=migrations.RunPython.noop),
    ]
