// Curated by hand from Semgrep scans of public repos. Every snippet is pinned to a commit.
export type Verdict = "pattern" | "done-well" | "noise";

export type Finding = {
  repo: string;
  title: string;
  verdict: Verdict;
  summary: string;
  takeaway: string;
  snippet: string;
  url: string;
};

export const findings: Finding[] = [
  {
    repo: "Netflix/spectator",
    title: "Smart retry policy, one fast path",
    verdict: "pattern",
    summary:
      "The default policy is idempotency-aware: writes only retry on connection failures, and 429 or 503 responses back off exponentially. But other 5xx responses on GET, and connection failures, retry immediately with no delay.",
    takeaway:
      "It also never reads the Retry-After header, which the simulator above shows recovers fastest. Small change, big effect when a dependency is struggling.",
    snippet: `if (shouldRetry && (s == 429 || s == 503)) {
  // Request is getting throttled, exponentially back off
  // - 429 client sending too many requests
  // - 503 server unavailable
  try {
    long delay = initialRetryDelay << (attempt - 1);
    LOGGER.debug("request throttled, delaying for {}ms: {} {}", delay, method, uri);
    Thread.sleep(delay);
  } catch (InterruptedException e) {
    Thread.currentThread().interrupt();
    throw new IOException("request failed " + method + " " + uri, e);
  }
} else if (!shouldRetry) {
  return response;
}`,
    url: "https://github.com/Netflix/spectator/blob/e2a90ec0d08e2eeae5062dd6a76b336d26d1051e/spectator-ext-ipc/src/main/java/com/netflix/spectator/ipc/http/HttpRequestBuilder.java#L276-L307",
  },
  {
    repo: "Netflix/EVCache",
    title: "Backpressure that fails fast",
    verdict: "done-well",
    summary:
      "When a cache node's write queue is full, the client waits briefly a few times, then drops the write and records a metric instead of blocking forever.",
    takeaway: "Bounded waiting plus load shedding is the right shape. A cache write is cheaper to lose than a stuck caller thread.",
    snippet: `while (true) {
    final int size = evcNode.getWriteQueueSize();
    final boolean canAddToOpQueue = size < maxWriteQueueSize;
    // (debug logging omitted)
    if (canAddToOpQueue) break;
    try {
        Thread.sleep(writeBlock.get());
    } catch (InterruptedException e) {
        throw new EVCacheException("Thread was Interrupted", e);
    }

    if(i++ > 3) {
        incrementFailure(EVCacheMetricsFactory.WRITE_QUEUE_FULL, call);`,
    url: "https://github.com/Netflix/EVCache/blob/64c7a35f7be31b72b83277b1d07a0530fce1f34b/evcache-core/src/main/java/com/netflix/evcache/pool/EVCacheClient.java#L280-L300",
  },
  {
    repo: "Netflix/conductor",
    title: "Retry any exception, fixed 500ms",
    verdict: "pattern",
    summary:
      "The task client's retry helper retries every exception, waits a flat 500ms, and swallows the interrupt, so it keeps retrying during shutdown.",
    takeaway:
      "Netflix stopped maintaining this repo in Dec 2023. It's still a clean example of the fixed-delay pattern in the simulator above.",
    snippet: `while (index < count) {
    try {
        return operation.apply(input);
    } catch (Exception e) {
        index++;
        try {
            Thread.sleep(500L);
        } catch (InterruptedException ie) {
            LOGGER.error("Retry interrupted", ie);
        }
    }
}`,
    url: "https://github.com/Netflix/conductor/blob/548f386c2c6c1e4d467b8551edbb6182881004ae/client/src/main/java/com/netflix/conductor/client/automator/TaskPollExecutor.java#L365-L380",
  },
  {
    repo: "conductor-oss/conductor",
    title: "Smarter retry, one subtle gap",
    verdict: "pattern",
    summary:
      "The community fork only retries connection errors, which is the right call. But the delay is 100ms × (count + 1), and count is the max retries. Every caller passes 3, so every attempt waits a flat 400ms.",
    takeaway: "Looks like backoff, behaves like a fixed delay. Easy to miss in review.",
    snippet: `if (t instanceof ConnectException
        || (t.getCause() != null && t.getCause() instanceof SocketException)) {
    index++;
    Uninterruptibles.sleepUninterruptibly(
            100L * (count + 1), TimeUnit.MILLISECONDS);
} else {
    break;
}`,
    url: "https://github.com/conductor-oss/conductor/blob/7c2f30502d2c4264df3be86cb89936806386f506/ai/src/main/java/org/conductoross/conductor/ai/document/HttpDocumentLoader.java#L236-L259",
  },
  {
    repo: "aws/aws-sdk-java-v2",
    title: "Exponential backoff, done right",
    verdict: "done-well",
    summary:
      "The EC2 metadata client doubles its wait each attempt, gives up cleanly on the last try, and restores the interrupt flag.",
    takeaway: "The one addition I'd suggest is jitter, so many instances booting at once don't retry in lockstep.",
    snippet: `int pause = (int) (Math.pow(2, DEFAULT_QUERY_ATTEMPTS - tries) * MINIMUM_RETRY_WAIT_TIME_MILLISECONDS);
try {
    Thread.sleep(pause < MINIMUM_RETRY_WAIT_TIME_MILLISECONDS ? MINIMUM_RETRY_WAIT_TIME_MILLISECONDS
                                                              : pause);
} catch (InterruptedException e1) {
    Thread.currentThread().interrupt();
}`,
    url: "https://github.com/aws/aws-sdk-java-v2/blob/8d3ad890e58253064ad6738bf383e6f310ae1296/core/regions/src/main/java/software/amazon/awssdk/regions/internal/util/EC2MetadataUtils.java#L412-L428",
  },
  {
    repo: "aws/aws-sdk-java-v2",
    title: "Flagged by the scanner, not a retry",
    verdict: "noise",
    summary:
      "My rule flagged sleep-in-a-loop-with-a-catch. This is a background reaper that closes idle connections on a timer. Correct code.",
    takeaway:
      "Scanners are only useful if someone tunes out noise like this. The fix: exclude loops whose condition is a shutdown flag.",
    snippet: `while (!stopping) {
    try {
        Thread.sleep(sleepPeriod);
        // close idle connections...`,
    url: "https://github.com/aws/aws-sdk-java-v2/blob/8d3ad890e58253064ad6738bf383e6f310ae1296/http-clients/apache-client/src/main/java/software/amazon/awssdk/http/apache/internal/conn/IdleConnectionReaper.java#L149-L152",
  },
];
