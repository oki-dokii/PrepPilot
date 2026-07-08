"""add cohorts and anticheat columns

Revision ID: b3f9c2a_cohorts
Revises: 4281f0e775da
Create Date: 2026-07-09

"""
from alembic import op
import sqlalchemy as sa

revision = 'b3f9c2a_cohorts'
down_revision = '4281f0e775da'
branch_labels = None
depends_on = None


def upgrade():
    # Anti-cheat columns on sessions
    op.add_column('sessions', sa.Column('tab_switches', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('sessions', sa.Column('paste_bursts', sa.Integer(), nullable=True, server_default='0'))

    # Cohorts table
    op.create_table(
        'cohorts',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('test_template_id', sa.String(36), sa.ForeignKey('tests.id'), nullable=False),
        sa.Column('invite_code', sa.String(12), unique=True, nullable=False),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_cohorts_invite_code', 'cohorts', ['invite_code'], unique=True)

    # Cohort members table
    op.create_table(
        'cohort_members',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('cohort_id', sa.String(36), sa.ForeignKey('cohorts.id'), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('sessions.id'), nullable=True),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('cohort_members')
    op.drop_index('ix_cohorts_invite_code', table_name='cohorts')
    op.drop_table('cohorts')
    op.drop_column('sessions', 'paste_bursts')
    op.drop_column('sessions', 'tab_switches')
