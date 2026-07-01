// src/pages/LandingPage.jsx
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";

import altimetryImg   from "../public/altimetry_ref.png";
import tripDetailImg  from "../public/trip_detail_ref.png";
import tripPlanImg    from "../public/trip_plan_ref.png";
import heroBoatImg    from "../public/hero_boat.jpg";
import riplocMarkImg  from "../public/brand/riploc-mark.png";
import riplocLockupImg from "../public/brand/riploc-lockup-horizontal.png";
import riplocOfiImg    from "../public/brand/riploc-ofi-icon.png";
import riplocBTextImg  from "../public/brand/riploc-b-text-icon.png";
import featureMahiImg from "../public/feature_mahi.jpg";
import ctaBillfishImg from "../public/cta_billfish.jpg";
import appUiImg       from "../public/screenshots/app_ui.jpg";
import commPinImg     from "../public/screenshots/community_pin.jpg";
import routeMapImg    from "../public/screenshots/route_map.jpg";
import hotspotImg     from "../public/screenshots/hotspot_zone.jpg";
import weatherImg     from "../public/screenshots/weather.jpg";
import sharingImg     from "../public/screenshots/sharing.jpg";
import commLbImg      from "../public/screenshots/community_leaderboard.jpg";
import commPhoto0  from "../public/community/img_0766.jpg";
import commPhoto1  from "../public/community/img_1092.jpg";
import commPhoto2  from "../public/community/img_1676.jpg";
import commPhoto3  from "../public/community/img_2641.jpg";
import commPhoto4  from "../public/community/img_2674.jpg";
import commPhoto5  from "../public/community/img_2697.jpg";
import commPhoto6  from "../public/community/img_5849.jpg";
import commPhoto7  from "../public/community/img_7142.jpg";
import commPhoto8  from "../public/community/img_7404.jpg";
import commPhoto9  from "../public/community/img_9568.jpg";
import commPhoto10 from "../public/community/img_1109.jpg";
import commPhoto11 from "../public/community/img_1162.jpg";
import commPhoto12 from "../public/community/img_1598.jpg";
import commPhoto13 from "../public/community/img_1963.jpg";
import commPhoto14 from "../public/community/img_2613.jpg";
import commPhoto15 from "../public/community/img_2776.jpg";
import commPhoto16 from "../public/community/img_2804.jpg";
import commPhoto17 from "../public/community/img_2925.jpg";
import commPhoto18 from "../public/community/img_2947.jpg";
import commPhoto19 from "../public/community/img_3034.jpg";

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  navy:    "#08101e",
  navyMid: "#0d1a2e",
  navyLt:  "#0f2244",
  teal:    "#00c8e8",
  blue:    "#1a5fd8",
  amber:   "#f59e0b",
  textOn:  "#e8f0f7",
  mutedOn: "#7a9ab5",
  white:   "#ffffff",
  slate:   "#f8fafc",
  dark:    "#0f172a",
  mid:     "#475569",
};

// ─── Injected CSS ─────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
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

  /* TRUST BAR */
  .rl-trust{background:#0f2244;border-top:1px solid rgba(12,196,160,.14);
    border-bottom:1px solid rgba(12,196,160,.14);padding:1rem 2.5rem;}
  .rl-trust-inner{max-width:1100px;margin:0 auto;display:flex;flex-wrap:wrap;
    justify-content:center;gap:1.5rem 3rem;}
  .rl-trust-item{display:flex;align-items:center;gap:.5rem;font-size:12.5px;font-weight:600;
    color:#7a9ab5;letter-spacing:.05em;text-transform:uppercase;}
  .rl-dot{width:6px;height:6px;border-radius:50%;background:#00c8e8;flex-shrink:0;}

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
  .rl-video-frame{margin:3rem auto 0;border-radius:20px;overflow:hidden;
    width:fit-content;background:#000;
    box-shadow:0 24px 80px rgba(0,0,0,.5);}
  .rl-video-frame video{display:block;max-width:min(900px,100%);max-height:70vh;width:auto;height:auto;}
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
    backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:1.5rem;}
  .rl-modal{background:#fff;border-radius:20px;padding:2.5rem;width:100%;max-width:420px;
    box-shadow:0 24px 80px rgba(0,0,0,.5);position:relative;}
  .rl-modal-x{position:absolute;top:1rem;right:1rem;background:none;border:none;cursor:pointer;
    color:#94a3b8;font-size:20px;line-height:1;padding:.25rem;border-radius:4px;transition:color .2s;}
  .rl-modal-x:hover{color:#0f172a;}
  .rl-modal-logo{display:flex;justify-content:center;margin-bottom:1.5rem;}
  .rl-modal-title{font-size:20px;font-weight:700;color:#0f172a;margin-bottom:.4rem;}
  .rl-modal-sub{font-size:14px;color:#475569;margin-bottom:1.5rem;}

  /* AUTH FORM */
  .rl-tabs{display:flex;gap:8px;margin-bottom:20px;}
  .rl-tab{flex:1;padding:.55rem;border-radius:8px;font-size:14px;font-weight:600;
    cursor:pointer;font-family:inherit;transition:all .15s;border:2px solid;}
  .rl-tab.on{background:#1a5fd8;color:#fff;border-color:#1a5fd8;}
  .rl-tab.off{background:#f1f5f9;color:#64748b;border-color:#e2e8f0;}
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
  .rl-fmbtn{width:100%;padding:.8rem;background:#1a5fd8;color:#fff;border:none;border-radius:8px;
    font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:4px;transition:background .2s;}
  .rl-fmbtn:hover{background:#1a5f94;}
  .rl-fmbtn:disabled{opacity:.65;cursor:not-allowed;}
  .rl-err{color:#dc2626;font-size:13px;padding:8px 12px;background:#fef2f2;border-radius:6px;margin-bottom:10px;}
  .rl-lnk{background:none;border:none;color:#1a5fd8;cursor:pointer;font-size:14px;
    text-decoration:underline;padding:0;font-family:inherit;}
  .rl-forgot{text-align:right;margin-top:-8px;margin-bottom:10px;}

  /* RESPONSIVE */
  @media(max-width:900px){
    .rl-nav-links{display:none;}
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
`;

// Inject styles at module level — before React renders, no FOUC
if (typeof document !== "undefined" && !document.querySelector('[data-rl="1"]')) {
  const _s = document.createElement("style");
  _s.setAttribute("data-rl", "1");
  _s.textContent = GLOBAL_CSS;
  document.head.appendChild(_s);
}

function EyeIcon({ visible }) {
  return visible ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function CamIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24">
      <polygon points="5,3 19,12 5,21" fill="#00c8e8"/>
    </svg>
  );
}

function PhotoPH({ label, style = {} }) {
  return (
    <div className="rl-photo-ph" style={style}>
      <CamIcon />
      <div>PHOTO: {label}</div>
    </div>
  );
}

function RipLocLogo({ h = 34, lockup = false }) {
  if (lockup) {
    // Full horizontal lockup PNG (RIPLOC + OFFSHORE FISHING INTELLIGENCE + tagline)
    const aspect = 600 / 130; // approx aspect ratio of the lockup image
    return (
      <img
        src={riplocLockupImg}
        alt="RipLoc: Offshore Fishing Intelligence"
        style={{ height: h, width: Math.round(h * aspect), objectFit:"contain", display:"block" }}
      />
    );
  }
  // Mark-only: iR lettermark + wave
  return (
    <div style={{ display:"flex", alignItems:"center", gap: Math.round(h * 0.28) }}>
      <img
        src={riplocMarkImg}
        alt="RipLoc"
        style={{ height: h, width: h, objectFit:"contain", display:"block", borderRadius: Math.round(h * 0.15) }}
      />
      <div style={{ display:"flex", flexDirection:"column", justifyContent:"center", lineHeight:1 }}>
        <span style={{
          fontFamily:"'Arial Black','Impact',sans-serif", fontWeight:900, fontStyle:"italic",
          fontSize: Math.round(h * 0.52), color:"#ffffff", letterSpacing:"-0.5px", lineHeight:1,
        }}>RIPLOC</span>
        <span style={{
          fontFamily:"Arial,sans-serif", fontWeight:700, fontSize: Math.round(h * 0.17),
          color:"#00c8e8", letterSpacing:"2px", textTransform:"uppercase", lineHeight:1.4,
        }}>OFFSHORE FISHING INTELLIGENCE</span>
      </div>
    </div>
  );
}

function AuthForm({ onSuccess, initialMode }) {
  const [mode, setMode]         = useState(initialMode ?? "register");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [showCf, setShowCf]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [sent, setSent]         = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleLogin(e) {
    e.preventDefault(); setError(null); setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) setError(err.message); else onSuccess?.();
  }
  async function handleRegister(e) {
    e.preventDefault(); setError(null);
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }
    if (referralCode.trim()) {
      sessionStorage.setItem("pendingReferralCode", referralCode.trim());
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
    // Note: the Stripe trial subscription is NOT created here — signUp() returns
    // no session until the user confirms their email, so there's no access token
    // yet. It's created in App.jsx's onAuthStateChange handler on first SIGNED_IN,
    // which fires once the user actually completes confirmation and logs in.
  }
  async function handleReset(e) {
    e.preventDefault(); setError(null);
    if (!resetEmail.trim()) { setError("Enter your email address."); return; }
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: window.location.origin + "/reset-password",
    });
    setLoading(false); setResetSent(true);
  }

  if (sent) return (
    <div style={{ textAlign: "center", padding: "1rem 0" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
      <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>Check your email</h3>
      <p style={{ color: "#475569", fontSize: 14, margin: "0 0 16px", lineHeight: 1.6 }}>
        Confirmation link sent to <strong>{email}</strong>.<br/>
        Click it to activate your account and start your 30-day Pro trial.
      </p>
      <button className="rl-fmbtn" style={{ background: "#64748b" }}
        onClick={() => { setSent(false); setMode("login"); }}>Back to sign in</button>
    </div>
  );
  if (resetSent) return (
    <div style={{ textAlign: "center", padding: "1rem 0" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
      <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>Reset link sent</h3>
      <p style={{ color: "#475569", fontSize: 14, margin: "0 0 16px", lineHeight: 1.6 }}>
        If <strong>{resetEmail}</strong> is registered, a reset link is on its way.
      </p>
      <button className="rl-fmbtn" style={{ background: "#64748b" }}
        onClick={() => { setResetSent(false); setMode("login"); setResetEmail(""); }}>
        Back to sign in</button>
    </div>
  );
  if (mode === "reset") return (
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 17, color: "#0f172a" }}>Reset your password</h3>
      <p style={{ margin: "0 0 18px", fontSize: 14, color: "#475569" }}>
        Enter your email and we will send a reset link.
      </p>
      <form onSubmit={handleReset}>
        <input className="rl-inp" type="email" placeholder="Email address"
          value={resetEmail} onChange={e => setResetEmail(e.target.value)} required autoFocus />
        {error && <div className="rl-err">{error}</div>}
        <button className="rl-fmbtn" type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}</button>
      </form>
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <button className="rl-lnk" onClick={() => { setMode("login"); setError(null); }}>
          Back to sign in</button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="rl-tabs">
        {[["register","Start Free Trial"],["login","Sign In"]].map(([m, lbl]) => (
          <button key={m} className={`rl-tab ${mode===m?"on":"off"}`}
            onClick={() => { setMode(m); setError(null); }}>{lbl}</button>
        ))}
      </div>
      {mode === "register" && (
        <div className="rl-trial">30-day free Pro trial. No credit card required.</div>
      )}
      <form onSubmit={mode === "login" ? handleLogin : handleRegister}>
        <input className="rl-inp" type="email" placeholder="Email address"
          value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        <div className="rl-pw">
          <input className="rl-inp" type={showPw?"text":"password"} placeholder="Password"
            value={password} onChange={e => setPassword(e.target.value)} required />
          <button type="button" className="rl-eye" onClick={() => setShowPw(s=>!s)}>
            <EyeIcon visible={showPw} /></button>
        </div>
        {mode === "login" && (
          <div className="rl-forgot">
            <button type="button" className="rl-lnk"
              onClick={() => { setMode("reset"); setError(null); }}>Forgot password?</button>
          </div>
        )}
        {mode === "register" && (
          <div className="rl-pw">
            <input className="rl-inp" type={showCf?"text":"password"} placeholder="Confirm password"
              value={confirm} onChange={e => setConfirm(e.target.value)} required />
            <button type="button" className="rl-eye" onClick={() => setShowCf(s=>!s)}>
              <EyeIcon visible={showCf} /></button>
          </div>
        )}
        {mode === "register" && (
          <input className="rl-inp" type="text" placeholder="Referral code (optional)"
            value={referralCode} onChange={e => setReferralCode(e.target.value)} />
        )}
        {error && <div className="rl-err">{error}</div>}
        <button className="rl-fmbtn" type="submit" disabled={loading}>
          {loading ? "…" : mode==="login" ? "Sign In" : "Create Account. Start Trial."}
        </button>
      </form>
    </div>
  );
}

function AuthModal({ open, onClose, onSuccess, initialMode }) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="rl-modal-ov" onClick={e => { if (e.target===e.currentTarget) onClose(); }}>
      <div className="rl-modal">
        <div className="rl-modal-accent" />
        <button className="rl-modal-x" onClick={onClose} aria-label="Close">✕</button>
        <div className="rl-modal-inner">
          <div className="rl-modal-logo">
            <img src={riplocBTextImg} alt="Riploc" style={{ height: 56, width: Math.round(56 * 5.295), objectFit: "contain", display: "block" }} />
          </div>
          <div className="rl-modal-title">Lock In.</div>
          <div className="rl-modal-sub">30-day Pro trial. No credit card. No BS.</div>
          <AuthForm onSuccess={() => { onClose(); onSuccess?.(); }} initialMode={initialMode} />
        </div>
      </div>
    </div>
  );
}

const DATA_LAYERS = [
  { title: "Sea Surface Temperature",
    body: "VIIRS daily, 36h composite, MUR 1km, and GOES. The same satellite feeds charter captains pay to access.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg> },
  { title: "Chlorophyll Concentration",
    body: "Track productivity zones and baitfish concentrations. Find the green water where pelagics are stacking.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg> },
  { title: "Sea Level Anomaly",
    body: "Altimetry-derived eddy detection. Warm-core rings and upwelling zones. Where the big fish hold.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg> },
  { title: "Ocean Current Vectors",
    body: "OSCAR / HYCOM current direction and speed. Know where the water is moving before you leave the inlet.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg> },
  { title: "Bathymetry + Structure",
    body: "Depth contours, canyon labels, LORAN grid. Wrecks and hard bottom (Pro). Know the bottom before you drop.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round"><polygon points="3,11 22,2 13,21 11,13 3,11"/></svg> },
  { title: "Wind & Marine Weather",
    body: "Animated GFS wind raster plus NOAA port-specific forecast. Seven-day marine weather at your departure inlet.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></svg> },
];

const FREE_FEATS = [
  "Sea Surface Temperature, daily",
  "Chlorophyll & sea color layers",
  "Bathymetry contours + canyon labels",
  "Wind map & NOAA marine forecast",
  "Departure port planning",
  "Unlimited saved locations",
  "Community reports (contribute to access)",
];
const PRO_FEATS = [
  "Everything in Standard",
  "36h VIIRS composite + MUR 1km SST",
  "Sea level anomaly (altimetry)",
  "Ocean current particle overlay",
  "Isotherm (temp break) overlay",
  "Fishing hotspot scoring map",
  "Color gain & rendering controls",
  "Wreck & bottom structure locations",
  "Weather buoy live observations",
  "Trip planner with fuel & ETA calc",
  "GPS tracking overlay",
  "Route saving & sharing",
  "90-day community access window",
];

const HERO_SLIDES = [
  {
    imgKey: "boat",
    imgPos: "55% center",
    eyebrow: "Offshore Fishing Intelligence",
    h1line1: "Stop Guessing.",
    h1span: "Lock In.",
    sub: "Professional-grade oceanographic data combined with real-time weather and a community of active offshore fishermen. SST, chlorophyll, altimetry, sea color, currents, bathymetry and more. Free. No ads. No BS.",
  },
  {
    imgKey: "mahi",
    imgPos: "center 40%",
    eyebrow: "Find the Fish",
    h1line1: "Know Where",
    h1span: "They're Biting.",
    sub: "RipLoc layers real satellite data over the exact temperature breaks, current edges, and depth changes where gamefish stack up. Stop running blind.",
  },
  {
    imgKey: "billfish",
    imgPos: "center 30%",
    eyebrow: "Contribute to Play",
    h1line1: "Share the Intel.",
    h1span: "Win Together.",
    sub: "Post a catch report. Drop a live pin. Tip a fellow angler. Every contribution earns points and opens the full community map to you.",
  },
];

function HeroCarousel({ open, heroBoatImg, featureMahiImg, ctaBillfishImg }) {
  const IMGS = { boat: heroBoatImg, mahi: featureMahiImg, billfish: ctaBillfishImg };
  const [idx, setIdx]       = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef            = useRef(null);

  function goTo(next) {
    if (fading) return;
    clearInterval(timerRef.current);
    setFading(true);
    setTimeout(() => { setIdx(next); setFading(false); }, 600);
    timerRef.current = setInterval(advance, 5500);
  }

  function advance() {
    setFading(true);
    setTimeout(() => {
      setIdx(i => (i + 1) % HERO_SLIDES.length);
      setFading(false);
    }, 600);
  }

  useEffect(() => {
    timerRef.current = setInterval(advance, 5500);
    return () => clearInterval(timerRef.current);
  }, []);

  const slide = HERO_SLIDES[idx];

  return (
    <section className="rl-hero">
      <div className={"rl-hero-photobg" + (fading ? " fading" : "")}>
        <img
          src={IMGS[slide.imgKey]}
          alt="RipLoc offshore fishing"
          style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition: slide.imgPos }}
        />
      </div>
      <div className="rl-hero-glow" />
      <div className="rl-hero-overlay" />
      <div className={"rl-hero-content" + (fading ? " fading" : "")}>
        <div className="rl-eyebrow">{slide.eyebrow}</div>
        <h1 className="rl-hero-h1">
          {slide.h1line1}<br/><span>{slide.h1span}</span>
        </h1>
        <p className="rl-hero-sub">{slide.sub}</p>
        <div className="rl-hero-ctas">
          <button className="rl-btn-hero" onClick={open}>
            Start Free. 30-Day Pro Trial.
          </button>
          <button className="rl-btn-outline"
            onClick={() => document.getElementById("video")?.scrollIntoView({ behavior: "smooth" })}>
            <PlayIcon /> Watch How It Works
          </button>
        </div>
        <p className="rl-hero-note">No credit card required &middot; East Coast Mid-Atlantic &middot; More regions coming</p>
      </div>
      <div className="rl-carousel-dots">
        {HERO_SLIDES.map((_, i) => (
          <button
            key={i}
            className={"rl-cdot" + (i === idx ? " on" : "")}
            onClick={() => goTo(i)}
            aria-label={"Slide " + (i + 1)}
          />
        ))}
      </div>
    </section>
  );
}

// ── Community photo carousel ──────────────────────────────────────────────────
// To add photos: import the file at the top, then add { src: myImg, caption: "..." }
// Use src: null to keep a placeholder slot while curating.
const ALL_COMMUNITY_PHOTOS = [
  { src: commPhoto0  },
  { src: commPhoto1  },
  { src: commPhoto2  },
  { src: commPhoto3  },
  { src: commPhoto4  },
  { src: commPhoto5  },
  { src: commPhoto6  },
  { src: commPhoto7  },
  { src: commPhoto8  },
  { src: commPhoto9  },
  { src: commPhoto10 },
  { src: commPhoto11 },
  { src: commPhoto12 },
  { src: commPhoto13 },
  { src: commPhoto14 },
  { src: commPhoto15 },
  { src: commPhoto16 },
  { src: commPhoto17 },
  { src: commPhoto18 },
  { src: commPhoto19 },
];
const PHOTOS_VISIBLE = 3;
function shufflePhotos(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MarketingLanding({ onAuthSuccess, authed }) {
  const [modal, setModal]     = useState(false);
  const [modalMode, setModalMode] = useState("register");
  const [photoIdx, setPhotoIdx] = useState(0);
  const [photos, setPhotos] = useState(() => shufflePhotos(ALL_COMMUNITY_PHOTOS));
  // Auto-cycle carousel every 4 seconds; reset on manual nav
  const photoTimerRef = React.useRef(null);
  const startPhotoTimer = React.useCallback(() => {
    clearInterval(photoTimerRef.current);
    photoTimerRef.current = setInterval(() => {
      setPhotoIdx(i => {
        const next = i + 1;
        return next > photos.length - PHOTOS_VISIBLE ? 0 : next;
      });
    }, 4000);
  }, [photos.length]);
  React.useEffect(() => { startPhotoTimer(); return () => clearInterval(photoTimerRef.current); }, [startPhotoTimer]);
  const [ambForm, setAmbForm]             = useState({ name:"", boatName:"", location:"", email:"", phone:"", comments:"" });
  const [ambSubmitting, setAmbSubmitting] = useState(false);
  const [ambSubmitted,  setAmbSubmitted]  = useState(false);
  const [ambError,      setAmbError]      = useState("");
  const navigate = useNavigate();

  // Re-inject CSS if missing (e.g. after sign-out remount); no cleanup — global style persists
  useEffect(() => {
    if (!document.querySelector('[data-rl="1"]')) {
      const s = document.createElement("style");
      s.setAttribute("data-rl", "1");
      s.textContent = GLOBAL_CSS;
      document.head.appendChild(s);
    }
  }, []);

  async function submitAmbassador() {
    if (!ambForm.name.trim() || !ambForm.email.trim()) {
      setAmbError("Name and email are required."); return;
    }
    setAmbSubmitting(true); setAmbError("");
    try {
      const { error } = await supabase.from("ambassador_applications").insert([{
        name:      ambForm.name.trim(),
        boat_name: ambForm.boatName.trim(),
        location:  ambForm.location.trim(),
        email:     ambForm.email.trim(),
        phone:     ambForm.phone.trim(),
        comments:  ambForm.comments.trim(),
      }]);
      if (error) throw error;
      // Fire-and-forget email notification (non-blocking)
      supabase.functions.invoke("notify-ambassador", {
        body: {
          name:     ambForm.name.trim(),
          email:    ambForm.email.trim(),
          boatName: ambForm.boatName.trim(),
          location: ambForm.location.trim(),
          phone:    ambForm.phone.trim(),
          comments: ambForm.comments.trim(),
        },
      }).catch(() => {}); // don't block submission on email failure
      setAmbSubmitted(true);
    } catch(e) {
      setAmbError("Something went wrong. Please email us directly.");
    } finally { setAmbSubmitting(false); }
  }

  const openRegister = () => { setModalMode("register"); setModal(true); };
  const openLogin    = () => {
    if (authed) { window.location.href = "/app"; return; }
    setModalMode("login"); setModal(true);
  };
  const done = () => { setModal(false); onAuthSuccess?.(); };

  return (
    <div className="rl">

      {/* NAV */}
      <nav className="rl-nav">
        <img src={riplocOfiImg} alt="Riploc" style={{ height: 34, width: Math.round(34 * 5.295), objectFit:"contain", display:"block" }} />
        <div className="rl-nav-links">
          <a href="#data"      className="rl-nav-link">Data</a>
          <a href="#features"  className="rl-nav-link">Features</a>
          <a href="#community" className="rl-nav-link">Community</a>
          <a href="#pricing"   className="rl-nav-link">Pricing</a>
          <a href="#ambassador" className="rl-nav-link">Ambassador</a>
        </div>
        <div className="rl-nav-right">
          <button className="rl-btn-ghost" onClick={openLogin}>Sign In</button>
          <button className="rl-btn-primary" onClick={openRegister}>Start Free</button>
        </div>
      </nav>

      {/* HERO CAROUSEL */}
      <HeroCarousel open={openRegister} heroBoatImg={heroBoatImg} featureMahiImg={featureMahiImg} ctaBillfishImg={ctaBillfishImg} />

      {/* TRUST BAR */}
      <div className="rl-trust">
        <div className="rl-trust-inner">
          {["30-Day Pro Trial Free","No Credit Card","No Ads. Ever.","100% of Tips Go to Anglers","Zero Kickbacks"].map(t => (
            <div key={t} className="rl-trust-item"><div className="rl-dot" />{t}</div>
          ))}
        </div>
      </div>

      {/* DATA INTELLIGENCE */}
      <section className="rl-sec rl-dark" id="data">
        <div className="rl-inner">
          <div className="rl-lbl">The Data</div>
          <h2 className="rl-h2">The intel pro captains rely on.<br/>Now free.</h2>
          <p className="rl-sub">
            Six layers of real satellite data: NOAA, NASA, CMEMS. Processed daily. One map built for fishing decisions, not lab reports.
          </p>
          <div className="rl-data-grid">
            {DATA_LAYERS.map(d => (
              <div key={d.title} className="rl-dcard">
                <div className="rl-dcard-icon">{d.icon}</div>
                <div className="rl-dcard-title">{d.title}</div>
                <div className="rl-dcard-body">{d.body}</div>
              </div>
            ))}
          </div>
          <div className="rl-mapframe">
            <img src={appUiImg} alt="RipLoc app — marine forecast, SST map, and route planner" />
            <div className="rl-maplabel" style={{ top: 16, left: 16 }}>Live · Oregon Inlet, NC</div>
            <div className="rl-maplabel" style={{ bottom: 16, right: 16 }}>SST + Route Planning + Marine Forecast</div>
          </div>
        </div>
      </section>

      {/* VIDEO */}
      <section className="rl-video-sec" id="video">
        <div className="rl-inner">
          <div className="rl-lbl">See It In Action</div>
          <h2 className="rl-h2" style={{ color: "#fff" }}>
            From dock to drop shot<br/>in under 10 minutes.
          </h2>
          <p style={{ color: "#7a9ab5", fontSize: 17, maxWidth: 580, lineHeight: 1.7 }}>
            Watch how RipLoc anglers read the water, plan their run, and share intel with the community.
          </p>
        </div>
        <div className="rl-video-frame">
          <video
            controls
            preload="metadata"
            playsInline
            poster=""
          >
            <source src="https://riploc-storage.s3.us-east-2.amazonaws.com/Riploc+Intro+480p.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      </section>

      {/* FEATURE SHOWCASE */}
      <section className="rl-sec rl-dark" id="features">
        <div className="rl-inner">

          {/* Feature 1 */}
          <div className="rl-feat-grid">
            <div>
              <div className="rl-feat-lbl">Sea Surface Temperature</div>
              <h3 className="rl-feat-h3">Read the water<br/>like a pro.</h3>
              <p className="rl-feat-body">
                Isotherm overlays pinpoint temperature breaks to within a tenth of a degree.
                Dial in your target temperature, adjust sensitivity, and the map shows exactly
                where the edge is sitting today. Not three days ago.
              </p>
              <div className="rl-pills">
                <span className="rl-pill">VIIRS Daily</span>
                <span className="rl-pill">36h Composite</span>
                <span className="rl-pill">MUR 1km</span>
                <span className="rl-pill">Isotherm Overlay</span>
                <span className="rl-pill">Color Gain Control</span>
              </div>
            </div>
            <div className="rl-scr">
              <img src={commPinImg} alt="RipLoc live community catch report pin popup" />
            </div>
          </div>

          {/* Feature 2 */}
          <div className="rl-feat-grid rl-flip">
            <div>
              <div className="rl-feat-lbl">Trip Planner</div>
              <h3 className="rl-feat-h3">Every waypoint.<br/>Every gallon.</h3>
              <p className="rl-feat-body">
                Plot your run, set cruise speed, and get heading, distance, ETA, and fuel burn
                for every leg. Before you leave the inlet. Share your route via link or text.
                No fumbling with multiple apps at 4 AM.
              </p>
              <div className="rl-pills">
                <span className="rl-pill">Multi-Waypoint Routes</span>
                <span className="rl-pill">ETA Calculator</span>
                <span className="rl-pill">Fuel Burn Per Leg</span>
                <span className="rl-pill">Route Sharing</span>
                <span className="rl-pill">GPS Tracking</span>
              </div>
            </div>
            <div className="rl-scr">
              <img src={routeMapImg} alt="RipLoc trip plan — multi-waypoint route on SST map" />
            </div>
          </div>

          {/* Feature 3 */}
          <div className="rl-feat-grid">
            <div>
              <div className="rl-feat-lbl">Fishing Hotspots</div>
              <h3 className="rl-feat-h3">Find the fish.<br/>Not the blue desert.</h3>
              <p className="rl-feat-body">
                RipLoc's daily hotspot scoring model synthesizes SST gradients, chlorophyll
                concentration, and bottom structure into a ranked heatmap of where the bite
                is most likely to be. Satellite data refined by community intel.
              </p>
              <div className="rl-pills">
                <span className="rl-pill">Daily Hotspot Map</span>
                <span className="rl-pill">SST + CHL + Bathy Scoring</span>
                <span className="rl-pill">Canyon & Shelf Edges</span>
                <span className="rl-pill">Wreck Locations</span>
              </div>
            </div>
            <div className="rl-scr">
              <img src={hotspotImg} alt="RipLoc fishing hotspot scored zones on SST map" />
            </div>
          </div>

          {/* Feature 4 — Weather */}
          <div className="rl-feat-grid rl-flip">
            <div>
              <div className="rl-feat-lbl">Marine Weather</div>
              <h3 className="rl-feat-h3">Every forecast.<br/>One place.</h3>
              <p className="rl-feat-body">
                NOAA sea conditions, tides, wind, sunrise/sunset, and general weather — immediate
                and extended forecasts with hourly breakdowns — all built seamlessly into the app
                and pinned to your departure location. No more bouncing between five different apps
                at 4 AM. Shareable with your crew in one tap.
              </p>
              <div className="rl-pills">
                <span className="rl-pill">NOAA Sea Conditions</span>
                <span className="rl-pill">Tides</span>
                <span className="rl-pill">Wind &amp; Gusts</span>
                <span className="rl-pill">Sunrise / Sunset</span>
                <span className="rl-pill">Hourly Breakdown</span>
                <span className="rl-pill">Extended Forecast</span>
              </div>
            </div>
            <div className="rl-scr">
              <img src={weatherImg} alt="RipLoc marine weather forecast panel" />
            </div>
          </div>

          {/* Feature 5 — Sharing */}
          <div className="rl-feat-grid">
            <div>
              <div className="rl-feat-lbl">Crew Sharing</div>
              <h3 className="rl-feat-h3">Send the plan.<br/>Not a screenshot.</h3>
              <p className="rl-feat-body">
                Pro subscribers can share locations, routes, and weather with their crew via email
                or text. Recipients import everything directly into their account with one tap —
                exact waypoints, fuel calculations, and forecast included. No manual entry, no
                blurry screenshots.
              </p>
              <div className="rl-pills">
                <span className="rl-pill">Share Locations</span>
                <span className="rl-pill">Share Routes</span>
                <span className="rl-pill">Share Weather</span>
                <span className="rl-pill">Email &amp; Text</span>
                <span className="rl-pill">One-Tap Import</span>
                <span className="rl-pill">Pro Feature</span>
              </div>
            </div>
            <div className="rl-scr">
              <img src={sharingImg} alt="RipLoc crew sharing — send routes and weather to crew" />
            </div>
          </div>

        </div>
      </section>

      {/* COMMUNITY */}
      <section className="rl-comm-sec" id="community">
        <div className="rl-comm-glow" />
        <div className="rl-comm-inner">
          <div>
            <div className="rl-lbl">The Community</div>
            <h2 className="rl-comm-h2" style={{whiteSpace:"nowrap",fontSize:"clamp(2rem,4.5vw,3.8rem)"}}>It's not pay-to-play.</h2>
            <h2 className="rl-comm-h2" style={{fontSize:"clamp(2rem,4.5vw,3.8rem)"}}><em>Contribute to play.</em></h2>
            <p className="rl-comm-rule">
              Post a catch report. Drop a live pin. Share what you found. The whole community
              opens up. Everyone sharing has skin in the game. That's what keeps the intel honest.
            </p>
            <div className="rl-pillars">
              <div className="rl-pillar">
                <div className="rl-p-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <div>
                  <div className="rl-p-title">Share</div>
                  <div className="rl-p-body">Drop GPS-pinned live reports (24h) or catch reports (7 days). Every pin earns points. Contribute within the last 30 days and the full community map opens up.</div>
                </div>
              </div>
              <div className="rl-pillar">
                <div className="rl-p-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round">
                    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                </div>
                <div>
                  <div className="rl-p-title">Tip</div>
                  <div className="rl-p-body">Found a report that put you on fish? Tip the angler directly via Venmo or CashApp. Real money, peer-to-peer. RipLoc keeps 0%.</div>
                </div>
              </div>
              <div className="rl-pillar">
                <div className="rl-p-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round">
                    <polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/>
                  </svg>
                </div>
                <div>
                  <div className="rl-p-title">Win</div>
                  <div className="rl-p-body">Community leaderboard tracks points for posts AND for tips given. Monthly corporate-sponsored gear giveaways for top contributors. Free and Pro alike.</div>
                </div>
              </div>
            </div>
          </div>
          <div className="rl-comm-photo" style={{borderRadius:16,overflow:"hidden",border:"1px solid rgba(0,200,232,.15)"}}>
            <img src={commLbImg} alt="RipLoc community leaderboard" style={{width:"100%",display:"block"}} />
          </div>
        </div>
      </section>


      {/* COMMUNITY PHOTOS */}
      <section className="rl-photos-sec">
        <div className="rl-photos-hdr">
          <div className="rl-photos-left">
            <div className="rl-photos-eyebrow">From The Water</div>
            <h2 className="rl-photos-h2">Real Community. Real Data.</h2>
          </div>
          <div className="rl-photos-nav">
            <button className="rl-photos-nbtn" onClick={() => { setPhotoIdx(i => Math.max(0, i-1)); startPhotoTimer(); }} disabled={photoIdx === 0} aria-label="Previous">&#8592;</button>
            <button className="rl-photos-nbtn" onClick={() => { setPhotoIdx(i => Math.min(photos.length - PHOTOS_VISIBLE, i+1)); startPhotoTimer(); }} disabled={photoIdx >= photos.length - PHOTOS_VISIBLE} aria-label="Next">&#8594;</button>
          </div>
        </div>
        <div className="rl-photos-track-wrap">
          <div className="rl-photos-track" style={{ transform: `translateX(calc(-${photoIdx * 516}px))` }}>
            {photos.map((p, i) => (
              <div className="rl-photo-slide" key={i}>
                {p.src
                  ? <><img src={p.src} alt={p.caption || "Community catch"} />{p.caption && <div className="rl-photo-caption">{p.caption}</div>}</>
                  : <div className="rl-photo-placeholder"><div className="rl-photo-ph-label">Photo coming soon</div></div>
                }
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NO BS */}
      <section className="rl-nobs-sec">
        <div className="rl-inner">
          <div className="rl-nobs-hdr">
            <div className="rl-nobs-eyebrow">Our Commitment</div>
            <h2 className="rl-nobs-h2">Built for anglers.<br/>Not advertisers.</h2>
            <p className="rl-nobs-sub">
              You're running a boat offshore. That costs real money. We built this for people who respond to utility, not interruption.
            </p>
          </div>
          <div className="rl-nobs-grid">
            <div className="rl-nobs-card">
              <div className="rl-nbadge nbno">✕</div>
              <div className="rl-nc-title">No Ads. Ever.</div>
              <div className="rl-nc-body">No banner ads, sponsored content, or third-party tracking. The platform exists to help you catch fish. That is the only job.</div>
            </div>
            <div className="rl-nobs-card">
              <div className="rl-nbadge nbno">✕</div>
              <div className="rl-nc-title">No In-App Purchases.</div>
              <div className="rl-nc-body">No features locked behind individual purchases. Free is free. Pro is Pro. One price, everything included. No nickel-and-diming.</div>
            </div>
            <div className="rl-nobs-card">
              <div className="rl-nbadge nbyes">✓</div>
              <div className="rl-nc-title">100% Tips to Anglers.</div>
              <div className="rl-nc-body">Every dollar tipped goes directly to the angler who earned it. We take zero. Monetization is Pro subscriptions only. Our interests are aligned with yours.</div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="rl-price-sec" id="pricing">
        <div className="rl-price-inner">
          <div className="rl-price-hdr">
            <div className="rl-lbl" style={{ marginBottom: "0.75rem" }}>Pricing</div>
            <h2 className="rl-price-h2">Less than one offshore trip.</h2>
            <p className="rl-price-sub">Pro is less expensive than every competing SST platform. And it outperforms them all.</p>
          </div>
          <div className="rl-cards">
            <div className="rl-card free">
              <div className="rl-tier lt">Standard</div>
              <div className="rl-amt"><span className="rl-num lt">$0</span><span className="rl-per lt">&nbsp;/forever</span></div>
              <div className="rl-pnote lt">Create an account. No card needed.</div>
              <div className="rl-div lt" />
              <ul className="rl-feats">
                {FREE_FEATS.map(f => <li key={f} className="rl-feat-li lt"><span className="chk">✓</span>{f}</li>)}
              </ul>
              <button className="rl-pcta lt" onClick={openRegister}>Create Free Account</button>
            </div>
            <div className="rl-card pro">
              <div className="rl-pbadge">2026 Promo Rate</div>
              <div className="rl-tier dk">Pro</div>
              <div className="rl-amt"><span className="rl-num dk">$49</span><span className="rl-per dk">&nbsp;/year</span></div>
              <div className="rl-pnote dk">$99/yr after 2026 · or $15/mo</div>
              <div className="rl-div dk" />
              <ul className="rl-feats">
                {PRO_FEATS.map(f => <li key={f} className="rl-feat-li dk"><span className="chk">✓</span>{f}</li>)}
              </ul>
              <button className="rl-pcta dk" onClick={() => navigate("/upgrade")}>Go Pro. $49/yr</button>
            </div>
          </div>
          <div className="rl-price-footer">30-day free Pro trial on every account. No credit card required.</div>
        </div>
      </section>

      {/* FINAL CTA */}

      {/* AMBASSADOR */}
      <section className="rl-amb-sec" id="ambassador">
        <div className="rl-amb-inner">
          <div>
            <div className="rl-amb-eyebrow">Ambassador Program</div>
            <h2 className="rl-amb-h2">Run the water.<br/>Fly the flag.</h2>
            <p className="rl-amb-body">
              Captains, mates, and folks in the trade who use the app, push the product forward, and hold us accountable to build something worth fishing with. In return, the app is yours free. And you get Pro subscriptions to gift to your crew.
            </p>
            <div className="rl-amb-perks">
              <div className="rl-amb-perk"><div className="rl-amb-dot"/><div className="rl-amb-perk-text">Free Pro subscription, no expiration</div></div>
              <div className="rl-amb-perk"><div className="rl-amb-dot"/><div className="rl-amb-perk-text">Pro gift subscriptions to pass to your crew</div></div>
              <div className="rl-amb-perk"><div className="rl-amb-dot"/><div className="rl-amb-perk-text">Direct line to the dev team -- your feedback shapes the roadmap</div></div>
              <div className="rl-amb-perk"><div className="rl-amb-dot"/><div className="rl-amb-perk-text">Featured on the community leaderboard</div></div>
              <div className="rl-amb-perk"><div className="rl-amb-dot"/><div className="rl-amb-perk-text">One requirement: stay active, contribute, and keep it honest</div></div>
            </div>
          </div>
          <div className="rl-amb-form-wrap">
            {ambSubmitted ? (
              <div className="rl-amb-success">
                <div className="rl-amb-success-h">Application Received.</div>
                <p className="rl-amb-success-p">We review every application personally. Expect to hear from us within a few days. Thank you!</p>
              </div>
            ) : (
              <>
                <div className="rl-amb-form-title">Apply</div>
                <div className="rl-amb-form-sub">Takes 2 minutes. We read every one.</div>
                <div className="rl-amb-row">
                  <div className="rl-amb-field">
                    <label className="rl-amb-label">Name</label>
                    <input className="rl-amb-input" placeholder="Captain Jane Smith" value={ambForm.name} onChange={e => setAmbForm(f=>({...f,name:e.target.value}))} />
                  </div>
                  <div className="rl-amb-field">
                    <label className="rl-amb-label">Boat Name</label>
                    <input className="rl-amb-input" placeholder="Reel Therapy" value={ambForm.boatName} onChange={e => setAmbForm(f=>({...f,boatName:e.target.value}))} />
                  </div>
                </div>
                <div className="rl-amb-field">
                  <label className="rl-amb-label">Home Port / Location</label>
                  <input className="rl-amb-input" placeholder="Oregon Inlet, NC" value={ambForm.location} onChange={e => setAmbForm(f=>({...f,location:e.target.value}))} />
                </div>
                <div className="rl-amb-row">
                  <div className="rl-amb-field">
                    <label className="rl-amb-label">Email</label>
                    <input className="rl-amb-input" type="email" placeholder="you@email.com" value={ambForm.email} onChange={e => setAmbForm(f=>({...f,email:e.target.value}))} />
                  </div>
                  <div className="rl-amb-field">
                    <label className="rl-amb-label">Phone</label>
                    <input className="rl-amb-input" type="tel" placeholder="(252) 555-0100" value={ambForm.phone} onChange={e => setAmbForm(f=>({...f,phone:e.target.value}))} />
                  </div>
                </div>
                <div className="rl-amb-field">
                  <label className="rl-amb-label">Tell us about yourself</label>
                  <textarea className="rl-amb-input rl-amb-textarea" placeholder="How you fish, how you use the app, what you'd change, who you'd tell about it..." value={ambForm.comments} onChange={e => setAmbForm(f=>({...f,comments:e.target.value}))} />
                </div>
                {ambError && <div className="rl-amb-error">{ambError}</div>}
                <button className="rl-amb-submit" disabled={ambSubmitting} onClick={submitAmbassador}>
                  {ambSubmitting ? "Sending..." : "Submit Application"}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="rl-final">
        <div className="rl-final-ph">
          <img src={ctaBillfishImg} alt="Billfish at the waterline"
            style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"center 30%" }} />
        </div>
        <div className="rl-final-ov" />
        <div className="rl-final-glow" />
        <div className="rl-final-content">
          <div className="rl-final-eyebrow">Start Fishing Smarter</div>
          <h2 className="rl-final-h2"><span>Lock In.</span></h2>
          <div className="rl-final-divider" />
          <p className="rl-final-sub">
            30 days free. No credit card. No obligation.<br/>Better intel before you leave the dock.
          </p>
          <button className="rl-btn-hero" style={{ fontSize: 19, padding: "1.1rem 3rem", letterSpacing:".03em" }} onClick={openRegister}>
            Start Free. 30-Day Pro Trial.
          </button>
          <p className="rl-final-note">30 days free. Cancel anytime. East Coast Mid-Atlantic.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="rl-footer">
        <div className="rl-footer-in">
          <RipLocLogo h={26} />
          <div className="rl-flinks">
            <a href="/privacy" className="rl-flink">Privacy</a>
            <a href="/terms"   className="rl-flink">Terms</a>
            <a href="mailto:hello@riploc.com" className="rl-flink">Contact</a>
          </div>
          <div className="rl-fcopy">© 2026 RipLoc. All rights reserved.</div>
        </div>
      </footer>

      <AuthModal open={modal} onClose={() => setModal(false)} onSuccess={done} initialMode={modalMode} />
    </div>
  );
}
