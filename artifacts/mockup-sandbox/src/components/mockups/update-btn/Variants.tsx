import { Zap, ChevronsUp, PackageCheck, RefreshCcw } from "lucide-react";
import { Button } from "../../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../ui/tooltip";

const TOOLTIP = "Appliquer les mises à jour (2)";
const COUNT = 2;

const variants = [
  {
    id: 1,
    label: "Zap",
    desc: "Élair — action rapide",
    icon: <Zap size={16} />,
  },
  {
    id: 2,
    label: "ChevronsUp",
    desc: "Montée en version",
    icon: <ChevronsUp size={16} />,
  },
  {
    id: 3,
    label: "PackageCheck",
    desc: "Package validé",
    icon: <PackageCheck size={16} />,
  },
  {
    id: 4,
    label: "RefreshCcw",
    desc: "Synchroniser",
    icon: <RefreshCcw size={16} />,
  },
];

export function Variants() {
  return (
    <div className="dark min-h-screen bg-[#0f1117] flex items-center justify-center p-10">
      <div className="flex flex-col gap-10 items-center">
        <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
          Survolez pour voir l'info-bulle
        </p>

        <div className="flex gap-8 items-start">
          {variants.map((v) => (
            <div key={v.id} className="flex flex-col items-center gap-3">
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      className="font-mono bg-amber-500 hover:bg-amber-600 text-black gap-2 border-2 border-amber-300 px-3"
                    >
                      {v.icon}
                      <span className="font-bold tabular-nums">({COUNT})</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="font-mono text-xs bg-zinc-800 border-zinc-700 text-zinc-100"
                  >
                    {TOOLTIP}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="text-center">
                <p className="text-xs font-mono text-amber-400 font-semibold">{v.label}</p>
                <p className="text-[11px] font-mono text-zinc-500 mt-0.5">{v.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
