"""Safety guard for the append-only wallet movement journal.

WalletTxn is the source of truth for money movements. This hook adds an
unambiguous source marker to manual operator credits/refunds so support can
trace them without changing the balance operation itself.
"""
from sqlalchemy import event

from .models import WalletTxn


@event.listens_for(WalletTxn, "before_insert")
def _tag_manual_wallet_change(_mapper, _connection, target: WalletTxn) -> None:
    if target.kind == "refund":
        source = "source=operator"
    elif target.kind == "topup" and target.note.startswith("Пополнение оператором"):
        source = "source=operator"
    else:
        return
    if source not in target.note:
        target.note = f"{target.note[:180]} [{source}]"
