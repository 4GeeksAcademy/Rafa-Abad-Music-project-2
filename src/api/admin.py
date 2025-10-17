import os
from flask_admin import Admin
from flask_admin.contrib.sqla import ModelView
from .models import db, User

def setup_admin(app):
    """
    Make admin setup idempotent (safe to call once even with reloader).
    """
    # If already registered (e.g., by the reloader), do nothing
    if 'admin' in app.blueprints:
        return app.blueprints['admin']

    app.secret_key = os.environ.get('FLASK_APP_KEY', 'sample key')
    app.config['FLASK_ADMIN_SWATCH'] = 'cerulean'

    # Give explicit endpoint/url so there are no accidental name clashes
    admin = Admin(
        app,
        name='4Geeks Admin',
        template_mode='bootstrap3',
        endpoint='admin',
        url='/admin'
    )

    # Add your models here
    admin.add_view(ModelView(User, db.session))

    return admin
