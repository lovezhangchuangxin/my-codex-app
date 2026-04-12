import { useState } from "react";

type MobilePanelView = "thread-list" | "thread-detail";

export function useMobilePanel() {
  const [view, setView] = useState<MobilePanelView>("thread-list");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const openThread = (id: string) => {
    setSelectedThreadId(id);
    setView("thread-detail");
  };

  const backToList = () => {
    setView("thread-list");
    setSelectedThreadId(null);
  };

  return { view, selectedThreadId, openThread, backToList };
}
