(function (global) {
  "use strict";

  var cfg = global.GW_CONFIG || {};
  var adsense = cfg.adsense || {};
  var DEMO_CREATIVES = [
    { title: "스피드 VPN", desc: "게임 핑 낮추고 더 빠르게 — 첫 달 할인", cta: "알아보기" },
    { title: "코딩 부트캠프", desc: "8주 만에 웹 개발자 — 지금 무료 상담", cta: "신청하기" },
    { title: "게이밍 헤드셋", desc: "몰입감 업! 한정 특가 진행 중", cta: "쇼핑하기" },
    { title: "에너지 드링크", desc: "집중이 필요할 때 — 신제품 출시", cta: "자세히" },
    { title: "클라우드 저장소", desc: "게임 세이브·사진 무제한 백업", cta: "시작하기" }
  ];

  function useAdsense() {
    var flag = localStorage.getItem("game-warehouse-adsense");
    if (flag === "1") return true;
    if (flag === "0") return false;
    return !!adsense.enabled;
  }

  function setAdsenseEnabled(on) {
    localStorage.setItem("game-warehouse-adsense", on ? "1" : "0");
  }

  function pickCreative() {
    return DEMO_CREATIVES[Math.floor(Math.random() * DEMO_CREATIVES.length)];
  }

  function renderDemo(slotEl) {
    var creative = pickCreative();
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "demo-ad";
    btn.innerHTML =
      '<span class="ad-badge">AD</span>' +
      "<strong>" + creative.title + "</strong>" +
      "<span>" + creative.desc + "</span>" +
      "<span>" + creative.cta + " →</span>";

    btn.addEventListener("click", function () {
      if (global.GWAnalytics) global.GWAnalytics.trackAdClick();
      window.open("https://example.com/ad-landing", "_blank", "noopener,noreferrer");
    });

    slotEl.innerHTML = "";
    slotEl.appendChild(btn);
    if (global.GWAnalytics) global.GWAnalytics.trackAdImpression();
  }

  function renderAdsense(slotEl, slotName) {
    var client = adsense.client;
    var slotId = (adsense.slots && adsense.slots[slotName]) || "";
    if (!client || client.indexOf("XXXX") !== -1 || !slotId) {
      renderDemo(slotEl);
      return;
    }

    slotEl.innerHTML = "";
    var ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.style.width = "100%";
    ins.style.minHeight = "90px";
    ins.setAttribute("data-ad-client", client);
    ins.setAttribute("data-ad-slot", slotId);
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    slotEl.appendChild(ins);

    try {
      (global.adsbygoogle = global.adsbygoogle || []).push({});
      if (global.GWAnalytics) global.GWAnalytics.trackAdImpression();
    } catch (e) {
      renderDemo(slotEl);
    }
  }

  function ensureAdsenseScript() {
    if (!useAdsense()) return;
    if (document.getElementById("adsense-script")) return;
    var client = adsense.client;
    if (!client || client.indexOf("XXXX") !== -1) return;
    var s = document.createElement("script");
    s.id = "adsense-script";
    s.async = true;
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(client);
    s.crossOrigin = "anonymous";
    document.head.appendChild(s);
  }

  function fillSlots(root) {
    ensureAdsenseScript();
    var nodes = (root || document).querySelectorAll("[data-ad-slot]");
    nodes.forEach(function (el) {
      var name = el.getAttribute("data-ad-slot");
      if (useAdsense()) renderAdsense(el, name);
      else renderDemo(el);
    });
  }

  var interstitialTimer = null;

  function showInterstitial(onDone) {
    var modal = document.getElementById("ad-modal");
    var closeBtn = document.getElementById("ad-close");
    var countdownEl = document.getElementById("ad-countdown");
    if (!modal || !closeBtn) {
      if (onDone) onDone();
      return;
    }

    fillSlots(modal);
    modal.hidden = false;
    closeBtn.disabled = true;
    var left = 5;
    countdownEl.textContent = String(left);

    if (interstitialTimer) clearInterval(interstitialTimer);
    interstitialTimer = setInterval(function () {
      left -= 1;
      countdownEl.textContent = String(Math.max(0, left));
      if (left <= 0) {
        clearInterval(interstitialTimer);
        interstitialTimer = null;
        closeBtn.disabled = false;
        countdownEl.textContent = "0";
      }
    }, 1000);

    function finish() {
      modal.hidden = true;
      closeBtn.removeEventListener("click", finish);
      if (interstitialTimer) {
        clearInterval(interstitialTimer);
        interstitialTimer = null;
      }
      if (onDone) onDone();
    }

    closeBtn.addEventListener("click", finish);
  }

  global.GWAds = {
    fillSlots: fillSlots,
    showInterstitial: showInterstitial,
    useAdsense: useAdsense,
    setAdsenseEnabled: setAdsenseEnabled
  };
})(window);
