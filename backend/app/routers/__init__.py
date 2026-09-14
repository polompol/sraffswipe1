"""Router package bootstrap.

Money-sensitive route replacements are installed before ``main`` includes the
routers, keeping OpenAPI/runtime paths unique while the hardening code stays in
its own small auditable module.
"""
from .. import financial_hardening as _financial_hardening
from . import admin_accounts as _admin_accounts  # noqa: F401
from . import billing as _billing  # noqa: F401

_financial_hardening.install_routes()
