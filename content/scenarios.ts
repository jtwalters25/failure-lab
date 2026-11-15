// Public post-incident reviews from the major cloud providers, retold in plain words.
// Only facts from each provider's own write-up and press coverage of it. Newest first.

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
    id: "aws-101925",
    provider: "AWS",
    name: "DynamoDB DNS fixed, EC2 stuck in congestive collapse (us-east-1)",
    date: "2025-10-20",
    outageMinutes: 172,
    approx: false,
    story:
      "A race condition in DynamoDB's DNS automation left the us-east-1 endpoint with an empty DNS record. DynamoDB was back in under three hours, but EC2's lease manager had fallen behind: its work kept timing out and being requeued, and AWS's summary says it \"entered a state of congestive collapse.\" Engineers throttled incoming work and restarted hosts. Full EC2 recovery came about 11 hours after DynamoDB was fixed.",
    lesson: "The outage took three hours. Draining the backlog took eleven more.",
    sources: [{ label: "AWS post-event summary", url: "https://aws.amazon.com/message/101925/" }],
  },
  {
    id: "gcp-ow5i3",
    provider: "Google Cloud",
    name: "Service Control restart caused a herd effect (global, worst in us-central1)",
    date: "2025-06-12",
    outageMinutes: 180,
    approx: false,
    story:
      "A policy change with blank fields replicated globally and crashed Service Control, the layer that checks Google Cloud API requests. As it restarted in us-central1, it created a herd effect on the infrastructure it depends on, because, in Google's words, \"Service Control did not have the appropriate randomized exponential backoff implemented.\" us-central1 took up to about 2 hours 40 minutes to fully recover.",
    lesson: "The missing piece is the simulator's middle button: randomized exponential backoff.",
    sources: [{ label: "Google Cloud incident report", url: "https://status.cloud.google.com/incidents/ow5i3PPK96RduMcb1SsW" }],
  },
];
