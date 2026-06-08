import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

const TARGET_TEMP_HELP = `The dotted white line is the plain isotherm — every point where the water hits exactly your target temp, regardless of whether it's a sharp break or a gentle slope. It's a geometric contour, like a topographic line.`;
const SHARPNESS_HELP = `The Front Sharpness slider controls which temperature differences get highlighted as "breaks."

• Low sharpness (0.5°F) — only draws the cyan line where the gradient is extremely sharp.
• High sharpness (8°F) — draws the cyan line even where temperature changes slowly.

The solid cyan line is the temp break and only drawn where the gradient exceeds your threshold.`;

function InfoPopup({ text, onClose, triggerRef }) {
  const [pos, setPos] = React.useState(null);
  useLayoutEffect(() => {
    if (!triggerRef?.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const W = 320;
    const left = Math.max(8, rect.left - W - 12);
    const top  = Math.max(8, Math.min(rect.top, window.innerHeight - 400));
    setPos({ left, top });
  }, []);
  useEffect(() => {
    function handler(e) { if (triggerRef?.current && !triggerRef.current.contains(e.target)) onClose(); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  if (!pos) return null;
  return createPortal(
    <div style={{ position:"fixed", left:pos.left, top:pos.top, width:320, zIndex:9999, background:"#fff", borderRadius:14, padding:"16px 18px 18px", boxShadow:"0 12px 40px rgba(0,0,0,0.22)", fontSize:12, lineHeight:1.7, color:"#1e293b", animation:"helpIn 0.15s ease-out" }}>
      <style>{`@keyframes helpIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}`}</style>
      <button onClick={onClose} style={{ position:"absolute", top:10, right:10, background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#94a3b8", lineHeight:1 }}>×</button>
      <div style={{ whiteSpace:"pre-wrap", paddingRight:16 }}>{text}</div>
    </div>,
    document.body
  );
}

function HelpIcon({ onOpen, btnRef }) {
  return (
    <button ref={btnRef} onClick={e => { e.stopPropagation(); onOpen(); }} style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:"50%", width:13, height:13, cursor:"pointer", padding:0, display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#0284c7", lineHeight:1, flexShrink:0, marginLeft:3, verticalAlign:"middle" }}>?</button>
  );
}

export default function IsothermControls({ enabled, onToggle, targetTemp, onTargetTemp, sensitivity, onSensitivity, sstMin, sstMax }) {
  const clampedTarget = Math.max(sstMin, Math.min(sstMax, targetTemp));
  const [helpText, setHelpText] = React.useState(null);
  const [activeTriggerRef, setActiveTriggerRef] = React.useState(null);
  const targetBtnRef = React.useRef(null);
  const sharpBtnRef  = React.useRef(null);
  function openHelp(text, ref) { setHelpText(text); setActiveTriggerRef(ref); }
  return (
    <div className="border-t border-slate-200 mt-0.5 pt-1.5">
      {helpText && <InfoPopup text={helpText} triggerRef={activeTriggerRef} onClose={() => { setHelpText(null); setActiveTriggerRef(null); }} />}
      <button onClick={onToggle} className={`w-full flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1.5 rounded-lg text-left transition-colors ${enabled ? "bg-sky-500 text-white" : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-300"}`}>
        <span className="text-sm">~</span> Temp Break
      </button>
      {enabled && (
        <div className="mt-1.5 space-y-2 px-1">
          <div>
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[10px] text-slate-500 font-medium flex items-center">Target Temp<HelpIcon btnRef={targetBtnRef} onOpen={() => openHelp(TARGET_TEMP_HELP, targetBtnRef)} /></span>
              <span className="text-[11px] font-bold text-sky-600 tabular-nums">{clampedTarget.toFixed(1)}F</span>
            </div>
            <input type="range" min={Math.floor(sstMin)} max={Math.ceil(sstMax)} step={0.5} value={clampedTarget} onChange={e => onTargetTemp(parseFloat(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-sky-500"/>
            <div className="flex justify-between text-[9px] text-slate-400 mt-0.5"><span>{Math.floor(sstMin)}</span><span>{Math.ceil(sstMax)}</span></div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[10px] text-slate-500 font-medium flex items-center">Front sharpness<HelpIcon btnRef={sharpBtnRef} onOpen={() => openHelp(SHARPNESS_HELP, sharpBtnRef)} /></span>
              <span className="text-[11px] font-bold text-violet-600 tabular-nums">{sensitivity.toFixed(1)}°F</span>
            </div>
            <input type="range" min={0.5} max={8} step={0.5} value={sensitivity} onChange={e => onSensitivity(parseFloat(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-violet-500"/>
            <div className="flex justify-between text-[9px] text-slate-400 mt-0.5"><span>← sharp only</span><span>all gradients →</span></div>
          </div>
        </div>
      )}
    </div>
  );
}