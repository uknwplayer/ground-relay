import type { RelayTask } from "../protocol/types";

export const demoTask: RelayTask = {
  id: "e335a4ea1f23a002db02f94c371d311b5b46fa908a7f2f6c9f72e60ea122f662",
  title: "Verify a storefront sign",
  description:
    "An autonomous agent needs a human to confirm the sign is present and readable from the public sidewalk.",
  poster: "6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ",
  status: "open",
  rewardAtomic: "1000000",
  rewardMint: "So11111111111111111111111111111111111111112",
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
