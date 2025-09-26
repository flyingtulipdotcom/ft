export default {
  "sonic-testnet": {
    "created": "2025-09-25T03:30:57.000Z",
    "updated": "2025-09-25T03:30:57.000Z",
    "tableName": "layerzero-chain_metadata",
    "environment": "testnet",
    "blockExplorers": [
      {
        "url": "https://testnet.sonicscan.org"
      }
    ],
    "deployments": [
      {
        "eid": "10349",
        "endpoint": {
          "address": "0x83c73Da98cf733B03315aFa8758834b36a195b87"
        },
        "chainKey": "sonic-testnet",
        "stage": "testnet",
        "relayerV2": {
          "address": "0x35AdD9321507A87471a11EBd4aE4f592d531e620"
        },
        "ultraLightNodeV2": {
          "address": "0x55370E0fBB5f5b8dAeD978BA1c075a499eB107B8"
        },
        "sendUln301": {
          "address": "0xB0487596a0B62D1A71D0C33294bd6eB635Fc6B09"
        },
        "receiveUln301": {
          "address": "0x073f5b4FdF17BBC16b0980d49f6C56123477bb51"
        },
        "version": 1,
        "nonceContract": {
          "address": "0x6098e96a28E02f27B1e6BD381f870F1C8Bd169d3"
        }
      },
      {
        "eid": "40349",
        "endpointV2View": {
          "address": "0x145C041566B21Bec558B2A37F1a5Ff261aB55998"
        },
        "chainKey": "sonic-testnet",
        "stage": "testnet",
        "executor": {
          "address": "0x9dB9Ca3305B48F196D18082e91cB64663b13d014"
        },
        "deadDVN": {
          "address": "0xF49d162484290EAeAd7bb8C2c7E3a6f8f52e32d6"
        },
        "endpointV2": {
          "address": "0x6C7Ab2202C98C4227C5c46f1417D81144DA716Ff"
        },
        "sendUln302": {
          "address": "0xd682ECF100f6F4284138AA925348633B0611Ae21"
        },
        "lzExecutor": {
          "address": "0xe1a12515F9AB2764b887bF60B923Ca494EBbB2d6"
        },
        "blockedMessageLib": {
          "address": "0x926984a57b10a3a5c4cfdbac04daaa0309e78932"
        },
        "version": 2,
        "receiveUln302": {
          "address": "0xcF1B0F4106B0324F96fEfcC31bA9498caa80701C"
        }
      }
    ],
    "chainDetails": {
      "chainType": "evm",
      "chainKey": "sonic-testnet",
      "chainStatus": "ACTIVE",
      "nativeChainId": 57054,
      "chainLayer": "L1",
      "nativeCurrency": {
        "symbol": "S",
        "cmcId": 32684,
        "decimals": 18
      }
    },
    "dvns": {
      "0x76bfdc5e49bbfb898070ef3bf3075181b682af24": {
        "version": 2,
        "canonicalName": "P2P",
        "id": "p2p"
      },
      "0x2e6be93a9a50eeb5fb0cbd83323b2509e7be15ab": {
        "version": 2,
        "canonicalName": "Bitgo",
        "id": "bitgo"
      },
      "0x88b27057a9e00c5f05dda29241027aff63f9e6e0": {
        "version": 2,
        "canonicalName": "LayerZero Labs",
        "id": "layerzero-labs"
      },
      "0xf49d162484290eaead7bb8c2c7e3a6f8f52e32d6": {
        "id": "lz-dead-dvn",
        "version": 2,
        "canonicalName": "LZDeadDVN",
        "deprecated": true
      }
    },
    "rpcs": [
      {
        "rank": 0,
        "url": "https://sonic-testnet.drpc.org"
      },
      {
        "rank": 1,
        "url": "https://sonic-blaze-rpc.publicnode.com"
      },
      {
        "rank": 1,
        "url": "https://sonic-blaze.therpc.io"
      },
      {
        "rank": 1,
        "url": "https://rpc.blaze.soniclabs.com"
      }
    ],
    "chainName": "sonic",
    "chainKey": "sonic-testnet"
  },
  "base-sepolia": {
    "created": "2025-09-25T03:30:54.000Z",
    "updated": "2025-09-25T03:30:54.000Z",
    "tableName": "layerzero-chain_metadata",
    "environment": "testnet",
    "blockExplorers": [
      {
        "url": "https://sepolia.basescan.org"
      }
    ],
    "deployments": [
      {
        "eid": "10245",
        "endpoint": {
          "address": "0x55370E0fBB5f5b8dAeD978BA1c075a499eB107B8"
        },
        "chainKey": "base-sepolia",
        "stage": "testnet",
        "relayerV2": {
          "address": "0x6Ac7bdc07A0583A362F1497252872AE6c0A5F5B8"
        },
        "ultraLightNodeV2": {
          "address": "0x35AdD9321507A87471a11EBd4aE4f592d531e620"
        },
        "sendUln301": {
          "address": "0x53fd4C4fBBd53F6bC58CaE6704b92dB1f360A648"
        },
        "receiveUln301": {
          "address": "0x9eCf72299027e8AeFee5DC5351D6d92294F46d2b"
        },
        "version": 1,
        "nonceContract": {
          "address": "0x88866E5A296FffA511EF8011CB1BBd4d01Cd094F"
        }
      },
      {
        "eid": "40245",
        "chainKey": "base-sepolia",
        "endpointV2": {
          "address": "0x6EDCE65403992e310A62460808c4b910D972f10f"
        },
        "readLib1002": {
          "address": "0x29270F0CFC54432181C853Cd25E2Fb60A68E03f2"
        },
        "version": 2,
        "endpointV2View": {
          "address": "0xF49d162484290EAeAd7bb8C2c7E3a6f8f52e32d6"
        },
        "stage": "testnet",
        "executor": {
          "address": "0x8A3D588D9f6AC041476b094f97FF94ec30169d3D"
        },
        "deadDVN": {
          "address": "0x78551ADC2553EF1858a558F5300F7018Aad2FA7e"
        },
        "sendUln302": {
          "address": "0xC1868e054425D378095A003EcbA3823a5D0135C9"
        },
        "lzExecutor": {
          "address": "0xD8C74c92a59c2b5b6390eD54f13193C59249e561"
        },
        "blockedMessageLib": {
          "address": "0x0c77d8d771ab35e2e184e7ce127f19ced31ff8c0"
        },
        "receiveUln302": {
          "address": "0x12523de19dc41c91F7d2093E0CFbB76b17012C8d"
        }
      }
    ],
    "chainDetails": {
      "mainnetChainName": "base",
      "chainKey": "base-sepolia",
      "chainStatus": "ACTIVE",
      "nativeChainId": 84532,
      "chainLayer": "L1",
      "nativeCurrency": {
        "symbol": "ETH",
        "cgId": "ethereum",
        "cmcId": 1027,
        "decimals": 18
      },
      "chainType": "evm"
    },
    "dvns": {
      "0xbf6ff58f60606edb2f190769b951d825bcb214e2": {
        "id": "layerzero-labs",
        "lzReadCompatible": true,
        "version": 2,
        "canonicalName": "LayerZero Labs"
      },
      "0xfa1a1804effec9000f75cd15d16d18b05738d467": {
        "id": "bitgo",
        "version": 2,
        "canonicalName": "Bitgo",
        "deprecated": true
      },
      "0xdf04abb599c7b37dd5ffc0f8e94f6898120874ef": {
        "version": 2,
        "canonicalName": "Bitgo",
        "id": "bitgo"
      },
      "0xe1cdd37c13450bc256a39d27b1e1b5d1bc26dde2": {
        "id": "horizen-labs",
        "lzReadCompatible": true,
        "version": 2,
        "canonicalName": "Horizen"
      },
      "0x63ef73671245d1a290f2a675be9d906090f72a8d": {
        "version": 2,
        "canonicalName": "P2P",
        "id": "p2p"
      },
      "0xb1b2319767b86800c4cfe8623a72c00d9d90cfb6": {
        "version": 2,
        "canonicalName": "Horizen",
        "id": "horizen-labs"
      },
      "0xd9222cc3ccd1df7c070d700ea377d4ada2b86eb5": {
        "version": 2,
        "canonicalName": "Nethermind",
        "id": "nethermind"
      },
      "0xe1a12515f9ab2764b887bf60b923ca494ebbb2d6": {
        "version": 2,
        "canonicalName": "LayerZero Labs",
        "id": "layerzero-labs"
      },
      "0x78551adc2553ef1858a558f5300f7018aad2fa7e": {
        "id": "lz-dead-dvn",
        "version": 2,
        "canonicalName": "LZDeadDVN",
        "deprecated": true
      }
    },
    "rpcs": [
      {
        "rank": 1,
        "url": "https://base-sepolia.gateway.tenderly.co"
      },
      {
        "rank": 1,
        "url": "https://sepolia.base.org"
      },
      {
        "rank": 1,
        "url": "https://base-sepolia.drpc.org"
      },
      {
        "rank": 1,
        "url": "https://base-sepolia-rpc.publicnode.com"
      },
      {
        "rank": 1,
        "url": "https://base-sepolia-public.nodies.app"
      },
      {
        "rank": 1,
        "url": "https://base-sepolia.api.onfinality.io/public"
      }
    ],
    "addressToOApp": {
      "0xf66312e6e525271c4d8f65353a24ba593079739c": {
        "id": "chedda-finance",
        "canonicalName": "Chedda Finance"
      },
      "0xeb8294974aac5f0653aaffd05b03cc87ed803a88": {
        "id": "dump-trade",
        "canonicalName": "Dump.trade"
      },
      "0x5b0bf3d3f6c7130ff5938d1278da28aed94f5a48": {
        "id": "zkverify",
        "canonicalName": "zkVerify"
      },
      "0xb71dd5cebe5af695209a73537368601f73851bde": {
        "id": "cadence-protocol",
        "canonicalName": "Cadence Protocol"
      },
      "0x5e535d11f80dca798fa19f98ea4a20d79461d56b": {
        "id": "parallel",
        "canonicalName": "Parallel"
      },
      "0x9eb80c8e7b37bbba9024d400f38df6ec95d7d9ad": {
        "id": "chedda-finance",
        "canonicalName": "Chedda Finance"
      },
      "0x3691c3c017e301709aabd0e14cd855f7ad19b905": {
        "id": "parallel",
        "canonicalName": "Parallel"
      },
      "0xbe7a70ea8a2b2133cb94d5f5174d92eb72e9cb83": {
        "id": "parallel",
        "canonicalName": "Parallel"
      },
      "0xede0f2f2b1716874883294e3c2ce2bca32f5ed69": {
        "id": "metaverseme",
        "canonicalName": "MetaverseME!"
      },
      "0x7591ebf775157a443c505fbf8a49755c7ed3e338": {
        "id": "monbridgedex",
        "canonicalName": "Mon Bridge Dex"
      },
      "0x17d3e3819830672dc29cb7192b6641c297b0b838": {
        "id": "mavia",
        "canonicalName": "Mavia"
      },
      "0x28041a8147eb37509bdd8aafc7006f15e0746bbd": {
        "id": "chedda-finance",
        "canonicalName": "Chedda Finance"
      },
      "0x188f596da34015cb2fd8d90770c024c8a271e513": {
        "id": "hermes-v2",
        "canonicalName": "Hermes V2"
      },
      "0x85b21815bce36a8ad51e8cba234e7a746fe1d41a": {
        "id": "chedda-finance",
        "canonicalName": "Chedda Finance"
      },
      "0x43e0171f8430d8c2a2386372463bcb2883c00314": {
        "id": "dackieswap",
        "canonicalName": "DackieSwap"
      },
      "0xc18d80760be88c657d30f879f325cddfcba68713": {
        "id": "squid-game",
        "canonicalName": "SQUID Game"
      },
      "0x386327f6b395a4dc0ed65047c54aa416c7cd6835": {
        "id": "parallel",
        "canonicalName": "Parallel"
      },
      "0xdb283529bfecceb1077bad1525cd6eb1f5d0bd97": {
        "id": "soul",
        "canonicalName": "Soul Protocol"
      },
      "0xe747d62e687955c4f7a018c4b0d768284607de18": {
        "id": "mavia",
        "canonicalName": "Mavia"
      },
      "0x68bb6fe75d8686ac8c6fc0b6f88afbec815b7ead": {
        "id": "mavia",
        "canonicalName": "Mavia"
      }
    },
    "chainName": "basesep",
    "tokens": {
      "0xf922d8b8ec0180b64dfcf07d205145b7e25c433e": {
        "symbol": "FRNT",
        "erc20TokenAddress": "0x15a2ea73f7e75264cfab564bbd3c82ae76fcec56",
        "type": "ProxyOFT",
        "decimals": 6,
        "sharedDecimals": 6
      },
      "0x15a2ea73f7e75264cfab564bbd3c82ae76fcec56": {
        "proxyAddresses": [
          "0xf922d8b8ec0180b64dfcf07d205145b7e25c433e"
        ],
        "symbol": "FRNT",
        "type": "ERC20",
        "decimals": 6
      }
    },
    "chainKey": "base-sepolia"
  },
  "fuji": {
    "created": "2025-09-25T03:30:54.000Z",
    "updated": "2025-09-25T03:30:54.000Z",
    "tableName": "layerzero-chain_metadata",
    "environment": "testnet",
    "blockExplorers": [
      {
        "url": "https://cchain.explorer.avax-test.network"
      }
    ],
    "deployments": [
      {
        "ultraLightNode": {
          "address": "0x0848B8AD17D4003dDe1f1B7eF1FdBA4B629Da97e"
        },
        "eid": "10106",
        "relayer": {
          "address": "0xd035e64324bc470ee872062D508DA9c2772f14b5"
        },
        "endpoint": {
          "address": "0x93f54D755A063cE7bB9e6Ac47Eccc8e33411d706"
        },
        "chainKey": "fuji",
        "stage": "testnet",
        "relayerV2": {
          "address": "0xA30444B26C171B27c6B3698544490Affa2e12119"
        },
        "ultraLightNodeV2": {
          "address": "0xfDDAFFa49e71dA3ef0419a303a6888F94bB5Ba18"
        },
        "sendUln301": {
          "address": "0x184e24e31657Cf853602589fe5304b144a826c85"
        },
        "receiveUln301": {
          "address": "0x91df17bF1Ced54c6169e1E24722C0a88a447cBAf"
        },
        "version": 1,
        "nonceContract": {
          "address": "0xB401d261F971E550FAeE4Bb0D28f92a30E812105"
        }
      },
      {
        "eid": "40106",
        "endpointV2View": {
          "address": "0x31fFd858c7826817F830C3dF2bb2A74126d51126"
        },
        "chainKey": "fuji",
        "stage": "testnet",
        "executor": {
          "address": "0xa7BFA9D51032F82D649A501B6a1f922FC2f7d4e3"
        },
        "endpointV2": {
          "address": "0x6EDCE65403992e310A62460808c4b910D972f10f"
        },
        "sendUln302": {
          "address": "0x69BF5f48d2072DfeBc670A1D19dff91D0F4E8170"
        },
        "lzExecutor": {
          "address": "0x1356D9201036A216836925803512649d6BB2395e"
        },
        "blockedMessageLib": {
          "address": "0x0c77d8d771ab35e2e184e7ce127f19ced31ff8c0"
        },
        "version": 2,
        "receiveUln302": {
          "address": "0x819F0FAF2cb1Fba15b9cB24c9A2BDaDb0f895daf"
        }
      }
    ],
    "chainDetails": {
      "chainKey": "fuji",
      "chainStatus": "ACTIVE",
      "nativeChainId": 43113,
      "chainLayer": "L1",
      "nativeCurrency": {
        "name": "Avalanche Token",
        "symbol": "AVAX",
        "cgId": "avalanche-2",
        "cmcId": 5805,
        "decimals": 18
      },
      "name": "Fuji",
      "chainType": "evm",
      "shortName": "Avalanche"
    },
    "dvns": {
      "0x8ca279897cde74350bd880737fd60c047d6d3d64": {
        "id": "bitgo",
        "version": 2,
        "canonicalName": "Bitgo",
        "deprecated": true
      },
      "0xdbec329a5e6d7fb0113eb0a098750d2afd61e9ae": {
        "version": 2,
        "canonicalName": "P2P",
        "id": "p2p"
      },
      "0xefdd92121acb3acd6e2f09dd810752d8da3dfdaf": {
        "version": 2,
        "canonicalName": "Republic",
        "id": "republic-crypto"
      },
      "0xa4652582077afc447ea7c9e984d656ee4963fe95": {
        "version": 2,
        "canonicalName": "Google",
        "id": "google-cloud"
      },
      "0x7883f83ea40a56137a63baf93bfee5b9b8c1c447": {
        "version": 2,
        "canonicalName": "Nethermind",
        "id": "nethermind"
      },
      "0x0d88ab4c8e8f89d8d758cbd5a6373f86f7bd737b": {
        "version": 2,
        "canonicalName": "BWare",
        "id": "bware-labs"
      },
      "0xca5ab7adcd3ea879f1a1c4eee81eaccd250173e4": {
        "version": 2,
        "canonicalName": "Switchboard",
        "id": "switchboard"
      },
      "0x9f0e79aeb198750f963b6f30b99d87c6ee5a0467": {
        "version": 2,
        "canonicalName": "LayerZero Labs",
        "id": "layerzero-labs"
      },
      "0xbc00fc17db9ae7c5cc957932688a686cab095936": {
        "version": 2,
        "canonicalName": "Horizen",
        "id": "horizen-labs"
      },
      "0x92cfdb3789693c2ae7225fcc2c263de94d630be4": {
        "version": 1,
        "canonicalName": "TSS",
        "id": "tss"
      },
      "0xe0f3389bf8a8aa1576b420d888cd462483fdc2a0": {
        "version": 2,
        "canonicalName": "Delegate",
        "id": "delegate"
      },
      "0xfde647565009b33b1df02689d5873bffff15d907": {
        "version": 2,
        "canonicalName": "Stablelab",
        "id": "stablelab"
      },
      "0xa1d84e5576299acda9ffed53195eadbe60d48e83": {
        "version": 2,
        "canonicalName": "Bitgo",
        "id": "bitgo"
      },
      "0x071fbf35b35d48afc3edf84f0397980c25531560": {
        "id": "gitcoin",
        "version": 2,
        "canonicalName": "Gitcoin",
        "deprecated": true
      }
    },
    "rpcs": [
      {
        "rank": 1,
        "url": "https://api.avax-test.network/ext/bc/C/rpc"
      },
      {
        "rank": 1,
        "url": "https://avalanche-fuji.drpc.org"
      },
      {
        "rank": 1,
        "url": "https://api.zan.top/avax-fuji/ext/bc/C/rpc"
      },
      {
        "rank": 1,
        "url": "https://ava-testnet.public.blastapi.io/ext/bc/C/rpc"
      },
      {
        "rank": 1,
        "url": "https://avalanche-fuji-c-chain-rpc.publicnode.com"
      },
      {
        "rank": 1,
        "url": "https://avalanche-fuji.therpc.io"
      }
    ],
    "addressToOApp": {
      "0xe9e30a0ad0d8af5cf2606ea720052e28d6fcbaaf": {
        "id": "holograph",
        "canonicalName": "Holograph"
      },
      "0xa4125191e017cdf143255371a9e056f83a839b42": {
        "id": "beam-bridge",
        "canonicalName": "Beam Bridge"
      },
      "0xfa12ffef9d6f0b3f18c60b3d219b9e5136b81926": {
        "id": "tradable",
        "canonicalName": "Tradable"
      },
      "0x6f484eacd997d9880205af22f6a4881ea0e1ccd7": {
        "id": "holograph",
        "canonicalName": "Holograph"
      },
      "0x225436ba1b4096afb14c374b8d1c6fd666e2fb41": {
        "id": "synthr",
        "canonicalName": "SYNTHR"
      },
      "0x7e562c90c2ad0295e837b2b4a4b42301e19faa33": {
        "id": "tapiocadao",
        "canonicalName": "TapiocaDAO"
      },
      "0x777c19834a1a2ff6353a1e9cfb7c799ed7943a11": {
        "id": "holograph",
        "canonicalName": "Holograph"
      },
      "0xa59d43445ef7403076277bd18cb2479bbb6cd31f": {
        "id": "beyond",
        "canonicalName": "Beyond"
      },
      "0xeadf4c87fa5ebdc5e925c09e989316199d42f108": {
        "id": "volta-club",
        "canonicalName": "Volta Club"
      },
      "0x66cdc567924d04e94abaa4d8bbbb33ef73d7713a": {
        "id": "beam-bridge",
        "canonicalName": "Beam Bridge"
      },
      "0xa30444b26c171b27c6b3698544490affa2e12119": {
        "id": "toinou-oft",
        "canonicalName": "TOINOU OFT"
      },
      "0x0b0f01f9214680cf1a67efabdd31d8281dc29551": {
        "id": "tapiocadao",
        "canonicalName": "TapiocaDAO"
      },
      "0xc9264255e1ae0cc80ceadd0056c63dc1caed28ad": {
        "id": "holograph",
        "canonicalName": "Holograph"
      },
      "0xdae4fa5e4a831931a94ef865ceb08f3d8640c6a0": {
        "id": "beam-bridge",
        "canonicalName": "Beam Bridge"
      },
      "0xb92de63eb7d8a652bf80385906812f92d49c5139": {
        "id": "synthr",
        "canonicalName": "SYNTHR"
      },
      "0xf1e06e45913ec0dc5856232e022e0f003c7b2b3f": {
        "id": "tutorial",
        "canonicalName": "LayerZero Tutorial"
      },
      "0x40174bf6df1a49d8faa84dd1c6440ab59371116e": {
        "id": "swapsicle",
        "canonicalName": "Swapsicle"
      },
      "0x4a339b39fe35913f8e809949eeff6bc96796820d": {
        "id": "layer3",
        "canonicalName": "Layer3"
      },
      "0x5164db46a18c8680393b6df36c0bcc724078a4d9": {
        "id": "shibx",
        "canonicalName": "SHIBX"
      },
      "0x88fee109bc31132ca518165e4383f927cb140eca": {
        "id": "dexalot",
        "canonicalName": "Dexalot"
      },
      "0xc2b5190c4e766212eb0a7065acb623a4c003a4bc": {
        "id": "swapsicle",
        "canonicalName": "Swapsicle"
      },
      "0xc360540950f50376e20ec3c06a5d93adf2728daf": {
        "id": "beam-bridge",
        "canonicalName": "Beam Bridge"
      },
      "0x9038f55ca0e2af8c4413bfe2855b912116ee0be7": {
        "id": "synthr",
        "canonicalName": "SYNTHR"
      },
      "0xa67a22d0227a92fb40ed5b4d6aa8ed01e09e4b94": {
        "id": "tapiocadao",
        "canonicalName": "TapiocaDAO"
      },
      "0xd315ead5c0fc0fb87fdb8b1bb48323fb2ad7adaf": {
        "id": "tapiocadao",
        "canonicalName": "TapiocaDAO"
      },
      "0x034697223c82c3abec358d0ccd68f5713fc21011": {
        "id": "gh0stly-gh0sts",
        "canonicalName": "Gh0stly Gh0sts"
      },
      "0xbdb2d676b35ee4ed0862614572e9f375b06c4a9a": {
        "id": "orderly-network",
        "canonicalName": "Orderly Network"
      },
      "0x6175a322e284e6a5ff5f8bcdbe82d30b047e22d4": {
        "id": "canto",
        "canonicalName": "Canto"
      },
      "0x803305930c1bbae396d03f496a7bf53ad7fd4303": {
        "id": "holograph",
        "canonicalName": "Holograph"
      },
      "0xc9de4ee312b90d42e53377a0ca7ffc5c8bf2b490": {
        "id": "tapiocadao",
        "canonicalName": "TapiocaDAO"
      },
      "0x9722c903eb9847bb88cd1e2391105171627ffc61": {
        "id": "tapiocadao",
        "canonicalName": "TapiocaDAO"
      },
      "0x991a8980d07cc48e531727095b7145b662449f9f": {
        "id": "hourglass",
        "canonicalName": "Hourglass"
      },
      "0xa4c2ad773b62e42b577d96865af4608fc77b58f3": {
        "id": "hourglass",
        "canonicalName": "Hourglass"
      },
      "0xb86dd73015590dc0bee11740aec3492727e44953": {
        "id": "tapiocadao",
        "canonicalName": "TapiocaDAO"
      },
      "0xc173624557f5c9b9c682eb82a04e1407d3794da6": {
        "id": "lendvest",
        "canonicalName": "Lendvest"
      },
      "0xf7a7fbf4edd64c9d0d8ff1149c1229cd38b2a261": {
        "id": "tide-exchange",
        "canonicalName": "Tide Exchange"
      },
      "0xcfa841d8bb654c4c23bf60a39428f170a7035f29": {
        "id": "ethenanova-space",
        "canonicalName": "Ethenanova Space"
      },
      "0xeef44c57d2fe281f5e10592ae2db7f45a463ea3d": {
        "id": "betswirl",
        "canonicalName": "BetSwirl"
      },
      "0x1e9bc397180eb625b28f3464eade1c928df2a33b": {
        "id": "tapiocadao",
        "canonicalName": "TapiocaDAO"
      },
      "0x4056aa23696ed2a77f68860920011b2354cfdaa8": {
        "id": "soul",
        "canonicalName": "Soul Protocol"
      },
      "0x0936a04505ea9c6ede026c81ec4e3d527388b706": {
        "id": "tapiocadao",
        "canonicalName": "TapiocaDAO"
      },
      "0xe42bd199bfe8beb3fb0cdcce72bbcd512b2ba35d": {
        "id": "beam-bridge",
        "canonicalName": "Beam Bridge"
      },
      "0x29fbc4e4092db862218c62a888a00f9521619230": {
        "id": "stargate",
        "canonicalName": "Stargate"
      },
      "0x18fac63ab1576141a9163b4d9cf3867123a6cead": {
        "id": "hourglass",
        "canonicalName": "Hourglass"
      },
      "0x24e77cd450cb18eb71762273412d1a59d6df425b": {
        "id": "term-finance",
        "canonicalName": "Term Finance"
      },
      "0x42443226e8f55f27c5bd4e33a0138f9fd21b0de8": {
        "id": "layersync",
        "canonicalName": "LayerSync"
      },
      "0xc27a0e3e938ea734c379635b0107a8fe7d520f33": {
        "id": "synthr",
        "canonicalName": "SYNTHR"
      },
      "0x0b78fd46cfae0ab2d3463ae7a384b81ff6e1bb43": {
        "id": "tradable",
        "canonicalName": "Tradable"
      },
      "0x5788ecaa5e93485bb657828580d18790794729e7": {
        "id": "hourglass",
        "canonicalName": "Hourglass"
      },
      "0xbec70f2e023c823442cf2d21b95ea21ff7575267": {
        "id": "cashmere",
        "canonicalName": "CashmereLabs"
      }
    },
    "chainName": "avalanche",
    "tokens": {
      "0x89c1d24ffb34020a9be5463bd2578ff966e9f303": {
        "symbol": "USDC",
        "decimals": 6
      },
      "0xfc01a763ef0af935db343d2c1adedc0591c56012": {
        "type": "NativeOFT",
        "symbol": "MOFT",
        "decimals": 18
      },
      "0xf922d8b8ec0180b64dfcf07d205145b7e25c433e": {
        "symbol": "FRNT",
        "erc20TokenAddress": "0x15a2ea73f7e75264cfab564bbd3c82ae76fcec56",
        "type": "ProxyOFT",
        "decimals": 6,
        "sharedDecimals": 6
      },
      "0x15a2ea73f7e75264cfab564bbd3c82ae76fcec56": {
        "proxyAddresses": [
          "0xf922d8b8ec0180b64dfcf07d205145b7e25c433e"
        ],
        "symbol": "FRNT",
        "type": "ERC20",
        "decimals": 6
      },
      "0x144843929df063312a083db6f0a0ff5697abed4a": {
        "symbol": "USDT",
        "decimals": 6
      }
    },
    "chainKey": "fuji"
  },
  "bsc-testnet": {
    "created": "2025-09-25T03:30:55.000Z",
    "updated": "2025-09-25T03:30:55.000Z",
    "tableName": "layerzero-chain_metadata",
    "environment": "testnet",
    "blockExplorers": [
      {
        "url": "https://testnet.bscscan.com"
      }
    ],
    "deployments": [
      {
        "ultraLightNode": {
          "address": "0x0322f521A328475f954F16933a386748f9942ec7"
        },
        "eid": "10102",
        "relayer": {
          "address": "0x74BE2A87a1F089bA3B0d04c7217eE8855d938835"
        },
        "endpoint": {
          "address": "0x6Fcb97553D41516Cb228ac03FdC8B9a0a9df04A1"
        },
        "chainKey": "bsc-testnet",
        "stage": "testnet",
        "relayerV2": {
          "address": "0xc0eb57BF242f8DD78a1AAA0684b15FAda79B6F85"
        },
        "ultraLightNodeV2": {
          "address": "0x40380d87B70F07C67Ed724a6ea14432Fe24b72A8"
        },
        "sendUln301": {
          "address": "0x65e2DdD01cf0f1e27090052fF64f061d236206fd"
        },
        "receiveUln301": {
          "address": "0xA4b12509e4267e3139249223c294bB16b6F1578b"
        },
        "version": 1,
        "nonceContract": {
          "address": "0x318b10788404E23dE2e02d52fA1329BDf6efD1FE"
        }
      },
      {
        "eid": "40102",
        "endpointV2View": {
          "address": "0x9a8E38C2394A4ec94421750b96a67A5CeF75EbfE"
        },
        "chainKey": "bsc-testnet",
        "stage": "testnet",
        "executor": {
          "address": "0x31894b190a8bAbd9A067Ce59fde0BfCFD2B18470"
        },
        "endpointV2": {
          "address": "0x6EDCE65403992e310A62460808c4b910D972f10f"
        },
        "sendUln302": {
          "address": "0x55f16c442907e86D764AFdc2a07C2de3BdAc8BB7"
        },
        "lzExecutor": {
          "address": "0x2b8e58866f7312b97Bd66d76BC7d911721563B71"
        },
        "blockedMessageLib": {
          "address": "0x0c77d8d771ab35e2e184e7ce127f19ced31ff8c0"
        },
        "version": 2,
        "receiveUln302": {
          "address": "0x188d4bbCeD671A7aA2b5055937F79510A32e9683"
        }
      }
    ],
    "chainDetails": {
      "chainKey": "bsc-testnet",
      "chainStatus": "ACTIVE",
      "nativeChainId": 97,
      "chainLayer": "L1",
      "nativeCurrency": {
        "name": "BNB",
        "symbol": "BNB",
        "cgId": "binancecoin",
        "cmcId": 1839,
        "decimals": 18
      },
      "name": "Binance Test Chain",
      "chainType": "evm",
      "shortName": "BNB"
    },
    "dvns": {
      "0x1337afd780b599b0af07fb0043226f02bc7fe92f": {
        "version": 2,
        "canonicalName": "Mantle01",
        "id": "mantle01"
      },
      "0x7baa95c10cc99c7687d31fc5b45b6b916362ed22": {
        "version": 2,
        "canonicalName": "Bitgo",
        "id": "bitgo"
      },
      "0x53ccb44479b2666cf93f5e815f75738aa5c6d3b9": {
        "version": 1,
        "canonicalName": "TSS",
        "id": "tss"
      },
      "0x2ddf08e397541721acd82e5b8a1d0775454a180b": {
        "version": 2,
        "canonicalName": "Polyhedra",
        "id": "polyhedra-network"
      },
      "0x0ee552262f7b562efced6dd4a7e2878ab897d405": {
        "version": 2,
        "canonicalName": "LayerZero Labs",
        "id": "layerzero-labs"
      },
      "0x35fa068ec18631719a7f6253710ba29ab5c5f3b7": {
        "version": 2,
        "canonicalName": "BWare",
        "id": "bware-labs"
      },
      "0x6f978ee5bfd7b1a8085a3ea9e54eb76e668e195a": {
        "id": "gitcoin",
        "version": 2,
        "canonicalName": "Gitcoin",
        "deprecated": true
      },
      "0x6f99ea3fc9206e2779249e15512d7248dab0b52e": {
        "version": 2,
        "canonicalName": "Google",
        "id": "google-cloud"
      },
      "0xd0a6fd2e542945d81d4ed82d8f4d25cc09c65f7f": {
        "version": 2,
        "canonicalName": "P2P",
        "id": "p2p"
      },
      "0x6334290b7b4a365f3c0e79c85b1b42f078db78e4": {
        "version": 2,
        "canonicalName": "Nethermind",
        "id": "nethermind"
      },
      "0x16b711e3284e7c1d3b7eed25871584ad8d946cac": {
        "id": "bitgo",
        "version": 2,
        "canonicalName": "Bitgo",
        "deprecated": true
      },
      "0xcd02c60d6a23966bd74d435df235a941b35f4f5f": {
        "version": 2,
        "canonicalName": "Delegate",
        "id": "delegate"
      },
      "0x4ecbb26142a1f2233aeee417fd2f4fb0ec6e0d78": {
        "version": 2,
        "canonicalName": "Switchboard",
        "id": "switchboard"
      },
      "0x33ba0e70d74c72d3633870904244b57edfb35df7": {
        "version": 2,
        "canonicalName": "Republic",
        "id": "republic-crypto"
      },
      "0xd05c27f2e47fbba82adaac2a5adb71ba57a5b933": {
        "version": 2,
        "canonicalName": "Stablelab",
        "id": "stablelab"
      },
      "0x98a7ad52b970d9b350fdee17d3892bbe79d0132a": {
        "version": 2,
        "canonicalName": "Horizen",
        "id": "horizen-labs"
      }
    },
    "rpcs": [
      {
        "rank": 0,
        "url": "https://api.zan.top/bsc-testnet"
      },
      {
        "rank": 1,
        "url": "https://bsc-testnet.drpc.org"
      },
      {
        "rank": 1,
        "url": "https://data-seed-prebsc-1-s1.bnbchain.org:8545"
      },
      {
        "rank": 1,
        "url": "https://data-seed-prebsc-2-s1.bnbchain.org:8545"
      },
      {
        "rank": 1,
        "url": "https://data-seed-prebsc-1-s2.bnbchain.org:8545"
      },
      {
        "rank": 1,
        "url": "https://data-seed-prebsc-2-s2.bnbchain.org:8545"
      },
      {
        "rank": 1,
        "url": "https://data-seed-prebsc-1-s1.binance.org:8545"
      },
      {
        "rank": 1,
        "url": "https://data-seed-prebsc-1-s3.binance.org:8545"
      },
      {
        "rank": 1,
        "url": "https://data-seed-prebsc-2-s3.bnbchain.org:8545"
      },
      {
        "rank": 1,
        "url": "https://data-seed-prebsc-1-s3.bnbchain.org:8545"
      },
      {
        "rank": 1,
        "url": "https://data-seed-prebsc-1-s2.binance.org:8545"
      },
      {
        "rank": 1,
        "url": "https://bsc-testnet-rpc.publicnode.com"
      },
      {
        "rank": 1,
        "url": "https://bsc-testnet.public.blastapi.io"
      },
      {
        "rank": 1,
        "url": "https://data-seed-prebsc-2-s2.binance.org:8545"
      },
      {
        "rank": 1,
        "url": "https://data-seed-prebsc-2-s1.binance.org:8545"
      },
      {
        "rank": 1,
        "url": "https://bnb-testnet.api.onfinality.io/public"
      }
    ],
    "addressToOApp": {
      "0x6c1fc51810f9cd6d56d8581394f76ea12c3cea1b": {
        "id": "squid-game",
        "canonicalName": "SQUID Game"
      },
      "0x87072008edec67b5265c95a8d5bc68211c3de156": {
        "id": "tide-exchange",
        "canonicalName": "Tide Exchange"
      },
      "0x22514ffb0d7232a56f0c24090e7b68f179faa940": {
        "id": "qorpo",
        "canonicalName": "QORPO"
      },
      "0x0e132cd94fd70298b747d2b4d977db8d086e5fd0": {
        "id": "venus-protocol",
        "canonicalName": "Venus Protocol"
      },
      "0x98de47c1a577558356a702a5267633cc133741dd": {
        "id": "squid-game",
        "canonicalName": "SQUID Game"
      },
      "0xe9e30a0ad0d8af5cf2606ea720052e28d6fcbaaf": {
        "id": "holograph",
        "canonicalName": "Holograph"
      },
      "0xd1c6b840d81344f60b0c290bb944511cbbf46e4e": {
        "id": "ait",
        "canonicalName": "AIT"
      },
      "0xa7a357cf185ab95cd51766a18f5ecdeef2daa664": {
        "id": "tradable",
        "canonicalName": "Tradable"
      },
      "0x57b96ccc55b0fe0e475edaaa1bb024e63f5f7b6d": {
        "id": "ethenanova-space",
        "canonicalName": "Ethenanova Space"
      },
      "0xf4ec7de2e2de7b1aa94eb2f883e6aba4b02aebb0": {
        "id": "cashmere",
        "canonicalName": "CashmereLabs"
      },
      "0x501db67e4fb1b13549ab3a689c6a8cec25c3b7f9": {
        "id": "sidus-heroes",
        "canonicalName": "Sidus Heroes"
      },
      "0x0fd58375f7849487f14f68812ddb35d59e1bad79": {
        "id": "stargate",
        "canonicalName": "Stargate"
      },
      "0x89f1b3f4ac159eb54d582807742814e59eb9acc8": {
        "id": "synthr",
        "canonicalName": "SYNTHR"
      },
      "0xf5b974638a054550cb41b60e7adcd6787b05d4b5": {
        "id": "betswirl",
        "canonicalName": "BetSwirl"
      },
      "0x4f1f83386cb399616495ef3a12e7d1dd1ddb1692": {
        "id": "hourglass",
        "canonicalName": "Hourglass"
      },
      "0x184537a204f8763e71b73cfe4eb0ccd50fe581d2": {
        "id": "fetcch",
        "canonicalName": "Fetcch"
      },
      "0x1eefcdfa0bf820a975d4b6dbca4c9469101c9b6e": {
        "id": "synthr",
        "canonicalName": "SYNTHR"
      },
      "0x6f484eacd997d9880205af22f6a4881ea0e1ccd7": {
        "id": "holograph",
        "canonicalName": "Holograph"
      },
      "0x034697223c82c3abec358d0ccd68f5713fc21011": {
        "id": "gh0stly-gh0sts",
        "canonicalName": "Gh0stly Gh0sts"
      },
      "0x77e1ef1a9774a0c75cb7d58184f2d979b6073f4e": {
        "id": "degenscan",
        "canonicalName": "Degenscan"
      },
      "0xd1a199ec4d7eda6f367cfcb31b0fc2524ec8d4d2": {
        "id": "hourglass",
        "canonicalName": "Hourglass"
      },
      "0x6fcb97553d41516cb228ac03fdc8b9a0a9df04a1": {
        "id": "synthr",
        "canonicalName": "SYNTHR"
      },
      "0x777c19834a1a2ff6353a1e9cfb7c799ed7943a11": {
        "id": "holograph",
        "canonicalName": "Holograph"
      },
      "0x420c2c9a1096174f5acb4218ff80fc043f6b5ae3": {
        "id": "orbofi",
        "canonicalName": "Orbofi"
      },
      "0x9789ca418ee5aef036a87f2a6fd1a9b9b2ff2ddb": {
        "id": "synthr",
        "canonicalName": "SYNTHR"
      },
      "0x4ee410bde1bbb78e24f0719af5e83ed4d0a26e40": {
        "id": "zkverify",
        "canonicalName": "zkVerify"
      },
      "0x803305930c1bbae396d03f496a7bf53ad7fd4303": {
        "id": "holograph",
        "canonicalName": "Holograph"
      },
      "0xcdf79e85a5e8ffd8d93def3d3c7580b8ab8870cd": {
        "id": "hardhit",
        "canonicalName": "HARDHIT"
      },
      "0x2a43c670571359d27e1b2ac84ebc28ef28431072": {
        "id": "ait",
        "canonicalName": "AIT"
      },
      "0x1a2dc7f4a90a1266a9c66191ccdb2961a5bdd2ee": {
        "id": "stargate",
        "canonicalName": "Stargate"
      },
      "0xc9264255e1ae0cc80ceadd0056c63dc1caed28ad": {
        "id": "holograph",
        "canonicalName": "Holograph"
      },
      "0x2456a21ec28eba80640f37b952103d664d1c3c8f": {
        "id": "cockadoods",
        "canonicalName": "Cockadoods"
      },
      "0xa1e105511416aec3200cce7069548cf332c6dca2": {
        "id": "stargate",
        "canonicalName": "Stargate"
      },
      "0x7ceda253df99066214a2228670105a9a75e44a0b": {
        "id": "degenscan",
        "canonicalName": "Degenscan"
      },
      "0x904c3c9ca9d03a2095673bdd109c924e997a8088": {
        "id": "layersync",
        "canonicalName": "LayerSync"
      },
      "0x078befb39b8d0c8a51ba6d2e081ce21ecd5d34b3": {
        "id": "stargate",
        "canonicalName": "Stargate"
      },
      "0x56f941e4442a766c41a5005cbe8bc9a03b2629eb": {
        "id": "xenify",
        "canonicalName": "Xenify"
      },
      "0xf1e06e45913ec0dc5856232e022e0f003c7b2b3f": {
        "id": "tutorial",
        "canonicalName": "LayerZero Tutorial"
      },
      "0x1c81e23e1c185d3bede09f35e598ba8fdf7bbed4": {
        "id": "synthr",
        "canonicalName": "SYNTHR"
      },
      "0x5c9008b1424ba942594f6c7aa5f23af78438bacd": {
        "id": "joule-finance",
        "canonicalName": "Joule Finance"
      },
      "0x9be0145bda51a271d80372d5b40ff6d30c778d9f": {
        "id": "ait",
        "canonicalName": "AIT"
      },
      "0xc3a9e5352972379dbe52709de64addbe15ed673a": {
        "id": "battlemon",
        "canonicalName": "Battlemon"
      },
      "0x15e67ab6a07d2222766ad24dd71d31cebdc79d42": {
        "id": "mavia",
        "canonicalName": "Mavia"
      },
      "0xe19525580913971d220dba3bbd01ee2a0b1adc6f": {
        "id": "stargate",
        "canonicalName": "Stargate"
      }
    },
    "chainName": "bsc",
    "tokens": {
      "0xaed3359b7afe5d420e69c15011cd33fd45890e50": {
        "symbol": "STG",
        "decimals": 18
      },
      "0xba3dff05107bc1085ce50db1c014116d372443cc": {
        "symbol": "STG",
        "decimals": 18
      },
      "0xe37bdc6f09dab6ce6e4ebc4d2e72792994ef3765": {
        "symbol": "USDT",
        "decimals": 6
      },
      "0x118fae8f40e902dc4c97659cd0cd1836c7c468f6": {
        "symbol": "STG",
        "decimals": 18
      },
      "0x1e8a86ecc9dc41106d3834c6f1033d86939b1e0d": {
        "symbol": "STG",
        "decimals": 18
      }
    },
    "chainKey": "bsc-testnet"
  },
  "sepolia": {
    "created": "2025-09-25T03:30:57.000Z",
    "updated": "2025-09-25T03:30:57.000Z",
    "tableName": "layerzero-chain_metadata",
    "environment": "testnet",
    "blockExplorers": [
      {
        "url": "https://sepolia.etherscan.io"
      }
    ],
    "deployments": [
      {
        "eid": "10161",
        "endpoint": {
          "address": "0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1"
        },
        "chainKey": "sepolia",
        "stage": "testnet",
        "relayerV2": {
          "address": "0x6Ac7bdc07A0583A362F1497252872AE6c0A5F5B8"
        },
        "ultraLightNodeV2": {
          "address": "0x3aCAAf60502791D199a5a5F0B173D78229eBFe32"
        },
        "sendUln301": {
          "address": "0x6862b19f6e42a810946B9C782E6ebE26Ad266C84"
        },
        "receiveUln301": {
          "address": "0x5937A5fe272fbA38699A1b75B3439389EEFDb399"
        },
        "version": 1,
        "nonceContract": {
          "address": "0x55370E0fBB5f5b8dAeD978BA1c075a499eB107B8"
        }
      },
      {
        "eid": "40161",
        "chainKey": "sepolia",
        "endpointV2": {
          "address": "0x6EDCE65403992e310A62460808c4b910D972f10f"
        },
        "readLib1002": {
          "address": "0x908E86e9cb3F16CC94AE7569Bf64Ce2CE04bbcBE"
        },
        "version": 2,
        "endpointV2View": {
          "address": "0x982Ca8b3532236C5e77Ff215791dD454e07E21F7"
        },
        "stage": "testnet",
        "executor": {
          "address": "0x718B92b5CB0a5552039B593faF724D182A881eDA"
        },
        "deadDVN": {
          "address": "0x8b450b0acF56E1B0e25C581bB04FBAbeeb0644b8"
        },
        "sendUln302": {
          "address": "0xcc1ae8Cf5D3904Cef3360A9532B477529b177cCE"
        },
        "lzExecutor": {
          "address": "0x34a561197e4eAe356D41B0B02C59F12a5C576C5A"
        },
        "blockedMessageLib": {
          "address": "0x0c77d8d771ab35e2e184e7ce127f19ced31ff8c0"
        },
        "receiveUln302": {
          "address": "0xdAf00F5eE2158dD58E0d3857851c432E34A3A851"
        }
      },
      {
        "eid": "161",
        "endpoint": {
          "address": "0x7cacBe439EaD55fa1c22790330b12835c6884a91"
        },
        "chainKey": "sepolia",
        "stage": "mainnet",
        "relayerV2": {
          "address": "0x306B9a8953B9462F8b826e6768a93C8EA7454965"
        },
        "ultraLightNodeV2": {
          "address": "0x41Bdb4aa4A63a5b2Efc531858d3118392B1A1C3d"
        },
        "version": 1,
        "nonceContract": {
          "address": "0xc097ab8CD7b053326DFe9fB3E3a31a0CCe3B526f"
        }
      },
      {
        "eid": "30161",
        "chainKey": "sepolia",
        "stage": "mainnet",
        "version": 2,
        "deadDVN": {
          "address": "0xF53857dbc0D2c59D5666006EC200cbA2936B8c35"
        }
      }
    ],
    "chainDetails": {
      "mainnetChainName": "ethereum",
      "chainKey": "sepolia",
      "chainStatus": "ACTIVE",
      "nativeChainId": 11155111,
      "chainLayer": "L1",
      "nativeCurrency": {
        "name": "Sepolia Ether",
        "symbol": "SETH",
        "cgId": "ethereum",
        "decimals": 18
      },
      "name": "Sepolia",
      "chainType": "evm",
      "shortName": "sep"
    },
    "dvns": {
      "0x51172653a6a1ebb0d4d716bf2e4f57f41507668c": {
        "environment": "testnet",
        "id": "paxos",
        "version": 2,
        "canonicalName": "Paxos"
      },
      "0xa6bcc8c553ea756c8ad393d2cf379bfb59856499": {
        "id": "mantle01",
        "version": 2,
        "canonicalName": "Mantle01",
        "deprecated": true
      },
      "0x120be7fabde72292e2a56240610db1ca54ae4000": {
        "environment": "testnet",
        "id": "citrea",
        "version": 2,
        "canonicalName": "Citrea"
      },
      "0x36ebea3941907c438ca8ca2b1065deef21ccdaed": {
        "id": "tss",
        "version": 1,
        "canonicalName": "TSS",
        "deprecated": true
      },
      "0x6943872cfc48f6b18f8b81d57816733d4545eca3": {
        "environment": "testnet",
        "id": "mantle01",
        "version": 2,
        "canonicalName": "Mantle01"
      },
      "0x906094951a041f8f45b31e6dbd6b2d1a0d758fbb": {
        "environment": "testnet",
        "id": "predicate",
        "version": 2,
        "canonicalName": "Predicate"
      },
      "0x28b92d35407caa791531cd7f7d215044f4c0cbdd": {
        "id": "gitcoin",
        "version": 2,
        "canonicalName": "Gitcoin",
        "deprecated": true
      },
      "0xca7a736be0fe968a33af62033b8b36d491f7999b": {
        "environment": "testnet",
        "id": "bware-labs",
        "version": 2,
        "canonicalName": "BWare"
      },
      "0xe7b65ec1ae41186ef626a3a3cbf79d0c0426a911": {
        "id": "p2p",
        "version": 2,
        "canonicalName": "P2P",
        "deprecated": true
      },
      "0xe4f5f5cd6229de94adc343deb86172c07b129bb0": {
        "environment": "testnet",
        "id": "mantle01",
        "version": 2,
        "canonicalName": "Mantle01",
        "deprecated": true
      },
      "0x843139c725c2fb9814de6a12fb890d8dbf3e1698": {
        "environment": "testnet",
        "id": "horizen-labs",
        "version": 2,
        "canonicalName": "Horizen"
      },
      "0x4386167355cda5dbb434e6997fe38fe1f4822c12": {
        "environment": "testnet",
        "id": "frax",
        "version": 2,
        "canonicalName": "Frax",
        "deprecated": true
      },
      "0xa6bf2be6c60175601bf88217c75dd4b14abb5fbb": {
        "environment": "mainnet",
        "id": "tss",
        "version": 1,
        "canonicalName": "TSS"
      },
      "0x00c5c0b8e0f75ab862cbaaecfff499db555fbdd2": {
        "environment": "testnet",
        "id": "tss",
        "version": 1,
        "canonicalName": "TSS"
      },
      "0x715a4451be19106bb7cefd81e507813e23c30768": {
        "id": "nethermind",
        "version": 2,
        "canonicalName": "Nethermind",
        "deprecated": true
      },
      "0x9efba56c8598853e5b40fd9a66b54a6c163742d7": {
        "environment": "testnet",
        "id": "p2p",
        "version": 2,
        "canonicalName": "P2P"
      },
      "0x000bfb182cc999879ffb5cd7cf9f1db18a454248": {
        "environment": "testnet",
        "id": "frax",
        "version": 2,
        "canonicalName": "Frax"
      },
      "0xac294c43d44d4131db389256959f33e713851e31": {
        "id": "bware-labs",
        "version": 2,
        "canonicalName": "BWare",
        "deprecated": true
      },
      "0x68802e01d6321d5159208478f297d7007a7516ed": {
        "environment": "testnet",
        "id": "nethermind",
        "version": 2,
        "canonicalName": "Nethermind"
      },
      "0x942afc25b43d6ffe6d990af37737841f580638d7": {
        "id": "delegate",
        "version": 2,
        "canonicalName": "Delegate",
        "deprecated": true
      },
      "0x76b3c210a22402e5e95f938074234676136c6023": {
        "environment": "testnet",
        "id": "horizen-labs",
        "lzReadCompatible": true,
        "version": 2,
        "canonicalName": "Horizen"
      },
      "0x8eebf8b423b73bfca51a1db4b7354aa0bfca9193": {
        "environment": "testnet",
        "id": "layerzero-labs",
        "version": 2,
        "canonicalName": "LayerZero Labs"
      },
      "0xefd1d76a2db92bad8fd56167f847d204f5f4004e": {
        "environment": "testnet",
        "id": "joc",
        "version": 2,
        "canonicalName": "Japan Blockchain Foundation"
      },
      "0x4f675c48fad936cb4c3ca07d7cbf421ceeae0c75": {
        "environment": "testnet",
        "id": "google-cloud",
        "version": 2,
        "canonicalName": "Google"
      },
      "0xf53857dbc0d2c59d5666006ec200cba2936b8c35": {
        "id": "lz-dead-dvn",
        "version": 2,
        "canonicalName": "LZDeadDVN",
        "deprecated": true
      },
      "0x9dc10a8de79f1de5242c88baa313b500490d764e": {
        "environment": "testnet",
        "id": "frax",
        "version": 2,
        "canonicalName": "Frax",
        "deprecated": true
      },
      "0x8b450b0acf56e1b0e25c581bb04fbabeeb0644b8": {
        "id": "lz-dead-dvn",
        "version": 2,
        "canonicalName": "LZDeadDVN",
        "deprecated": true
      },
      "0x15f5a70fc078279d7d4a7dd94811189364810111": {
        "environment": "testnet",
        "id": "mantle02",
        "version": 2,
        "canonicalName": "Mantle02",
        "deprecated": true
      },
      "0x96746917b256bdb8424496ff6bbcaf8216708a6a": {
        "id": "google-cloud",
        "version": 2,
        "canonicalName": "Google",
        "deprecated": true
      },
      "0x25f492a35ec1e60ebcf8a3dd52a815c2d167f4c3": {
        "environment": "testnet",
        "id": "altlayer",
        "version": 2,
        "canonicalName": "AltLayer"
      },
      "0x51e8907d6f3606587ba9f0aba4ece4c28ac31ec6": {
        "id": "switchboard",
        "version": 2,
        "canonicalName": "Switchboard",
        "deprecated": true
      },
      "0x530fbe405189204ef459fa4b767167e4d41e3a37": {
        "environment": "testnet",
        "id": "layerzero-labs",
        "lzReadCompatible": true,
        "version": 2,
        "canonicalName": "LayerZero Labs"
      },
      "0xf21f0282b55b4143251d8e39d3d93e78a78389ab": {
        "id": "stablelab",
        "version": 2,
        "canonicalName": "Stablelab",
        "deprecated": true
      },
      "0xdd7b5e1db4aafd5c8ec3b764efb8ed265aa5445b": {
        "environment": "mainnet",
        "id": "horizen-labs",
        "version": 2,
        "canonicalName": "Horizen"
      }
    },
    "rpcs": [
      {
        "rank": 1,
        "url": "https://rpc-sepolia.rockx.com"
      },
      {
        "rank": 2,
        "url": "https://op-sepolia-pokt.nodies.app"
      },
      {
        "rank": 2,
        "url": "https://eth-sepolia.public.blastapi.io"
      },
      {
        "rank": 2,
        "url": "https://sepolia.gateway.tenderly.co"
      },
      {
        "rank": 2,
        "url": "https://gateway.tenderly.co/public/sepolia"
      },
      {
        "rank": 2,
        "url": "https://api.zan.top/eth-sepolia"
      },
      {
        "rank": 2,
        "url": "https://ethereum-sepolia-rpc.publicnode.com"
      },
      {
        "rank": 2,
        "url": "https://1rpc.io/sepolia"
      },
      {
        "rank": 2,
        "url": "https://eth-sepolia.api.onfinality.io/public"
      },
      {
        "rank": 2,
        "url": "https://ethereum-sepolia.rpc.subquery.network/public"
      },
      {
        "rank": 2,
        "url": "https://0xrpc.io/sep"
      },
      {
        "rank": 2,
        "url": "https://rpc.sepolia.ethpandaops.io"
      },
      {
        "rank": 2,
        "url": "https://sepolia.drpc.org"
      }
    ],
    "addressToOApp": {
      "0xb5691e49f86cba649c815ee633679944b044bc43": {
        "id": "merkly",
        "canonicalName": "Merkly"
      },
      "0xa5fdde482b533767c8f2363c31e32d7650d5c2df": {
        "id": "yay",
        "canonicalName": "Yay"
      },
      "0xdd69db25f6d620a7bad3023c5d32761d353d3de9": {
        "id": "testnet-bridge",
        "canonicalName": "Testnet Bridge"
      },
      "0x6d47cb207ee241ce67b2750402de44bd1ba45482": {
        "id": "betswirl",
        "canonicalName": "BetSwirl"
      },
      "0xeb27b05178515c7e6e51dee159c8487a011ac030": {
        "id": "hmx",
        "canonicalName": "HMX"
      },
      "0x1615ea8b8208b05d0c298382ea7fc12bf65c78cc": {
        "id": "rootstock",
        "canonicalName": "Rootstock"
      },
      "0x4f7a67464b5976d7547c860109e4432d50afb38e": {
        "id": "testnet-bridge",
        "canonicalName": "Testnet Bridge"
      },
      "0x27e5d2fde8f24f74a232363785013dd3187cdd01": {
        "id": "hermes-v2",
        "canonicalName": "Hermes V2"
      },
      "0x15457b648a7e4898e24fe1366185603c7fbdd4e7": {
        "id": "parallel",
        "canonicalName": "Parallel"
      },
      "0xeedb0fff872e506b8c0451cd1cec15c15d6a25ab": {
        "id": "dump-trade",
        "canonicalName": "Dump.trade"
      },
      "0x4cb9547cdbb82b414fbfc4d5233f64365902f8c9": {
        "id": "rootstock",
        "canonicalName": "Rootstock"
      },
      "0x25c1782f54cd67c9771060fadb36c910884fe51d": {
        "id": "farcana",
        "canonicalName": "FARCANA"
      },
      "0x311f0dd563582f7a94ed605429446dcc6ba68bbf": {
        "id": "chedda-finance",
        "canonicalName": "Chedda Finance"
      },
      "0x6e296c220b36ac858aad1f61b053444a2bed6331": {
        "id": "metastreet",
        "canonicalName": "MetaStreet"
      },
      "0x571ef527bee601439fc319c42960c06a6867f4c0": {
        "id": "term-finance",
        "canonicalName": "Term Finance"
      },
      "0xcdf79e85a5e8ffd8d93def3d3c7580b8ab8870cd": {
        "id": "hardhit",
        "canonicalName": "HARDHIT"
      },
      "0x2d82366fb0a6ad5965ee516b6585a16c6cbdbf7e": {
        "id": "squid-game",
        "canonicalName": "SQUID Game"
      },
      "0xb0608c86a850e1c33c965272df19ab686061af28": {
        "id": "synthr",
        "canonicalName": "SYNTHR"
      },
      "0xa56dc4c966c6a8b8e6b2e76fa83da715bd692451": {
        "id": "detrip",
        "canonicalName": "DeTrip"
      },
      "0x2e5221b0f855be4ea5cefffb8311eed0563b6e87": {
        "id": "testnet-bridge",
        "canonicalName": "Testnet Bridge"
      },
      "0xca3540c99e144efbfad409ba99387eb6f2588e20": {
        "id": "synthr",
        "canonicalName": "SYNTHR"
      },
      "0x41680df55b33faad71d1b038e884173b873fa333": {
        "id": "vessel-finance",
        "canonicalName": "Vessel Finance"
      },
      "0x0b12a0f3da62903fa769f7502b88324445ac0dbc": {
        "id": "yay",
        "canonicalName": "Yay"
      },
      "0x93e5f549327bab41a1e33daebf27df27502cc818": {
        "id": "dappgate",
        "canonicalName": "DappGate"
      },
      "0xe5ececec372382a96fe8e88fdc52f327e0895245": {
        "id": "stargate",
        "canonicalName": "Stargate"
      },
      "0x0dbb7d305434d01cd9e408b0ddc5a227d563a921": {
        "id": "chedda-finance",
        "canonicalName": "Chedda Finance"
      },
      "0xb004c6399bbd9cf6f21ae98efd932e6c12f4870a": {
        "id": "merkly",
        "canonicalName": "Merkly"
      },
      "0x29ad73a1bbdcf46c6f1ac85d76b60c85068189d6": {
        "id": "yay",
        "canonicalName": "Yay"
      },
      "0x37f84c52e7af2ac039359b4484f65529d344b4f4": {
        "id": "stargate",
        "canonicalName": "Stargate"
      },
      "0x08d6474eb92e8c4df03e4223e0ec8d50f743c75f": {
        "id": "cryptorastas",
        "canonicalName": "CryptoRastas"
      },
      "0x859d1567c1bc0b5da6a0d9a6c27846b18dca7b5f": {
        "id": "parallel",
        "canonicalName": "Parallel"
      },
      "0xd63e09a2c73378b63de534e53ee0595c9d614755": {
        "id": "mavia",
        "canonicalName": "Mavia"
      },
      "0x1e489db1a75cd9a46cf4b490f8321f92276dcf0d": {
        "id": "parallel",
        "canonicalName": "Parallel"
      },
      "0x858428d7ba29ed952bf4a74036181187e8f5da2b": {
        "id": "tradable",
        "canonicalName": "Tradable"
      },
      "0x076806c6fb9c86843d18215fda1a8af45fe530eb": {
        "id": "dfk-today",
        "canonicalName": "DFK today"
      },
      "0x9f40916d0dfb2f8f5fb63d8f76826d09041f2eae": {
        "id": "merkly",
        "canonicalName": "Merkly"
      },
      "0x35a7a91081959a638b136840b01b9481f35b4cee": {
        "id": "toinou-oft",
        "canonicalName": "TOINOU OFT"
      },
      "0x0c9942d770527a54c803c60789b59d13cfbcde3a": {
        "id": "chedda-finance",
        "canonicalName": "Chedda Finance"
      },
      "0x22514ffb0d7232a56f0c24090e7b68f179faa940": {
        "id": "qorpo",
        "canonicalName": "QORPO"
      },
      "0xf836905a5c6e9dfbb88c4a9adf79f6a47b43ecbb": {
        "id": "merkly",
        "canonicalName": "Merkly"
      },
      "0x5ebbdaaa2c5715ac0c75cf14a5c92f1c59d3d181": {
        "id": "monbridgedex",
        "canonicalName": "Mon Bridge Dex"
      },
      "0xc340b7d3406502f43dc11a988e4ec5bbe536e642": {
        "id": "venus-protocol",
        "canonicalName": "Venus Protocol"
      },
      "0x23ebeb9538df8f844f774a102de27579fab980c7": {
        "id": "you-are-here",
        "canonicalName": "You Are Here"
      },
      "0x763d3fbc838247c04fa1ef1a603335384b0eaf21": {
        "id": "lendvest",
        "canonicalName": "Lendvest"
      },
      "0x244e087d1bd4ffe7a75ababf1b60267f437d8dae": {
        "id": "cere-network",
        "canonicalName": "Cere Network"
      },
      "0xdaf057867475d66f832828dd602ecbbec196ee97": {
        "id": "soul",
        "canonicalName": "Soul Protocol"
      },
      "0xe71bdfe1df69284f00ee185cf0d95d0c7680c0d4": {
        "id": "testnet-bridge",
        "canonicalName": "Testnet Bridge"
      },
      "0x885ef5813e46ab6efb10567b50b77aaad4d258ce": {
        "id": "merkly",
        "canonicalName": "Merkly"
      },
      "0xdb6a6ca2c31ea5993885859e412161eb4974e4ec": {
        "id": "metazero",
        "canonicalName": "MetaZero"
      },
      "0xcbfa283ccc60cf5151aaf5f73f9513e7321c8483": {
        "id": "chedda-finance",
        "canonicalName": "Chedda Finance"
      },
      "0x5a2ee1b8b242f7ab7989e03a4c33e65b2d39356d": {
        "id": "beyond",
        "canonicalName": "Beyond"
      },
      "0x73ecfe614ec61e388552b790a830263e823ff72f": {
        "id": "mavia",
        "canonicalName": "Mavia"
      },
      "0xfb112f7fc5725de9f630abb23e4916d6fd7526d3": {
        "id": "stargate",
        "canonicalName": "Stargate"
      },
      "0xd252ec0c597f0b1b41f4ed32ead6c0b9046142d7": {
        "id": "sumer-money",
        "canonicalName": "Sumer.Money"
      },
      "0x7d9405441f805da40e6e7f0cff4efdc175f18bf4": {
        "id": "mavia",
        "canonicalName": "Mavia"
      },
      "0x7aa19d72e4c02965af1201ab3f1be01b2e3bf3de": {
        "id": "yay",
        "canonicalName": "Yay"
      },
      "0x5e6a88bb6aad9346ec70d0e28fd822037a26ffdd": {
        "id": "stargate",
        "canonicalName": "Stargate"
      },
      "0xbf5ec327464603514227e969afdb76f391c49e92": {
        "id": "parallel",
        "canonicalName": "Parallel"
      },
      "0x66468126de4be2cab37c3c29104025f3c8aaeca9": {
        "id": "parallel",
        "canonicalName": "Parallel"
      },
      "0x5dc602d33fd276ed09118290375881e6724f5844": {
        "id": "ethenanova-space",
        "canonicalName": "Ethenanova Space"
      },
      "0x6bed67cd99a3bdb9db561173f5b998230085fe5d": {
        "id": "merkly",
        "canonicalName": "Merkly"
      }
    },
    "chainName": "sepolia",
    "tokens": {
      "0x827f537aed442c335f32b6f20faba8c6aa4f55ef": {
        "type": "NativeOFT",
        "symbol": "MOFT",
        "decimals": 18
      },
      "0xb15a3f6e64d2caffaf7927431ab0d1c21e429644": {
        "symbol": "USDT",
        "decimals": 18
      },
      "0x2e5221b0f855be4ea5cefffb8311eed0563b6e87": {
        "symbol": "SepoliaETH",
        "erc20TokenAddress": "0x0000000000000000000000000000000000000000",
        "decimals": 18,
        "name": "SepoliaETH",
        "peggedTo": {
          "symbol": "SepoliaETH",
          "chainName": "ethereum",
          "address": "0xe71bdfe1df69284f00ee185cf0d95d0c7680c0d4",
          "programaticallyPegged": true
        },
        "type": "ProxyOFT",
        "sharedDecimals": 18
      },
      "0x0000000000000000000000000000000000000000": {
        "name": "SepoliaETH",
        "peggedTo": {
          "symbol": "SepoliaETH",
          "chainName": "ethereum",
          "address": "0xe71bdfe1df69284f00ee185cf0d95d0c7680c0d4",
          "programaticallyPegged": true
        },
        "decimals": 18
      },
      "0x4f7a67464b5976d7547c860109e4432d50afb38e": {
        "name": "MainnetETH",
        "peggedTo": {
          "symbol": "ETH",
          "chainName": "ethereum",
          "address": "0x0000000000000000000000000000000000000000",
          "programaticallyPegged": true
        },
        "symbol": "MainnetETH",
        "type": "NativeOFT",
        "decimals": 18,
        "sharedDecimals": 18
      },
      "0xe6208639ff7a6c82060274d044e4158458af8549": {
        "symbol": "USDT0",
        "erc20TokenAddress": "0x411d14f0b6b10b321533a4f8b1c2f0350c03cc0f",
        "type": "ProxyOFT",
        "decimals": 6,
        "sharedDecimals": 6
      },
      "0x4cf28c9a7c7bb582eecbcdd69e83864141c897c1": {
        "symbol": "STG",
        "decimals": 18
      },
      "0xf3f2b4815a58152c9be53250275e8211163268ba": {
        "symbol": "USDT",
        "decimals": 6
      },
      "0xa0263418d30a75609ce915f9fbb7eaa5666b781c": {
        "symbol": "USDT0",
        "erc20TokenAddress": "0x1287ee65d703db00bb0c9488acb97353f1f66087",
        "type": "ProxyOFT",
        "decimals": 6,
        "sharedDecimals": 6
      },
      "0x22fbc5e582fb03040243cb0c8671c8e14c2d110d": {
        "symbol": "STG",
        "decimals": 18
      },
      "0x0790be41d2f58fb8fe23ee03b33ae25e7b9436bc": {
        "symbol": "STG",
        "decimals": 18
      },
      "0x1287ee65d703db00bb0c9488acb97353f1f66087": {
        "symbol": "USDT0",
        "type": "OFT",
        "decimals": 6,
        "sharedDecimals": 6
      },
      "0x3a7f2580675ceed079b433c3c00ea997a31fb686": {
        "symbol": "STG",
        "decimals": 18
      },
      "0x411d14f0b6b10b321533a4f8b1c2f0350c03cc0f": {
        "symbol": "USDT0",
        "decimals": 6,
        "sharedDecimals": 6
      },
      "0xf922d8b8ec0180b64dfcf07d205145b7e25c433e": {
        "symbol": "FRNT",
        "erc20TokenAddress": "0x15a2ea73f7e75264cfab564bbd3c82ae76fcec56",
        "type": "ProxyOFT",
        "decimals": 6,
        "sharedDecimals": 6
      },
      "0x2f6f07cdcf3588944bf4c42ac74ff24bf56e7590": {
        "symbol": "USDC",
        "decimals": 6
      },
      "0x5859b9d0af9d84f3932efbf798e48014b59a3fbf": {
        "symbol": "SGETH",
        "decimals": 18
      },
      "0x743013b0da8278a68f52abb86bf3954880b5b52e": {
        "symbol": "USDT",
        "decimals": 18
      },
      "0x15a2ea73f7e75264cfab564bbd3c82ae76fcec56": {
        "proxyAddresses": [
          "0xf922d8b8ec0180b64dfcf07d205145b7e25c433e"
        ],
        "symbol": "FRNT",
        "type": "ERC20",
        "decimals": 6
      },
      "0x9b4a04ad57ad186156beef5e22b0ff3f9b69d2bf": {
        "symbol": "USDT",
        "decimals": 18
      }
    },
    "chainKey": "sepolia"
  }
}