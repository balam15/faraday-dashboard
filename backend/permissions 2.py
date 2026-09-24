"""Role permissions: the catalogue, the seeded system roles, and helpers to
resolve a user's effective permissions.
"""
from __future__ import annotations

from typing import List, Set

from sqlalchemy.orm import Session

from models import Role, User

# The full permission catalogue (ids match the frontend labels).
ALL_PERMISSIONS: List[str] = [
    "view_dashboard",
    "view_applications",
    "view_findings",
    "import_scans",
    "manage_findings",
    "manage_applications",
    "manage_users",
    "manage_roles",
    "manage_settings",
]

# System roles seeded on startup. Admin always gets everything.
SYSTEM_ROLES = {
    "admin": {
        "description": "Full access to all features",
        "permissions": list(ALL_PERMISSIONS),
    },
    "security_engineer": {
        "description": "Can import scans and manage findings",
        "permissions": [
            "view_dashboard", "view_applications", "view_findings",
            "import_scans", "manage_findings",
        ],
    },
    "developer": {
        "description": "Read-only access to findings for their apps",
        "permissions": ["view_dashboard", "view_applications", "view_findings"],
    },
    "viewer": {
        "description": "Dashboard and findings view only",
        "permissions": ["view_dashboard", "view_findings"],
    },
}


def seed_system_roles(db: Session) -> None:
    """Create/refresh the system roles. Safe to call on every startup."""
    for name, spec in SYSTEM_ROLES.items():
        row = db.query(Role).filter(Role.name == name).first()
        if row is None:
            db.add(Role(
                name=name,
                description=spec["description"],
                permissions=spec["permissions"],
                is_system=True,
            ))
        else:
            # Keep system roles canonical (e.g. admin always has all perms).
            row.permissions = spec["permissions"]
            row.is_system = True
    db.commit()


def role_permissions(db: Session, role_name: str) -> Set[str]:
    if role_name == "admin":
        return set(ALL_PERMISSIONS)
    row = db.query(Role).filter(Role.name == role_name).first()
    if not row:
        return set()
    return set(row.permissions or [])


def user_permissions(db: Session, user: User) -> Set[str]:
    return role_permissions(db, user.role)


def has_permission(db: Session, user: User, perm: str) -> bool:
    return perm in user_permissions(db, user)


def role_exists(db: Session, name: str) -> bool:
    return db.query(Role).filter(Role.name == name).first() is not None


def valid_permissions(perms) -> List[str]:
    """Filter to known permission ids, preserving catalogue order."""
    given = set(perms or [])
    return [p for p in ALL_PERMISSIONS if p in given]
