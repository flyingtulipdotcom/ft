import os
from typing import Any

from ape import Contract, accounts, chain

try:
    from eth_abi import encode
except ImportError:
    from eth_abi.abi import encode


FT_OAPP = "0x5DD1A7A369e8273371d2DBf9d83356057088082c"
DELEGATE_SAFE = "0x22246a9183cE2CE6e2c2a9973F94aEA91435017C"

CONFIG_TYPE_ULN = 2
REQUIRED_DVN_COUNT = 2
OPTIONAL_DVN_COUNT = 3
OPTIONAL_DVN_THRESHOLD = 2

ULN_CONFIG_TYPE = "(uint64,uint8,uint8,uint8,address[],address[])"

ENDPOINT_ABI = [
    {
        "type": "function",
        "name": "setConfig",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "_oapp", "type": "address"},
            {"name": "_lib", "type": "address"},
            {
                "name": "_params",
                "type": "tuple[]",
                "components": [
                    {"name": "eid", "type": "uint32"},
                    {"name": "configType", "type": "uint32"},
                    {"name": "config", "type": "bytes"},
                ],
            },
        ],
        "outputs": [],
    }
]

CHAINS: dict[str, dict[str, Any]] = {
    "ethereum": {
        "chain_id": 1,
        "eid": 30101,
        "confirmations": 15,
        "endpoint": "0x1a44076050125825900e736c501f859c50fE728c",
        "send_uln": "0xbB2Ea70C9E858123480642Cf96acbcCE1372dCe1",
        "receive_uln": "0xc02Ab410f0734EFa3F14628780e6e695156024C2",
        "required_dvns": [
            "0x589dedbd617e0cbcb916a9223f4d1300c294236b",
            "0xa4fe5a5b9a846458a70cd0748228aed3bf65c2cd",
        ],
        "optional_dvns": [
            "0x373a6e5c0c4e89e24819f00aa37ea370917aaff4",
            "0x380275805876ff19055ea900cdb2b46a94ecf20d",
            "0xa59ba433ac34d2927232918ef5b2eaafcf130ba5",
        ],
    },
    "bsc": {
        "chain_id": 56,
        "eid": 30102,
        "confirmations": 20,
        "endpoint": "0x1a44076050125825900e736c501f859c50fE728c",
        "send_uln": "0x9F8C645f2D0b2159767Bd6E0839DE4BE49e823DE",
        "receive_uln": "0xB217266c3A98C8B2709Ee26836C98cf12f6cCEC1",
        "required_dvns": [
            "0xfa9ba83c102283958b997adc8b44ed3a3cdb5dda",
            "0xfd6865c841c2d64565562fcc7e05e619a30615f0",
        ],
        "optional_dvns": [
            "0x247624e2143504730aec22912ed41f092498bef2",
            "0x31f748a368a893bdb5abb67ec95f232507601a73",
            "0xf0a5c5306adbfd4e3dfd5d4b148b451c411d3878",
        ],
    },
    "avalanche": {
        "chain_id": 43114,
        "eid": 30106,
        "confirmations": 12,
        "endpoint": "0x1a44076050125825900e736c501f859c50fE728c",
        "send_uln": "0x197D1333DEA5Fe0D6600E9b396c7f1B1cFCc558a",
        "receive_uln": "0xbf3521d309642FA9B1c91A08609505BA09752c61",
        "required_dvns": [
            "0x962f502a63f5fbeb44dc9ab932122648e8352959",
            "0xcc49e6fca014c77e1eb604351cc1e08c84511760",
        ],
        "optional_dvns": [
            "0x07c05eab7716acb6f83ebf6268f8eecda8892ba1",
            "0xa59ba433ac34d2927232918ef5b2eaafcf130ba5",
            "0xbe57e9e7d9eb16b92c6383792abe28d64a18c0f1",
        ],
    },
    "sonic": {
        "chain_id": 146,
        "eid": 30332,
        "confirmations": 20,
        "endpoint": "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B",
        "send_uln": "0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7",
        "receive_uln": "0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043",
        "required_dvns": [
            "0x282b3386571f7f794450d5789911a9804fa346b4",
            "0xb2c7832aa8dda878de6f949485f927e9e532e92c",
        ],
        "optional_dvns": [
            "0x05aaefdf9db6e0f7d27fa3b6ee099edb33da029e",
            "0x54dd79f5ce72b51fcbbcb170dd01e32034323565",
            "0xde79818c75649773fc462e9d3134b23b81741481",
        ],
    },
    "base": {
        "chain_id": 8453,
        "eid": 30184,
        "confirmations": 10,
        "endpoint": "0x1a44076050125825900e736c501f859c50fE728c",
        "send_uln": "0xB5320B0B3a13cC860893E2Bd79FCd7e13484Dda2",
        "receive_uln": "0xc70AB6f32772f59fBfc23889Caf4Ba3376C84bAf",
        "required_dvns": [
            "0x554833698ae0fb22ecc90b01222903fd62ca4b47",
            "0x9e059a54699a285714207b43b055483e78faac25",
        ],
        "optional_dvns": [
            "0xa7b5189bca84cd304d8553977c7c614329750d99",
            "0xc2a0c36f5939a14966705c7cec813163faeea1f0",
            "0xcd37ca043f8479064e10635020c65ffc005d36f6",
        ],
    },
}

CHAIN_BY_ID = {cfg["chain_id"]: name for name, cfg in CHAINS.items()}
REMOTE_ORDER = ["ethereum", "bsc", "avalanche", "sonic", "base"]


def _assert_sorted(addresses: list[str], label: str) -> None:
    sorted_addresses = sorted(addresses, key=lambda value: value.lower())
    if addresses != sorted_addresses:
        raise ValueError(f"{label} are not sorted ascending by address")


def _encode_uln_config(confirmations: int, local_cfg: dict[str, Any]) -> bytes:
    required_dvns = local_cfg["required_dvns"]
    optional_dvns = local_cfg["optional_dvns"]

    _assert_sorted(required_dvns, "required DVNs")
    _assert_sorted(optional_dvns, "optional DVNs")

    return encode(
        [ULN_CONFIG_TYPE],
        [
            (
                confirmations,
                REQUIRED_DVN_COUNT,
                OPTIONAL_DVN_COUNT,
                OPTIONAL_DVN_THRESHOLD,
                required_dvns,
                optional_dvns,
            )
        ],
    )


def _set_config_params_for_send(local_chain: str) -> list[tuple[int, int, bytes]]:
    local_cfg = CHAINS[local_chain]
    return [
        (
            CHAINS[remote_chain]["eid"],
            CONFIG_TYPE_ULN,
            _encode_uln_config(local_cfg["confirmations"], local_cfg),
        )
        for remote_chain in REMOTE_ORDER
        if remote_chain != local_chain
    ]


def _set_config_params_for_receive(local_chain: str) -> list[tuple[int, int, bytes]]:
    local_cfg = CHAINS[local_chain]
    return [
        (
            CHAINS[remote_chain]["eid"],
            CONFIG_TYPE_ULN,
            _encode_uln_config(CHAINS[remote_chain]["confirmations"], local_cfg),
        )
        for remote_chain in REMOTE_ORDER
        if remote_chain != local_chain
    ]


def _active_chain_name() -> str:
    active_chain_id = chain.chain_id
    if active_chain_id not in CHAIN_BY_ID:
        supported = ", ".join(f"{name}={cfg['chain_id']}" for name, cfg in CHAINS.items())
        raise ValueError(f"Unsupported active chain id {active_chain_id}. Supported: {supported}")

    return CHAIN_BY_ID[active_chain_id]


def main() -> None:
    local_chain = os.environ.get("CHAIN") or _active_chain_name()
    if local_chain not in CHAINS:
        raise ValueError(f"Unknown CHAIN={local_chain}")

    local_cfg = CHAINS[local_chain]
    safe_alias = os.environ.get("SAFE_ALIAS", "ft-delegate-safe")
    submitter_alias = os.environ.get("SUBMITTER_ALIAS")

    safe = accounts.load(safe_alias)
    if safe.address.lower() != DELEGATE_SAFE.lower():
        raise ValueError(f"Loaded safe {safe.address}, expected delegate Safe {DELEGATE_SAFE}")

    submitter = accounts.load(submitter_alias) if submitter_alias else None
    endpoint = Contract(local_cfg["endpoint"], abi=ENDPOINT_ABI)

    send_params = _set_config_params_for_send(local_chain)
    receive_params = _set_config_params_for_receive(local_chain)

    batch = safe.create_batch()
    batch.add(endpoint.setConfig, FT_OAPP, local_cfg["send_uln"], send_params)
    batch.add(endpoint.setConfig, FT_OAPP, local_cfg["receive_uln"], receive_params)

    print(f"Queueing LayerZero DVN config for {local_chain}")
    print(f"Safe:        {safe.address}")
    print(f"Endpoint:    {local_cfg['endpoint']}")
    print(f"Send ULN:    {local_cfg['send_uln']} ({len(send_params)} remote EIDs)")
    print(f"Receive ULN: {local_cfg['receive_uln']} ({len(receive_params)} remote EIDs)")
    print(f"Submitter:   {submitter.address if submitter else 'ape-safe default/local signer'}")

    if os.environ.get("DRY_RUN") == "1":
        tx = batch.as_transaction(safe=safe)
        print("DRY_RUN=1; not proposing to Safe Transaction Service")
        print(f"To:    {getattr(tx, 'receiver', getattr(tx, 'to', None))}")
        print(f"Value: {tx.value}")
        print(f"Data:  {tx.data}")
        return

    safe_tx = batch.propose(submitter=submitter) if submitter else batch.propose()
    print(f"Proposed Safe transaction: {safe_tx}")
