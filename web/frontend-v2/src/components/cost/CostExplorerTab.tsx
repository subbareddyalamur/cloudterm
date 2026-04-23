export function CostExplorerTab() {
  return (
    <div className="flex flex-col h-full bg-bg">
      <iframe
        src="http://localhost:5173"
        className="flex-1 w-full border-0"
        title="Cost Explorer"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  );
}

CostExplorerTab.displayName = 'CostExplorerTab';
