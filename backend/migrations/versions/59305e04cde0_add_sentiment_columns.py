"""Add sentiment columns to responses

Revision ID: 59305e04cde0
Revises: 240de0a4f0b8
Create Date: 2026-04-02

Tilføjer tre kolonner til responses-tabellen til lokal sentiment-analyse:
  - sentiment_label:          "positiv" | "neutral" | "negativ" (nullable)
  - sentiment_score:          float -1.0 til 1.0 (nullable)
  - sentiment_low_agreement:  True hvis de to modeller er uenige (nullable)
"""

from alembic import op
import sqlalchemy as sa

revision = '59305e04cde0'
down_revision = '240de0a4f0b8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('responses', sa.Column('sentiment_label', sa.String(20), nullable=True))
    op.add_column('responses', sa.Column('sentiment_score', sa.Float(), nullable=True))
    op.add_column('responses', sa.Column('sentiment_low_agreement', sa.Boolean(),
                                         nullable=True, server_default='0'))


def downgrade():
    op.drop_column('responses', 'sentiment_low_agreement')
    op.drop_column('responses', 'sentiment_score')
    op.drop_column('responses', 'sentiment_label')
