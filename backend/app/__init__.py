"""StaffSwipe backend (FastAPI)."""

# Import the wallet audit hook as soon as the app package is imported. It only
# annotates already-existing WalletTxn rows and never changes balances.
from . import wallet_audit as _wallet_audit  # noqa: F401,E402
