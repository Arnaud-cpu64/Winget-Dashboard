import { Bell, ArrowUp, Sparkles, Inbox } from "lucide-react";
import { Button } from "../../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../ui/tooltip";

const TOOLTIP = "Appliquer les mises à jour (2)";
const COUNT = 2;

export function Variants() {
  return (
    <div className="dark min-h-screen bg-[#0f1117] flex items-center justify-center p-10">
      <div className="flex flex-col gap-12 items-center">
        <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
          Survolez pour voir l'info-bulle
        </p>

        <div className="flex gap-10 items-center flex-wrap justify-center">

          {/* A — Cloche de notification avec badge */}
          <div className="flex flex-col items-center gap-3">
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="relative p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-amber-500/50 transition-all text-zinc-300 hover:text-amber-400">
                    <Bell size={18} />
                    <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold font-mono flex items-center justify-center leading-none">
                      {COUNT}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="font-mono text-xs bg-zinc-800 border-zinc-700 text-zinc-100">
                  {TOOLTIP}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="text-center">
              <p className="text-xs font-mono text-amber-400 font-semibold">A — Cloche</p>
              <p className="text-[11px] font-mono text-zinc-500 mt-0.5">Badge de notification</p>
            </div>
          </div>

          {/* B — Pill avec texte court */}
          <div className="flex flex-col items-center gap-3">
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 hover:border-amber-500/70 text-amber-400 hover:text-amber-300 transition-all text-xs font-mono font-semibold">
                    <ArrowUp size={13} />
                    {COUNT} màj
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="font-mono text-xs bg-zinc-800 border-zinc-700 text-zinc-100">
                  {TOOLTIP}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="text-center">
              <p className="text-xs font-mono text-amber-400 font-semibold">B — Pill</p>
              <p className="text-[11px] font-mono text-zinc-500 mt-0.5">Discret, texte court</p>
            </div>
          </div>

          {/* C — Bouton plein avec animation pulse */}
          <div className="flex flex-col items-center gap-3">
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold transition-all shadow-[0_0_12px_rgba(245,158,11,0.4)] hover:shadow-[0_0_20px_rgba(245,158,11,0.6)]">
                    <Sparkles size={13} />
                    {COUNT} disponibles
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="font-mono text-xs bg-zinc-800 border-zinc-700 text-zinc-100">
                  {TOOLTIP}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="text-center">
              <p className="text-xs font-mono text-amber-400 font-semibold">C — Glow</p>
              <p className="text-[11px] font-mono text-zinc-500 mt-0.5">Plein avec halo ambré</p>
            </div>
          </div>

          {/* D — Inbox style */}
          <div className="flex flex-col items-center gap-3">
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-dashed border-amber-500/60 hover:border-amber-500 bg-transparent hover:bg-amber-500/10 text-amber-500 hover:text-amber-400 transition-all text-xs font-mono font-semibold">
                    <Inbox size={14} />
                    <span>{COUNT}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="font-mono text-xs bg-zinc-800 border-zinc-700 text-zinc-100">
                  {TOOLTIP}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="text-center">
              <p className="text-xs font-mono text-amber-400 font-semibold">D — Inbox</p>
              <p className="text-[11px] font-mono text-zinc-500 mt-0.5">Pointillés, épuré</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
