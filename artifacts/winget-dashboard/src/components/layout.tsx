import React from "react";
import { Link, useLocation } from "wouter";
import { Package, Search, Settings, Server, TerminalSquare, Activity } from "lucide-react";
import { useHealthCheck } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck();

  const navItems = [
    { href: "/", label: "Dashboard", icon: Package },
    { href: "/search", label: "Search & Add", icon: Search },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row w-full bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-full md:w-64 flex flex-col border-r border-border bg-card/50 backdrop-blur-xl">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-[0_0_15px_rgba(0,255,255,0.3)]">
            <TerminalSquare size={18} />
          </div>
          <div className="flex flex-col">
            <span className="font-mono font-bold tracking-tight text-sm leading-none">WG-REPO</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Self-Hosted</span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <item.icon size={16} className={isActive ? "text-primary drop-shadow-[0_0_8px_rgba(0,255,255,0.5)]" : ""} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <Activity size={14} className={health?.status === 'ok' ? 'text-green-400' : 'text-yellow-400'} />
            <span className="flex-1">System Status</span>
            <span className={health?.status === 'ok' ? 'text-green-400 font-bold' : 'text-yellow-400'}>
              {health?.status === 'ok' ? 'ONLINE' : 'CONNECTING'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-[100dvh] overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
