type ChainConfig = {
  id: string;
  name: string;
  endpointV2: string;
  confirmations: number;
  delegate: string;
  configurator: string;
  finalOwner: string;
  ftTokenAddress?: string;
};

// I-2: Support environment variable overrides for role addresses
// This allows rotation without code changes
const STANDARD_FT_DELEGATE = process.env.FT_DELEGATE || "0x3419E83fe5583028e056b1aa5E62601D80799572";
const STANDARD_FT_CONFIGURATOR = process.env.FT_CONFIGURATOR || "0x3419E83fe5583028e056b1aa5E62601D80799572";
// MSIG address for all chains
const STANDARD_FINAL_OWNER = process.env.FINAL_OWNER || "0x1118e1c057211306a40A4d7006C040dbfE1370Cb";

function safeRequire(path: string): string | undefined {
  try {
    return require(path).address;
  } catch {
    return undefined;
  }
}

const CHAINS: Omit<ChainConfig, "ftAddress">[] = [
  {
    id: "1",
    name: "ethereum",
    endpointV2: "0x1a44076050125825900e736c501f859c50fE728c",
    confirmations: 15,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR,
    finalOwner: STANDARD_FINAL_OWNER
  },
  {
    id: "56",
    name: "bsc",
    endpointV2: "0x1a44076050125825900e736c501f859c50fE728c",
    confirmations: 20,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR,
    finalOwner: STANDARD_FINAL_OWNER
  },
  {
    id: "43114",
    name: "avalanche",
    endpointV2: "0x1a44076050125825900e736c501f859c50fE728c",
    confirmations: 12,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR,
    finalOwner: STANDARD_FINAL_OWNER
  },
  {
    id: "146",
    name: "sonic",
    endpointV2: "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B",
    confirmations: 20,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR,
    finalOwner: STANDARD_FINAL_OWNER
  },
  {
    id: "8453",
    name: "base",
    endpointV2: "0x1a44076050125825900e736c501f859c50fE728c",
    confirmations: 10,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR,
    finalOwner: STANDARD_FINAL_OWNER
  },
  {
    id: "11155111",
    name: "sepolia",
    endpointV2: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    confirmations: 15,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR,
    finalOwner: STANDARD_FINAL_OWNER
  },
  {
    id: "97",
    name: "bsc-testnet",
    endpointV2: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    confirmations: 12,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR,
    finalOwner: STANDARD_FINAL_OWNER
  },
  {
    id: "43113",
    name: "fuji",
    endpointV2: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    confirmations: 12,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR,
    finalOwner: STANDARD_FINAL_OWNER
  },
  {
    id: "84532",
    name: "base-sepolia",
    endpointV2: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    confirmations: 10,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR,
    finalOwner: STANDARD_FINAL_OWNER
  }
];

function buildChainConfig(c: (typeof CHAINS)[number]): ChainConfig {
  const path = `../deployments/${c.name.toLowerCase().replace(/\s+/g, "-")}/FT.json`;
  const ftTokenAddress = safeRequire(path);
  return {
    ...c,
    ftTokenAddress
  };
}

const chainRegistry: Record<string, ChainConfig> = Object.fromEntries(CHAINS.map((c) => [c.id, buildChainConfig(c)]));

export function getChainConfig(chainId: string | number): ChainConfig | undefined {
  return chainRegistry[chainId.toString()];
}

export const TOKEN_CONTRACT_NAME = "FT";
