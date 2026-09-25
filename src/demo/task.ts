import type { RelayTask } from "../protocol/types";

export const demoTask: RelayTask = {
  id: "clock-in-demo-001",
  title: "Verify a storefront sign",
  description:
    "An autonomous agent needs a human to confirm the sign is present and readable from the public sidewalk.",
  poster: "agent:ground-relay-demo",
  status: "open",
  rewardAtomic: "1000000",
  rewardMint: "USDC-devnet-demo",
  createdAt: new Date(0).toISOString(),
  criteria: [
    {
      id: "photo",
      description: "Capture one clear photo showing the full sign.",
      required: true
    },
    {
      id: "note",
      description: "Confirm the business name in one sentence.",
      required: true
    }
  ]
};
