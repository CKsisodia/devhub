"use client";

import { motion } from "motion/react";
import { EASE } from "@/components/motion";

/** Re-mounts on every navigation, giving each page a soft fade/rise entrance. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.32, ease: EASE }}>
      {children}
    </motion.div>
  );
}
