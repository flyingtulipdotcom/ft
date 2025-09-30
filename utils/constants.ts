type ChainConfig = {
  id: string;
  name: string;
  endpointV2: string;
  confirmations: number;
  delegate: string;
  configurator: string;
  ftTokenAddress?: string;
};

const STANDARD_FT_DELEGATE = "0x3419E83fe5583028e056b1aa5E62601D80799572";
const STANDARD_FT_CONFIGURATOR = "0x3419E83fe5583028e056b1aa5E62601D80799572";

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
    confirmations: 12,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR
  },
  {
    id: "56",
    name: "bsc",
    endpointV2: "0x1a44076050125825900e736c501f859c50fE728c",
    confirmations: 10,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR
  },
  {
    id: "43114",
    name: "avalanche",
    endpointV2: "0x1a44076050125825900e736c501f859c50fE728c",
    confirmations: 1,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR
  },
  {
    id: "146",
    name: "sonic",
    endpointV2: "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B",
    confirmations: 3,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR
  },
  {
    id: "8453",
    name: "base",
    endpointV2: "0x1a44076050125825900e736c501f859c50fE728c",
    confirmations: 12,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR
  },
  {
    id: "11155111",
    name: "sepolia",
    endpointV2: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    confirmations: 1,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR
  },
  {
    id: "97",
    name: "bsc-testnet",
    endpointV2: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    confirmations: 2,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR
  },
  {
    id: "43113",
    name: "fuji",
    endpointV2: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    confirmations: 3,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR
  },
  {
    id: "84532",
    name: "base-sepolia",
    endpointV2: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    confirmations: 4,
    delegate: STANDARD_FT_DELEGATE,
    configurator: STANDARD_FT_CONFIGURATOR
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
