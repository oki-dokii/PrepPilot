"""drop cohorts and cohort_members tables

Revision ID: d1e4f2a83c90
Revises: c2ef760b2e1a
Create Date: 2026-07-09

"""
from alembic import op
import sqlalchemy as sa

revision = "d1e4f2a83c90"
down_revision = "c2ef760b2e1a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop cohort_members first (FK dependency on cohorts)
    op.drop_table("cohort_members")
    op.drop_table("cohorts")


def downgrade() -> None:
    op.create_table(
        "cohorts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("test_template_id", sa.String(36), sa.ForeignKey("tests.id"), nullable=False),
        sa.Column("invite_code", sa.String(12), unique=True, nullable=False, index=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "cohort_members",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("cohort_id", sa.String(36), sa.ForeignKey("cohorts.id"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("sessions.id"), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
