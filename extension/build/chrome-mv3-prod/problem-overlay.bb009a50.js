var e,t;"function"==typeof(e=globalThis.define)&&(t=e,e=null),function(t,o,n,r,a){var l="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},s="function"==typeof l[r]&&l[r],i=s.cache||{},d="undefined"!=typeof module&&"function"==typeof module.require&&module.require.bind(module);function c(e,o){if(!i[e]){if(!t[e]){var n="function"==typeof l[r]&&l[r];if(!o&&n)return n(e,!0);if(s)return s(e,!0);if(d&&"string"==typeof e)return d(e);var a=Error("Cannot find module '"+e+"'");throw a.code="MODULE_NOT_FOUND",a}p.resolve=function(o){var n=t[e][1][o];return null!=n?n:o},p.cache={};var u=i[e]=new c.Module(e);t[e][0].call(u.exports,p,u,u.exports,this)}return i[e].exports;function p(e){var t=p.resolve(e);return!1===t?{}:c(t)}}c.isParcelRequire=!0,c.Module=function(e){this.id=e,this.bundle=c,this.exports={}},c.modules=t,c.cache=i,c.parent=s,c.register=function(e,o){t[e]=[function(e,t){t.exports=o},{}]},Object.defineProperty(c,"root",{get:function(){return l[r]}}),l[r]=c;for(var u=0;u<o.length;u++)c(o[u]);if(n){var p=c(n);"object"==typeof exports&&"undefined"!=typeof module?module.exports=p:"function"==typeof e&&e.amd?e(function(){return p}):a&&(this[a]=p)}}({"2ZIMm":[function(e,t,o){var n=e("@parcel/transformer-js/src/esmodule-helpers.js");n.defineInteropFlag(o),n.export(o,"config",()=>l);var r=e("../lib/leetcode-url"),a=e("./ZenithSystemOverlay");let l={matches:["https://leetcode.com/problems/*","https://leetcode.com/contest/*/problems/*"],run_at:"document_idle"},s=!1,i=!1,d=()=>{if(!s||i)return;let e=document.evaluate("//*[text()='Editorial' or text()='Solutions' or text()='Discussion']",document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);for(let t=0;t<e.snapshotLength;t++){let o=e.snapshotItem(t);if(o){let e=o.closest('[role="tab"], a, button, div[class*="tab"]')||o;!e||e.textContent?.includes("Description")||e.id?.includes("av-intentional-reveal")||e.style.setProperty("display","none","important")}}let t=document.querySelectorAll('[role="tablist"] > *');t.forEach(e=>{let t=e.textContent?.trim()||"";(t.includes("Editorial")||t.includes("Solutions")||t.includes("Discussion")||t.includes("Discuss"))&&!e.id?.includes("av-intentional-reveal")&&e.style.setProperty("display","none","important")})},c=()=>{if(!s||i)return;let e=document.querySelector('[role="tablist"]');if(e&&!document.getElementById("av-intentional-reveal")){let t=document.createElement("button");t.id="av-intentional-reveal",t.className="ml-auto text-xs px-3 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors font-medium flex items-center gap-1 cursor-pointer font-mono select-none",t.innerHTML="<span>\uD83D\uDD12</span> Yield & Reveal Solutions",t.title="Hold for 2 seconds to yield and reveal solutions";let o=null;t.onmousedown=()=>{t.innerHTML="<span>\uD83D\uDD13</span> Yielding...",t.style.backgroundColor="rgba(239, 68, 68, 0.3)",o=window.setTimeout(()=>{chrome.storage.local.set({"algovault.zenithGrade":"D","algovault.zenithReason":"Intentional Reveal"},()=>{i=!0,document.querySelectorAll('[role="tab"], a, button, div').forEach(e=>{let t=e.textContent?.trim()||"";if("Editorial"===t||"Solutions"===t||"Discussion"===t){e.style.removeProperty("display");let t=e.closest('[role="tab"]');t&&t.style.removeProperty("display")}}),t.innerHTML="<span>\u2705</span> Solutions Revealed",t.disabled=!0,t.style.opacity="0.5",t.style.cursor="default"})},2e3)},t.onmouseup=t.onmouseleave=()=>{o&&(clearTimeout(o),t.disabled||(t.innerHTML="<span>\uD83D\uDD12</span> Yield & Reveal Solutions",t.style.backgroundColor="rgba(239, 68, 68, 0.1)"))},e.appendChild(t)}},u=e=>{let t=document.getElementById("av-zenith-style");if(e)t||((t=document.createElement("style")).id="av-zenith-style",t.textContent=`
        /* Hide Navbar to prevent navigation away */
        #navbar-root, nav, header { display: none !important; }
        
        /* Hide topics, companies, hints sections at the bottom */
        div[class*="topic-tags"], div.mt-6.flex.flex-col.gap-3 { display: none !important; }
        
        /* Hide LeetCode's own timer/session widgets if any */
        [data-track-load="timer"] { display: none !important; }
        
        /* Premium Background */
        body { background-color: #030303 !important; }
      `,document.head.appendChild(t)),d(),c();else{i=!1,t&&t.remove();let e=document.getElementById("av-intentional-reveal");e&&e.remove(),document.querySelectorAll('[role="tab"], a, button').forEach(e=>{"none"===e.style.display&&e.style.removeProperty("display")})}};chrome.storage.local.get("algovault.isZenith",e=>{u(s=!!e["algovault.isZenith"])}),chrome.storage.onChanged.addListener((e,t)=>{"local"===t&&e["algovault.isZenith"]&&u(s=!!e["algovault.isZenith"].newValue)});let p=!1,m=!1,b=!1,f=null,g=async()=>{let e=(0,r.getLeetCodeProblemSlug)();if(e)for(let t=0;t<3;t+=1){try{let t=await new Promise(t=>{chrome.runtime.sendMessage({action:"get_prediction",slug:e},t)});if(!t?.error){f=t,x();return}}catch(e){console.error("AlgoVault Prediction Error:",e)}await new Promise(e=>setTimeout(e,1e3))}},x=()=>{m||chrome.storage.sync.get(["hideAcceptanceRate"],e=>{if(!1===e.hideAcceptanceRate)return;let t=document.evaluate("//*[text()='Accepted' or text()='Submissions']",document,null,XPathResult.ANY_TYPE,null),o=t.iterateNext();for(;o;){let e=o.nextElementSibling;e&&e.textContent?.match(/\d/)||(e=o.parentElement?.nextElementSibling),e&&(e.style.display="none"),o.style.display="none",o=t.iterateNext()}let n=document.evaluate("//*[text()='Acceptance' or text()='Acceptance Rate']",document,null,XPathResult.ANY_TYPE,null),r=n.iterateNext();if(r){let e=r.nextElementSibling;if(e&&e.textContent?.includes("%")||(e=r.parentElement?.nextElementSibling),e&&"none"!==e.style.display&&e.textContent?.includes("%")){let t=e.textContent||"";e.style.display="none";let o=document.createElement("div");o.className="text-label-1 dark:text-dark-label-1 font-medium flex items-center gap-2";let n=document.createElement("span");n.textContent="Hidden";let a=document.createElement("button");a.textContent="\uD83D\uDC41 Show",a.style.cursor="pointer",a.style.color="#00d4aa",a.style.fontSize="12px";let l=!1;a.onclick=()=>{l=!l,n.textContent=l?t:"Hidden",a.textContent=l?"\uD83D\uDC41 Hide":"\uD83D\uDC41 Show"},o.appendChild(n),o.appendChild(a),r.parentElement?.appendChild(o),m=!0}}});let e=Array.from(document.querySelectorAll('div[class*="text-difficulty"]')).find(e=>{let t=e.textContent?.trim();return"Easy"===t||"Medium"===t||"Hard"===t}),t=(0,r.getLeetCodeProblemSlug)(),o=e?.getAttribute("data-algovault-rating");if(e&&t&&o!==t){e.setAttribute("data-algovault-rating",t),e.querySelector(".av-rating")?.remove();let o=o=>{if((0,r.getLeetCodeProblemSlug)()!==t||!Number.isFinite(o))return;let n=Math.round(Number(o)),a=e.querySelector(".av-rating");a&&a.remove();let l=document.createElement("span");l.className="av-rating ml-2 font-mono font-bold opacity-90",l.dataset.algovaultRating=t,l.textContent=` (${n})`,l.title="ZeroTrac contest rating",e.appendChild(l),p=!0};chrome.runtime.sendMessage({action:"get_problem_rating",slug:t},e=>{e&&"number"==typeof e.Rating&&o(e.Rating)})}if(document.getElementById("av-lists-btn")?.remove(),document.getElementById("av-start-zenith-btn")||s)s&&document.getElementById("av-start-zenith-btn")&&document.getElementById("av-start-zenith-btn")?.remove();else{var n,l;let e,t,o,s,i,d;let c=document.createElement("button");c.id="av-start-zenith-btn",c.innerHTML='<span style="font-size: 12px; margin-right: 4px;">\u2694\ufe0f</span> ZENITH',Object.assign(c.style,{position:"fixed",bottom:"24px",left:"24px",zIndex:"9999",display:"flex",alignItems:"center",justifyContent:"center",padding:"4px 10px",borderRadius:"9999px",backgroundColor:"rgba(9, 9, 11, 0.85)",color:"#dfa054",fontFamily:"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",fontSize:"11px",fontWeight:"700",letterSpacing:"0.8px",textTransform:"uppercase",border:"1px solid rgba(223, 160, 84, 0.3)",boxShadow:"0 2px 10px rgba(0, 0, 0, 0.5), 0 0 12px rgba(223, 160, 84, 0.15)",backdropFilter:"blur(8px)",cursor:"pointer",userSelect:"none",transition:"all 0.2s ease"}),c.onmouseover=()=>{c.style.backgroundColor="rgba(24, 24, 27, 0.95)",c.style.borderColor="rgba(223, 160, 84, 0.6)",c.style.boxShadow="0 0 25px rgba(223, 160, 84, 0.3)"},c.onmouseleave=()=>{c.style.backgroundColor="rgba(9, 9, 11, 0.9)",c.style.borderColor="rgba(223, 160, 84, 0.3)",c.style.boxShadow="0 0 15px rgba(223, 160, 84, 0.15)"},n="algovault.zenithBtnPos",l=()=>{(0,a.showZenithQuestModal)(e=>{document.documentElement.requestFullscreen().catch(e=>{console.warn("Fullscreen request rejected:",e)});let t=(0,r.getLeetCodeProblemSlug)();t&&chrome.runtime.sendMessage({action:"session_start_v2",slug:t}),chrome.storage.local.set({"algovault.isZenith":!0,"algovault.zenithGrade":"S_PLUS","algovault.zenithReason":"Pure Solve","algovault.zenithFocusScore":100,"algovault.zenithIntent":e},()=>{c.remove()})},()=>{})},e=!1,t=0,o=0,s=0,i=0,d=!1,chrome.storage.local.get(n,e=>{let t=e[n];t&&"number"==typeof t.left&&"number"==typeof t.top&&(c.style.bottom="auto",c.style.left=`${t.left}px`,c.style.top=`${t.top}px`)}),c.addEventListener("mousedown",r=>{if(0!==r.button)return;e=!0,d=!1,t=r.clientX,o=r.clientY;let a=c.getBoundingClientRect();s=a.left,i=a.top,c.style.transition="none",c.style.cursor="grabbing";let u=n=>{if(!e)return;let r=n.clientX-t,l=n.clientY-o;(Math.abs(r)>3||Math.abs(l)>3)&&(d=!0);let u=Math.max(10,Math.min(window.innerWidth-a.width-10,s+r)),p=Math.max(10,Math.min(window.innerHeight-a.height-10,i+l));c.style.bottom="auto",c.style.left=`${u}px`,c.style.top=`${p}px`},p=()=>{if(e=!1,c.style.cursor="pointer",c.style.transition="all 0.3s ease",window.removeEventListener("mousemove",u),window.removeEventListener("mouseup",p),d){let e=c.getBoundingClientRect();chrome.storage.local.set({[n]:{left:e.left,top:e.top}})}else l()};window.addEventListener("mousemove",u),window.addEventListener("mouseup",p)}),document.body.appendChild(c)}if(f&&!f.error&&!b&&e&&e.parentElement){let t=e.parentElement;if(!document.getElementById("av-solve-chance-bubble")){let{solveChance:e,expectedTimeMinutes:o,confidence:n}=f,r="number"==typeof e?Math.round(e):0,a="Stretch",l="rgba(239, 68, 68, 0.08)",s="rgba(239, 68, 68, 0.2)",i="#ef4444";r>=80?(a="Accessible",l="rgba(16, 185, 129, 0.08)",s="rgba(16, 185, 129, 0.2)",i="#10b981"):r>=40&&(a="Uncertain",l="rgba(245, 158, 11, 0.08)",s="rgba(245, 158, 11, 0.2)",i="#f59e0b");let d=n?n.charAt(0).toUpperCase()+n.slice(1).toLowerCase():"Medium",c=document.createElement("div");c.id="av-solve-chance-bubble",c.className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full",c.style.display="inline-flex",c.style.whiteSpace="nowrap",c.style.backgroundColor=l,c.style.border=`1px solid ${s}`,c.style.color=i,c.style.marginLeft="8px",c.innerHTML=`\u26a1 Practice estimate: <strong style="font-weight:700; margin-left:2px; margin-right:2px;">${a}</strong> (${r}%)`,t.appendChild(c);let u=document.createElement("div");u.id="av-confidence-bubble",u.className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full",u.style.display="inline-flex",u.style.whiteSpace="nowrap",u.style.backgroundColor="rgba(255, 255, 255, 0.03)",u.style.border="1px solid rgba(255, 255, 255, 0.08)",u.style.color="#c2c2c2",u.style.marginLeft="8px",u.innerHTML=`\ud83c Confidence: <strong style="font-weight:700; margin-left:2px;">${d}</strong>`,t.appendChild(u),b=!0}}},y=null,h=new MutationObserver(e=>{e.every(e=>e.target.closest?.('.monaco-editor, .view-lines, .CodeMirror, [data-track-load="code_editor"]'))||(p&&!document.querySelector('div[class*="text-difficulty"] span')&&(p=!1),b&&!document.getElementById("av-solve-chance-bubble")&&(b=!1),y&&window.clearTimeout(y),y=window.setTimeout(()=>{x(),d(),c()},250))});h.observe(document.body,{childList:!0,subtree:!0}),window.addEventListener("beforeunload",()=>h.disconnect()),setTimeout(()=>{g(),x()},1e3)},{"../lib/leetcode-url":"bUokv","./ZenithSystemOverlay":"wJlMj","@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],bUokv:[function(e,t,o){var n=e("@parcel/transformer-js/src/esmodule-helpers.js");function r(e=window.location.pathname){let t=e.match(/\/problems\/([^/?#]+)/);if(!t?.[1])return null;try{return decodeURIComponent(t[1]).trim().toLowerCase()||null}catch{return t[1].trim().toLowerCase()||null}}n.defineInteropFlag(o),n.export(o,"getLeetCodeProblemSlug",()=>r)},{"@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}],fRZO2:[function(e,t,o){o.interopDefault=function(e){return e&&e.__esModule?e:{default:e}},o.defineInteropFlag=function(e){Object.defineProperty(e,"__esModule",{value:!0})},o.exportAll=function(e,t){return Object.keys(e).forEach(function(o){"default"===o||"__esModule"===o||t.hasOwnProperty(o)||Object.defineProperty(t,o,{enumerable:!0,get:function(){return e[o]}})}),t},o.export=function(e,t,o){Object.defineProperty(e,t,{enumerable:!0,get:o})}},{}],wJlMj:[function(e,t,o){var n=e("@parcel/transformer-js/src/esmodule-helpers.js");n.defineInteropFlag(o),n.export(o,"config",()=>r),n.export(o,"showZenithQuestModal",()=>i),n.export(o,"showZenithAlarmModal",()=>d),n.export(o,"showZenithToast",()=>c);let r={matches:["https://leetcode.com/problems/*"],run_at:"document_idle"},a=`
  @keyframes soloFadeIn {
    from { opacity: 0; transform: scale(0.95) translate(-50%, -50%); }
    to { opacity: 1; transform: scale(1) translate(-50%, -50%); }
  }

  @keyframes bgFadeIn {
    from { opacity: 0; backdrop-filter: blur(0px); }
    to { opacity: 1; backdrop-filter: blur(12px); }
  }

  @keyframes pulseCyan {
    0%, 100% { box-shadow: 0 0 15px rgba(223, 160, 84, 0.22), inset 0 0 10px rgba(223, 160, 84, 0.05); }
    50% { box-shadow: 0 0 25px rgba(223, 160, 84, 0.38), inset 0 0 15px rgba(223, 160, 84, 0.12); }
  }

  @keyframes pulseRed {
    0%, 100% { box-shadow: 0 0 15px rgba(255, 0, 85, 0.4), inset 0 0 10px rgba(255, 0, 85, 0.1); }
    50% { box-shadow: 0 0 25px rgba(255, 0, 85, 0.7), inset 0 0 15px rgba(255, 0, 85, 0.3); }
  }

  @keyframes slideToast {
    from { transform: translateY(100px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .solo-bg-blur {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(2, 6, 12, 0.85);
    z-index: 2147483646;
    animation: bgFadeIn 0.3s ease-out forwards;
  }

  .solo-quest-card {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 380px;
    background: rgba(14, 15, 19, 0.97);
    border: 1px solid rgba(223, 160, 84, 0.68);
    border-radius: 8px;
    z-index: 2147483647;
    animation: soloFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards, pulseCyan 4s infinite;
    padding: 24px;
    color: #f4f4f5;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    box-sizing: border-box;
  }

  .solo-quest-header {
    border: 1px solid rgba(223, 160, 84, 0.24);
    background: rgba(223, 160, 84, 0.06);
    padding: 8px 16px;
    text-align: center;
    font-weight: bold;
    font-size: 18px;
    letter-spacing: 2px;
    color: #f2c27b;
    text-shadow: 0 0 8px rgba(223, 160, 84, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 20px;
  }

  .solo-quest-subheader {
    font-size: 11px;
    text-align: center;
    color: #a1a1aa;
    margin-bottom: 20px;
    letter-spacing: 1px;
  }

  .solo-quest-section-title {
    font-size: 14px;
    font-weight: bold;
    color: #f2c27b;
    border-bottom: 1px solid rgba(223, 160, 84, 0.16);
    padding-bottom: 4px;
    margin-bottom: 12px;
    letter-spacing: 1px;
  }

  .solo-quest-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    margin-bottom: 8px;
    color: #d4d4d8;
  }

  .solo-quest-checkmark {
    color: #f2c27b;
    border: 1px solid rgba(223, 160, 84, 0.28);
    padding: 1px 4px;
    font-size: 9px;
    border-radius: 2px;
    background: rgba(223, 160, 84, 0.06);
  }

  .solo-quest-warning {
    margin-top: 24px;
    font-size: 11px;
    color: #a1a1aa;
    text-align: center;
    line-height: 1.5;
  }

  .solo-quest-warning span.penalty {
    color: #f2c27b;
    font-weight: bold;
    text-shadow: 0 0 8px rgba(255, 0, 85, 0.3);
  }

  .solo-quest-confirm-btn {
    display: block;
    width: 60px;
    height: 60px;
    margin: 20px auto 0 auto;
    background: rgba(223, 160, 84, 0.08);
    border: 1px solid #dfa054;
    border-radius: 6px;
    color: #f2c27b;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    outline: none;
    box-shadow: 0 0 10px rgba(223, 160, 84, 0.18);
  }

  .solo-quest-confirm-btn:hover {
    background: rgba(223, 160, 84, 0.16);
    box-shadow: 0 0 20px rgba(223, 160, 84, 0.3);
    transform: scale(1.05);
  }

  .solo-quest-intents {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 10px 0 4px;
  }

  .solo-intent {
    border: 1px solid rgba(255,255,255,0.09);
    background: rgba(255,255,255,0.02);
    border-radius: 6px;
    color: #a1a1aa;
    cursor: pointer;
    font: inherit;
    font-size: 10px;
    padding: 9px 6px;
    transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
  }

  .solo-intent:hover, .solo-intent.is-active {
    border-color: rgba(223,160,84,0.56);
    background: rgba(223,160,84,0.10);
    color: #f4f4f5;
  }

  /* Alarm warning dialog styles */
  .solo-alarm-card {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 380px;
    background: rgba(22, 10, 16, 0.95);
    border: 2px solid #ff0055;
    border-radius: 4px;
    z-index: 2147483647;
    animation: soloFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards, pulseRed 4s infinite;
    padding: 24px;
    color: #ffd8e2;
    font-family: 'Courier New', Courier, monospace;
    box-sizing: border-box;
  }

  .solo-alarm-header {
    border: 1px solid rgba(255, 0, 85, 0.4);
    background: rgba(255, 0, 85, 0.05);
    padding: 8px 16px;
    text-align: center;
    font-weight: bold;
    font-size: 18px;
    letter-spacing: 2px;
    color: #ff0055;
    text-shadow: 0 0 8px rgba(255, 0, 85, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 20px;
  }

  .solo-alarm-msg {
    font-size: 13px;
    text-align: center;
    color: #ffb3c5;
    margin-bottom: 20px;
    line-height: 1.6;
  }

  .solo-alarm-msg span.penalty {
    color: #ff0055;
    font-weight: bold;
    text-shadow: 0 0 8px rgba(255, 0, 85, 0.3);
  }

  .solo-alarm-buttons {
    display: flex;
    gap: 16px;
    margin-top: 24px;
  }

  .solo-alarm-btn {
    flex: 1;
    padding: 10px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    font-weight: bold;
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
    transition: all 0.2s;
    outline: none;
  }

  .solo-alarm-btn-obey {
    border: 1px solid #00f0ff;
    color: #00f0ff;
    box-shadow: 0 0 10px rgba(0, 240, 255, 0.1);
  }

  .solo-alarm-btn-obey:hover {
    background: rgba(0, 240, 255, 0.1);
    box-shadow: 0 0 15px rgba(0, 240, 255, 0.4);
  }

  .solo-alarm-btn-proceed {
    border: 1px solid #ff0055;
    color: #ff0055;
    box-shadow: 0 0 10px rgba(255, 0, 85, 0.1);
  }

  .solo-alarm-btn-proceed:hover {
    background: rgba(255, 0, 85, 0.1);
    box-shadow: 0 0 15px rgba(255, 0, 85, 0.4);
  }

  /* Toast message styles */
  .solo-toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    background: rgba(7, 15, 28, 0.9);
    border: 1px solid #00f0ff;
    box-shadow: 0 0 15px rgba(0, 240, 255, 0.3);
    border-radius: 4px;
    padding: 10px 16px;
    color: #aaeaff;
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    letter-spacing: 0.5px;
    animation: slideToast 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    pointer-events: none;
  }
`,l=!1;function s(){if(l)return;let e=document.createElement("style");e.textContent=a,document.head.appendChild(e),l=!0}function i(e,t){s();let o=document.createElement("div");o.className="solo-bg-blur";let n=document.createElement("div");n.className="solo-quest-card",n.innerHTML=`
    <div class="solo-quest-header">
      <span>\u2726</span> ZENITH EXPEDITION
    </div>
    <div class="solo-quest-subheader">
      A deliberate practice session. Your record is private and yours.
    </div>
    
    <div class="solo-quest-section-title">GOAL</div>
    <div class="solo-quest-item">
      <span>Set a clear intent</span>
      <span class="solo-quest-checkmark">Ready</span>
    </div>
    <div class="solo-quest-item">
      <span>Work the problem honestly</span>
      <span class="solo-quest-checkmark">Observed</span>
    </div>
    <div class="solo-quest-item">
      <span>Record help when you use it</span>
      <span class="solo-quest-checkmark">Reflect</span>
    </div>

    <div class="solo-quest-section-title" style="margin-top:18px">SESSION INTENT</div>
    <div class="solo-quest-intents">
      <button class="solo-intent is-active" data-intent="FOCUSED_SOLVE">Focused solve</button>
      <button class="solo-intent" data-intent="INTERVIEW_SIM">Interview</button>
      <button class="solo-intent" data-intent="RECOVERY">Recovery</button>
    </div>

    <div class="solo-quest-warning">
      Zenith records continuity and help signals so you can review how you practiced. It does not judge you.
    </div>

    <button class="solo-quest-confirm-btn" title="Begin Quest">
      BEGIN
    </button>
  `,n.addEventListener("click",e=>e.stopPropagation());let r="FOCUSED_SOLVE";n.querySelectorAll(".solo-intent").forEach(e=>{e.addEventListener("click",()=>{r=e.dataset.intent||"FOCUSED_SOLVE",n.querySelectorAll(".solo-intent").forEach(e=>e.classList.remove("is-active")),e.classList.add("is-active")})}),n.querySelector(".solo-quest-confirm-btn")?.addEventListener("click",()=>{o.remove(),n.remove(),e(r)}),o.addEventListener("click",()=>{o.remove(),n.remove(),t()}),document.body.appendChild(o),document.body.appendChild(n)}function d(e,t,o,n){s();let r=document.createElement("div");r.className="solo-bg-blur";let a=document.createElement("div");a.className="solo-alarm-card",a.innerHTML=`
    <div class="solo-alarm-header">
      <span>\u25c7</span> CONTINUITY CHECK
    </div>
    <div class="solo-alarm-msg">
      ${e}
    </div>
    <div class="solo-alarm-msg">
      Your private session record will note this interruption. <span class="penalty">${t}</span>
    </div>
    
    <div class="solo-alarm-buttons">
      <button class="solo-alarm-btn solo-alarm-btn-obey">Return to focus</button>
      <button class="solo-alarm-btn solo-alarm-btn-proceed">Continue session</button>
    </div>
  `,a.addEventListener("click",e=>e.stopPropagation()),a.querySelector(".solo-alarm-btn-obey")?.addEventListener("click",()=>{r.remove(),a.remove(),n()}),a.querySelector(".solo-alarm-btn-proceed")?.addEventListener("click",()=>{r.remove(),a.remove(),o()}),r.addEventListener("click",()=>{r.remove(),a.remove(),n()}),document.body.appendChild(r),document.body.appendChild(a)}function c(e){s(),document.querySelectorAll(".solo-toast-container").forEach(e=>e.remove());let t=document.createElement("div");t.className="solo-toast-container",t.textContent=`[System: ${e}]`,document.body.appendChild(t),setTimeout(()=>{t.style.transition="all 0.5s ease-in",t.style.opacity="0",t.style.transform="translateY(-20px)",setTimeout(()=>t.remove(),500)},3500)}},{"@parcel/transformer-js/src/esmodule-helpers.js":"fRZO2"}]},["2ZIMm"],"2ZIMm","parcelRequiree717"),globalThis.define=t;