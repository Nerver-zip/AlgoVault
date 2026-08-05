import type { PlasmoCSConfig } from "plasmo"
import { STUDY_LISTS } from "../lib/study-lists"
import { getLeetCodeProblemSlug } from "../lib/leetcode-url"
import { showZenithQuestModal } from "./ZenithSystemOverlay"

export const config: PlasmoCSConfig = {
  matches: ["https://leetcode.com/problems/*", "https://leetcode.com/contest/*/problems/*"],
  run_at: "document_idle"
}

let isZenithActive = false;
let isZenithRevealed = false;

const hideForbiddenTabs = () => {
  if (!isZenithActive || isZenithRevealed) return;

  // 1. Target via XPath text search for "Editorial", "Solutions", "Discussion"
  const xpathResult = document.evaluate(
    "//*[text()='Editorial' or text()='Solutions' or text()='Discussion']",
    document,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null
  );

  for (let i = 0; i < xpathResult.snapshotLength; i++) {
    const node = xpathResult.snapshotItem(i) as HTMLElement;
    if (node) {
      // Find closest tab container or interactive wrapper
      const tabContainer = node.closest('[role="tab"], a, button, div[class*="tab"]') || node;
      if (tabContainer && !tabContainer.textContent?.includes("Description") && !tabContainer.id?.includes("av-intentional-reveal")) {
        (tabContainer as HTMLElement).style.setProperty("display", "none", "important");
      }
    }
  }

  // 2. Target tablist children that are not Description
  const tablist = document.querySelectorAll('[role="tablist"] > *');
  tablist.forEach((child) => {
    const text = child.textContent?.trim() || "";
    if ((text.includes("Editorial") || text.includes("Solutions") || text.includes("Discussion") || text.includes("Discuss")) && !child.id?.includes("av-intentional-reveal")) {
      (child as HTMLElement).style.setProperty("display", "none", "important");
    }
  });
};

const injectIntentionalRevealButton = () => {
  if (!isZenithActive || isZenithRevealed) return;
  const tablist = document.querySelector('[role="tablist"]');
  if (tablist && !document.getElementById("av-intentional-reveal")) {
    const revealBtn = document.createElement("button");
    revealBtn.id = "av-intentional-reveal";
    revealBtn.className = "ml-auto text-xs px-3 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors font-medium flex items-center gap-1 cursor-pointer font-mono select-none";
    revealBtn.innerHTML = "<span>🔒</span> Yield & Reveal Solutions";
    revealBtn.title = "Hold for 2 seconds to yield and reveal solutions";

    let holdTimer: number | null = null;

    revealBtn.onmousedown = () => {
      revealBtn.innerHTML = "<span>🔓</span> Yielding...";
      revealBtn.style.backgroundColor = "rgba(239, 68, 68, 0.3)";
      holdTimer = window.setTimeout(() => {
        chrome.storage.local.set({ 
          "algovault.zenithGrade": "D", 
          "algovault.zenithReason": "Intentional Reveal" 
        }, () => {
          isZenithRevealed = true;
          // Un-hide Editorial & Solutions tabs
          document.querySelectorAll('[role="tab"], a, button, div').forEach((el) => {
            const text = el.textContent?.trim() || "";
            if (text === "Editorial" || text === "Solutions" || text === "Discussion") {
              (el as HTMLElement).style.removeProperty("display");
              const parent = (el as HTMLElement).closest('[role="tab"]');
              if (parent) (parent as HTMLElement).style.removeProperty("display");
            }
          });
          revealBtn.innerHTML = "<span>✅</span> Solutions Revealed";
          revealBtn.disabled = true;
          revealBtn.style.opacity = "0.5";
          revealBtn.style.cursor = "default";
        });
      }, 2000);
    };

    revealBtn.onmouseup = revealBtn.onmouseleave = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        if (!revealBtn.disabled) {
          revealBtn.innerHTML = "<span>🔒</span> Yield & Reveal Solutions";
          revealBtn.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
        }
      }
    };

    tablist.appendChild(revealBtn);
  }
};

const applyZenithMode = (isActive: boolean) => {
  let zenithStyle = document.getElementById("av-zenith-style");
  if (isActive) {
    if (!zenithStyle) {
      zenithStyle = document.createElement("style");
      zenithStyle.id = "av-zenith-style";
      // Cinematic Focus: Darker backgrounds, hiding extraneous information
      zenithStyle.textContent = `
        /* Hide Navbar to prevent navigation away */
        #navbar-root, nav, header { display: none !important; }
        
        /* Hide topics, companies, hints sections at the bottom */
        div[class*="topic-tags"], div.mt-6.flex.flex-col.gap-3 { display: none !important; }
        
        /* Hide LeetCode's own timer/session widgets if any */
        [data-track-load="timer"] { display: none !important; }
        
        /* Premium Background */
        body { background-color: #030303 !important; }
      `;
      document.head.appendChild(zenithStyle);
    }
    hideForbiddenTabs();
    injectIntentionalRevealButton();
  } else {
    isZenithRevealed = false;
    if (zenithStyle) zenithStyle.remove();
    const revealBtn = document.getElementById("av-intentional-reveal");
    if (revealBtn) revealBtn.remove();
    // Restore any hidden tabs if Zenith is turned off
    document.querySelectorAll('[role="tab"], a, button').forEach((el) => {
      if ((el as HTMLElement).style.display === "none") {
        (el as HTMLElement).style.removeProperty("display");
      }
    });
  }
}

// Listen for Zenith state changes to apply/remove blackout
chrome.storage.local.get("algovault.isZenith", (res) => {
  isZenithActive = !!res["algovault.isZenith"];
  applyZenithMode(isZenithActive);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes["algovault.isZenith"]) {
    isZenithActive = !!changes["algovault.isZenith"].newValue;
    applyZenithMode(isZenithActive);
  }
});

// Global state to prevent infinite loops from MutationObserver
let ratingInjected = false;
let acceptanceHidden = false;
let predictionInjected = false;
let predictionData: any = null;

const fetchPrediction = async () => {
  const slug = getLeetCodeProblemSlug()
  if (!slug) return;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "get_prediction", slug }, resolve);
      });
      if (!res?.error) {
        predictionData = res;
        injectAlgoVaultOverlay();
        return;
      }
    } catch (e) {
      console.error("AlgoVault Prediction Error:", e);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

const injectAlgoVaultOverlay = () => {
  // 1. Acceptance Rate & Global Accepted/Submissions
  if (!acceptanceHidden) {
    chrome.storage.sync.get(['hideAcceptanceRate'], (result) => {
      if (result.hideAcceptanceRate === false) return;

      // Hide global "Accepted" and "Submissions" numbers
      const iterAccepted = document.evaluate(
        "//*[text()='Accepted' or text()='Submissions']",
        document, null, XPathResult.ANY_TYPE, null
      );
      let nextAcc = iterAccepted.iterateNext() as HTMLElement;
      while (nextAcc) {
        let valNode = nextAcc.nextElementSibling as HTMLElement;
        if (!valNode || !valNode.textContent?.match(/\d/)) {
            valNode = nextAcc.parentElement?.nextElementSibling as HTMLElement;
        }
        if (valNode) {
            valNode.style.display = 'none';
        }
        nextAcc.style.display = 'none';
        nextAcc = iterAccepted.iterateNext() as HTMLElement;
      }

      // Find the acceptance rate label more robustly using XPath
      const iter = document.evaluate(
        "//*[text()='Acceptance' or text()='Acceptance Rate']",
        document, null, XPathResult.ANY_TYPE, null
      );
      const accLabel = iter.iterateNext() as HTMLElement;

      if (accLabel) {
        let accValue = accLabel.nextElementSibling as HTMLElement;
        if (!accValue || !accValue.textContent?.includes('%')) {
            accValue = accLabel.parentElement?.nextElementSibling as HTMLElement;
        }

        if (accValue && accValue.style.display !== 'none' && accValue.textContent?.includes('%')) {
          const originalValue = accValue.textContent || '';
          accValue.style.display = 'none';

          const toggleWrapper = document.createElement('div');
          toggleWrapper.className = 'text-label-1 dark:text-dark-label-1 font-medium flex items-center gap-2';

          const hiddenDots = document.createElement('span');
          hiddenDots.textContent = 'Hidden';

          const eyeBtn = document.createElement('button');
          eyeBtn.textContent = '👁 Show';
          eyeBtn.style.cursor = 'pointer';
          eyeBtn.style.color = '#00d4aa';
          eyeBtn.style.fontSize = '12px';

          let isShowing = false;
          eyeBtn.onclick = () => {
            isShowing = !isShowing;
            hiddenDots.textContent = isShowing ? originalValue : 'Hidden';
            eyeBtn.textContent = isShowing ? '👁 Hide' : '👁 Show';
          };

          toggleWrapper.appendChild(hiddenDots);
          toggleWrapper.appendChild(eyeBtn);

          accLabel.parentElement?.appendChild(toggleWrapper);
          acceptanceHidden = true;
        }
      }
    });
  }

  // 2. Inject Rating (Replacing Difficulty Tag)
  const diffTag = Array.from(document.querySelectorAll('div[class*="text-difficulty"]')).find(el => {
    const text = el.textContent?.trim();
    return text === "Easy" || text === "Medium" || text === "Hard";
  }) as HTMLElement;

  const currentSlug = getLeetCodeProblemSlug();
  const injectedSlug = diffTag?.getAttribute("data-algovault-rating");

  if (diffTag && currentSlug && injectedSlug !== currentSlug) {
    diffTag.setAttribute("data-algovault-rating", currentSlug);
    diffTag.querySelector(".av-rating")?.remove();

    const applyRating = (rating: number) => {
      // LeetCode is a SPA. Ignore async responses whose page context is stale.
      if (getLeetCodeProblemSlug() !== currentSlug) return
      if (!Number.isFinite(rating)) return

      const rounded = Math.round(Number(rating))
      const existing = diffTag.querySelector(".av-rating")
      if (existing) existing.remove()

      const badge = document.createElement("span")
      badge.className = "av-rating ml-2 font-mono font-bold opacity-90"
      badge.dataset.algovaultRating = currentSlug
      badge.textContent = ` (${rounded})`
      badge.title = "ZeroTrac contest rating"
      diffTag.appendChild(badge)
      ratingInjected = true
    }

    // Fetch rating for current problem via background to bypass CSP.
    chrome.runtime.sendMessage({ action: "get_problem_rating", slug: currentSlug }, (data) => {
      if (data && typeof data.Rating === "number") {
        applyRating(data.Rating)
      }
    })
  }

  // Compact study-list membership entry point.
  const titleH1 = document.querySelector('a[href*="/problems/"]')?.parentElement;
  if (titleH1 && !document.getElementById('av-lists-btn')) {
    const slug = getLeetCodeProblemSlug();
    const memberships = STUDY_LISTS.filter((list) => list.problems.some((problem) => problem.slug === slug));
    const listsBtn = document.createElement('button');
    listsBtn.id = 'av-lists-btn';
    listsBtn.textContent = memberships.length ? memberships.map((list) => list.name.replace("NeetCode ", "NC ").replace("Striver ", "Striver ")).join(" · ") : 'Study Lists';
    listsBtn.title = memberships.length ? `Included in ${memberships.map((list) => list.name).join(" and ")}` : "Open study lists";
    listsBtn.className = 'ml-3 text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors font-medium';
    listsBtn.onclick = () => {
      chrome.storage.local.set({ "algovault.requestedTab": "Lists" }, () => {
        chrome.runtime.sendMessage({ action: "open_side_panel" });
      });
    };
    titleH1.appendChild(listsBtn);
  }

  // Helper to make Zenith button freely draggable across the screen
  const makeElementDraggable = (el: HTMLElement, storageKey: string, onClickHandler: () => void) => {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let hasMoved = false;

    // Restore saved position if present
    chrome.storage.local.get(storageKey, (res) => {
      const saved = res[storageKey];
      if (saved && typeof saved.left === "number" && typeof saved.top === "number") {
        el.style.bottom = "auto";
        el.style.left = `${saved.left}px`;
        el.style.top = `${saved.top}px`;
      }
    });

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = el.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      el.style.transition = "none";
      el.style.cursor = "grabbing";

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasMoved = true;
        }

        let newLeft = Math.max(10, Math.min(window.innerWidth - rect.width - 10, initialLeft + dx));
        let newTop = Math.max(10, Math.min(window.innerHeight - rect.height - 10, initialTop + dy));

        el.style.bottom = "auto";
        el.style.left = `${newLeft}px`;
        el.style.top = `${newTop}px`;
      };

      const onMouseUp = () => {
        isDragging = false;
        el.style.cursor = "pointer";
        el.style.transition = "all 0.3s ease";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);

        if (hasMoved) {
          const rect = el.getBoundingClientRect();
          chrome.storage.local.set({
            [storageKey]: { left: rect.left, top: rect.top }
          });
        } else {
          onClickHandler();
        }
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };

    el.addEventListener("mousedown", onMouseDown);
  };

  // Inject Start Zenith button if not already in Zenith session
  if (!document.getElementById('av-start-zenith-btn') && !isZenithActive) {
    const startZenithBtn = document.createElement('button');
    startZenithBtn.id = 'av-start-zenith-btn';
    startZenithBtn.innerHTML = '<span style="font-size: 12px; margin-right: 4px;">⚔️</span> ZENITH';
    
    // Positioned at bottom-left corner by default with compact, sleek pill styling
    Object.assign(startZenithBtn.style, {
      position: 'fixed',
      bottom: '24px',
      left: '24px',
      zIndex: '9999',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4px 10px',
      borderRadius: '9999px',
      backgroundColor: 'rgba(9, 9, 11, 0.85)',
      color: '#dfa054',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: '11px',
      fontWeight: '700',
      letterSpacing: '0.8px',
      textTransform: 'uppercase',
      border: '1px solid rgba(223, 160, 84, 0.3)',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.5), 0 0 12px rgba(223, 160, 84, 0.15)',
      backdropFilter: 'blur(8px)',
      cursor: 'pointer',
      userSelect: 'none',
      transition: 'all 0.2s ease'
    });

    startZenithBtn.onmouseover = () => {
      startZenithBtn.style.backgroundColor = 'rgba(24, 24, 27, 0.95)';
      startZenithBtn.style.borderColor = 'rgba(223, 160, 84, 0.6)';
      startZenithBtn.style.boxShadow = '0 0 25px rgba(223, 160, 84, 0.3)';
    };
    
    startZenithBtn.onmouseleave = () => {
      startZenithBtn.style.backgroundColor = 'rgba(9, 9, 11, 0.9)';
      startZenithBtn.style.borderColor = 'rgba(223, 160, 84, 0.3)';
      startZenithBtn.style.boxShadow = '0 0 15px rgba(223, 160, 84, 0.15)';
    };

    makeElementDraggable(startZenithBtn, "algovault.zenithBtnPos", () => {
      showZenithQuestModal(
        (intent) => {
          // Synchronously request fullscreen on user click
          document.documentElement.requestFullscreen().catch((err) => {
            console.warn("Fullscreen request rejected:", err);
          });
          // Zenith is an explicit user action, so it starts an APSE v2 focus session.
          const slug = getLeetCodeProblemSlug()
          if (slug) {
            chrome.runtime.sendMessage({ action: "session_start_v2", slug });
          }
          chrome.storage.local.set({
            "algovault.isZenith": true,
            "algovault.zenithGrade": "S_PLUS",
            "algovault.zenithReason": "Pure Solve",
            "algovault.zenithFocusScore": 100,
            "algovault.zenithIntent": intent
          }, () => {
            startZenithBtn.remove();
          });
        },
        () => {
          // Cancel
        }
      );
    });

    document.body.appendChild(startZenithBtn);
  } else if (isZenithActive && document.getElementById('av-start-zenith-btn')) {
    document.getElementById('av-start-zenith-btn')?.remove();
  }

  // Early return if we don't have prediction data yet
  if (!predictionData || predictionData.error) return;

  // 3. Solve Probability (Injected as Inline Bubbles/Pills next to difficulty tag)
  if (!predictionInjected && diffTag && diffTag.parentElement) {
    const container = diffTag.parentElement;
    if (!document.getElementById('av-solve-chance-bubble')) {
      const { solveChance, expectedTimeMinutes, confidence } = predictionData;
      const roundedSolveChance = typeof solveChance === 'number' ? Math.round(solveChance) : 0;
      
      let assessment = "Stretch";
      let assessmentBg = "rgba(239, 68, 68, 0.08)";
      let assessmentBorder = "rgba(239, 68, 68, 0.2)";
      let assessmentColor = "#ef4444";
      
      if (roundedSolveChance >= 80) {
        assessment = "Accessible";
        assessmentBg = "rgba(16, 185, 129, 0.08)";
        assessmentBorder = "rgba(16, 185, 129, 0.2)";
        assessmentColor = "#10b981";
      } else if (roundedSolveChance >= 40) {
        assessment = "Uncertain";
        assessmentBg = "rgba(245, 158, 11, 0.08)";
        assessmentBorder = "rgba(245, 158, 11, 0.2)";
        assessmentColor = "#f59e0b";
      }

      const displayConfidence = confidence ? confidence.charAt(0).toUpperCase() + confidence.slice(1).toLowerCase() : "Medium";

      // 1. Solve Chance Bubble
      const chanceBubble = document.createElement('div');
      chanceBubble.id = 'av-solve-chance-bubble';
      chanceBubble.className = 'flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full';
      chanceBubble.style.display = 'inline-flex';
      chanceBubble.style.whiteSpace = 'nowrap';
      chanceBubble.style.backgroundColor = assessmentBg;
      chanceBubble.style.border = `1px solid ${assessmentBorder}`;
      chanceBubble.style.color = assessmentColor;
      chanceBubble.style.marginLeft = '8px';
      chanceBubble.innerHTML = `⚡ Practice estimate: <strong style="font-weight:700; margin-left:2px; margin-right:2px;">${assessment}</strong> (${roundedSolveChance}%)`;
      container.appendChild(chanceBubble);

      // 2. Confidence Bubble
      const confBubble = document.createElement('div');
      confBubble.id = 'av-confidence-bubble';
      confBubble.className = 'flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full';
      confBubble.style.display = 'inline-flex';
      confBubble.style.whiteSpace = 'nowrap';
      confBubble.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
      confBubble.style.border = '1px solid rgba(255, 255, 255, 0.08)';
      confBubble.style.color = '#c2c2c2';
      confBubble.style.marginLeft = '8px';
      confBubble.innerHTML = `🎯 Confidence: <strong style="font-weight:700; margin-left:2px;">${displayConfidence}</strong>`;
      container.appendChild(confBubble);

      predictionInjected = true;
    }
  }
}

let observerTimeout: number | null = null;
const observer = new MutationObserver((mutations) => {
  // Completely ignore mutations happening inside the code editor to prevent typing lag
  if (mutations.every(m => (m.target as Element).closest?.('.monaco-editor, .view-lines, .CodeMirror, [data-track-load="code_editor"]'))) {
    return;
  }

  if (ratingInjected && !document.querySelector('div[class*="text-difficulty"] span')) ratingInjected = false;
  if (predictionInjected && !document.getElementById('av-solve-chance-bubble')) predictionInjected = false;
  
  if (observerTimeout) window.clearTimeout(observerTimeout);
  observerTimeout = window.setTimeout(() => {
    injectAlgoVaultOverlay();
    hideForbiddenTabs();
    injectIntentionalRevealButton();
  }, 250);
});

observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener("beforeunload", () => observer.disconnect());

// Start process
setTimeout(() => {
    fetchPrediction();
    injectAlgoVaultOverlay();
}, 1000);
