import { createContext, useContext } from 'react';

export interface TopologyContextValue {
  riskMode: boolean;
  swimlaneMode: boolean;
}

export const TopologyContext = createContext<TopologyContextValue>({
  riskMode: false,
  swimlaneMode: false,
});

export const useTopologyContext = () => useContext(TopologyContext);
