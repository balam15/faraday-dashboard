from typing import Optional, Tuple
from ldap3 import Server, Connection, ALL, SUBTREE, Tls
from ldap3.core.exceptions import LDAPException
from ldap3.utils.conv import escape_filter_chars
import ssl

from models import LdapConfig, LdapGroupMapping
from sqlalchemy.orm import Session


def get_ldap_config(db: Session) -> Optional[LdapConfig]:
    return db.query(LdapConfig).filter(LdapConfig.id == 1).first()


def build_tls(db: Session, cfg: LdapConfig) -> Optional[Tls]:
    """Build the ldap3 Tls object for a connection.

    When certificate verification is on, any CA/SSL certificates imported
    under Settings → Certificates (usage 'ldap' or 'all') are supplied as
    trust anchors so LDAPS to an internal AD with a private CA works without
    disabling verification.
    """
    if not cfg.use_ssl:
        return None
    if not cfg.tls_verify:
        return Tls(validate=ssl.CERT_NONE)

    from models import Certificate  # local import to avoid a cycle
    pems = [
        c.pem
        for c in db.query(Certificate).filter(Certificate.usage.in_(("ldap", "all"))).all()
        if c.pem
    ]
    ca_data = "\n".join(pems) if pems else None
    return Tls(validate=ssl.CERT_REQUIRED, ca_certs_data=ca_data)


def verify_user_mapping(username: str, db: Session, cfg: Optional[LdapConfig] = None) -> dict:
    """Look a user up in the directory (service-account bind, no password
    check) and report the attributes and the role they would be granted.

    `cfg` may be a transient (unsaved) config so the admin can verify against
    the values currently in the form. Falls back to the saved config.

    Raises ValueError with a human-readable message on any failure so the
    UI can explain exactly what went wrong.
    """
    if cfg is None:
        cfg = get_ldap_config(db)
    if not cfg or not cfg.host:
        raise ValueError("LDAP is not configured yet. Fill in the connection details and save first.")
    if not cfg.bind_dn or not cfg.bind_password:
        raise ValueError("No service account (Bind DN / password) is set — it is required to search for users.")
    if not cfg.base_dn:
        raise ValueError("Base DN is empty. Set it (e.g. DC=example,DC=com) so the directory can be searched.")

    try:
        tls = build_tls(db, cfg)
        server = Server(cfg.host, port=cfg.port, use_ssl=cfg.use_ssl, tls=tls, get_info=ALL)
        conn = Connection(server, user=cfg.bind_dn, password=cfg.bind_password, auto_bind=True)
    except LDAPException as e:
        raise ValueError(f"Could not bind with the service account: {e}") from e
    except Exception as e:  # TLS / DNS / socket errors
        raise ValueError(f"Could not reach the LDAP server: {e}") from e

    try:
        safe_username = escape_filter_chars(username)
        user_filter = cfg.user_filter or f"({cfg.username_attr}={{username}})"
        search_filter = user_filter.replace("{username}", safe_username)
        if "{username}" not in (cfg.user_filter or "{username}"):
            # Filter had no placeholder — AND it with a username match.
            search_filter = f"(&{user_filter}({cfg.username_attr}={safe_username}))"
        if not search_filter.startswith("("):
            search_filter = f"({cfg.username_attr}={safe_username})"

        conn.search(
            search_base=cfg.base_dn,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=[cfg.username_attr, cfg.email_attr, cfg.display_name_attr,
                        "memberOf", "distinguishedName"],
        )
        if not conn.entries:
            raise ValueError(
                f"User '{username}' was not found under {cfg.base_dn}. "
                "Check the username attribute and search filter."
            )

        entry = conn.entries[0]

        def attr(name: str) -> str:
            try:
                v = getattr(entry, name)
                return str(v) if v else ""
            except Exception:
                return ""

        groups: list[str] = []
        try:
            if entry.memberOf:
                groups = [str(g) for g in entry.memberOf]
        except Exception:
            pass

        role, apps = resolve_role_from_groups(groups, db)
        return {
            "dn": entry.entry_dn,
            "username": attr(cfg.username_attr) or username,
            "email": attr(cfg.email_attr),
            "display_name": attr(cfg.display_name_attr),
            "groups": groups,
            "resolved_role": role,
            "allowed_apps": apps,
        }
    finally:
        try:
            conn.unbind()
        except Exception:
            pass


def ldap_authenticate(
    username: str,
    password: str,
    db: Session,
) -> Tuple[bool, Optional[dict]]:
    """
    Attempt to authenticate username/password against LDAP.
    Returns (success, user_info_dict).
    user_info contains: username, email, display_name, groups (list of DNs)
    """
    cfg = get_ldap_config(db)
    if not cfg or not cfg.host:
        return False, None

    try:
        # TLS setup (uses any imported CA certs when verification is on)
        tls = build_tls(db, cfg)

        server = Server(
            cfg.host,
            port=cfg.port,
            use_ssl=cfg.use_ssl,
            tls=tls,
            get_info=ALL,
        )

        # Bind with service account to search for the user
        bind_conn = Connection(
            server,
            user=cfg.bind_dn,
            password=cfg.bind_password,
            auto_bind=True,
        )

        # Build search filter. Escape the username so it can't inject LDAP
        # filter syntax (e.g. "*", ")(uid=*") — an auth bypass otherwise.
        safe_username = escape_filter_chars(username)
        user_filter = cfg.user_filter or f"({cfg.username_attr}={{username}})"
        search_filter = user_filter.replace("{username}", safe_username)
        if not search_filter.startswith("("):
            search_filter = f"({cfg.username_attr}={safe_username})"

        bind_conn.search(
            search_base=cfg.base_dn,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=[
                cfg.username_attr,
                cfg.email_attr,
                cfg.display_name_attr,
                "memberOf",
                "distinguishedName",
            ],
        )

        if not bind_conn.entries:
            bind_conn.unbind()
            return False, None

        user_entry = bind_conn.entries[0]
        user_dn = user_entry.entry_dn
        bind_conn.unbind()

        # Now try to bind as the user to verify password
        user_conn = Connection(
            server,
            user=user_dn,
            password=password,
            auto_bind=True,
        )
        user_conn.unbind()

        # Extract attributes safely
        def get_attr(entry, attr: str) -> str:
            try:
                val = getattr(entry, attr)
                return str(val) if val else ""
            except Exception:
                return ""

        groups: list[str] = []
        try:
            member_of = user_entry.memberOf
            if member_of:
                groups = [str(g) for g in member_of]
        except Exception:
            pass

        user_info = {
            "username": get_attr(user_entry, cfg.username_attr) or username,
            "email": get_attr(user_entry, cfg.email_attr),
            "display_name": get_attr(user_entry, cfg.display_name_attr),
            "groups": groups,
        }
        return True, user_info

    except LDAPException:
        return False, None
    except Exception:
        return False, None


def resolve_role_from_groups(groups: list[str], db: Session) -> Tuple[str, Optional[list]]:
    """Given the user's AD group DNs, return the best matching role (system OR
    custom) and its allowed apps.

    When several groups match, the role granting the most permissions wins
    (admin, which holds everything, always ranks highest). If no group matches,
    the user gets `viewer` with no app access until an admin grants some.
    """
    from models import Role

    def normalize(name: str) -> str:
        return (name or "").strip().lower().replace(" ", "_")

    # permission-count per role name (admin => everything)
    role_rank: dict = {}
    for r in db.query(Role).all():
        role_rank[r.name] = 10_000 if r.name == "admin" else len(r.permissions or [])

    matched = []  # (rank, role_name, apps)
    for mapping in db.query(LdapGroupMapping).all():
        if any(g.lower() == mapping.group_dn.lower() for g in groups):
            role = normalize(mapping.role)
            if role in role_rank:  # ignore mappings to roles that no longer exist
                matched.append((role_rank[role], role, mapping.apps))

    if not matched:
        return "viewer", []  # deny-by-default: no app access until granted

    matched.sort(key=lambda x: x[0], reverse=True)
    _, best_role, best_apps = matched[0]
    return best_role, best_apps


# ─────────────────────────────────────────────
# Live directory enumeration (browse AD without waiting for logins)
# ─────────────────────────────────────────────

def _connect(db: Session, cfg: LdapConfig) -> Connection:
    """Bind with the service account. Raises ValueError with a clear message."""
    if not cfg or not cfg.host:
        raise ValueError("LDAP is not configured yet. Fill in the connection details and save first.")
    if not cfg.bind_dn or not cfg.bind_password:
        raise ValueError("No service account (Bind DN / password) is set — it is required to browse the directory.")
    if not cfg.base_dn:
        raise ValueError("Base DN is empty. Set it (e.g. DC=example,DC=com) so the directory can be searched.")
    try:
        tls = build_tls(db, cfg)
        server = Server(cfg.host, port=cfg.port, use_ssl=cfg.use_ssl, tls=tls, get_info=ALL)
        return Connection(server, user=cfg.bind_dn, password=cfg.bind_password, auto_bind=True)
    except LDAPException as e:
        raise ValueError(f"Could not bind with the service account: {e}") from e
    except Exception as e:
        raise ValueError(f"Could not reach the LDAP server: {e}") from e


def _attr(entry, name: str) -> str:
    try:
        v = getattr(entry, name)
        return str(v) if v else ""
    except Exception:
        return ""


def _entry_groups(entry) -> list[str]:
    try:
        if entry.memberOf:
            return [str(g) for g in entry.memberOf]
    except Exception:
        pass
    return []


def list_directory_users(db: Session, limit: int = 200, cfg: Optional[LdapConfig] = None) -> list[dict]:
    """Enumerate the users allowed to sign in (the login filter), live from AD.

    `cfg` may be a transient (unsaved) config so an admin can preview the
    result of the values currently in the form. Returns each user's attributes
    plus the role they would be granted from their group memberships. Read-only
    preview — no accounts are created.
    """
    if cfg is None:
        cfg = get_ldap_config(db)
    conn = _connect(db, cfg)
    try:
        # Use the configured login filter so the list matches exactly who can
        # authenticate. Replace the {username} placeholder with a wildcard.
        base_filter = cfg.user_filter or "(&(objectClass=user)(objectCategory=person))"
        search_filter = base_filter.replace("{username}", "*") if "{username}" in base_filter else base_filter
        if not search_filter.startswith("("):
            search_filter = f"({cfg.username_attr}=*)"

        conn.search(
            search_base=cfg.base_dn,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=[cfg.username_attr, cfg.email_attr, cfg.display_name_attr, "memberOf"],
            paged_size=limit,
            size_limit=limit,
        )
        users = []
        for e in list(conn.entries)[:limit]:
            groups = _entry_groups(e)
            role, apps = resolve_role_from_groups(groups, db)
            users.append({
                "username": _attr(e, cfg.username_attr),
                "email": _attr(e, cfg.email_attr),
                "display_name": _attr(e, cfg.display_name_attr),
                "groups_count": len(groups),
                "resolved_role": role,
                "allowed_apps": apps,
                "dn": e.entry_dn,
            })
        # Stable, human-friendly ordering.
        users.sort(key=lambda u: (u["display_name"] or u["username"] or "").lower())
        return users
    finally:
        try:
            conn.unbind()
        except Exception:
            pass


def list_directory_groups(db: Session, limit: int = 200) -> list[dict]:
    """Enumerate security groups live from AD (name, DN, member count, and the
    platform role mapped to them if any)."""
    cfg = get_ldap_config(db)
    conn = _connect(db, cfg)
    try:
        conn.search(
            search_base=cfg.base_dn,
            search_filter="(objectClass=group)",
            search_scope=SUBTREE,
            attributes=["cn", "member"],
            paged_size=limit,
            size_limit=limit,
        )
        # Map DN → mapped platform role (lowercased) for a quick lookup.
        mapped = {}
        for m in db.query(LdapGroupMapping).all():
            mapped[m.group_dn.lower()] = (m.role or "").strip().lower().replace(" ", "_")

        groups = []
        for e in list(conn.entries)[:limit]:
            dn = e.entry_dn
            try:
                members = list(e.member) if e.member else []
            except Exception:
                members = []
            groups.append({
                "dn": dn,
                "name": _attr(e, "cn") or dn,
                "member_count": len(members),
                "mapped_role": mapped.get(dn.lower()),
            })
        groups.sort(key=lambda g: (g["name"] or "").lower())
        return groups
    finally:
        try:
            conn.unbind()
        except Exception:
            pass


def list_group_members(db: Session, group_dn: str, limit: int = 200) -> list[dict]:
    """List the users that belong to a given group DN, live from AD."""
    cfg = get_ldap_config(db)
    conn = _connect(db, cfg)
    try:
        safe_dn = escape_filter_chars(group_dn)
        conn.search(
            search_base=cfg.base_dn,
            search_filter=f"(&({cfg.username_attr}=*)(memberOf={safe_dn}))",
            search_scope=SUBTREE,
            attributes=[cfg.username_attr, cfg.email_attr, cfg.display_name_attr],
            paged_size=limit,
            size_limit=limit,
        )
        members = [{
            "username": _attr(e, cfg.username_attr),
            "email": _attr(e, cfg.email_attr),
            "display_name": _attr(e, cfg.display_name_attr),
        } for e in list(conn.entries)[:limit]]
        members.sort(key=lambda m: (m["display_name"] or m["username"] or "").lower())
        return members
    finally:
        try:
            conn.unbind()
        except Exception:
            pass
