# -*- coding: utf-8 -*-
# Generated by Django 1.11 on 2017-05-23 04:59
from __future__ import unicode_literals

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import grapher_admin.models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0008_alter_user_username_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='User',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('password', models.CharField(max_length=128, verbose_name='password')),
                ('last_login', models.DateTimeField(blank=True, null=True, verbose_name='last login')),
                ('is_superuser', models.BooleanField(default=False, help_text='Designates that this user has all permissions without explicitly assigning them.', verbose_name='superuser status')),
                ('email', models.EmailField(max_length=255, unique=True)),
                ('name', models.CharField(max_length=255, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_active', models.BooleanField(default=True)),
                ('groups', models.ManyToManyField(blank=True, help_text='The groups this user belongs to. A user will get all permissions granted to each of their groups.', related_name='user_set', related_query_name='user', to='auth.Group', verbose_name='groups')),
                ('user_permissions', models.ManyToManyField(blank=True, help_text='Specific permissions for this user.', related_name='user_set', related_query_name='user', to='auth.Permission', verbose_name='user permissions')),
            ],
            options={
                'db_table': 'users',
            },
            managers=[
                ('objects', grapher_admin.models.UserManager()),
            ],
        ),
        migrations.CreateModel(
            name='Chart',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('config', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('last_edited_at', models.DateTimeField(auto_now=True)),
                ('origin_url', models.CharField(max_length=255)),
                ('notes', models.TextField()),
                ('slug', models.CharField(blank=True, max_length=255, null=True)),
                ('published', models.BooleanField(default=None)),
                ('starred', models.BooleanField(default=False)),
                ('type', models.CharField(blank=True, choices=[('LineChart', 'Line chart'), ('ScatterPlot', 'Scatter plot'), ('StackedArea', 'Stacked area'), ('MultiBar', 'Multi bar'), ('HorizontalMultiBar', 'Horizontal Multi bar'), ('DiscreteBar', 'Discrete bar'), ('SlopeChart', 'Slope chart')], max_length=255, null=True)),
                ('last_edited_by', models.ForeignKey(blank=True, db_column='last_edited_by', null=True, on_delete=django.db.models.deletion.DO_NOTHING, to=settings.AUTH_USER_MODEL, to_field='name')),
            ],
            options={
                'db_table': 'charts',
            },
        ),
        migrations.CreateModel(
            name='ChartDimension',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order', models.IntegerField()),
                ('property', models.CharField(max_length=255)),
                ('unit', models.CharField(max_length=255)),
                ('displayName', models.CharField(db_column='displayName', max_length=255)),
                ('targetYear', models.IntegerField(blank=True, db_column='targetYear', null=True)),
                ('isProjection', models.BooleanField(default=False)),
                ('tolerance', models.IntegerField(blank=True, default=5)),
                ('color', models.CharField(max_length=255)),
                ('chartId', models.ForeignKey(db_column='chartId', on_delete=django.db.models.deletion.CASCADE, to='grapher_admin.Chart')),
            ],
            options={
                'db_table': 'chart_dimensions',
            },
        ),
        migrations.CreateModel(
            name='ChartSlugRedirect',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slug', models.CharField(max_length=255, unique=True)),
                ('chart_id', models.IntegerField()),
            ],
            options={
                'db_table': 'chart_slug_redirects',
            },
        ),
        migrations.CreateModel(
            name='Dataset',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('description', models.CharField(max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('namespace', models.CharField(default='owid', max_length=255)),
            ],
            options={
                'db_table': 'datasets',
            },
        ),
        migrations.CreateModel(
            name='DatasetCategory',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'dataset_categories',
            },
        ),
        migrations.CreateModel(
            name='DatasetSubcategory',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('fk_dst_cat_id', models.ForeignKey(blank=True, db_column='fk_dst_cat_id', null=True, on_delete=django.db.models.deletion.DO_NOTHING, to='grapher_admin.DatasetCategory')),
            ],
            options={
                'db_table': 'dataset_subcategories',
            },
        ),
        migrations.CreateModel(
            name='DataValue',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('value', models.CharField(max_length=255)),
                ('year', models.IntegerField()),
            ],
            options={
                'db_table': 'data_values',
            },
        ),
        migrations.CreateModel(
            name='Entity',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(blank=True, max_length=255, null=True, unique=True)),
                ('name', models.CharField(max_length=255, unique=True)),
                ('validated', models.BooleanField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('displayName', models.CharField(db_column='displayName', max_length=255)),
            ],
            options={
                'db_table': 'entities',
            },
        ),
        migrations.CreateModel(
            name='InputFile',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('raw_data', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('fk_user_id', models.ForeignKey(db_column='fk_user_id', on_delete=django.db.models.deletion.DO_NOTHING, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'input_files',
            },
        ),
        migrations.CreateModel(
            name='License',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('description', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'licenses',
            },
        ),
        migrations.CreateModel(
            name='Logo',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('svg', models.TextField()),
            ],
            options={
                'db_table': 'logos',
            },
        ),
        migrations.CreateModel(
            name='PasswordReset',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.CharField(max_length=255)),
                ('token', models.CharField(max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'password_resets',
            },
        ),
        migrations.CreateModel(
            name='Setting',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('meta_name', models.CharField(max_length=255)),
                ('meta_value', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'settings',
            },
        ),
        migrations.CreateModel(
            name='Source',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('description', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('datasetId', models.IntegerField(blank=True, db_column='datasetId', null=True)),
            ],
            options={
                'db_table': 'sources',
            },
        ),
        migrations.CreateModel(
            name='UserInvitation',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=255)),
                ('email', models.CharField(max_length=255)),
                ('status', models.CharField(choices=[('pending', 'pending'), ('successful', 'successful'), ('canceled', 'canceled'), ('expired', 'expired')], max_length=10)),
                ('valid_till', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user_id', models.ForeignKey(db_column='user_id', on_delete=django.db.models.deletion.DO_NOTHING, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'user_invitations',
            },
        ),
        migrations.CreateModel(
            name='Variable',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('unit', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('code', models.CharField(blank=True, max_length=255, null=True)),
                ('coverage', models.CharField(max_length=255)),
                ('timespan', models.CharField(max_length=255)),
                ('fk_dst_id', models.ForeignKey(db_column='fk_dst_id', on_delete=django.db.models.deletion.CASCADE, to='grapher_admin.Dataset')),
            ],
            options={
                'db_table': 'variables',
            },
        ),
        migrations.CreateModel(
            name='VariableType',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('isSortable', models.BooleanField(db_column='isSortable', default=False)),
            ],
            options={
                'db_table': 'variable_types',
            },
        ),
        migrations.AddField(
            model_name='variable',
            name='fk_var_type_id',
            field=models.ForeignKey(db_column='fk_var_type_id', on_delete=django.db.models.deletion.DO_NOTHING, to='grapher_admin.VariableType'),
        ),
        migrations.AddField(
            model_name='variable',
            name='sourceId',
            field=models.ForeignKey(db_column='sourceId', on_delete=django.db.models.deletion.DO_NOTHING, to='grapher_admin.Source'),
        ),
        migrations.AddField(
            model_name='variable',
            name='uploaded_by',
            field=models.ForeignKey(blank=True, db_column='uploaded_by', null=True, on_delete=django.db.models.deletion.DO_NOTHING, to=settings.AUTH_USER_MODEL, to_field='name'),
        ),
        migrations.AlterUniqueTogether(
            name='source',
            unique_together=set([('name', 'datasetId')]),
        ),
        migrations.AddField(
            model_name='datavalue',
            name='fk_ent_id',
            field=models.ForeignKey(blank=True, db_column='fk_ent_id', null=True, on_delete=django.db.models.deletion.DO_NOTHING, to='grapher_admin.Entity'),
        ),
        migrations.AddField(
            model_name='datavalue',
            name='fk_var_id',
            field=models.ForeignKey(db_column='fk_var_id', on_delete=django.db.models.deletion.CASCADE, to='grapher_admin.Variable'),
        ),
        migrations.AddField(
            model_name='dataset',
            name='fk_dst_cat_id',
            field=models.ForeignKey(blank=True, db_column='fk_dst_cat_id', null=True, on_delete=django.db.models.deletion.DO_NOTHING, to='grapher_admin.DatasetCategory'),
        ),
        migrations.AddField(
            model_name='dataset',
            name='fk_dst_subcat_id',
            field=models.ForeignKey(blank=True, db_column='fk_dst_subcat_id', null=True, on_delete=django.db.models.deletion.DO_NOTHING, to='grapher_admin.DatasetSubcategory'),
        ),
        migrations.AddField(
            model_name='chartdimension',
            name='variableId',
            field=models.ForeignKey(db_column='variableId', on_delete=django.db.models.deletion.DO_NOTHING, to='grapher_admin.Variable'),
        ),
        migrations.AlterUniqueTogether(
            name='variable',
            unique_together=set([('name', 'fk_dst_id'), ('code', 'fk_dst_id')]),
        ),
        migrations.AlterUniqueTogether(
            name='datavalue',
            unique_together=set([('fk_ent_id', 'fk_var_id', 'year')]),
        ),
        migrations.AlterUniqueTogether(
            name='datasetsubcategory',
            unique_together=set([('name', 'fk_dst_cat_id')]),
        ),
        migrations.AlterUniqueTogether(
            name='dataset',
            unique_together=set([('name', 'namespace')]),
        ),
        migrations.AlterUniqueTogether(
            name='chart',
            unique_together=set([('slug', 'published')]),
        ),
    ]