import { create } from "zustand";
import type {
  VPCTopology,
  ReachabilityResult,
  ExposureResult,
  RuleConflict,
} from "../types";

interface TopologyState {
  selectedAccountId: string | null;
  selectedRegion: string | null;
  selectedVpcId: string | null;
  topologyData: VPCTopology | null;
  reachability: ReachabilityResult | null;
  exposure: ExposureResult | null;
  conflicts: RuleConflict[];
  loading: boolean;
}

interface TopologyActions {
  setSelectedAccount: (accountId: string | null) => void;
  setSelectedRegion: (region: string | null) => void;
  setSelectedVpc: (vpcId: string | null) => void;
  setTopologyData: (data: VPCTopology | null) => void;
  setReachability: (result: ReachabilityResult | null) => void;
  setExposure: (result: ExposureResult | null) => void;
  setConflicts: (conflicts: RuleConflict[]) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export type TopologyStore = TopologyState & TopologyActions;

const initialState: TopologyState = {
  selectedAccountId: null,
  selectedRegion: null,
  selectedVpcId: null,
  topologyData: null,
  reachability: null,
  exposure: null,
  conflicts: [],
  loading: false,
};

export const useTopologyStore = create<TopologyStore>()((set) => ({
  ...initialState,

  setSelectedAccount: (accountId) => set({ selectedAccountId: accountId }),
  setSelectedRegion: (region) => set({ selectedRegion: region }),
  setSelectedVpc: (vpcId) => set({ selectedVpcId: vpcId }),
  setTopologyData: (data) => set({ topologyData: data }),
  setReachability: (result) => set({ reachability: result }),
  setExposure: (result) => set({ exposure: result }),
  setConflicts: (conflicts) => set({ conflicts }),
  setLoading: (loading) => set({ loading }),
  reset: () => set(initialState),
}));
