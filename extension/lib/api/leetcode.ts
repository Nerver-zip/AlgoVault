import { LEETCODE_GRAPHQL_URL } from "../constants"

export class LeetCodeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
    public readonly retryAfterMs?: number
  ) {
    super(message)
    this.name = "LeetCodeApiError"
  }
}

async function getLeetcodeAuthHeaders(): Promise<Record<string, string>> {
  const csrfCookie = await chrome.cookies.get({ url: "https://leetcode.com", name: "csrftoken" })
  return csrfCookie?.value ? { "X-CSRFToken": csrfCookie.value } : {}
}

function retryAfterMs(response: Response) {
  const seconds = Number(response.headers.get("Retry-After"))
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined
}

function graphqlOperation(query: string) {
  return query.match(/\b(?:query|mutation)\s+([A-Za-z0-9_]+)/)?.[1] || "GraphQL"
}

function leetcodeHttpError(response: Response, endpoint: string) {
  const guidance = response.status === 403
    ? " Refresh or sign in to LeetCode.com, then wait a few minutes before retrying."
    : response.status === 429
      ? " LeetCode is rate limiting requests; wait before retrying."
      : ""
  return new LeetCodeApiError(
    `LeetCode ${endpoint} error: ${response.status} ${response.statusText}.${guidance}`,
    response.status,
    endpoint,
    retryAfterMs(response)
  )
}

export const fetchGraphQL = async (query: string, variables: any = {}) => {
  const operation = graphqlOperation(query)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const authHeaders = await getLeetcodeAuthHeaders()
    const response = await fetch(LEETCODE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://leetcode.com',
        'Referer': 'https://leetcode.com/',
        ...authHeaders
      },
      credentials: 'include',
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const error = leetcodeHttpError(response, operation)
      if ((response.status === 403 || response.status === 429) && attempt < 2) {
        const delay = error.retryAfterMs || (5000 * (2 ** attempt) + Math.floor(Math.random() * 750))
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
      throw error
    }

    const payload = await response.json();
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error: any) => error.message).join("; "));
    }
    return payload;
  }
  throw new Error(`LeetCode ${operation} request failed after retries`)
};

export const fetchUserProfile = async (username: string) => {
  const query = `
    query userPublicProfile($username: String!) {
      matchedUser(username: $username) {
        username
        profile {
          realName
          userAvatar
          ranking
        }
        submitStats {
          acSubmissionNum {
            difficulty
            count
          }
        }
        submitStatsGlobal {
          acSubmissionNum {
            difficulty
            count
          }
        }
      }
    }
  `;
  return fetchGraphQL(query, { username });
};

export const fetchUserStatus = async () => {
  const query = `
    query globalData {
      userStatus {
        isSignedIn
        username
      }
    }
  `;
  return fetchGraphQL(query);
};

export const fetchSolvedProblems = async (skip: number, limit: number) => {
  const query = `
    query userProgressQuestionList($filters: UserProgressQuestionListInput!) {
      problemsetQuestionList: userProgressQuestionList(filters: $filters) {
        totalNum
        questions {
          frontendQuestionId: frontendId
          title
          titleSlug
          difficulty
          questionStatus
          lastSubmittedAt
          numSubmitted
          topicTags {
            name
            slug
          }
        }
      }
    }
  `;
  return fetchGraphQL(query, {
    filters: {
      skip,
      limit,
      questionStatus: "SOLVED",
      sortOrder: "ASCENDING"
    }
  });
};

export const fetchProblemMetadata = async (titleSlugs: string[]) => {
  if (titleSlugs.length === 0) return [];

  const aliases = titleSlugs.map((slug, index) => `
    q${index}: question(titleSlug: ${JSON.stringify(slug)}) {
      frontendQuestionId: questionFrontendId
      title
      titleSlug
      difficulty
      content
      topicTags {
        name
        slug
      }
    }
  `).join("\n");

  const response = await fetchGraphQL(`query attemptedProblemMetadata { ${aliases} }`);
  return Object.values(response.data || {}).filter(Boolean);
};

export const fetchAllSubmissions = async (offset: number, limit: number) => {
  // LeetCode REST API requires CSRF token in headers (unlike GraphQL which is more lenient)
  const authHeaders = await getLeetcodeAuthHeaders()
  const url = `https://leetcode.com/api/submissions/?offset=${offset}&limit=${limit}`;
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Referer': 'https://leetcode.com/',
      ...authHeaders
    },
  });
  
  if (!response.ok) {
    throw leetcodeHttpError(response, `submissions page at offset ${offset}`)
  }
  
  return response.json();
};

export const fetchSubmissionDetails = async (submissionId: number) => {
  const query = `
    query submissionDetails($submissionId: Int!) {
      submissionDetails(submissionId: $submissionId) {
        code
        lang {
          name
          verboseName
        }
        runtime
        memory
        statusDisplay
        timestamp
        question {
          title
          titleSlug
        }
      }
    }
  `;
  const response = await fetchGraphQL(query, { submissionId });
  return response.data?.submissionDetails ?? null;
};

export interface ProblemSubmissionRequest {
  titleSlug: string
  offset?: number
  lastKey?: string | null
}

export interface ProblemSubmissionPage {
  titleSlug: string
  submissions: any[]
  hasNext: boolean
  lastKey: string | null
}

/**
 * Reads the per-problem submission lists used by LeetCode's Submissions tab.
 * Aliasing several problems into one GraphQL operation keeps full-history
 * recovery practical without issuing one HTTP request per solved problem.
 */
export const fetchProblemSubmissionPages = async (
  requests: ProblemSubmissionRequest[],
  limit = 20
): Promise<ProblemSubmissionPage[]> => {
  if (!requests.length) return []
  const fields = requests.map((request, index) => `
    q${index}: questionSubmissionList(
      offset: ${Math.max(0, request.offset || 0)}
      limit: ${Math.max(1, limit)}
      ${request.lastKey ? `lastKey: ${JSON.stringify(request.lastKey)}` : ""}
      questionSlug: ${JSON.stringify(request.titleSlug)}
    ) {
      lastKey
      hasNext
      submissions {
        id
        title
        titleSlug
        statusDisplay
        lang
        runtime
        memory
        timestamp
      }
    }
  `).join("\n")
  const response = await fetchGraphQL(`query missingAcceptedSubmissions { ${fields} }`)
  return requests.map((request, index) => {
    const page = response.data?.[`q${index}`] || {}
    return {
      titleSlug: request.titleSlug,
      submissions: Array.isArray(page.submissions) ? page.submissions : [],
      hasNext: Boolean(page.hasNext),
      lastKey: page.lastKey || null
    }
  })
}

export const fetchSubmissionDetailsBatch = async (submissionIds: number[]) => {
  const ids = submissionIds.filter((id) => Number.isSafeInteger(id) && id > 0)
  if (!ids.length) return []
  const fields = ids.map((id, index) => `
    s${index}: submissionDetails(submissionId: ${id}) {
      code
      lang {
        name
        verboseName
      }
      runtime
      memory
      statusDisplay
      timestamp
      question {
        title
        titleSlug
      }
    }
  `).join("\n")
  const response = await fetchGraphQL(`query missingSubmissionDetails { ${fields} }`)
  return ids.map((id, index) => ({
    id: String(id),
    ...(response.data?.[`s${index}`] || {})
  }))
}

export const fetchContestHistory = async (username: string) => {
  const query = `
    query userContestRankingInfo($username: String!) {
      userContestRanking(username: $username) {
        attendedContestsCount
        rating
        globalRanking
        topPercentage
        badge {
          name
          icon
        }
      }
      userContestRankingHistory(username: $username) {
        attended
        rating
        ranking
        problemsSolved
        totalProblems
        finishTimeInSeconds
        contest {
          title
          titleSlug
          startTime
        }
      }
    }
  `;
  return fetchGraphQL(query, { username: username.trim() });
};

export const fetchContestQuestions = async (contestSlug: string) => {
  const query = `
    query contestQuestionList($contestSlug: String!) {
      contestQuestionList(contestSlug: $contestSlug) {
        title
        titleSlug
        questionId
      }
    }
  `;
  const response = await fetchGraphQL(query, { contestSlug });
  return response.data?.contestQuestionList ?? [];
};

export const fetchReplayEvents = async (username: string, contestSlug: string, questionSlug: string) => {
  const query = `
    query UserContestReplayEvents($contestSlug: String!, $questionSlug: String!, $username: String) {
      userContestReplayEvents(
        contestSlug: $contestSlug
        questionSlug: $questionSlug
        username: $username
      ) {
        eventType
        eventData
        timestamp
      }
    }
  `;
  const response = await fetchGraphQL(query, { contestSlug, questionSlug, username });
  return response.data?.userContestReplayEvents ?? [];
};

export type AnalysisStatus = 'CLEAN' | 'MILD_PASTE' | 'HEAVY_PASTE' | 'SKIPPED';

export interface CheatReport {
  status: AnalysisStatus;
  label: string; 
  color: string;
  details: string[];
  pasteCount: number;
  focusLoss: number;
}

export function analyzeEvents(events: any[]): CheatReport {
  if (!events || events.length === 0) {
    return { status: 'SKIPPED', label: 'No Data', color: 'text-zinc-500', details: ['No data'], pasteCount: 0, focusLoss: 0 };
  }
  let isAccepted = false;
  let attemptStatus = null;
  for (const e of events) {
    const type = parseInt(e.eventType, 10);
    if (type === 5) {
        try {
            const data = JSON.parse(e.eventData);
            if (data.result && data.result.status === 10) { isAccepted = true; break; }
            else if (data.result) { attemptStatus = data.result.status; }
        } catch (err) {}
    }
  }
  if (!isAccepted) {
      const msg = attemptStatus ? `Not Accepted (Status ${attemptStatus})` : `No Submission`;
      return { status: 'SKIPPED', label: 'Skipped', color: 'text-zinc-500', details: [msg], pasteCount: 0, focusLoss: 0 };
  }

  let pasteCount = 0;
  let focusLoss = 0;
  const HEAVY_THRESHOLD = 500; 
  const MILD_THRESHOLD = 100;

  const detectedPastes: string[] = [];

  events.forEach((e) => {
    const type = parseInt(e.eventType, 10);

    if (type === 3) {
      if (e.eventData.includes('"val": false') || e.eventData.includes('"val":false')) focusLoss++;
    }

    if ((type === 7 || type === 10) && e.eventData) {
      try {
        const data = JSON.parse(e.eventData);
        const isInternal = data.isFromInside === true; 

        if (data.change && data.change.changes) {
          data.change.changes.forEach((change: any) => {
            const insertedLen = (change.insert || "").length;
            if (insertedLen > 0) {
              if (isInternal) return; 

              if (insertedLen > MILD_THRESHOLD) {
                if (type === 10) { 
                   pasteCount++;
                   if (insertedLen > HEAVY_THRESHOLD) {
                     detectedPastes.push(`Large Ext. Paste: ${insertedLen} chars`);
                   } else {
                     detectedPastes.push(`Small Ext. Paste: ${insertedLen} chars`);
                   }
                } 
              }
            }
          });
        }
      } catch (err) {}
    }
  });

  let status: AnalysisStatus = 'CLEAN';
  let label = 'No external paste detected';
  let color = 'text-green-400';
  const details: string[] = [];

  const hasHeavyPaste = detectedPastes.some(d => d.includes('Large Ext. Paste'));
  
  if (hasHeavyPaste) {
    status = 'HEAVY_PASTE';
    label = 'Large Paste'; 
    color = 'text-rose-500';
    details.push(...detectedPastes);
  } 
  else if (pasteCount > 0) {
    status = 'MILD_PASTE';
    label = 'Small Paste'; 
    color = 'text-amber-500'; 
    details.push(...detectedPastes);
  }

  if (focusLoss > 10) {
     details.push(`Tab Switch: ${focusLoss}x`);
  }

  if (status === 'CLEAN') {
    details.push(`No external paste event was recorded`);
  }

  return { status, label, color, details, pasteCount, focusLoss };
}

export const fetchUpcomingContests = async () => {
  const query = `
    query contestUpcomingContests {
      upcomingContests {
        title
        titleSlug
        startTime
        duration
      }
    }
  `;
  try {
    const res = await fetchGraphQL(query);
    return (res.data?.upcomingContests || []).map((c: any) => ({
      platform: "LeetCode",
      id: c.titleSlug,
      name: c.title,
      startTime: new Date(c.startTime * 1000).toISOString(),
      durationSeconds: c.duration,
      url: `https://leetcode.com/contest/${c.titleSlug}`
    }));
  } catch (e) {
    console.error("Failed to fetch LeetCode upcoming contests", e);
    return [];
  }
};

export const fetchPastContests = async (pageNo = 1, numPerPage = 20) => {
  const query = `
    query contestPastContests($pageNo: Int, $numPerPage: Int) {
      pastContests(pageNo: $pageNo, numPerPage: $numPerPage) {
        data {
          title
          titleSlug
          startTime
          duration
        }
      }
    }
  `;
  const res = await fetchGraphQL(query, { pageNo, numPerPage });
  return (res.data?.pastContests?.data || []).map((c: any) => ({
    platform: "LeetCode",
    id: c.titleSlug,
    name: c.title,
    startTime: new Date(c.startTime * 1000).toISOString(),
    durationSeconds: c.duration,
    url: `https://leetcode.com/contest/${c.titleSlug}`
  }));
};
