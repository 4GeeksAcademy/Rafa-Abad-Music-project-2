from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0348ce5769fe'
down_revision = 'aa1c1d81e498'
branch_labels = None
depends_on = None

def has_column(bind, table_name, column_name):
    insp = sa.inspect(bind)
    cols = [c['name'] for c in insp.get_columns(table_name)]
    return column_name in cols

def upgrade():
    bind = op.get_bind()

    # ---- matches: add rate, chatApproved (guard if already added) ----
    with op.batch_alter_table('matches', schema=None) as batch_op:
        if not has_column(bind, 'matches', 'rate'):
            batch_op.add_column(sa.Column('rate', sa.Numeric(10, 2), nullable=True))
        if not has_column(bind, 'matches', 'chatApproved'):
            batch_op.add_column(sa.Column('chatApproved', sa.Boolean(), nullable=False, server_default=sa.false()))
    # drop the server_default after setting existing rows
    with op.batch_alter_table('matches', schema=None) as batch_op:
        batch_op.alter_column('chatApproved', server_default=None)

    # ---- offers: add acceptedPerformerId + named FK (guard column) ----
    with op.batch_alter_table('offers', schema=None) as batch_op:
        if not has_column(bind, 'offers', 'acceptedPerformerId'):
            batch_op.add_column(sa.Column('acceptedPerformerId', sa.Integer(), nullable=True))
        # name the FK explicitly to avoid "Constraint must have a name"
        # (if it already exists, SQLite will ignore duplicate; most dev DBs are fine)
        batch_op.create_foreign_key(
            'fk_offers_accepted_performer',  # FK name
            'user',                          # referent table
            ['acceptedPerformerId'],         # local cols
            ['userId']                       # remote cols
        )

def downgrade():
    # Reverse order safely; guard if columns/FK exist
    bind = op.get_bind()
    with op.batch_alter_table('offers', schema=None) as batch_op:
        # Drop FK if present (some SQLite builds may no-op)
        try:
            batch_op.drop_constraint('fk_offers_accepted_performer', type_='foreignkey')
        except Exception:
            pass
        if has_column(bind, 'offers', 'acceptedPerformerId'):
            batch_op.drop_column('acceptedPerformerId')

    with op.batch_alter_table('matches', schema=None) as batch_op:
        if has_column(bind, 'matches', 'chatApproved'):
            batch_op.drop_column('chatApproved')
        if has_column(bind, 'matches', 'rate'):
            batch_op.drop_column('rate')
