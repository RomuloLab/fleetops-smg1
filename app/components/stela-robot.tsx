"use client";
import { useId } from "react";

export default function StelaRobot({ mood = "idle", className = "" }: { mood?: "idle" | "thinking" | "speaking" | "listening"; className?: string }) {
  const id = "stela" + useId().replace(/:/g, "");
  return <svg className={`stela-robot ${mood} ${className}`} viewBox="0 0 180 200" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id+"shell"} x1=".1" y1="0" x2=".85" y2="1"><stop stopColor="#fff"/><stop offset=".58" stopColor="#f1f7ff"/><stop offset="1" stopColor="#b9cfe5"/></linearGradient>
      <linearGradient id={id+"visor"} x1="0" y1="0" x2=".75" y2="1"><stop stopColor="#26384d"/><stop offset=".38" stopColor="#07111e"/><stop offset="1" stopColor="#020710"/></linearGradient>
      <linearGradient id={id+"blue"} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#80d9ff"/><stop offset="1" stopColor="#2d98e0"/></linearGradient>
      <radialGradient id={id+"shine"}><stop stopColor="white" stopOpacity=".75"/><stop offset="1" stopColor="white" stopOpacity="0"/></radialGradient>
      <filter id={id+"glow"} x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="1.6"/></filter>
    </defs>
    <ellipse className="stela-robot-shadow" cx="90" cy="186" rx="36" ry="6" fill="#2787cc" opacity=".18"/>
    <g className="stela-robot-float">
      <g className="stela-arm stela-arm-left"><ellipse cx="47" cy="131" rx="14" ry="23" transform="rotate(34 47 131)" fill={`url(#${id}shell)`}/><path d="M36 119q-7 5-8 13l15 8q8-6 9-14z" fill={`url(#${id}blue)`}/></g>
      <g className="stela-arm stela-arm-right"><ellipse cx="133" cy="131" rx="14" ry="23" transform="rotate(-34 133 131)" fill={`url(#${id}shell)`}/><path d="M144 119q7 5 8 13l-15 8q-8-6-9-14z" fill={`url(#${id}blue)`}/></g>
      <path d="M55 117q35-14 70 0v22c0 31-15 42-35 42s-35-11-35-42z" fill={`url(#${id}shell)`}/>
      <path d="M56 117q34 12 68 0l-2 12q-33 14-64 0z" fill={`url(#${id}blue)`}/>
      <ellipse cx="79" cy="145" rx="17" ry="23" fill={`url(#${id}shine)`} opacity=".7"/>
      <circle cx="90" cy="151" r="3.2" fill="#253d58"/><circle className="stela-heart" cx="90" cy="151" r="1.3" fill="#74d9ff"/>
      <g className="stela-robot-head">
        <rect x="26" y="58" width="12" height="27" rx="6" fill="#c9d8eb"/><rect x="142" y="58" width="12" height="27" rx="6" fill="#c9d8eb"/>
        <ellipse cx="90" cy="70" rx="58" ry="52" fill={`url(#${id}shell)`}/>
        <path d="M68 20h44v5q-20 4-44 0z" fill={`url(#${id}blue)`}/>
        <rect x="42" y="39" width="96" height="65" rx="33" fill={`url(#${id}visor)`} stroke="#b4c8df" strokeWidth="2"/>
        <ellipse cx="76" cy="48" rx="27" ry="11" fill={`url(#${id}shine)`} opacity=".4"/>
        <g className="stela-eyes" strokeLinecap="round" fill="none"><g stroke="#7edaff" strokeWidth="6" opacity=".5" filter={`url(#${id}glow)`}><path d="M61 68q9-10 18 0M101 68q9-10 18 0"/></g><g stroke="#d3f2ff" strokeWidth="3.4"><path d="M61 68q9-10 18 0M101 68q9-10 18 0"/></g></g>
        <path className="stela-mouth" d="M82 85q8 4 16 0" fill="none" stroke="#5ab6e8" strokeWidth="2.8" strokeLinecap="round"/>
      </g>
    </g>
  </svg>;
}
