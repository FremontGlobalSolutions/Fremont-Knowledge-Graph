import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  title: string;
  toolbar?: ReactNode;
  children: ReactNode;
  isDark?: boolean;
};

export function FullscreenCanvasFrame({ title, toolbar, children, isDark = false }: Props) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreen]);

  const toggleBtn = (
    <button
      type="button"
      className="btn-secondary btn-fullscreen"
      onClick={() => setFullscreen((f) => !f)}
      title={fullscreen ? "Exit fullscreen (Esc)" : "Enter fullscreen"}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
        {fullscreen ? (
          <>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5.5 0a.5.5 0 0 1 .5.5v4A1.5 1.5 0 0 1 4.5 6h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5zM10.5 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 10 4.5v-4a.5.5 0 0 1 .5-.5zM0 10.5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 6 11.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zM16 10.5a.5.5 0 0 1-.5.5h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4a1.5 1.5 0 0 1 1.5-1.5h4a.5.5 0 0 1 .5.5z"/>
            </svg>
            Exit
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10.5 0a.5.5 0 0 1 0 1h4a.5.5 0 0 0 .5.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4zM0 10.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4zm15 0a.5.5 0 0 1-1 0v4a.5.5 0 0 0-.5.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4z"/>
            </svg>
            Fullscreen
          </>
        )}
      </span>
    </button>
  );

  if (fullscreen) {
    return createPortal(
      <div className={`fullscreen-viewport${isDark ? " fullscreen-viewport--dark" : ""}`}>
        <div className="fullscreen-header">
          <h2 className="fullscreen-title">{title}</h2>
          {toggleBtn}
        </div>
        <div className="fullscreen-toolbar">
          {toolbar}
        </div>
        <div className="fullscreen-canvas-container">
          {children}
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div className="fullscreen-frame">
      <div className="fullscreen-frame-toolbar">
        <div className="fullscreen-frame-toolbar-left">
          {toolbar}
        </div>
        {toggleBtn}
      </div>
      <div className="fullscreen-frame-body">
        {children}
      </div>
    </div>
  );
}
