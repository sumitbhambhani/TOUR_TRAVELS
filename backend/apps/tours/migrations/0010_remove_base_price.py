# Generated migration to remove base_price field from Tour model
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('tours', '0009_add_traveler_details_to_custom_package'),
    ]

    operations = [
        # Remove index on base_price
        migrations.RemoveIndex(
            model_name='tour',
            name='tours_tour_base_pr_96cfee_idx',
        ),
        # Remove base_price field
        migrations.RemoveField(
            model_name='tour',
            name='base_price',
        ),
    ]
