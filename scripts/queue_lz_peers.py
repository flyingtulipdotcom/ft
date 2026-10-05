import os
from typing import Any

from ape import Contract, accounts, chain


FT_OAPP = "0x5DD1A7A369e8273371d2DBf9d83356057088082c"
OWNER_SAFE = "0x1118e1c057211306a40A4d7006C040dbfE1370Cb"
PEER_BYTES32 = "0x0000000000000000000000005dd1a7a369e8273371d2dbf9d83356057088082c"

FT_ABI = [
    {
        "type": "function",
        "name": "setPeer",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "_eid", "type": "uint32"},
            {"name": "_peer", "type": "bytes32"},
        ],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "setPaused",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "isPaused", "type": "bool"}],
        "outputs": [],
    },
]

CHAINS: dict[str, dict[str, Any]] = {
    "ethereum": {"chain_id": 1, "eid": 30101},
    "bsc": {"chain_id": 56, "eid": 30102},
    "avalanche": {"chain_id": 43114, "eid": 30106},
    "sonic": {"chain_id": 146, "eid": 30332},
    "base": {"chain_id": 8453, "eid": 30184},
}

REMOTE_ORDER = ["ethereum", "bsc", "avalanche", "sonic", "base"]
CHAIN_BY_ID = {cfg["chain_id"]: name for name, cfg in CHAINS.items()}


def _active_chain_name() -> str:
    active_chain_id = chain.chain_id
    if active_chain_id not in CHAIN_BY_ID:
        supported = ", ".join(f"{name}={cfg['chain_id']}" for name, cfg in CHAINS.items())
        raise ValueError(f"Unsupported active chain id {active_chain_id}. Supported: {supported}")

    return CHAIN_BY_ID[active_chain_id]


def _remote_chains(local_chain: str) -> list[str]:
    return [remote_chain for remote_chain in REMOTE_ORDER if remote_chain != local_chain]


def main() -> None:
    local_chain = os.environ.get("CHAIN") or _active_chain_name()
    if local_chain not in CHAINS:
        raise ValueError(f"Unknown CHAIN={local_chain}")

    safe_alias = os.environ.get("SAFE_ALIAS", "ft-owner-safe")
    submitter_alias = os.environ.get("SUBMITTER_ALIAS")
    include_avalanche_unpause = os.environ.get("UNPAUSE_AVALANCHE") == "1"

    safe = accounts.load(safe_alias)
    if safe.address.lower() != OWNER_SAFE.lower():
        raise ValueError(f"Loaded safe {safe.address}, expected owner Safe {OWNER_SAFE}")

    submitter = accounts.load(submitter_alias) if submitter_alias else None
    ft = Contract(FT_OAPP, abi=FT_ABI)
    peer = bytes.fromhex(PEER_BYTES32.removeprefix("0x"))

    batch = safe.create_batch()
    remotes = _remote_chains(local_chain)
    for remote_chain in remotes:
        batch.add(ft.setPeer, CHAINS[remote_chain]["eid"], peer)

    if include_avalanche_unpause:
        if local_chain != "avalanche":
            raise ValueError("UNPAUSE_AVALANCHE=1 may only be used on the Avalanche network")
        batch.add(ft.setPaused, False)

    print(f"Queueing FT peer restore for {local_chain}")
    print(f"Safe:      {safe.address}")
    print(f"FT OApp:   {FT_OAPP}")
    print(f"Peer:      {PEER_BYTES32}")
    remote_summary = ", ".join(f"{name}:{CHAINS[name]['eid']}" for name in remotes)
    print(f"Remotes:   {remote_summary}")
    print(f"Unpause:   {include_avalanche_unpause}")
    print(f"Submitter: {submitter.address if submitter else 'ape-safe default/local signer'}")

    if os.environ.get("DRY_RUN") == "1":
        tx = batch.as_transaction(safe=safe)
        print("DRY_RUN=1; not proposing to Safe Transaction Service")
        print(f"To:    {getattr(tx, 'receiver', getattr(tx, 'to', None))}")
        print(f"Value: {tx.value}")
        print(f"Data:  {tx.data}")
        return

    safe_tx = batch.propose(submitter=submitter) if submitter else batch.propose()
    print(f"Proposed Safe transaction: {safe_tx}")
