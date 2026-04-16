'use client';

interface TopBarProps {
  onOpenSettings: () => void;
  onExport: () => void;
}

export default function TopBar({ onOpenSettings, onExport }: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel">
      <h1 className="text-sm font-semibold tracking-wide">
        TwinMind — Live Suggestions
      </h1>
      <div className="flex items-center gap-3">
        <button
          onClick={onExport}
          className="text-xs text-muted hover:text-text transition-colors px-3 py-1.5 rounded border border-border hover:border-accent"
        >
          Export
        </button>
        <button
          onClick={onOpenSettings}
          className="text-xs text-muted hover:text-text transition-colors px-3 py-1.5 rounded border border-border hover:border-accent"
        >
          Settings
        </button>
      </div>
    </div>
  );
}
