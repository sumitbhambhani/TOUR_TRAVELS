from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('tours', '0004_tour_brochure'),
        ('bookings', '0006_booking_applied_offer_id_booking_base_amount_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='booking',
            name='tour',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='bookings', to='tours.tour'),
        ),
    ]

