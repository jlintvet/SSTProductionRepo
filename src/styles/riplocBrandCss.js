// src/styles/riplocBrandCss.js
//
// Single source of truth for RipLoc's site-wide "rl-" design system --
// fonts, colors, nav, buttons, section rhythm, pricing cards, and auth
// form fields. Originally lived only inside LandingPage.jsx as a local
// GLOBAL_CSS constant; any other page that wants to look and feel like
// the marketing site (currently: LandingPage.jsx and UpgradePage.jsx)
// should import RL_GLOBAL_CSS / injectRlGlobalCss() from here instead of
// declaring its own copy or inventing separate styles. The injection is
// idempotent (guarded by a `data-rl="1"` attribute) so it's safe for
// multiple pages to call injectRlGlobalCss() independently -- whichever
// page mounts first wins, and the stylesheet is identical either way.

export const RL_GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  .rl{font-family:'Inter',system-ui,sans-serif;color:#0f172a;scroll-behavior:smooth;}

  /* NAV */
  .rl-nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;
    justify-content:space-between;padding:0 2.5rem;height:68px;
    background:rgba(8,13,24,0.93);backdrop-filter:blur(12px);
    border-bottom:1px solid rgba(12,196,160,0.12);transition:background .3s;}
  .rl-nav-links{display:flex;align-items:center;gap:2rem;}
  .rl-nav-link{color:#7a9ab5;font-size:14px;font-weight:500;text-decoration:none;
    letter-spacing:.04em;transition:color .2s;}
  .rl-nav-link:hover{color:#00c8e8;}
  .rl-nav-right{display:flex;align-items:center;gap:1rem;}
  .rl-btn-ghost{background:none;border:none;color:#7a9ab5;font-size:14px;font-weight:500;
    cursor:pointer;font-family:inherit;padding:.4rem .75rem;border-radius:6px;transition:color .2s;}
  .rl-btn-ghost:hover{color:#fff;}
  .rl-btn-primary{background:#00c8e8;color:#08101e;border:none;border-radius:8px;font-size:14px;
    font-weight:700;cursor:pointer;font-family:inherit;padding:.5rem 1.25rem;
    letter-spacing:.03em;transition:background .2s,transform .15s;}
  .rl-btn-primary:hover{background:#00deff;transform:translateY(-1px);}

  /* HERO */
  .rl-hero{min-height:100vh;display:flex;flex-direction:column;justify-content:center;
    position:relative;overflow:hidden;background:#08101e;padding:120px 2.5rem 80px;}
  .rl-hero-photobg{position:absolute;inset:0;z-index:0;
    background:linear-gradient(135deg,#04090f 0%,#071525 60%,#0a1e2c 100%);
    display:flex;align-items:center;justify-content:center;}
  .rl-photo-ph{width:100%;height:100%;border:1.5px dashed rgba(30,111,168,.3);
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
    color:rgba(12,196,160,.35);font-size:11.5px;font-weight:600;letter-spacing:.1em;
    text-transform:uppercase;text-align:center;padding:2rem;}
  .rl-hero-glow{position:absolute;inset:0;z-index:1;
    background:radial-gradient(ellipse 60% 60% at 65% 50%,rgba(14,116,144,.16) 0%,transparent 70%),
               radial-gradient(ellipse 35% 40% at 85% 80%,rgba(12,196,160,.07) 0%,transparent 60%),
               radial-gradient(ellipse 45% 50% at 15% 20%,rgba(30,111,168,.1) 0%,transparent 60%);}
  .rl-hero-overlay{position:absolute;inset:0;z-index:2;
    background:
      linear-gradient(to right,rgba(8,16,30,.78) 0%,rgba(8,16,30,.52) 38%,rgba(8,16,30,.04) 72%,transparent 100%),
      linear-gradient(to top,rgba(8,16,30,.55) 0%,transparent 45%);}
  .rl-hero-content{position:relative;z-index:3;max-width:660px;}
  .rl-eyebrow{font-size:11.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;
    color:#00c8e8;margin-bottom:1.25rem;}
  .rl-hero-h1{font-family:'Bebas Neue','Arial Black',sans-serif;
    font-size:clamp(4rem,9vw,7rem);line-height:.95;color:#fff;margin-bottom:1.5rem;letter-spacing:.02em;}
  .rl-hero-h1 span{color:#00c8e8;}
  .rl-hero-sub{font-size:clamp(15px,2vw,18px);line-height:1.7;color:#7a9ab5;
    max-width:520px;margin-bottom:2.25rem;}
  .rl-hero-ctas{display:flex;gap:1rem;flex-wrap:wrap;align-items:center;}
  .rl-btn-hero{background:#00c8e8;color:#08101e;border:none;border-radius:10px;font-size:16px;
    font-weight:800;cursor:pointer;font-family:inherit;padding:.85rem 2rem;letter-spacing:.02em;
    transition:background .2s,transform .15s,box-shadow .2s;
    box-shadow:0 0 32px rgba(12,196,160,.22);}
  .rl-btn-hero:hover{background:#00deff;transform:translateY(-2px);box-shadow:0 4px 40px rgba(12,196,160,.38);}
  .rl-btn-outline{background:transparent;color:#e8f0f7;border:1.5px solid rgba(232,240,247,.22);
    border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;font-family:inherit;
    padding:.85rem 1.75rem;letter-spacing:.02em;transition:border-color .2s,color .2s;
    display:flex;align-items:center;gap:.5rem;}
  .rl-btn-outline:hover{border-color:#00c8e8;color:#00c8e8;}
  .rl-hero-note{margin-top:1.25rem;font-size:13px;color:#7a9ab5;}

  /* HERO CAROUSEL */
  .rl-hero-photobg{transition:opacity .7s ease;}
  .rl-hero-photobg.fading{opacity:0;}
  .rl-carousel-dots{position:absolute;bottom:2rem;left:2.5rem;z-index:4;
    display:flex;gap:.6rem;align-items:center;}
  .rl-cdot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.3);
    border:none;padding:0;cursor:pointer;transition:all .25s;}
  .rl-cdot.on{width:22px;border-radius:4px;background:#00c8e8;}
  .rl-hero-content{transition:opacity .5s ease,transform .5s ease;}
  .rl-hero-content.fading{opacity:0;transform:translateY(12px);}

  /* TRUST BAR - horizontal marquee, single line, scrolls left to right */
  .rl-trust{background:#0f2244;border-top:1px solid rgba(12,196,160,.14);
    border-bottom:1px solid rgba(12,196,160,.14);padding:1rem 0;overflow:hidden;}
  .rl-trust-track{display:inline-flex;width:max-content;
    animation:rl-trust-scroll 38s linear infinite;}
  .rl-trust:hover .rl-trust-track{animation-play-state:paused;}
  .rl-trust-item{display:inline-flex;align-items:center;gap:.5rem;font-size:12.5px;font-weight:600;
    color:#7a9ab5;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;padding:0 1.75rem;}
  .rl-dot{width:6px;height:6px;border-radius:50%;background:#00c8e8;flex-shrink:0;}
  @keyframes rl-trust-scroll{from{transform:translateX(-50%);}to{transform:translateX(0);}}

  /* SECTIONS */
  .rl-sec{padding:6rem 2.5rem;}
  .rl-dark{background:#08101e;color:#e8f0f7;}
  .rl-mid{background:#0d1a2e;color:#e8f0f7;}
  .rl-light{background:#f8fafc;color:#0f172a;}
  .rl-inner{max-width:1100px;margin:0 auto;}
  .rl-lbl{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
    color:#00c8e8;margin-bottom:1rem;}
  .rl-h2{font-family:'Bebas Neue','Arial Black',sans-serif;
    font-size:clamp(2.25rem,5vw,3.5rem);line-height:1;letter-spacing:.03em;margin-bottom:1rem;}
  .rl-sub{font-size:17px;line-height:1.7;max-width:580px;opacity:.72;margin-bottom:3rem;}

  /* DATA CARDS */
  .rl-data-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem;margin-bottom:3.5rem;}
  .rl-dcard{background:rgba(255,255,255,.04);border:1px solid rgba(12,196,160,.11);border-radius:14px;
    padding:1.75rem;transition:border-color .2s,background .2s;}
  .rl-dcard:hover{border-color:rgba(12,196,160,.32);background:rgba(12,196,160,.05);}
  .rl-dcard-icon{width:40px;height:40px;border-radius:10px;background:rgba(12,196,160,.14);
    display:flex;align-items:center;justify-content:center;margin-bottom:1rem;}
  .rl-dcard-title{font-size:15px;font-weight:700;margin-bottom:.4rem;color:#e8f0f7;}
  .rl-dcard-body{font-size:13.5px;line-height:1.65;color:#7a9ab5;}

  /* MAP FRAME */
  .rl-mapframe{border-radius:16px;overflow:hidden;
    box-shadow:0 0 0 1px rgba(12,196,160,.18),0 24px 80px rgba(0,0,0,.55);position:relative;}
  .rl-mapframe img{width:100%;display:block;}
  .rl-maplabel{position:absolute;background:rgba(8,13,24,.88);backdrop-filter:blur(8px);
    border:1px solid rgba(12,196,160,.22);border-radius:8px;padding:.4rem .75rem;
    font-size:11.5px;font-weight:600;color:#00c8e8;letter-spacing:.06em;text-transform:uppercase;}

  /* VIDEO */
  .rl-video-sec{background:#0d1a2e;padding:6rem 2.5rem;}
  .rl-video-grid{display:grid;grid-template-columns:1fr 1fr;gap:4rem;align-items:center;}
  .rl-video-frame{margin:0;border-radius:20px;overflow:hidden;
    width:fit-content;max-width:100%;justify-self:center;background:#000;
    box-shadow:0 24px 80px rgba(0,0,0,.5);}
  .rl-video-frame video{display:block;width:auto;height:auto;max-width:100%;max-height:min(70vh,620px);}
  .rl-play{width:80px;height:80px;border-radius:50%;background:rgba(12,196,160,.14);
    border:2px solid #00c8e8;display:flex;align-items:center;justify-content:center;
    cursor:pointer;transition:background .2s,transform .15s;}
  .rl-play:hover{background:rgba(12,196,160,.25);transform:scale(1.06);}
  .rl-vid-note{color:#7a9ab5;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;}

  /* FEATURE ROWS */
  .rl-feat-grid{display:grid;grid-template-columns:1fr 1fr;gap:5rem;align-items:center;margin-bottom:7rem;}
  .rl-feat-grid:last-child{margin-bottom:0;}
  .rl-flip{direction:rtl;}
  .rl-flip>*{direction:ltr;}
  .rl-feat-lbl{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
    color:#00c8e8;margin-bottom:.75rem;}
  .rl-feat-h3{font-family:'Bebas Neue','Arial Black',sans-serif;
    font-size:clamp(2rem,4vw,2.75rem);line-height:1.05;letter-spacing:.03em;
    color:#e8f0f7;margin-bottom:1rem;}
  .rl-feat-body{font-size:16px;line-height:1.75;color:#7a9ab5;margin-bottom:1.5rem;}
  .rl-pills{display:flex;flex-wrap:wrap;gap:.5rem;}
  .rl-pill{background:rgba(12,196,160,.11);border:1px solid rgba(12,196,160,.23);
    color:#00c8e8;font-size:12px;font-weight:600;letter-spacing:.05em;border-radius:20px;padding:.3rem .85rem;}
  .rl-scr{border-radius:16px;overflow:hidden;
    box-shadow:0 0 0 1px rgba(12,196,160,.14),0 20px 60px rgba(0,0,0,.5);background:#0f2244;}
  .rl-scr img{width:100%;display:block;}
  .rl-scr-ph{aspect-ratio:4/3;background:linear-gradient(135deg,#0a1828 0%,#071020 100%);
    border:1.5px dashed rgba(30,111,168,.32);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:.75rem;padding:2rem;text-align:center;color:rgba(12,196,160,.4);
    font-size:11.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;}
  .rl-two{display:grid;grid-template-rows:auto auto;gap:1rem;}

  /* COMMUNITY */
  .rl-comm-sec{background:#08101e;padding:7rem 2.5rem;position:relative;overflow:hidden;}
  .rl-comm-glow{position:absolute;inset:0;
    background:radial-gradient(ellipse 55% 75% at 80% 50%,rgba(12,196,160,.055) 0%,transparent 65%);}
  .rl-comm-inner{max-width:1100px;margin:0 auto;position:relative;z-index:1;
    display:grid;grid-template-columns:1fr 1fr;gap:5rem;align-items:center;}
  .rl-comm-h2{font-family:'Bebas Neue','Arial Black',sans-serif;
    font-size:clamp(2.5rem,6vw,4.5rem);line-height:1;letter-spacing:.03em;color:#fff;margin-bottom:.2rem;}
  .rl-comm-h2 em{color:#00c8e8;font-style:normal;}
  .rl-comm-rule{font-size:16px;line-height:1.75;color:#7a9ab5;margin:1.5rem 0 2.5rem;}
  .rl-pillars{display:flex;flex-direction:column;gap:1.5rem;}
  .rl-pillar{display:flex;gap:1.25rem;align-items:flex-start;}
  .rl-p-icon{flex-shrink:0;width:44px;height:44px;border-radius:10px;
    background:rgba(12,196,160,.11);border:1px solid rgba(12,196,160,.2);
    display:flex;align-items:center;justify-content:center;}
  .rl-p-title{font-size:15px;font-weight:700;color:#e8f0f7;margin-bottom:.3rem;}
  .rl-p-body{font-size:14px;line-height:1.65;color:#7a9ab5;}
  .rl-comm-photo{border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5);
    aspect-ratio:4/5;position:relative;}
  .rl-comm-photo img{width:100%;height:100%;object-fit:cover;object-position:center;display:block;}

  /* NO BS */
  .rl-nobs-sec{background:#08101e;padding:7rem 2.5rem;
    border-top:1px solid rgba(0,200,232,.1);position:relative;overflow:hidden;}
  .rl-nobs-sec::before{content:'';position:absolute;top:-120px;left:50%;
    transform:translateX(-50%);width:700px;height:700px;
    background:radial-gradient(circle,rgba(26,95,216,.1) 0%,transparent 70%);
    pointer-events:none;}
  .rl-nobs-hdr{text-align:left;margin-bottom:5rem;position:relative;z-index:1;}
  .rl-nobs-eyebrow{font-size:11px;font-weight:700;letter-spacing:.18em;
    text-transform:uppercase;color:#00c8e8;margin-bottom:1rem;}
  .rl-nobs-h2{font-family:'Bebas Neue','Arial Black',sans-serif;
    font-size:clamp(2.5rem,5vw,4rem);color:#fff;line-height:1.05;margin-bottom:1rem;}
  .rl-nobs-sub{font-size:17px;color:#7a9ab5;max-width:640px;margin:0;line-height:1.7;}
  .rl-nobs-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0;
    border:1px solid rgba(0,200,232,.12);border-radius:20px;overflow:hidden;
    position:relative;z-index:1;}
  .rl-nobs-card{padding:3rem 2.5rem;background:transparent;
    border-right:1px solid rgba(0,200,232,.08);transition:background .25s;}
  .rl-nobs-card:last-child{border-right:none;}
  .rl-nobs-card:hover{background:rgba(0,200,232,.03);}
  .rl-nbadge{display:inline-flex;align-items:center;justify-content:center;
    width:44px;height:44px;border-radius:12px;margin-bottom:1.5rem;
    font-size:20px;font-weight:700;}
  .nbno{background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.2);}
  .nbyes{background:rgba(0,200,232,.08);color:#00c8e8;border:1px solid rgba(0,200,232,.2);}
  .rl-nc-title{font-family:'Bebas Neue','Arial Black',sans-serif;
    font-size:1.6rem;letter-spacing:.02em;color:#fff;margin-bottom:.75rem;line-height:1.1;}
  .rl-nc-body{font-size:15px;line-height:1.7;color:#7a9ab5;}

  /* PRICING */
  .rl-price-sec{background:#f8fafc;padding:6rem 2.5rem;}
  .rl-price-inner{max-width:900px;margin:0 auto;}
  .rl-price-hdr{text-align:left;margin-bottom:3.5rem;}
  .rl-price-h2{font-family:'Bebas Neue','Arial Black',sans-serif;
    font-size:clamp(2rem,5vw,3.25rem);color:#0f172a;letter-spacing:.03em;margin-bottom:.75rem;}
  .rl-price-sub{font-size:16px;color:#475569;max-width:640px;margin:0;line-height:1.7;}
  .rl-cards{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;}
  .rl-card{border-radius:20px;padding:2.5rem;position:relative;}
  .rl-card.free{background:#fff;border:1.5px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,.07);}
  .rl-card.pro{background:#08101e;border:1.5px solid rgba(12,196,160,.28);
    box-shadow:0 0 0 1px rgba(12,196,160,.18),0 16px 60px rgba(0,0,0,.32);}
  .rl-pbadge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);
    background:#f59e0b;color:#fff;border-radius:20px;padding:4px 16px;
    font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;}
  .rl-tier{font-size:12.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:.5rem;}
  .rl-tier.lt{color:#475569;} .rl-tier.dk{color:#00c8e8;}
  .rl-amt{display:flex;align-items:baseline;gap:.25rem;margin-bottom:.25rem;}
  .rl-num{font-family:'Bebas Neue',sans-serif;font-size:3.5rem;line-height:1;}
  .rl-num.lt{color:#0f172a;} .rl-num.dk{color:#fff;}
  .rl-per{font-size:14px;} .rl-per.lt{color:#475569;} .rl-per.dk{color:#7a9ab5;}
  .rl-pnote{font-size:13px;margin-bottom:1.75rem;}
  .rl-pnote.lt{color:#475569;} .rl-pnote.dk{color:#7a9ab5;}
  .rl-div{height:1px;margin:1.5rem 0;}
  .rl-div.lt{background:#e2e8f0;} .rl-div.dk{background:rgba(255,255,255,.08);}
  .rl-feats{list-style:none;display:flex;flex-direction:column;gap:.6rem;margin-bottom:2rem;}
  .rl-feat-li{display:flex;gap:.6rem;font-size:14px;line-height:1.5;}
  .rl-feat-li .chk{color:#00c8e8;font-weight:700;flex-shrink:0;}
  .rl-feat-li.lt{color:#475569;} .rl-feat-li.dk{color:rgba(232,240,247,.82);}
  .rl-pcta{width:100%;padding:.85rem;border-radius:10px;font-size:15px;font-weight:700;
    cursor:pointer;font-family:inherit;border:none;transition:all .2s;letter-spacing:.03em;}
  .rl-pcta.lt{background:#0f172a;color:#fff;} .rl-pcta.lt:hover{background:#1a5fd8;}
  .rl-pcta.dk{background:#00c8e8;color:#08101e;} .rl-pcta.dk:hover{background:#00deff;}
  .rl-price-footer{text-align:center;margin-top:2rem;font-size:14px;color:#475569;}

  /* FINAL CTA */
  .rl-final{position:relative;padding:8rem 2.5rem;overflow:hidden;text-align:center;background:#08101e;}
  .rl-final-ph{position:absolute;inset:0;z-index:0;
    background:linear-gradient(160deg,#030609 0%,#07111a 100%);
    display:flex;align-items:center;justify-content:center;}
  .rl-final-ov{position:absolute;inset:0;z-index:1;background:linear-gradient(to top,rgba(8,16,30,.88) 0%,rgba(8,16,30,.55) 40%,rgba(8,16,30,.3) 100%);}
  .rl-final-glow{position:absolute;inset:0;z-index:1;
    background:radial-gradient(ellipse 70% 70% at 50% 50%,rgba(12,196,160,.07) 0%,transparent 70%);}
  .rl-final-content{position:relative;z-index:2;max-width:800px;margin:0 auto;}
  .rl-final-h2{font-family:'Bebas Neue','Arial Black',sans-serif;
    font-size:clamp(5rem,12vw,9rem);color:#fff;margin-bottom:1rem;line-height:.9;
    text-shadow:0 0 80px rgba(0,200,232,.12);}
  .rl-final-h2 span{color:#00c8e8;}
  .rl-final-sub{font-size:19px;color:#a0bad4;max-width:480px;margin:0 auto 3rem;line-height:1.7;}
  .rl-final-note{margin-top:1.25rem;font-size:14px;color:#7a9ab5;opacity:.75;letter-spacing:.02em;}
  .rl-final-eyebrow{font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#00c8e8;margin-bottom:2rem;}
  .rl-final-divider{width:60px;height:2px;background:linear-gradient(to right,#1a5fd8,#00c8e8);margin:1.5rem auto 2rem;}

  /* ── Community Photo Carousel ─────────────────────────────────────────────── */
  .rl-photos-sec{background:#04090f;padding:5rem 0;overflow:hidden;border-top:1px solid rgba(0,200,232,.07);}
  .rl-photos-hdr{max-width:1100px;margin:0 auto 2.5rem;padding:0 2.5rem;display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;}
  .rl-photos-left{}
  .rl-photos-eyebrow{font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#00c8e8;margin-bottom:.75rem;}
  .rl-photos-h2{font-family:'Bebas Neue','Arial Black',sans-serif;font-size:clamp(2rem,4vw,3rem);color:#fff;line-height:1;}
  .rl-photos-nav{display:flex;gap:.5rem;flex-shrink:0;}
  .rl-photos-nbtn{width:40px;height:40px;border-radius:50%;border:1px solid rgba(0,200,232,.2);background:transparent;color:#00c8e8;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;font-size:16px;}
  .rl-photos-nbtn:hover{background:rgba(0,200,232,.1);}
  .rl-photos-nbtn:disabled{opacity:.3;cursor:default;}
  .rl-photos-track-wrap{padding-left:2.5rem;overflow:hidden;}
  .rl-photos-track{display:flex;gap:1rem;transition:transform .6s cubic-bezier(.4,0,.2,1);}
  .rl-photo-slide{flex:0 0 500px;height:350px;border-radius:16px;overflow:hidden;position:relative;background:#0d1a2e;}
  .rl-photo-slide img{width:100%;height:100%;object-fit:cover;display:block;}
  .rl-photo-caption{position:absolute;bottom:0;left:0;right:0;padding:1rem 1.25rem .875rem;background:linear-gradient(to top,rgba(0,0,0,.65),transparent);font-size:12px;color:rgba(255,255,255,.8);letter-spacing:.03em;}
  .rl-photo-placeholder{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.75rem;border:1px dashed rgba(0,200,232,.15);border-radius:16px;}
  .rl-photo-ph-label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#2a4a6a;}

  /* ── Ambassador Section ────────────────────────────────────────────────────── */
  .rl-amb-sec{background:#06101e;padding:8rem 2.5rem;border-top:1px solid rgba(0,200,232,.1);position:relative;overflow:hidden;}
  .rl-amb-sec::before{content:'';position:absolute;top:-80px;right:-80px;width:500px;height:500px;background:radial-gradient(circle,rgba(26,95,216,.08) 0%,transparent 70%);pointer-events:none;}
  .rl-amb-inner{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:5rem;align-items:start;position:relative;z-index:1;}
  .rl-amb-eyebrow{font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#00c8e8;margin-bottom:1rem;}
  .rl-amb-h2{font-family:'Bebas Neue','Arial Black',sans-serif;font-size:clamp(2.5rem,5vw,4rem);color:#fff;line-height:1.05;margin-bottom:1.5rem;}
  .rl-amb-body{font-size:16px;line-height:1.8;color:#7a9ab5;margin-bottom:2rem;}
  .rl-amb-perks{display:flex;flex-direction:column;gap:1rem;}
  .rl-amb-perk{display:flex;gap:.875rem;align-items:flex-start;}
  .rl-amb-dot{width:6px;height:6px;border-radius:50%;background:#00c8e8;flex-shrink:0;margin-top:.55rem;}
  .rl-amb-perk-text{font-size:15px;color:#a0bad4;line-height:1.6;}
  .rl-amb-form-wrap{background:rgba(13,26,46,.7);border:1px solid rgba(0,200,232,.12);border-radius:20px;padding:2.5rem;}
  .rl-amb-form-title{font-family:'Bebas Neue','Arial Black',sans-serif;font-size:1.8rem;color:#fff;margin-bottom:.4rem;letter-spacing:.02em;line-height:1;}
  .rl-amb-form-sub{font-size:13px;color:#4a6a85;margin-bottom:2rem;line-height:1.5;}
  .rl-amb-field{margin-bottom:1.1rem;}
  .rl-amb-label{display:block;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#4a6a85;margin-bottom:.4rem;}
  .rl-amb-input{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(0,200,232,.12);border-radius:10px;padding:.7rem 1rem;font-size:14px;color:#e0eaf4;outline:none;transition:border-color .2s;box-sizing:border-box;font-family:inherit;}
  .rl-amb-input:focus{border-color:rgba(0,200,232,.4);}
  .rl-amb-input::placeholder{color:#2a4060;}
  .rl-amb-textarea{resize:vertical;min-height:90px;}
  .rl-amb-row{display:grid;grid-template-columns:1fr 1fr;gap:.875rem;}
  .rl-amb-submit{width:100%;margin-top:.75rem;padding:.95rem;background:linear-gradient(135deg,#1a5fd8,#00c8e8);border:none;border-radius:10px;color:#fff;font-size:15px;font-weight:700;letter-spacing:.04em;cursor:pointer;transition:opacity .2s;font-family:inherit;}
  .rl-amb-submit:hover{opacity:.88;}
  .rl-amb-submit:disabled{opacity:.45;cursor:not-allowed;}
  .rl-amb-error{font-size:13px;color:#f87171;margin-top:.75rem;text-align:center;}
  .rl-amb-success{text-align:center;padding:2.5rem 1rem;}
  .rl-amb-success-h{font-family:'Bebas Neue','Arial Black',sans-serif;font-size:2.2rem;color:#00c8e8;margin-bottom:.75rem;line-height:1;}
  .rl-amb-success-p{font-size:15px;color:#7a9ab5;line-height:1.7;}
  @media(max-width:900px){
    .rl-amb-inner{grid-template-columns:1fr;}
    .rl-photo-slide{flex:0 0 350px;height:250px;}
    .rl-amb-row{grid-template-columns:1fr;}
  }

  /* FOOTER */
  .rl-footer{background:#030609;padding:2.5rem;border-top:1px solid rgba(255,255,255,.05);}
  .rl-footer-in{max-width:1100px;margin:0 auto;display:flex;flex-wrap:wrap;
    justify-content:space-between;align-items:center;gap:1rem;}
  .rl-flinks{display:flex;gap:1.5rem;}
  .rl-flink{font-size:13px;color:rgba(122,154,181,.55);text-decoration:none;transition:color .2s;}
  .rl-flink:hover{color:#00c8e8;}
  .rl-fcopy{font-size:13px;color:rgba(122,154,181,.38);}

  /* MODAL */
  .rl-modal-ov{position:fixed;inset:0;z-index:1000;background:rgba(4,9,16,.9);
    backdrop-filter:blur(8px);display:flex;align-items:flex-start;justify-content:center;padding:1.5rem;overflow-y:auto;}
  .rl-modal{background:#fff;border-radius:20px;padding:2.5rem;width:100%;max-width:420px;
    box-shadow:0 24px 80px rgba(0,0,0,.5);position:relative;margin:auto;}
  .rl-modal-x{position:absolute;top:1rem;right:1rem;background:none;border:none;cursor:pointer;
    color:#94a3b8;font-size:20px;line-height:1;padding:.25rem;border-radius:4px;transition:color .2s;}
  .rl-modal-x:hover{color:#0f172a;}
  .rl-modal-logo{display:flex;justify-content:center;margin-bottom:1.5rem;}
  .rl-modal-title{font-size:20px;font-weight:700;color:#0f172a;margin-bottom:.4rem;}
  .rl-modal-sub{font-size:14px;color:#475569;margin-bottom:1.5rem;}

  /* AUTH FORM */
  .rl-tabs{display:flex;gap:0;margin-bottom:20px;border-bottom:1.5px solid #e2e8f0;}
  .rl-tab{flex:1;padding:.65rem 0;background:none;border:none;border-bottom:2px solid transparent;
    margin-bottom:-1.5px;font-size:14px;font-weight:600;
    cursor:pointer;font-family:inherit;transition:all .15s;}
  .rl-tab.on{color:#1a5fd8;border-bottom-color:#1a5fd8;}
  .rl-tab.off{color:#94a3b8;}
  .rl-tab.off:hover{color:#475569;}
  .rl-inp{width:100%;padding:.65rem .9rem;border:1.5px solid #e2e8f0;border-radius:8px;
    font-size:15px;margin-bottom:12px;box-sizing:border-box;outline:none;
    font-family:inherit;transition:border-color .2s;}
  .rl-inp:focus{border-color:#1a5fd8;}
  .rl-pw{position:relative;margin-bottom:12px;}
  .rl-pw .rl-inp{margin-bottom:0;padding-right:2.5rem;}
  .rl-eye{position:absolute;right:10px;top:50%;transform:translateY(-50%);
    background:none;border:none;cursor:pointer;color:#94a3b8;padding:2px;display:flex;align-items:center;}
  .rl-trial{font-size:13px;color:#1a5fd8;background:#f0f9ff;border-radius:8px;
    padding:8px 12px;margin:0 0 14px;text-align:center;}
  .rl-fmbtn{width:100%;padding:.8rem;background:#16a34a;color:#fff;border:none;border-radius:8px;
    font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:4px;transition:background .2s;}
  .rl-fmbtn:hover{background:#15803d;}
  .rl-fmbtn:disabled{opacity:.65;cursor:not-allowed;}
  .rl-err{color:#dc2626;font-size:13px;padding:8px 12px;background:#fef2f2;border-radius:6px;margin-bottom:10px;}
  .rl-lnk{background:none;border:none;color:#1a5fd8;cursor:pointer;font-size:14px;
    text-decoration:underline;padding:0;font-family:inherit;}
  .rl-forgot{text-align:right;margin-top:-8px;margin-bottom:10px;}

  /* RESPONSIVE */
  @media(max-width:900px){
    .rl-nav-links{display:none;}
    .rl-video-grid{grid-template-columns:1fr;gap:2.5rem;}
    .rl-feat-grid{grid-template-columns:1fr;gap:2.5rem;}
    .rl-flip{direction:ltr;}
    .rl-comm-inner{grid-template-columns:1fr;gap:3rem;}
    .rl-comm-photo{display:none;}
    .rl-nobs-grid{grid-template-columns:1fr;border-radius:16px;}
    .rl-nobs-card{border-right:none;border-bottom:1px solid rgba(0,200,232,.08);}
    .rl-nobs-card:last-child{border-bottom:none;}
    .rl-cards{grid-template-columns:1fr;}
    .rl-sec{padding:4rem 1.5rem;}
    .rl-hero{padding:100px 1.5rem 60px;}
  }
  @media(max-width:600px){
    .rl-hero-ctas{flex-direction:column;}
    .rl-btn-hero,.rl-btn-outline{width:100%;justify-content:center;}
    .rl-data-grid{grid-template-columns:1fr;}
  }

  /* UPGRADE PAGE (/upgrade) -- reuses the same rl- design tokens as the
     landing page's pricing section, with dark-mode variants of the auth
     form fields (rl-inp.dk etc.) for embedding inside the dark Pro card,
     and a billing-cycle pill toggle in the same teal/navy palette. */
  .rl-upg-hero{background:#08101e;padding:140px 2.5rem 3.5rem;text-align:center;}
  .rl-upg-hero-inner{max-width:600px;margin:0 auto;}
  .rl-upg-sub{font-size:16px;line-height:1.7;color:#7a9ab5;margin:0 auto 2rem;max-width:460px;}
  .rl-toggle-wrap{display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,.07);
    border:1px solid rgba(0,200,232,.14);border-radius:40px;padding:6px;}
  .rl-toggle-btn{padding:.55rem 1.25rem;border-radius:32px;border:none;cursor:pointer;
    font-family:inherit;font-weight:600;font-size:14px;letter-spacing:.02em;
    background:transparent;color:#7a9ab5;display:flex;align-items:center;gap:8px;transition:all .15s;}
  .rl-toggle-btn.on{background:#00c8e8;color:#08101e;}
  .rl-toggle-save{background:#059669;color:#fff;font-size:10.5px;font-weight:700;
    padding:2px 7px;border-radius:12px;}
  .rl-inp.dk{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.16);color:#e2f0ff;}
  .rl-inp.dk::placeholder{color:#5a7a95;}
  .rl-inp.dk:focus{border-color:#00c8e8;}
  .rl-tabs.dk{border-bottom-color:rgba(255,255,255,.12);}
  .rl-tab.dk.on{color:#00c8e8;border-bottom-color:#00c8e8;}
  .rl-tab.dk.off{color:#5a7a95;}
  .rl-tab.dk.off:hover{color:#93c5fd;}
  .rl-err.dk{background:rgba(239,68,68,.14);color:#fca5a5;}
  .rl-lnk.dk{color:#7dd3fc;}
  .rl-upg-footer{text-align:center;margin-top:1rem;font-size:13px;color:#475569;}
  @media(max-width:900px){
    .rl-upg-hero{padding:110px 1.5rem 2.5rem;}
  }
`;

export function injectRlGlobalCss() {
  if (typeof document === "undefined") return;
  if (document.querySelector('[data-rl="1"]')) return;
  const s = document.createElement("style");
  s.setAttribute("data-rl", "1");
  s.textContent = RL_GLOBAL_CSS;
  document.head.appendChild(s);
}
