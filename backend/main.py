import os
from fastapi import FastAPI, Depends, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from models import (
    init_db, get_db, SessionLocal, User, SystemConfig, LdapConfig,
    LdapGroupMapping, Role,
)
from auth import hash_password, verify_password, create_access_token, decode_token
from ldap_auth import ldap_authenticate, resolve_role_from_groups
import permissions

app = FastAPI(title="Faraday Dashboard API", version="1.0.0")

# The frontend reaches the API through Next.js server-side rewrites (same
# origin), so cross-origin access is off by default. Set CORS_ORIGINS
# (comma-separated) only if a browser must call the API directly.
_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.on_event("startup")
def startup():
    init_db()
    db = SessionLocal()
    try:
        permissions.seed_system_roles(db)
    finally:
        db.close()


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def is_first_run(db: Session) -> bool:
    cfg = db.query(SystemConfig).filter(SystemConfig.key == "first_run_complete").first()
    return cfg is None


def _extract_token(request: Request) -> str:
    """Bearer header first, then the httpOnly cookie set at login."""
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        tok = header[len("Bearer "):].strip()
        if tok:
            return tok
    return (request.cookies.get("faraday_token") or "").strip()


_COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
_COOKIE_MAX_AGE = int(os.environ.get("TOKEN_EXPIRE_MINUTES", "480")) * 60


def _set_auth_cookie(response: Response, token: str) -> None:
    """Store the JWT in an httpOnly cookie so it's out of reach of JS/XSS."""
    response.set_cookie(
        key="faraday_token",
        value=token,
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=_COOKIE_SECURE,
        path="/",
    )


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(User).filter(User.username == payload.get("sub")).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_admin(user: User = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_permission(perm: str):
    """Dependency factory: allow the request only if the user's role grants
    `perm`. The admin role implicitly holds every permission."""
    def _dep(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        if not permissions.has_permission(db, user, perm):
            raise HTTPException(status_code=403, detail=f"Missing permission: {perm}")
        return user
    return _dep


# ─────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────

class SetupRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=8, max_length=128)
    email: Optional[str] = None
    display_name: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str
    auth_type: str = "local"   # "local" | "ldap"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserOut(BaseModel):
    id: str
    username: str
    email: Optional[str]
    display_name: Optional[str]
    role: str
    auth_type: str
    is_active: bool
    last_login: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class LdapConfigIn(BaseModel):
    host: str
    port: int = 636
    base_dn: str
    bind_dn: str
    bind_password: Optional[str] = None
    user_filter: Optional[str] = None
    username_attr: str = "sAMAccountName"
    email_attr: str = "mail"
    display_name_attr: str = "displayName"
    tls_verify: bool = True
    use_ssl: bool = True


class GroupMappingIn(BaseModel):
    group_dn: str
    role: str
    apps: Optional[list[str]] = None


# ─────────────────────────────────────────────
# Routes: System
# ─────────────────────────────────────────────

@app.get("/api/system/status")
def system_status(db: Session = Depends(get_db)):
    """Returns whether first-run setup is needed."""
    return {"first_run": is_first_run(db)}


@app.post("/api/system/setup")
def first_run_setup(body: SetupRequest, response: Response, db: Session = Depends(get_db)):
    """Create the initial admin account. Can only be called once."""
    if not is_first_run(db):
        raise HTTPException(status_code=400, detail="Setup already completed")

    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    admin = User(
        username=body.username,
        email=body.email,
        display_name=body.display_name or body.username,
        hashed_password=hash_password(body.password),
        auth_type="local",
        role="admin",
        is_active=True,
    )
    db.add(admin)

    # Mark first run as complete
    db.add(SystemConfig(key="first_run_complete", value="true"))
    db.commit()

    token = create_access_token({"sub": admin.username, "role": admin.role})
    _set_auth_cookie(response, token)
    return TokenResponse(
        access_token=token,
        user={"username": admin.username, "role": admin.role, "auth_type": "local"},
    )


# ─────────────────────────────────────────────
# Routes: Auth
# ─────────────────────────────────────────────

@app.post("/api/auth/login", response_model=TokenResponse)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    if is_first_run(db):
        raise HTTPException(status_code=403, detail="Setup required")

    if body.auth_type == "ldap":
        success, user_info = ldap_authenticate(body.username, body.password, db)
        if not success or not user_info:
            raise HTTPException(status_code=401, detail="Invalid LDAP credentials")

        role, allowed_apps = resolve_role_from_groups(user_info.get("groups", []), db)

        # Upsert LDAP user
        user = db.query(User).filter(User.username == user_info["username"]).first()
        if not user:
            user = User(
                username=user_info["username"],
                email=user_info.get("email"),
                display_name=user_info.get("display_name"),
                auth_type="ldap",
                role=role,
                allowed_apps=allowed_apps,
            )
            db.add(user)
        else:
            # A user disabled in the app is blocked even if AD still accepts them.
            if not user.is_active:
                raise HTTPException(status_code=401, detail="Account disabled")
            user.role = role
            user.allowed_apps = allowed_apps
            user.email = user_info.get("email") or user.email
            user.display_name = user_info.get("display_name") or user.display_name

        user.last_login = datetime.utcnow()
        db.commit()

    else:
        # Local auth
        user = db.query(User).filter(User.username == body.username).first()
        if not user or user.auth_type != "local" or not user.hashed_password:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not verify_password(body.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not user.is_active:
            raise HTTPException(status_code=401, detail="Account disabled")
        user.last_login = datetime.utcnow()
        db.commit()

    token = create_access_token({"sub": user.username, "role": user.role})
    _set_auth_cookie(response, token)
    return TokenResponse(
        access_token=token,
        user={
            "username": user.username,
            "role": user.role,
            "display_name": user.display_name,
            "auth_type": user.auth_type,
            "allowed_apps": user.allowed_apps,
        },
    )


@app.get("/api/auth/me")
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {
        "username": current_user.username,
        "email": current_user.email,
        "display_name": current_user.display_name,
        "role": current_user.role,
        "auth_type": current_user.auth_type,
        "allowed_apps": current_user.allowed_apps,
        "permissions": sorted(permissions.user_permissions(db, current_user)),
    }


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie("faraday_token", path="/")
    return {"ok": True}


# ─────────────────────────────────────────────
# Routes: Users (admin only)
# ─────────────────────────────────────────────

@app.get("/api/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_permission("manage_users"))):
    return db.query(User).all()


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=8, max_length=128)
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: str = "viewer"


@app.post("/api/users", response_model=UserOut)
def create_user(body: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_permission("manage_users"))):
    if not permissions.role_exists(db, body.role):
        raise HTTPException(status_code=400, detail="Invalid role")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    user = User(
        username=body.username,
        email=body.email,
        display_name=body.display_name or body.username,
        hashed_password=hash_password(body.password),
        auth_type="local",
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.patch("/api/users/{user_id}/active")
def set_user_active(
    user_id: str,
    active: bool,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_users")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id and not active:
        raise HTTPException(status_code=400, detail="Cannot disable your own account")
    user.is_active = active
    db.commit()
    return {"ok": True}


@app.patch("/api/users/{user_id}/role")
def update_user_role(
    user_id: str,
    role: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("manage_users")),
):
    if not permissions.role_exists(db, role):
        raise HTTPException(status_code=400, detail="Invalid role")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = role
    db.commit()
    return {"ok": True}


@app.delete("/api/users/{user_id}")
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_users")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    db.delete(user)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────
# Routes: Roles (manage_roles — only admin by default)
# ─────────────────────────────────────────────

import re as _re

_ROLE_NAME_RE = _re.compile(r"^[a-z0-9_]{2,64}$")


class RoleIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=64)
    description: Optional[str] = ""
    permissions: list[str] = []


class RoleUpdate(BaseModel):
    description: Optional[str] = None
    permissions: Optional[list[str]] = None


def _role_dict(db: Session, role: Role) -> dict:
    user_count = db.query(User).filter(User.role == role.name).count()
    return {
        "name": role.name,
        "description": role.description or "",
        "permissions": role.permissions or [],
        "is_system": bool(role.is_system),
        "user_count": user_count,
    }


@app.get("/api/roles")
def list_roles(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    # Any authenticated user may read the role list (needed to render dropdowns);
    # role names/permissions are not sensitive.
    rows = db.query(Role).all()
    order = {"admin": 0, "security_engineer": 1, "developer": 2, "viewer": 3}
    rows.sort(key=lambda r: (order.get(r.name, 99), r.name))
    return {"roles": [_role_dict(db, r) for r in rows], "all_permissions": permissions.ALL_PERMISSIONS}


@app.post("/api/roles")
def create_role(body: RoleIn, db: Session = Depends(get_db), _: User = Depends(require_permission("manage_roles"))):
    name = body.name.strip().lower().replace(" ", "_")
    if not _ROLE_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Role name must be lowercase letters, numbers, or underscores")
    if db.query(Role).filter(Role.name == name).first():
        raise HTTPException(status_code=400, detail="Role already exists")
    role = Role(
        name=name,
        description=(body.description or "")[:256],
        permissions=permissions.valid_permissions(body.permissions),
        is_system=False,
    )
    db.add(role)
    db.commit()
    return _role_dict(db, role)


@app.patch("/api/roles/{name}")
def update_role(name: str, body: RoleUpdate, db: Session = Depends(get_db), _: User = Depends(require_permission("manage_roles"))):
    role = db.query(Role).filter(Role.name == name).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=400, detail="System roles cannot be edited")
    if body.description is not None:
        role.description = body.description[:256]
    if body.permissions is not None:
        role.permissions = permissions.valid_permissions(body.permissions)
    db.commit()
    return _role_dict(db, role)


@app.delete("/api/roles/{name}")
def delete_role(name: str, db: Session = Depends(get_db), _: User = Depends(require_permission("manage_roles"))):
    role = db.query(Role).filter(Role.name == name).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=400, detail="System roles cannot be deleted")
    in_use = db.query(User).filter(User.role == name).count()
    if in_use:
        raise HTTPException(status_code=400, detail=f"Role is assigned to {in_use} user(s); reassign them first")
    db.delete(role)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────
# Routes: LDAP Config (admin only)
# ─────────────────────────────────────────────

@app.get("/api/ldap/config")
def get_ldap_config(db: Session = Depends(get_db), _: User = Depends(require_permission("manage_settings"))):
    cfg = db.query(LdapConfig).filter(LdapConfig.id == 1).first()
    if not cfg:
        return {}
    data = {c.name: getattr(cfg, c.name) for c in LdapConfig.__table__.columns}
    data.pop("bind_password", None)  # never return password
    return data


@app.put("/api/ldap/config")
def save_ldap_config(
    body: LdapConfigIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("manage_settings")),
):
    cfg = db.query(LdapConfig).filter(LdapConfig.id == 1).first()
    if not cfg:
        cfg = LdapConfig(id=1)
        db.add(cfg)

    cfg.host = body.host
    cfg.port = body.port
    cfg.base_dn = body.base_dn
    cfg.bind_dn = body.bind_dn
    if body.bind_password:
        cfg.bind_password = body.bind_password
    cfg.user_filter = body.user_filter
    cfg.username_attr = body.username_attr
    cfg.email_attr = body.email_attr
    cfg.display_name_attr = body.display_name_attr
    cfg.tls_verify = body.tls_verify
    cfg.use_ssl = body.use_ssl
    db.commit()
    return {"ok": True}


@app.post("/api/ldap/test")
def test_ldap_connection(db: Session = Depends(get_db), _: User = Depends(require_permission("manage_settings"))):
    from ldap_auth import get_ldap_config as _get_cfg
    from ldap3 import Server, Connection, ALL, Tls
    import ssl as _ssl

    cfg = _get_cfg(db)
    if not cfg or not cfg.host:
        raise HTTPException(status_code=400, detail="LDAP not configured")
    try:
        tls = None
        if cfg.use_ssl:
            tls = Tls(validate=_ssl.CERT_REQUIRED if cfg.tls_verify else _ssl.CERT_NONE)
        server = Server(cfg.host, port=cfg.port, use_ssl=cfg.use_ssl, tls=tls, get_info=ALL)
        conn = Connection(server, user=cfg.bind_dn, password=cfg.bind_password, auto_bind=True)
        conn.unbind()
        return {"ok": True, "message": "LDAP connection successful"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LDAP connection failed: {str(e)}")


# ─────────────────────────────────────────────
# Routes: LDAP Group Mappings (admin only)
# ─────────────────────────────────────────────

@app.get("/api/ldap/groups")
def list_group_mappings(db: Session = Depends(get_db), _: User = Depends(require_permission("manage_settings"))):
    return db.query(LdapGroupMapping).all()


@app.post("/api/ldap/groups")
def add_group_mapping(
    body: GroupMappingIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("manage_settings")),
):
    existing = db.query(LdapGroupMapping).filter(
        LdapGroupMapping.group_dn == body.group_dn
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Group DN already mapped")
    mapping = LdapGroupMapping(
        group_dn=body.group_dn,
        role=body.role,
        apps=body.apps,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return mapping


class GroupMappingUpdate(BaseModel):
    role: Optional[str] = None
    apps: Optional[list[str]] = None


@app.patch("/api/ldap/groups/{mapping_id}")
def update_group_mapping(
    mapping_id: str,
    body: GroupMappingUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("manage_settings")),
):
    mapping = db.query(LdapGroupMapping).filter(LdapGroupMapping.id == mapping_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    if body.role is not None:
        mapping.role = body.role
    if body.apps is not None:
        # None (unset) means "all apps"; an empty list is honored as-is.
        mapping.apps = body.apps
    db.commit()
    db.refresh(mapping)
    return mapping


@app.delete("/api/ldap/groups/{mapping_id}")
def delete_group_mapping(
    mapping_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("manage_settings")),
):
    mapping = db.query(LdapGroupMapping).filter(LdapGroupMapping.id == mapping_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    db.delete(mapping)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "faraday-api"}


# ══════════════════════════════════════════════════════════════════
# Scan data: applications, tags, scans, findings, import, API keys
# ══════════════════════════════════════════════════════════════════
from fastapi import UploadFile, File, Form, Header

from models import Application, ImageTag, Scan, Finding, ApiKey
import parsers
import ingest
import serializers
import api_keys

# Capability checks are permission-based (see permissions.py); status values
# remain a fixed enum.
_VALID_STATUS = {"open", "mitigated", "false_positive", "accepted"}


def _accessible_app_names(user: User) -> Optional[set]:
    """None → all apps; otherwise the set of application NAMES the user may see.

    Access is keyed by application name (which is unique and human-readable),
    so admins configure LDAP group → app mappings with names, not UUIDs.
    """
    if user.role == "admin" or user.allowed_apps is None:
        return None
    return set(user.allowed_apps or [])


def _app_visible(user: User, app: Application) -> bool:
    allowed = _accessible_app_names(user)
    return allowed is None or app.name in allowed


def require_import(
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
) -> User:
    if not permissions.has_permission(db, user, "import_scans"):
        raise HTTPException(status_code=403, detail="You cannot import scans")
    return user


# ── Read: applications ────────────────────────────────────────────

@app.get("/api/apps")
def list_apps(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    allowed = _accessible_app_names(user)
    apps = db.query(Application).all()
    return [
        serializers.application_dict(a)
        for a in apps
        if allowed is None or a.name in allowed
    ]


@app.get("/api/apps/{app_id}")
def get_app(app_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    app_row = db.query(Application).filter(Application.id == app_id).first()
    if not app_row or not _app_visible(user, app_row):
        raise HTTPException(status_code=404, detail="Application not found")
    return serializers.application_dict(app_row)


@app.delete("/api/apps/{app_id}")
def delete_app(app_id: str, db: Session = Depends(get_db), _: User = Depends(require_permission("manage_applications"))):
    app_row = db.query(Application).filter(Application.id == app_id).first()
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found")
    db.delete(app_row)
    db.commit()
    return {"ok": True}


# ── Read: findings ────────────────────────────────────────────────

def _finding_visible(user: User, finding: Finding) -> bool:
    allowed = _accessible_app_names(user)
    if allowed is None:
        return True
    return finding.scan.image_tag.application.name in allowed


@app.get("/api/scans/{scan_id}/findings")
def scan_findings(scan_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan or not _app_visible(user, scan.image_tag.application):
        raise HTTPException(status_code=404, detail="Scan not found")
    return [serializers.finding_dict(f) for f in scan.findings]


@app.get("/api/tags/{tag_id}/findings")
def tag_findings(tag_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tag = db.query(ImageTag).filter(ImageTag.id == tag_id).first()
    if not tag or not _app_visible(user, tag.application):
        raise HTTPException(status_code=404, detail="Tag not found")
    out = []
    for s in tag.scans:
        out.extend(serializers.finding_dict(f) for f in s.findings)
    return out


@app.get("/api/findings")
def list_findings(
    severity: Optional[str] = None,
    status_filter: Optional[str] = None,
    scanner: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    allowed = _accessible_app_names(user)
    q = (
        db.query(Finding)
        .join(Scan, Finding.scan_id == Scan.id)
        .join(ImageTag, Scan.image_tag_id == ImageTag.id)
        .join(Application, ImageTag.application_id == Application.id)
    )
    if allowed is not None:
        if not allowed:
            return []
        q = q.filter(Application.name.in_(allowed))
    if severity:
        q = q.filter(Finding.severity == severity)
    if status_filter:
        q = q.filter(Finding.status == status_filter)
    if scanner:
        q = q.filter(Finding.scanner == scanner)
    q = q.order_by(Finding.found_at.desc())
    return [serializers.finding_dict(f) for f in q.all()]


@app.patch("/api/findings/{finding_id}")
def update_finding_status(
    finding_id: str,
    status: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not permissions.has_permission(db, user, "manage_findings"):
        raise HTTPException(status_code=403, detail="You cannot change finding status")
    if status not in _VALID_STATUS:
        raise HTTPException(status_code=400, detail="Invalid status")
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding or not _finding_visible(user, finding):
        raise HTTPException(status_code=404, detail="Finding not found")
    finding.status = status
    db.commit()
    return {"ok": True}


# ── Import ────────────────────────────────────────────────────────

@app.get("/api/scanners")
def list_scanners(user: User = Depends(get_current_user)):
    return {"scan_types": parsers.available_scan_types()}


def _authorize_import(request: Request, db: Session, x_api_key: Optional[str]) -> str:
    """Allow either a session user with import rights or a valid API key.
    Returns a short identity string for auditing."""
    if x_api_key:
        key = api_keys.verify(db, x_api_key)
        if not key:
            raise HTTPException(status_code=401, detail="Invalid API key")
        return f"apikey:{key.prefix}"
    # Fall back to session auth.
    user = get_current_user(request, db)
    if not permissions.has_permission(db, user, "import_scans"):
        raise HTTPException(status_code=403, detail="You cannot import scans")
    return f"user:{user.username}"


@app.post("/api/import-scan")
async def import_scan(
    request: Request,
    file: UploadFile = File(...),
    app_name: str = Form(...),
    tag: str = Form(...),
    digest: Optional[str] = Form(None),
    scan_type: Optional[str] = Form(None),
    scanner: Optional[str] = Form(None),
    app_type: str = Form("service"),
    team: str = Form(""),
    db: Session = Depends(get_db),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    identity = _authorize_import(request, db, x_api_key)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        result = parsers.parse(content, scan_type)
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Unknown scan_type: {scan_type}")
    except Exception as e:  # noqa: BLE001 - surface parse errors to the caller
        raise HTTPException(status_code=422, detail=f"Failed to parse scan: {e}")

    scan = ingest.persist_scan(
        db, result,
        app_name=app_name.strip(),
        tag=tag.strip(),
        digest=(digest or None),
        scanner_override=(scanner or None),
        scan_type_override=None,
        app_type=app_type,
        team=team,
    )
    return {
        "ok": True,
        "imported_by": identity,
        "scan_id": scan.id,
        "scanner": scan.scanner,
        "scan_type": scan.scan_type,
        "findings": len(result.findings),
    }


# ── API keys (admin) ──────────────────────────────────────────────

@app.get("/api/apikeys")
def list_api_keys(db: Session = Depends(get_db), _: User = Depends(require_permission("manage_settings"))):
    rows = db.query(ApiKey).order_by(ApiKey.created_at.desc()).all()
    return [
        {
            "id": k.id,
            "name": k.name,
            "prefix": k.prefix,
            "created_at": serializers.iso(k.created_at),
            "last_used": serializers.iso(k.last_used),
            "is_active": k.is_active,
        }
        for k in rows
    ]


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)


@app.post("/api/apikeys")
def create_api_key(body: ApiKeyCreate, db: Session = Depends(get_db), user: User = Depends(require_permission("manage_settings"))):
    row, plaintext = api_keys.generate(db, body.name, created_by=user.username)
    # The plaintext key is returned exactly once.
    return {"id": row.id, "name": row.name, "prefix": row.prefix, "key": plaintext}


@app.delete("/api/apikeys/{key_id}")
def revoke_api_key(key_id: str, db: Session = Depends(get_db), _: User = Depends(require_permission("manage_settings"))):
    row = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="API key not found")
    row.is_active = False
    db.commit()
    return {"ok": True}
