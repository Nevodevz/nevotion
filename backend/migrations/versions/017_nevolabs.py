"""NevoLabs department and lab projects

Revision ID: 017
Revises: 016
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = '017'
down_revision = '016'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'lab_projects',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), server_default='', nullable=False),
        sa.Column('status', sa.String(40), server_default='Идея', nullable=False),
        sa.Column('board_id', sa.Integer(), sa.ForeignKey('boards.id', ondelete='SET NULL'), nullable=True),
        sa.Column('is_archived', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_lab_projects_board_id', 'lab_projects', ['board_id'])
    op.create_index('ix_lab_projects_created_by', 'lab_projects', ['created_by'])

    op.create_table(
        'lab_project_members',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('lab_project_id', sa.Integer(), sa.ForeignKey('lab_projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
    )
    op.create_index('ix_lab_project_members_lab_project_id', 'lab_project_members', ['lab_project_id'])
    op.create_index('ix_lab_project_members_user_id', 'lab_project_members', ['user_id'])


def downgrade():
    op.drop_index('ix_lab_project_members_user_id', table_name='lab_project_members')
    op.drop_index('ix_lab_project_members_lab_project_id', table_name='lab_project_members')
    op.drop_table('lab_project_members')
    op.drop_index('ix_lab_projects_created_by', table_name='lab_projects')
    op.drop_index('ix_lab_projects_board_id', table_name='lab_projects')
    op.drop_table('lab_projects')
