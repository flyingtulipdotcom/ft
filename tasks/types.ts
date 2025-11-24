// Shared types for LayerZero scripts

export interface ChainMetadata {
  chainDetails: {
    chainKey: string;
    nativeChainId: number;
    chainStatus: string;
  };
  deployments: Array<{
    eid: string;
    version: number;
    stage: string;
    endpointV2: {
      address: string;
    };
    executor: {
      address: string;
    };
    sendUln302: {
      address: string;
    };
    receiveUln302: {
      address: string;
    };
  }>;
  dvns: Record<
    string,
    {
      version: number;
      canonicalName: string;
      id: string;
      deprecated?: boolean;
      lzReadCompatible?: boolean;
    }
  >;
}

export interface ChainConfig {
  chainKey: string;
  eid: number;
  nativeChainId: number;
  endpointV2Address: string;
  executorAddress: string;
  sendLibAddress: string;
  receiveLibAddress: string;
  dvnAddresses: string[];
  ftTokenAddress?: string;
  confirmations?: number;
}

export interface TaskArgs {
  chains: string;
  safe?: boolean;
}

export const NUM_BLOCKS_TO_WAIT = 2;
