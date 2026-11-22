from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tours', '0003_inquiry_anonymous_token'),
    ]

    operations = [
        migrations.AddField(
            model_name='tour',
            name='brochure',
            field=models.FileField(blank=True, help_text='Upload PDF brochure for this tour', null=True, upload_to='tours/brochures/'),
        ),
    ]

