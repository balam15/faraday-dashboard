from typing import Optional, Tuple
from ldap3 import Server, Connection, ALL, SUBTREE, Tls
from ldap3.core.exceptions import LDAPException
from ldap3.utils.conv import escape_filter_chars
import ssl

from models import LdapConfig, LdapGroupMapping
from sqlalchemy.orm import Session


def get_ldap_config(db: Session) -> Optional[LdapConfig]:
    return db.query(LdapConfig).filter(LdapConfig.id == 1).first()


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
        # TLS setup
        tls = None
        if cfg.use_ssl:
            tls = Tls(
                validate=ssl.CERT_REQUIRED if cfg.tls_verify else ssl.CERT_NONE,
            )

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
