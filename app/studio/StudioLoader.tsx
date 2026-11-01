"use client";

import dynamic from "next/dynamic";

/** The studio is canvas and browser APIs throughout, so it renders only in the browser. */
const Studio = dynamic(() => import("./Studio"), { ssr: false });

export default function StudioLoader() {
  return <Studio />;
}
