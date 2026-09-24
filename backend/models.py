from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, DateTime, Integer,
    ForeignKey, Text, JSON, create_engine, Index
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
import uuid

Base = declarative_base()


def gen_uuid():
    return str(uuid.uuid4())


# ══════════════════════════════════════════════════════════════════
# System / Auth tables
# ══════════════════════════════════════════════════════════════════

class SystemConfig(Base):
    """Stores global flags like first_run_complete."""
    __tablename__ = "system_config"
    key   = Column(String(64), primary_key=True)
    value = Column(Text, nullable=False)


class User(Base):
    __tablename__ = "users"
    id           = Column(String(36), primary_key=True, default=gen_uuid)
    username     = Column(String(128), unique=True, nullable=False, index=True)
    email        = Column(String(256), unique=True, nullable=True)
    display_name = Column(String(256), nullable=True)
    hashed_password = Column(String(256), nullable=True)   # NULL for LDAP-only users
    auth_type    = Column(String(16), default="local")      # "local" | "ldap"
    role         = Column(String(64), default="viewer")     # "admin" | "security_engineer" | "developer" | "viewer"
    # None = access to all apps; a list of application IDs = restricted access.
    allowed_apps = Column(JSON, nullable=True)
    is_active    = Column(Boolean, default=True)
    last_login   = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)


class LdapGroupMapping(Base):
    """Maps an AD group DN → role + allowed apps."""
    __tablename__ = "ldap_group_mappings"
    id        = Column(String(36), primary_key=True, default=gen_uuid)
    group_dn  = Column(String(512), unique=True, nullable=False)
    role      = Column(String(64), nullable=False)
    apps      = Column(JSON, nullable=True)   # None = all apps, list = specific app IDs
    created_at = Column(DateTime, default=datetime.utcnow)


class Activity(Base):
    """A dashboard activity event, shown in the notification feed."""
    __tablename__ = "activity"
    id         = Column(String(36), primary_key=True, default=gen_uuid)
    kind       = Column(String(32), nullable=False)   # import | user | role | application | auth
    message    = Column(String(512), nullable=False)
    actor      = Column(String(128), nullable=True)   # username or "apikey:<prefix>"
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class Role(Base):
    """A role (system or custom) with a set of permissions.

    System roles (admin/security_engineer/developer/viewer) are seeded at
    startup and cannot be edited or deleted. Admins can create/delete custom
    roles and assign them to users.
    """
    __tablename__ = "roles"
    name        = Column(String(64), primary_key=True)
    description = Column(String(256), nullable=True, default="")
    permissions = Column(JSON, nullable=False, default=list)  # list of permission ids
    is_system   = Column(Boolean, default=False)
    created_at  = Column(DateTime, default=datetime.utcnow)


class LdapConfig(Base):
    """Stores LDAP connection settings."""
    __tablename__ = "ldap_config"
    id               = Column(Integer, primary_key=True, default=1)
    host             = Column(String(256), nullable=True)
    port             = Column(Integer, default=636)
    base_dn          = Column(String(512), nullable=True)
    bind_dn          = Column(String(512), nullable=True)
    bind_password    = Column(String(512), nullable=True)
    user_filter      = Column(Text, nullable=True)
    username_attr    = Column(String(64), default="sAMAccountName")
    email_attr       = Column(String(64), default="mail")
    display_name_attr = Column(String(64), default="displayName")
    tls_verify       = Column(Boolean, default=True)
    use_ssl          = Column(Boolean, default=True)


class ApiKey(Base):
    """API keys used by CI/CD pipelines to import scans.

    Only the hash of the key is stored. `prefix` is the short, non-secret
    portion shown in the UI (e.g. ``frd_live_a1b2``) for identification.
    """
    __tablename__ = "api_keys"
    id         = Column(String(36), primary_key=True, default=gen_uuid)
    name       = Column(String(128), nullable=False)
    prefix     = Column(String(32), nullable=False, index=True)
    key_hash   = Column(String(128), nullable=False)
    created_by = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used  = Column(DateTime, nullable=True)
    is_active  = Column(Boolean, default=True)


# ══════════════════════════════════════════════════════════════════
# Scan data tables
# ══════════════════════════════════════════════════════════════════

class Application(Base):
    __tablename__ = "applications"
    id          = Column(String(36), primary_key=True, default=gen_uuid)
    name        = Column(String(256), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True, default="")
    team        = Column(String(128), nullable=True, default="")
    # "web" | "api" | "mobile" | "service"
    type        = Column(String(32), nullable=False, default="service")
    created_at  = Column(DateTime, default=datetime.utcnow)

    image_tags = relationship(
        "ImageTag", back_populates="application",
        cascade="all, delete-orphan", lazy="selectin",
    )


class ImageTag(Base):
    """A specific version/build of an application (e.g. an image tag)."""
    __tablename__ = "image_tags"
    id             = Column(String(36), primary_key=True, default=gen_uuid)
    application_id = Column(String(36), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True)
    tag            = Column(String(256), nullable=False)
    digest         = Column(String(256), nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    application = relationship("Application", back_populates="image_tags")
    scans = relationship(
        "Scan", back_populates="image_tag",
        cascade="all, delete-orphan", lazy="selectin",
    )

    __table_args__ = (
        Index("ix_image_tags_app_tag", "application_id", "tag"),
    )


class Scan(Base):
    """A single scanner run against an image tag."""
    __tablename__ = "scans"
    id           = Column(String(36), primary_key=True, default=gen_uuid)
    image_tag_id = Column(String(36), ForeignKey("image_tags.id", ondelete="CASCADE"), nullable=False, index=True)
    scanner      = Column(String(64), nullable=False)   # "Trivy", "Fortify", "OWASP ZAP", ...
    scan_type    = Column(String(32), nullable=False)   # "SAST" | "DAST" | "Image Scan" | "SCA" | "Secrets"
    format       = Column(String(32), nullable=False)   # "JSON" | "SARIF" | "XML" | "FPR"
    scanned_at   = Column(DateTime, default=datetime.utcnow)
    imported_at  = Column(DateTime, default=datetime.utcnow)
    # "completed" | "running" | "failed"
    status       = Column(String(16), nullable=False, default="completed")
    error        = Column(Text, nullable=True)

    image_tag = relationship("ImageTag", back_populates="scans")
    findings = relationship(
        "Finding", back_populates="scan",
        cascade="all, delete-orphan", lazy="selectin",
    )


class Finding(Base):
    __tablename__ = "findings"
    id          = Column(String(36), primary_key=True, default=gen_uuid)
    scan_id     = Column(String(36), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True)
    title       = Column(String(512), nullable=False)
    # "critical" | "high" | "medium" | "low" | "info"
    severity    = Column(String(16), nullable=False, default="info", index=True)
    scanner     = Column(String(64), nullable=False)
    scan_type   = Column(String(32), nullable=False)
    file_path   = Column(String(1024), nullable=True)
    line_number = Column(Integer, nullable=True)
    cwe         = Column(String(32), nullable=True)
    cve         = Column(String(64), nullable=True)
    description = Column(Text, nullable=True, default="")
    remediation = Column(Text, nullable=True)
    # "open" | "mitigated" | "false_positive" | "accepted"
    status      = Column(String(24), nullable=False, default="open", index=True)
    found_at    = Column(DateTime, default=datetime.utcnow)
    # Stable fingerprint used to deduplicate and to carry status across re-scans.
    dedup_hash  = Column(String(64), nullable=False, index=True)

    scan = relationship("Scan", back_populates="findings")

    __table_args__ = (
        Index("ix_findings_scan_dedup", "scan_id", "dedup_hash"),
    )


# ══════════════════════════════════════════════════════════════════
# DB setup
# ══════════════════════════════════════════════════════════════════
import os


def _build_database_url() -> str:
    """Resolve the DB URL.

    Priority:
      1. DATABASE_URL (e.g. postgresql+psycopg://user:pass@host/db)
      2. DB_PATH → sqlite file (legacy / local fallback)
    """
    url = os.environ.get("DATABASE_URL")
    if url:
        # Normalise the common "postgres://" / "postgresql://" forms to the
        # psycopg (v3) driver we ship in requirements.txt.
        if url.startswith("postgres://"):
            url = "postgresql+psycopg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url
    db_path = os.environ.get("DB_PATH", "/data/faraday.db")
    return f"sqlite:///{db_path}"


DATABASE_URL = _build_database_url()
_IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _IS_SQLITE else {},
    pool_pre_ping=not _IS_SQLITE,
)

if _IS_SQLITE:
    # Enable WAL so the two uvicorn workers don't lock each other out as badly.
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _rec):  # pragma: no cover - trivial
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Create tables. Used as a fallback when Alembic migrations are absent."""
    if _IS_SQLITE:
        db_path = DATABASE_URL.replace("sqlite:///", "")
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
