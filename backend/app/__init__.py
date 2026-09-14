"""StaffSwipe backend (FastAPI)."""

# Financial tables are split out of models.py, but still belong to the same
# SQLAlchemy metadata. Register them on every app-package import so create_all
# in SQLite/tests and Alembic describe the same schema.
from . import financial_models as _financial_models  # noqa: F401,E402

# Import the wallet audit hook as soon as the app package is imported. It only
# annotates already-existing WalletTxn rows and never changes balances.
from . import wallet_audit as _wallet_audit  # noqa: F401,E402
