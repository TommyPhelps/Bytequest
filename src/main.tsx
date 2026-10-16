import { createRoot } from "react-dom/client";

function Boot() {
  return <pre style={{ color: "#52ff8c", font: "16px monospace", padding: 24 }}>BYTEQUEST.EXE // SYSTEM READY (scaffold build)</pre>;
}

createRoot(document.getElementById("root")!).render(<Boot />);
