import { useEffect, useState } from "react";
import { PasswordGate, tryAutoUnlock } from "./components/PasswordGate";
import { RoadmapHeader } from "./components/RoadmapHeader";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { DocumentReader } from "./components/DocumentReader";
import { ParticleField } from "./components/ParticleField";
import { ResizableSplit } from "./components/ResizableSplit";
import type { ContentFile, DashboardContent } from "./lib/decrypt";

export default function App() {
  const [content, setContent] = useState<DashboardContent | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [selectedFile, setSelectedFile] = useState<ContentFile | null>(null);

  useEffect(() => {
    void tryAutoUnlock().then((c) => {
      if (c) setContent(c);
      setCheckingSession(false);
    });
  }, []);

  function handleSelectFile(path: string) {
    if (!content) return;
    const file = content.docs.files.find((f) => f.path === path) ?? null;
    setSelectedFile(file);
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
                onSelectFile={handleSelectFile}
              />
            }
            right={<DocumentReader file={selectedFile} />}
          />
        </main>
      </div>
    </div>
  );
}
