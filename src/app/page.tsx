"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export default function Home() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const hoverTokenRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rotationTimerRef = useRef<number | null>(null);

  const textStyle = {
    color: "#ffffff",
    textShadow:
      "0 1px 2px rgba(0,0,0,0.55), 0 0 1px rgba(255,255,255,0.1)",
  };

  const typeScale = {
    "--type-logo": "clamp(20px, 3vw, 40px)",
    "--type-center": "clamp(18px, 2.6vw, 36px)",
    "--type-footer": "clamp(10px, 1.1vw, 14px)",
  } as React.CSSProperties;

  const backgroundVideos = useMemo(
    () => [
      "/bg/diver.mp4",
      "/bg/fighter.mp4",
      "/bg/surfer.mp4",
      "/bg/yoga.mp4",
    ],
    [],
  );

  const setRandomVideo = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * backgroundVideos.length);
    setVideoSrc(
      `${backgroundVideos[randomIndex]}?r=${hoverTokenRef.current++}`,
    );
  }, [backgroundVideos]);

  const handleHover = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      return;
    }

    setRandomVideo();

    if (rotationTimerRef.current === null) {
      rotationTimerRef.current = window.setInterval(() => {
        setRandomVideo();
      }, 5000);
    }
  }, [setRandomVideo]);

  const handleHoverOut = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      return;
    }

    if (rotationTimerRef.current !== null) {
      window.clearInterval(rotationTimerRef.current);
      rotationTimerRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
    }

    if (videoRef.current) {
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }

    setVideoSrc("");
  }, []);

  const handleClick = useCallback(() => {
    if (rotationTimerRef.current !== null) {
      window.clearInterval(rotationTimerRef.current);
      rotationTimerRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }

    setVideoSrc(null);
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#000000",
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        ...textStyle,
        ...typeScale,
        position: "relative",
        zIndex: 1,
      }}
      className="page"
    >
      <video
        ref={videoRef}
        src={videoSrc ?? undefined}
        autoPlay
        muted
        playsInline
        preload="none"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: 0,
          pointerEvents: "none",
        }}
        onLoadedData={() => {
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
            void videoRef.current.play();
          }
        }}
      />
      <header
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "16px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <a
          href="/"
          style={{
            ...textStyle,
            textDecoration: "none",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            fontSize: "var(--type-logo)",
          }}
          onClick={handleClick}
        >
          MACKLEY
        </a>
      </header>

      <section
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <a
          href="/"
          style={{
            ...textStyle,
            letterSpacing: "-0.015em",
            fontSize: "var(--type-center)",
          }}
          className="hover-link center-link"
          data-hover="breathe"
          onMouseEnter={handleHover}
          onMouseLeave={handleHoverOut}
          onClick={handleClick}
        >
          1. BREATHE
        </a>
        <a
          href="/"
          style={{
            ...textStyle,
            letterSpacing: "-0.015em",
            fontSize: "var(--type-center)",
          }}
          className="hover-link center-link"
          data-hover="deeper"
          onMouseEnter={handleHover}
          onMouseLeave={handleHoverOut}
          onClick={handleClick}
        >
          2. DEEPER
        </a>
      </section>

      <footer
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "16px",
          gap: "24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <a
          href="/"
          style={{
            ...textStyle,
            letterSpacing: "-0.02em",
            fontSize: "var(--type-footer)",
          }}
          className="hover-link footer-link"
          data-hover="breathe"
          onMouseEnter={handleHover}
          onMouseLeave={handleHoverOut}
          onClick={handleClick}
        >
          1. BREATHE
        </a>
        <a
          href="/"
          style={{
            ...textStyle,
            letterSpacing: "-0.02em",
            fontSize: "var(--type-footer)",
          }}
          className="hover-link footer-link"
          data-hover="deeper"
          onMouseEnter={handleHover}
          onMouseLeave={handleHoverOut}
          onClick={handleClick}
        >
          2. DEEPER
        </a>
        <a
          href="/"
          style={{
            ...textStyle,
            letterSpacing: "-0.02em",
            fontSize: "var(--type-footer)",
          }}
          className="hover-link footer-link"
          onClick={handleClick}
        >
          LEGAL
        </a>
      </footer>
      <style>{`
        .hover-link {
          text-decoration: none;
          font-weight: 400;
          display: inline-block;
          white-space: nowrap;
          color: #ffffff;
        }

        @media (hover: hover) and (pointer: fine) {
          .hover-link[data-hover="breathe"]:hover {
            color: #0066cc !important;
            text-shadow: none !important;
            text-decoration: underline;
          }

          .hover-link[data-hover="deeper"]:hover {
            color: #ff2d55 !important;
            text-shadow: none !important;
            text-decoration: underline;
          }
        }
      `}</style>
    </main>
  );
}
