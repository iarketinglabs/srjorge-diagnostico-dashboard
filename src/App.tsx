import { useEffect, useState } from "react";
import { PasswordGate, tryAutoUnlock } from "./components/PasswordGate";
import { RoadmapHeader } from "./components/RoadmapHeader";
import { KnowledgeGraph, type FocusRequest } from "./components/KnowledgeGraph";
import { DocumentReader } from "./components/DocumentReader";
import { ParticleField } from "./components/ParticleField";
import { ResizableSplit } from "./components/ResizableSplit";
import type { DashboardContent } from "./lib/decrypt";

export default function App() {
  const [content, setContent] = useState<DashboardContent | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // Browser-history-style navigation: `history` is the stack of visited
  // document paths, `historyIndex` the current position within it — back/
  // forward just move the pointer, navigating to a fresh doc truncates any
  // forward entries (same semantics as window.history).
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

  useEffect(() => {
    void tryAutoUnlock().then((c) => {
      if (c) setContent(c);
      setCheckingSession(false);
    });
  }, []);

  function navigate(path: string) {
    if (history[historyIndex] !== path) {
      const truncated = history.slice(0, historyIndex + 1);
      truncated.push(path);
      setHistory(truncated);
      setHistoryIndex(truncated.length - 1);
    }
    setFocusRequest({ path });
  }

  function goBack() {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setFocusRequest({ path: history[nextIndex] });
  }

  function goForward() {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setFocusRequest({ path: history[nextIndex] });
  }

  function focusFolder(folderPath: string) {
    setFocusRequest({ path: folderPath });
  }

  if (checkingSession) {
    return <div className="page-shell" />;
  }

  if (!content) {
    return (
      <div className="page-shell">
        <ParticleField />
        <div className="page-content">
          <PasswordGate onUnlock={setContent} />
        </div>
      </div>
    );
  }

  const currentPath = historyIndex >= 0 ? history[historyIndex] : null;
  const selectedFile = currentPath ? content.docs.files.find((f) => f.path === currentPath) ?? null : null;

  return (
    <div className="page-shell">
      <ParticleField />
      <div className="page-content dashboard-shell">
        <RoadmapHeader roadmap={content.roadmap} statusSnapshot={content.statusSnapshot} />
        <main className="dashboard-body">
          <ResizableSplit
            left={
              <KnowledgeGraph
                tree={content.docs.tree}
                selectedPath={selectedFile?.path ?? null}
                onSelectFile={navigate}
                focusRequest={focusRequest}
              />
            }
            right={
              <DocumentReader
                file={selectedFile}
                allFiles={content.docs.files}
                onNavigate={navigate}
                onFocusFolder={focusFolder}
                canGoBack={historyIndex > 0}
                canGoForward={historyIndex < history.length - 1}
                onBack={goBack}
                onForward={goForward}
              />
            }
          />
        </main>
      </div>
    </div>
  );
}
