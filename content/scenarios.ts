// Public Microsoft Azure post-incident reviews, retold in plain words.
// Only facts from Microsoft's public status history and press coverage of it.

export type Scenario = {
  id: string;
  provider: string;
  name: string;
  date: string;
  outageMinutes: number;
  approx: boolean;
  story: string;
  lesson: string;
  sources: { label: string; url: string }[];
};

export const scenarios: Scenario[] = [
  {
    id: "azure-m5b-9rz",
    provider: "Microsoft Azure",
    name: "Managed Identity overwhelmed after a fix (East US, West US)",
    date: "2026-02-03",
    outageMinutes: 355,
    approx: false,
    story:
      "A storage policy change broke VM operations on February 2. The mitigation for that set off a second incident: a large spike in traffic overwhelmed Managed Identity, and several scale-up attempts could not keep up with the backlog and retry volume. Engineers removed traffic so the service could be repaired without load. It ran from 00:10 to 06:05 UTC.",
    lesson: "The textbook retry storm: the fix arrived, and the queued and retried traffic kept the service down.",
    sources: [
      { label: "Azure status history (M5B-9RZ)", url: "https://azure.status.microsoft/en-us/status/history/?trackingId=M5B-9RZ" },
      { label: "Network World", url: "https://networkworld.com/article/4127142/azure-outage-disrupts-vms-and-identity-services-for-over-10-hours.html" },
    ],
  },
  {
    id: "azure-zjv6-sgg",
    provider: "Microsoft Azure",
    name: "West US datacenter cut off by a repair (West US)",
    date: "2026-07-23",
    outageMinutes: 300,
    approx: true,
    story:
      "A repair to one optical device was widened to every device leaving a datacenter, because the safety check judged each device on its own instead of their combined effect. Routes were withdrawn, cutting the datacenter off from the network for about five hours. Automated recovery retried several times, but every retry depended on the same broken connectivity.",
    lesson: "A different lesson: retries only help when the thing being retried can recover without them.",
    sources: [
      { label: "Azure status history (ZJV6-SGG)", url: "https://azure.status.microsoft/en-us/status/history/?trackingId=ZJV6-SGG" },
      { label: "Surfing Complexity", url: "https://surfingcomplexity.blog/2026/08/16/quick-thoughts-on-azure-regional-outage-from-july-23-26/" },
    ],
  },
];
